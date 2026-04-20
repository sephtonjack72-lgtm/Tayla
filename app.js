/* ===========================================================
   TAYLA -- APPLICATION JAVASCRIPT
   -------------------------------------------------------
   TABLE OF CONTENTS

   01. Supabase Setup
   02. Storage Helpers
   03. Auth (Login, Register, Logout)
   04. Screens & Tabs
   05. Modals
   06. Consent & Settings Logic
   07. FY (Financial Year) Management
   08. Data Load & Persist
   09. Tax Calculator
   10. Budget Tracker
   11. Financial Health
   12. Goals
   13. Data Rights (APP 12)
   14. Utils
   15. Init
=========================================================== */

/* ===================================================
   SUPABASE SETUP
=================================================== */
const SUPABASE_URL  = 'https://anspwetxfykbmydrnkwh.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFuc3B3ZXR4ZnlrYm15ZHJua3doIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI5NTY0NjUsImV4cCI6MjA4ODUzMjQ2NX0.7yPIZFWRGaHNyXm-ZXzNXl6epi_C37HfXwVVagpBQJU';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON);

let CURRENT_USER = null; // { email, name, id } | null
let GUEST_MODE   = false; // true when using app without an account
let CURRENT_TIER = 'free'; // 'free' | 'plus' | 'pro'

const GUEST_LS_KEY = 'tayla_guest_data';
const GUEST_ALLOWED_TABS = ['tax', 'budget'];

function isGuest() { return GUEST_MODE && !CURRENT_USER; }
function isPlus()  { return CURRENT_TIER === 'plus' || CURRENT_TIER === 'pro'; }

/* ===================================================
   GUEST SESSION TRACKING
=================================================== */
const GUEST_SESSION_KEY = 'tayla_guest_session_id';

function getOrCreateGuestSessionId() {
  let id = localStorage.getItem(GUEST_SESSION_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(GUEST_SESSION_KEY, id);
  }
  return id;
}

async function trackGuestSession() {
  const sessionId = getOrCreateGuestSessionId();
  try {
    await sb
      .from('guest_sessions')
      .upsert({ session_id: sessionId, last_seen: new Date().toISOString() },
               { onConflict: 'session_id' });
  } catch (e) {
    console.warn('Guest tracking failed:', e);
  }
}

async function fetchUserTier(userId) {
  try {
    const { data, error } = await sb
      .from('profiles')
      .select('tier, theme, upcoming_invoice_at')
      .eq('id', userId)
      .maybeSingle();
    if (!error && data) {
      CURRENT_TIER = data.tier || 'free';
      // Apply saved theme
      loadTheme(data.theme || localStorage.getItem(THEME_LS_KEY) || 'default');
      // Check for upcoming renewal notice
      checkRenewalNotice(data.upcoming_invoice_at);
    } else {
      CURRENT_TIER = 'free';
      loadTheme(localStorage.getItem(THEME_LS_KEY) || 'default');
    }
  } catch {
    CURRENT_TIER = 'free';
    loadTheme(localStorage.getItem(THEME_LS_KEY) || 'default');
  }
}

function checkRenewalNotice(upcomingInvoiceAt) {
  const banner = document.getElementById('renewal-banner');
  if (!banner) return;
  if (!upcomingInvoiceAt) { banner.style.display = 'none'; return; }
  const renewalDate = new Date(upcomingInvoiceAt);
  const now = new Date();
  const daysUntil = Math.ceil((renewalDate - now) / (1000 * 60 * 60 * 24));
  if (daysUntil <= 7 && daysUntil >= 0) {
    const dateStr = renewalDate.toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' });
    document.getElementById('renewal-banner-date').textContent = dateStr;
    banner.style.display = 'flex';
  } else {
    banner.style.display = 'none';
  }
}

/* ===================================================
   STORAGE HELPERS (consents stored in browser, all app data via Supabase)
=================================================== */
const getConsents  = email => { try { return JSON.parse(localStorage.getItem('ft_consents_' + email)) || {}; } catch { return {}; } };
const saveConsents = (email, c) => localStorage.setItem('ft_consents_' + email, JSON.stringify(c));

/* ===================================================
   AUTH
=================================================== */
function switchAuthTab(t) {
  document.getElementById('login-form').style.display    = t === 'login'    ? 'block' : 'none';
  document.getElementById('register-form').style.display = t === 'register' ? 'block' : 'none';
  document.getElementById('tab-login-btn').className = 'auth-tab' + (t === 'login' ? ' active' : '');
  document.getElementById('tab-reg-btn').className   = 'auth-tab' + (t === 'register' ? ' active' : '');
}

function showAlert(id, msg, type = 'error') {
  const el = document.getElementById(id);
  el.className = 'alert alert-' + type;
  el.textContent = msg;
  el.style.display = 'block';
  if (type !== 'success') setTimeout(() => el.style.display = 'none', 5000);
}

async function doLogin() {
  const email = document.getElementById('login-email').value.trim().toLowerCase();
  const pw    = document.getElementById('login-pw').value;
  if (!email || !pw) return showAlert('login-error', 'Please enter your email and password.');

  const { data, error } = await sb.auth.signInWithPassword({ email, password: pw });
  if (error) return showAlert('login-error', error.message || 'Login failed. Please try again.');

  // Migrate any guest data into this account
  if (data.user) await migrateGuestData(data.user.id);

  const name = data.user.user_metadata?.name || email.split('@')[0];
  enterApp(email, name, data.user.id);
}

// Migrate guest localStorage data into Supabase after signup/login
async function migrateGuestData(userId) {
  try {
    const raw = localStorage.getItem(GUEST_LS_KEY);
    if (!raw) return;
    const all = JSON.parse(raw);
    const keys = Object.keys(all);
    if (keys.length === 0) return;
    const upserts = keys.map(fy_key => ({
      user_id: userId,
      fy_key,
      data: all[fy_key],
      updated_at: new Date().toISOString(),
    }));
    await sb.from('user_data').upsert(upserts, { onConflict: 'user_id,fy_key', ignoreDuplicates: true });
    localStorage.removeItem(GUEST_LS_KEY);
    localStorage.removeItem(GUEST_SESSION_KEY);
    console.log('Guest data migrated to account.');
  } catch (e) { console.warn('Guest migration failed:', e); }
}

/* ===================================================
   PROMO CODES
=================================================== */
const PROMO_CODES = {
  '2FREE2MONTH': { months: 2, label: '2 months of Tayla Plus free', validUntil: new Date('2025-04-22T23:59:59') },
};

function checkPromoCode() {
  const code     = document.getElementById('promo-code').value.trim().toUpperCase();
  const feedback = document.getElementById('promo-feedback');
  if (!code) { feedback.textContent = ''; return; }
  const promo = PROMO_CODES[code];
  if (promo && new Date() <= promo.validUntil) {
    feedback.innerHTML = `<span style="color:var(--green)">✓ Valid code -- ${promo.label} will be applied</span>`;
  } else if (promo && new Date() > promo.validUntil) {
    feedback.innerHTML = `<span style="color:var(--red)">✗ This promo code has expired</span>`;
  } else {
    feedback.innerHTML = `<span style="color:var(--red)">✗ Invalid promo code</span>`;
  }
}

async function applyPromoCode(userId, code) {
  const promo = PROMO_CODES[code];
  if (!promo) return;
  if (new Date() > promo.validUntil) return; // expired -- don't apply
  const expiresAt = new Date();
  expiresAt.setMonth(expiresAt.getMonth() + promo.months);
  await sb.from('profiles').update({
    tier:            'plus',
    promo_used:      code,
    plus_expires_at: expiresAt.toISOString(),
    updated_at:      new Date().toISOString(),
  }).eq('id', userId);
}

async function doRegister() {
  const name  = document.getElementById('reg-name').value.trim();
  const email = document.getElementById('reg-email').value.trim().toLowerCase();
  const pw    = document.getElementById('reg-pw').value;
  const pw2   = document.getElementById('reg-pw2').value;
  const cTos  = document.getElementById('c-tos').checked;
  const cDisc = document.getElementById('c-disclaimer').checked;
  const cAge  = document.getElementById('c-age').checked;
  const cCat  = document.getElementById('c-cat-data').checked;

  if (!name || !email || !pw || !pw2) return showAlert('reg-error', 'Please fill in all required fields.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return showAlert('reg-error', 'Please enter a valid email address.');
  if (pw.length < 8) return showAlert('reg-error', 'Password must be at least 8 characters long.');
  if (pw !== pw2)    return showAlert('reg-error', 'Passwords do not match.');
  if (!cTos)  return showAlert('reg-error', 'You must agree to the Terms of Service and Privacy Policy.');
  if (!cDisc) return showAlert('reg-error', 'You must acknowledge the financial disclaimer.');
  if (!cAge)  return showAlert('reg-error', 'You must confirm you are 18 or older.');

  const { data, error } = await sb.auth.signUp({
    email, password: pw,
    options: { data: { name } }
  });
  if (error) return showAlert('reg-error', error.message || 'Registration failed. Please try again.');

  // Migrate any guest data into the new account
  if (data.user) await migrateGuestData(data.user.id);

  // Apply promo code if entered
  const promoCode = document.getElementById('promo-code')?.value.trim().toUpperCase();
  if (promoCode && PROMO_CODES[promoCode] && data.user) {
    await applyPromoCode(data.user.id, promoCode);
  }

  const now = new Date().toISOString();
  saveConsents(email, {
    tos:         { given: true,  timestamp: now, version: '1.0' },
    disclaimer:  { given: true,  timestamp: now },
    age:         { given: true,  timestamp: now },
    categoryData:{ given: cCat,  timestamp: now, canWithdraw: true },
  });

  showAlert('reg-success', '', 'success'); // clear any old messages
  document.getElementById('verify-email-display').textContent = email;
  showScreen('verify-screen');
}

async function doLogout() {
  if (!isGuest()) {
    await sb.auth.signOut();
  }
  CURRENT_USER = null;
  GUEST_MODE   = false;
  document.getElementById('main-nav').style.display = 'none';
  document.getElementById('privacy-banner').style.display = 'none';
  document.getElementById('mobile-nav').style.display = 'none';
  // Reset locked tab styles
  ['tools','workforce'].forEach(t => {
    const s = document.getElementById('nav-' + t);
    const m = document.getElementById('mnav-' + t);
    if (s) s.classList.remove('nav-locked');
    if (m) m.classList.remove('nav-locked');
  });
  document.querySelectorAll('.nav-lock-badge').forEach(b => b.style.display = 'none');
  const sidebarCta = document.getElementById('sidebar-guest-cta');
  if (sidebarCta) sidebarCta.style.display = 'none';
  document.getElementById('guest-nav-label').style.display = 'none';
  const tierBadge = document.getElementById('nav-tier-badge');
  if (tierBadge) tierBadge.style.display = 'none';
  showScreen('auth-screen');
}

// Auto-restore session on page load only - login/register call enterApp directly
sb.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_IN' && session && !CURRENT_USER) {
    const email = session.user.email;
    const name  = session.user.user_metadata?.name || email.split('@')[0];
    enterApp(email, name, session.user.id);
  }
  if (event === 'SIGNED_OUT') {
    CURRENT_USER = null;
  }
});

/* ===================================================
   SCREENS & TABS
=================================================== */
function hideSplash() {
  const splash = document.getElementById('tayla-splash');
  if (!splash) return;
  splash.classList.add('fade-out');
  setTimeout(() => splash.remove(), 450);
}

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

async function enterApp(email, name, id) {
  CURRENT_USER = { email, name, id };
  GUEST_MODE   = false;

  // Show the shell immediately -- don't wait for data
  ['tools','workforce'].forEach(t => {
    const s = document.getElementById('nav-' + t);
    const m = document.getElementById('mnav-' + t);
    if (s) s.classList.remove('nav-locked');
    if (m) m.classList.remove('nav-locked');
  });
  document.querySelectorAll('.nav-lock-badge').forEach(b => b.style.display = 'none');
  document.getElementById('guest-nav-label').style.display = 'none';
  document.getElementById('nav-username').textContent = name;
  document.getElementById('nav-tier-badge').style.display = 'inline-flex';
  document.getElementById('main-nav').style.display = 'block';
  document.getElementById('privacy-banner').style.display = 'flex';
  document.getElementById('mobile-nav').style.display = 'block';
  showScreen('app-screen');

  // Fetch tier + data in parallel -- one round trip wait instead of two
  await Promise.all([fetchUserTier(id), loadAllUserData()]);

  applyTierGating();
  // Restore health mode now that tier is known -- never triggers modal on login
  const savedMode = isPlus() ? HEALTH_MODE : 'manual';
  HEALTH_MODE = savedMode;
  applyAccruedExpenses();
  syncConsentUI();
  buildWeekRows();
  hideSplash();
  renderBudget();
  document.getElementById('budget-month-select').value = BUDGET_MONTH;
  // Handle Stripe checkout return
  handleCheckoutReturn();
}

function enterGuest() {
  GUEST_MODE   = true;
  CURRENT_USER = null;
  trackGuestSession();

  // Nav -- hide user name, show guest label + sign-up prompt
  document.getElementById('nav-username').textContent = '';
  document.getElementById('guest-nav-label').style.display = 'flex';
  document.getElementById('main-nav').style.display   = 'block';
  document.getElementById('privacy-banner').style.display = 'none';
  document.getElementById('mobile-nav').style.display = 'block';

  // Lock tabs in sidebar and mobile nav
  ['tools','workforce'].forEach(t => {
    const s = document.getElementById('nav-' + t);
    const m = document.getElementById('mnav-' + t);
    if (s) s.classList.add('nav-locked');
    if (m) m.classList.add('nav-locked');
  });
  // Show lock badges on sidebar items
  document.querySelectorAll('.nav-lock-badge').forEach(b => b.style.display = 'inline');
  // Show sidebar guest CTA
  const sidebarCta = document.getElementById('sidebar-guest-cta');
  if (sidebarCta) sidebarCta.style.display = 'block';

  showScreen('app-screen');
  loadTheme(localStorage.getItem(THEME_LS_KEY) || 'default');
  loadAllUserData().then(() => {
    buildWeekRows();
    renderBudget();
    document.getElementById('budget-month-select').value = BUDGET_MONTH;
    hideSplash();
  });
}

function applyTierGating() {
  const plus = isPlus();

  // Tools tab — lock for guests, unlock for all accounts
  const navTools  = document.getElementById('nav-tools');
  const mnavTools = document.getElementById('mnav-tools');
  if (isGuest()) {
    navTools?.classList.add('nav-locked');
    mnavTools?.classList.add('nav-locked');
  } else {
    navTools?.classList.remove('nav-locked');
    mnavTools?.classList.remove('nav-locked');
  }

  // Workforce tab — locked until invite accepted
  refreshWorkforceLock();

  // -- Auto health toggle --
  const autoBtn = document.getElementById('health-btn-auto');
  if (autoBtn) {
    autoBtn.disabled = !plus;
    autoBtn.style.opacity = plus ? '' : '0.4';
    autoBtn.title = plus ? '' : 'Tayla Plus feature';
    // Force manual mode for non-plus without triggering the upgrade modal
    if (!plus) {
      HEALTH_MODE = 'manual';
      document.getElementById('health-btn-auto')?.classList.remove('active');
      document.getElementById('health-btn-manual')?.classList.add('active');
      document.getElementById('health-manual-card') && (document.getElementById('health-manual-card').style.display = 'block');
      document.getElementById('health-auto-card')   && (document.getElementById('health-auto-card').style.display   = 'none');
    }
  }

  // -- Debt Register card --
  const debtCard = document.getElementById('debt-register-card');
  if (debtCard) {
    debtCard.classList.toggle('tier-locked', !plus);
    const overlay = debtCard.querySelector('.tier-lock-overlay');
    if (overlay) overlay.style.display = plus ? 'none' : 'flex';
  }

  // -- Recurring Expenses card --
  const accruedCard = document.getElementById('accrued-card');
  if (accruedCard) {
    accruedCard.classList.toggle('tier-locked', !plus);
    const overlay = accruedCard.querySelector('.tier-lock-overlay');
    if (overlay) overlay.style.display = plus ? 'none' : 'flex';
  }

  // -- Savings rate options in budget --
  ['savings rate|Savings/Investment','savings rate|Emergency Fund',
   'savings draw|Emergency Fund','savings draw|Savings/Investment'].forEach(val => {
    const opt = document.querySelector(`option[value="${val}"]`);
    if (opt) {
      opt.disabled = !plus;
      opt.textContent = opt.textContent.replace(' * Plus', '') + (!plus ? ' * Plus' : '');
    }
  });

  // -- Sidebar Plus CTA --
  const plusCta = document.getElementById('sidebar-plus-cta');
  if (plusCta) plusCta.style.display = plus ? 'none' : 'block';

  // -- Nav tier badge --
  const tierBadge = document.getElementById('nav-tier-badge');
  if (tierBadge) {
    tierBadge.textContent = plus ? '* Plus' : 'Free';
    tierBadge.className   = 'nav-tier-badge ' + (plus ? 'badge-plus' : 'badge-free');
  }
}

function setMobileNav(el) {
  document.querySelectorAll('.mobile-nav-item').forEach(i => i.classList.remove('active'));
  el.classList.add('active');
}

function openTab(t) {
  // Guest: only Income + Budget
  if (isGuest() && !GUEST_ALLOWED_TABS.includes(t)) {
    openModal('guest-upgrade-modal');
    return;
  }
  // Free: no Portfolio (inside tools)
  if (!isGuest() && !isPlus() && t === 'goals') {
    openModal('plus-upgrade-modal');
    return;
  }
  // Workforce: requires account (not guest) + active connection
  if (t === 'workforce') {
    if (isGuest()) { openModal('guest-upgrade-modal'); return; }
    // Allow through — panel handles the connected/not-connected state
  }
  // Legacy direct health/goals tabs still work (redirect to tools)
  if (t === 'health' || t === 'goals') {
    openTab('tools');
    openToolsSubtab(t);
    return;
  }

  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.sidebar-item[id^=nav-]').forEach(i => i.classList.remove('active'));
  document.querySelectorAll('.mobile-nav-item[id^=mnav-]').forEach(i => i.classList.remove('active'));
  document.getElementById('panel-' + t)?.classList.add('active');
  document.getElementById('nav-' + t)?.classList.add('active');
  document.getElementById('mnav-' + t)?.classList.add('active');

  if (t === 'tools')      renderToolsTab();
  if (t === 'workforce')  renderWorkforceTab();
}

/* ===================================================
   MODALS
=================================================== */
function openModal(id)  { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }
// Close on backdrop click
document.querySelectorAll('.modal-overlay').forEach(o => {
  o.addEventListener('click', e => { if (e.target === o) o.classList.remove('open'); });
});

/* ===================================================
   CONSENT / SETTINGS LOGIC
=================================================== */
function syncConsentUI() {
  if (!CURRENT_USER) return;
  const c = getConsents(CURRENT_USER.email);
  const hasCat = c.categoryData && c.categoryData.given;
  document.getElementById('settings-cat-toggle').checked = hasCat;
  document.getElementById('cat-toggle-status').textContent = hasCat ? 'On' : 'Off';
  document.getElementById('sidebar-consent-status').textContent = hasCat ? 'on' : 'off';
  document.getElementById('cat-consent-notice').style.display = hasCat ? 'block' : 'none';
  syncSettingsAccountUI();
}

function syncSettingsAccountUI() {
  const plus = isPlus();
  const guest = isGuest();
  const badge = document.getElementById('settings-plan-badge');
  const desc  = document.getElementById('settings-plan-desc');
  const upgradeRow = document.getElementById('settings-upgrade-row');
  const cancelRow  = document.getElementById('settings-cancel-row');
  const guestRow   = document.getElementById('settings-guest-row');
  const emailEl    = document.getElementById('settings-email-display');

  // Email / guest label
  if (emailEl) {
    emailEl.textContent = guest ? 'Guest -- not signed in' : (CURRENT_USER?.email || '');
  }

  // Guest row (mobile save data CTA)
  if (guestRow) guestRow.style.display = guest ? 'flex' : 'none';

  if (!badge) return;

  if (guest) {
    badge.textContent = '👤 Guest';
    badge.className   = 'nav-tier-badge badge-free';
    if (desc) desc.textContent = 'You\'re using Tayla as a guest. Create a free account to save your data.';
    if (upgradeRow) upgradeRow.style.display = 'none';
    if (cancelRow)  cancelRow.style.display  = 'none';
  } else if (plus) {
    badge.textContent = '* Plus';
    badge.className   = 'nav-tier-badge badge-plus';
    if (desc) desc.textContent = 'You\'re on Tayla Plus. Thank you for supporting Tayla!';
    if (upgradeRow) upgradeRow.style.display = 'none';
    if (cancelRow)  cancelRow.style.display  = 'flex';
  } else {
    badge.textContent = 'Free';
    badge.className   = 'nav-tier-badge badge-free';
    if (desc) desc.textContent = 'You\'re on the Free plan. Upgrade to Tayla Plus to unlock all features.';
    if (upgradeRow) upgradeRow.style.display = 'flex';
    if (cancelRow)  cancelRow.style.display  = 'none';
  }
}

async function confirmCancelSubscription() {
  try {
    const { data: profile, error } = await sb
      .from('profiles')
      .select('stripe_customer_id')
      .eq('id', CURRENT_USER.id)
      .single();

    if (error || !profile?.stripe_customer_id) throw new Error('No customer ID found');

    const res = await fetch('https://anspwetxfykbmydrnkwh.supabase.co/functions/v1/customer-portal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customerId: profile.stripe_customer_id, returnUrl: window.location.href }),
    });

    const data = await res.json();
    if (data.url) {
      window.location.href = data.url;
    } else {
      throw new Error(data.error || 'No portal URL returned');
    }
  } catch (e) {
    alert('Something went wrong. Please try again or contact support.');
    console.error('Cancel subscription error:', e);
  }
}

/* ===================================================
   STRIPE CHECKOUT
=================================================== */
async function startCheckout() {
  if (!CURRENT_USER) {
    closeModal('plus-upgrade-modal');
    showScreen('auth-screen');
    switchAuthTab('register');
    return;
  }

  const btn = document.getElementById('checkout-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Loading…'; }

  try {
    const { data: { session } } = await sb.auth.getSession();
    const { data, error } = await sb.functions.invoke('smooth-responder', {
      body: { userId: CURRENT_USER.id, email: CURRENT_USER.email },
      headers: session ? { Authorization: `Bearer ${session.access_token}` } : {},
    });

    if (error) {
      alert('Error: ' + error.message);
      if (btn) { btn.disabled = false; btn.textContent = 'Upgrade to Plus -- $3.99/month'; }
      return;
    }

    if (!data?.url) {
      alert('No checkout URL returned: ' + JSON.stringify(data));
      if (btn) { btn.disabled = false; btn.textContent = 'Upgrade to Plus -- $3.99/month'; }
      return;
    }

    window.location.href = data.url;
  } catch (e) {
    alert('Network error: ' + e.message);
    if (btn) { btn.disabled = false; btn.textContent = 'Upgrade to Plus -- $3.99/month'; }
  }
}

async function handleCheckoutReturn() {
  const params = new URLSearchParams(window.location.search);
  const status = params.get('checkout');
  if (!status) return;

  // Clean URL
  window.history.replaceState({}, '', window.location.pathname);

  if (status === 'success') {
    // Re-fetch tier -- webhook may have already updated it
    if (CURRENT_USER?.id) {
      await fetchUserTier(CURRENT_USER.id);
      applyTierGating();
      syncSettingsAccountUI();
    }
    setTimeout(() => alert('🎉 Welcome to Tayla Plus! All features are now unlocked.'), 500);
  } else if (status === 'cancelled') {
    setTimeout(() => alert('Checkout cancelled -- you\'re still on the Free plan.'), 300);
  }
}


const THEME_LS_KEY = 'tayla_theme';

function setTheme(theme) {
  // Apply to DOM
  if (theme === 'default') {
    document.documentElement.removeAttribute('data-theme');
  } else {
    document.documentElement.setAttribute('data-theme', theme);
  }
  // Update active swatch
  document.querySelectorAll('.theme-swatch').forEach(s => s.classList.remove('active'));
  const active = document.getElementById('swatch-' + theme);
  if (active) active.classList.add('active');
  // Update PWA theme-color meta
  const themeColors = {
    default: '#111e1e', green: '#051a08', blue: '#0a1628',
    pink: '#2a0a1a', red: '#1e0a08', yellow: '#1e1600', black: '#000000'
  };
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', themeColors[theme] || '#111e1e');
  // Re-render budget so pie chart picks up new palette immediately
  if (typeof renderBudget === 'function') renderBudget();
  // Save
  localStorage.setItem(THEME_LS_KEY, theme);
  if (CURRENT_USER?.id) {
    sb.from('profiles').update({ theme, updated_at: new Date().toISOString() })
      .eq('id', CURRENT_USER.id).then(() => {});
  }
}

function loadTheme(theme) {
  if (theme && theme !== 'default') setTheme(theme);
  else setTheme('default');
}

function updateCatConsent() {
  if (!CURRENT_USER) return;
  const val = document.getElementById('settings-cat-toggle').checked;
  const c = getConsents(CURRENT_USER.email);
  c.categoryData = { given: val, timestamp: new Date().toISOString(), canWithdraw: true,
    action: val ? 'consent_given' : 'consent_withdrawn' };
  if (!c.consentHistory) c.consentHistory = [];
  c.consentHistory.push({ type: 'categoryData', given: val, timestamp: new Date().toISOString() });
  saveConsents(CURRENT_USER.email, c);
  syncConsentUI();
}
function updateConsentStatus(type) { /* real-time during reg, no-op here */ }

/* ===================================================
   DATA LOAD / SAVE
=================================================== */
let APP_DATA = { weeks: new Array(52).fill(null), months: new Array(12).fill(null), weeks2: new Array(52).fill(null), months2: new Array(12).fill(null), annualIncome: 0, budget: {}, health: {}, goals: [] };
let BUDGET_MONTH = new Date().getMonth() >= 6 ? new Date().getMonth() - 6 : new Date().getMonth() + 6;
const SYSTEM_GOAL_IDS = { emergency: 'system_emergency', savings: 'system_savings' };

const FY_OPTIONS = [
  { label: 'FY2024-25', key: 'fy2024', start: new Date(2024, 6, 1) }, // 1 Jul 2024
  { label: 'FY2025-26', key: 'fy2025', start: new Date(2025, 6, 1) }, // 1 Jul 2025
  { label: 'FY2026-27', key: 'fy2026', start: new Date(2026, 6, 1) }, // 1 Jul 2026
];
let CURRENT_FY = FY_OPTIONS[1]; // default FY2025-26
let FY_START   = CURRENT_FY.start;


async function loadAllUserData() {
  let saved = {};
  if (CURRENT_USER && CURRENT_USER.id) {
    // Authenticated user -- load from Supabase
    const { data, error } = await sb
      .from('user_data')
      .select('data')
      .eq('user_id', CURRENT_USER.id)
      .eq('fy_key', CURRENT_FY.key)
      .maybeSingle();
    if (!error && data) saved = data.data || {};
  } else if (isGuest()) {
    // Guest -- load from localStorage
    try {
      const raw = localStorage.getItem(GUEST_LS_KEY);
      const all = raw ? JSON.parse(raw) : {};
      saved = all[CURRENT_FY.key] || {};
    } catch { saved = {}; }
  }
  APP_DATA = {
    weeks:        saved.weeks        || new Array(52).fill(null),
    months:       saved.months       || new Array(12).fill(null),
    weeks2:       saved.weeks2       || new Array(52).fill(null),
    months2:      saved.months2      || new Array(12).fill(null),
    annualIncome: saved.annualIncome || 0,
    budget:       saved.budget       || {},
    health:       saved.health       || {},
    goals:        saved.goals        || [],
    debts:        saved.debts        || [],
    accrued:      saved.accrued      || [],
  };
  const h = APP_DATA.health;
  ['income','expenses','emergency','debt','housing','savings'].forEach(k => {
    const el = document.getElementById('h-' + k);
    if (el && h[k]) { el.value = h[k]; }
  });
  refreshAccruedDebtOptions();
}

async function persist() {
  if (CURRENT_USER && CURRENT_USER.id) {
    // Authenticated -- save to Supabase
    await sb.from('user_data').upsert({
      user_id: CURRENT_USER.id,
      fy_key:  CURRENT_FY.key,
      data:    APP_DATA,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,fy_key' });
  } else if (isGuest()) {
    // Guest -- save to localStorage per FY key
    try {
      const raw = localStorage.getItem(GUEST_LS_KEY);
      const all = raw ? JSON.parse(raw) : {};
      all[CURRENT_FY.key] = APP_DATA;
      localStorage.setItem(GUEST_LS_KEY, JSON.stringify(all));
    } catch (e) { console.warn('Guest persist failed:', e); }
  }
}

/* ===================================================
   TAX CALCULATOR -- multi-mode
=================================================== */

// All tax logic works on ANNUAL figures internally, then converts for display
// ATO 2024-25 brackets (annual)
const ANNUAL_BRACKETS = [
  { min: 0,       max: 18200,  base: 0,      rate: 0    },
  { min: 18200,   max: 45000,  base: 0,      rate: 0.16 },
  { min: 45000,   max: 135000, base: 4288,   rate: 0.30 },
  { min: 135000,  max: 190000, base: 31288,  rate: 0.37 },
  { min: 190000,  max: Infinity,base:51638,  rate: 0.45 },
];

function calcTaxAnnual(annual) {
  annual = parseFloat(annual) || 0;
  if (annual <= 18200)  return 0;
  if (annual <= 45000)  return (annual - 18200) * 0.16;
  if (annual <= 135000) return (annual - 45000) * 0.30 + 4288;
  if (annual <= 190000) return (annual - 135000) * 0.37 + 31288;
  return (annual - 190000) * 0.45 + 51638;
}

// Convert a period gross to annual, calc tax, return period tax
function calcTaxForPeriod(periodGross, mode) {
  // All calculations routed through daily rate for maximum accuracy
  const days = mode === 'weekly' ? 7 : mode === 'monthly' ? (365 / 12) : 365;
  const dailyGross = periodGross / days;
  const annualGross = dailyGross * 365;
  const annualTax = calcTaxAnnual(annualGross);
  const dailyTax = annualTax / 365;
  return parseFloat((dailyTax * days).toFixed(2));
}

// Reverse: given a net period amount, find the gross via binary search
function netToGrossPeriod(netAmount, mode) {
  if (!netAmount || netAmount <= 0) return 0;
  let lo = netAmount, hi = netAmount * 2.5, mid, tax;
  for (let i = 0; i < 60; i++) {
    mid = (lo + hi) / 2;
    tax = calcTaxForPeriod(mid, mode);
    const calcNet = mid - tax;
    if (Math.abs(calcNet - netAmount) < 0.001) break;
    if (calcNet < netAmount) lo = mid;
    else hi = mid;
  }
  return parseFloat(mid.toFixed(2));
}

// Reverse: given annual net, find gross via binary search
function netToGrossAnnual(netAnnual) {
  if (!netAnnual || netAnnual <= 0) return 0;
  let lo = netAnnual, hi = netAnnual * 2.5, mid, tax;
  for (let i = 0; i < 60; i++) {
    mid = (lo + hi) / 2;
    tax = calcTaxAnnual(mid);
    const calcNet = mid - tax;
    if (Math.abs(calcNet - netAnnual) < 0.001) break;
    if (calcNet < netAnnual) lo = mid;
    else hi = mid;
  }
  return parseFloat(mid.toFixed(2));
}

// -- INPUT MODE (gross vs net) --
let INPUT_MODE = 'gross'; // 'gross' | 'net'

function setInputMode(mode) {
  INPUT_MODE = mode;
  // Update toggle buttons
  document.getElementById('input-btn-gross').classList.toggle('active', mode === 'gross');
  document.getElementById('input-btn-net').classList.toggle('active', mode === 'net');

  const hint      = document.getElementById('input-mode-hint');
  const inputCol  = document.getElementById('head-input-col');
  const rightCol  = document.getElementById('head-right-col');
  const modeDesc  = document.getElementById('mode-desc');
  const annLabel  = document.getElementById('annual-input-label');
  const cfg       = MODE_CONFIG[TAX_MODE];

  if (mode === 'net') {
    hint.innerHTML = 'Enter your <strong>take-home pay</strong> -- Tayla reverse-calculates your gross and tax.';
    if (inputCol) inputCol.textContent = 'Net Pay ($)';
    if (rightCol) rightCol.textContent = 'Gross Pay';
    if (annLabel) annLabel.textContent = 'Enter your annual net (take-home) income';
    if (modeDesc && cfg) modeDesc.textContent = cfg.desc.replace('gross', 'net (take-home)');
  } else {
    hint.innerHTML = 'Enter your pay <strong>before tax</strong> -- Tayla calculates your take-home.';
    if (inputCol) inputCol.textContent = 'Gross Pay ($)';
    if (rightCol) rightCol.textContent = 'Net Pay';
    if (annLabel) annLabel.textContent = 'Enter your annual gross income';
    if (modeDesc && cfg) modeDesc.textContent = cfg.desc;
  }
  // Rebuild rows with updated input values and column order
  if (TAX_MODE !== 'annual') buildPeriodRows();
}

function getBracketAnnual(annual) {
  if (annual <= 18200)  return 0;
  if (annual <= 45000)  return 1;
  if (annual <= 135000) return 2;
  if (annual <= 190000) return 3;
  return 4;
}

const fmt  = n => '$' + (parseFloat(n)||0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const fmtK = n => n >= 1000 ? '$' + (n/1000).toFixed(1) + 'k' : fmt(n);
const fmtInt = n => '$' + Math.round(parseFloat(n)||0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');

// -- MODE STATE --
let TAX_MODE = 'weekly'; // 'weekly' | 'monthly' | 'annual'

const MODE_CONFIG = {
  weekly: {
    count: 52, label: 'Week', plural: 'weeks',
    desc: 'Enter your weekly gross pay for each of the 52 weeks in the financial year.',
    bracketSub: 'Weekly equivalent · 2024–25',
    summaryTitle: 'Annual Summary',
    summarySub: 'Based on entered weeks',
    grossLabel: 'Total Gross Income',
    netLabel: 'Total Net Income',
    brackets: [
      ['$0 – $350 / wk',        '0%'],
      ['$350 – $865 / wk',      '16¢ per $1 over $350'],
      ['$865 – $2,596 / wk',    '30¢ + $82.46'],
      ['$2,596 – $3,654 / wk',  '37¢ + $729.23'],
      ['$3,654+ / wk',          '45¢ + $1,120.96'],
    ],
    jumpMax: 52,
  },
  monthly: {
    count: 12, label: 'Month', plural: 'months',
    desc: 'Enter your gross income for each of the 12 months in the financial year.',
    bracketSub: 'Monthly equivalent · 2024–25',
    summaryTitle: 'Annual Summary',
    summarySub: 'Based on entered months',
    grossLabel: 'Total Gross Income',
    netLabel: 'Total Net Income',
    brackets: [
      ['$0 – $1,517 / mth',     '0%'],
      ['$1,517 – $3,750 / mth', '16¢ per $1 over $1,517'],
      ['$3,750 – $11,250 / mth','30¢ + $357.33'],
      ['$11,250 – $15,833 / mth','37¢ + $2,607.33'],
      ['$15,833+ / mth',        '45¢ + $4,303.17'],
    ],
    jumpMax: 12,
  },
  annual: {
    count: 1, label: 'Year', plural: 'year',
    desc: 'Enter your total annual gross income to see your full-year tax breakdown instantly.',
    bracketSub: 'Annual · 2024–25',
    summaryTitle: 'Annual Summary',
    summarySub: 'Based on annual income',
    grossLabel: 'Annual Gross Income',
    netLabel: 'Annual Net Income',
    brackets: [
      ['$0 – $18,200 / yr',     '0%'],
      ['$18,200 – $45,000 / yr','16¢ per $1 over $18,200'],
      ['$45,001 – $135,000 / yr','30¢ + $4,288'],
      ['$135,001 – $190,000 / yr','37¢ + $31,288'],
      ['$190,001+ / yr',        '45¢ + $51,638'],
    ],
    jumpMax: 1,
  },
};

const MONTH_NAMES = ['Jul','Aug','Sep','Oct','Nov','Dec','Jan','Feb','Mar','Apr','May','Jun'];

function setMode(mode) {
  TAX_MODE = mode;
  const cfg = MODE_CONFIG[mode];

  // Buttons
  ['weekly','monthly','annual'].forEach(m => {
    document.getElementById('mode-btn-'+m).className = 'mode-btn' + (m === mode ? ' active' : '');
  });

  // Desc (mode-desc element is optional now)
  const modeDescEl = document.getElementById('mode-desc');
  if (modeDescEl) modeDescEl.textContent = INPUT_MODE === 'net'
    ? cfg.desc.replace('gross', 'net (take-home)')
    : cfg.desc;

  // Show/hide table vs annual input
  const isAnnual = mode === 'annual';
  document.getElementById('period-table-wrap').style.display  = isAnnual ? 'none' : 'block';
  document.getElementById('annual-input-wrap').className = 'annual-input-wrap' + (isAnnual ? ' visible' : '');

  // Summary labels
  document.getElementById('summary-title').textContent   = cfg.summaryTitle;
  document.getElementById('summary-sub').textContent     = cfg.summarySub;
  document.getElementById('sum-gross-label').textContent = cfg.grossLabel;
  document.getElementById('sum-net-label').textContent   = cfg.netLabel;
  document.getElementById('bracket-sub').textContent     = cfg.bracketSub;

  // Table head
  document.getElementById('head-period').textContent = cfg.label;
  document.getElementById('jump-input').max = cfg.jumpMax;
  document.getElementById('jump-input').placeholder = 'Jump to ' + cfg.label.toLowerCase() + '…';
  document.getElementById('periods-of-label').textContent = 'of ' + cfg.count + ' ' + cfg.plural;

  // Bracket table
  cfg.brackets.forEach((b, i) => {
    document.querySelector('#br'+i+' .b-range').textContent = b[0];
    document.querySelector('#br'+i+' .b-rate').textContent  = b[1];
  });

  // Annualised projection row -- only show in weekly/monthly
  document.getElementById('annualised-row').style.display = 'none';

  if (!isAnnual) buildPeriodRows();
  else {
    renderAnnualSummary();
  }
}

function getWeekLabel(i) {
  const weekStart = new Date(FY_START);
  weekStart.setDate(FY_START.getDate() + i * 7);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  const fmt = d => d.getDate() + ' ' + ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getMonth()];
  return fmt(weekStart) + ' – ' + fmt(weekEnd);
}

function buildPeriodRows() {
  const cfg = MODE_CONFIG[TAX_MODE];
  const data = TAX_MODE === 'weekly' ? APP_DATA.weeks : APP_DATA.months;
  const container = document.getElementById('period-rows');
  container.innerHTML = '';

  // Update header
  const headInput = document.getElementById('head-input-col');
  const headRight = document.getElementById('head-right-col');
  if (headInput) headInput.textContent = 'Income 1 ($)';
  if (headRight) headRight.textContent = 'Income 2 ($)';
  const headCombined = document.getElementById('head-combined-col');
  if (headCombined) headCombined.textContent = 'Combined';

  const data2 = TAX_MODE === 'weekly' ? APP_DATA.weeks2 : APP_DATA.months2;

  // Check if any data exists
  const hasAnyData = data.some((v, i) => v || data2[i]);

  // Empty state
  if (!hasAnyData) {
    const empty = document.createElement('div');
    empty.id = 'income-empty-state';
    empty.style.cssText = 'text-align:center;padding:48px 24px;color:var(--ink-3)';
    empty.innerHTML = `
      <div style="font-size:2rem;margin-bottom:12px"></div>
      <div style="font-size:1rem;font-weight:600;color:var(--ink-1);margin-bottom:8px">Add your first pay to get started</div>
      <div style="font-size:0.82rem;margin-bottom:20px;line-height:1.5">Enter your gross pay for any week below.<br>Tayla will calculate your take-home automatically.</div>
      <button class="btn btn-primary btn-sm" onclick="expandAndFocusCurrentWeek()">Enter first pay -></button>
    `;
    container.appendChild(empty);
  }

  for (let i = 0; i < cfg.count; i++) {
    const label    = TAX_MODE === 'monthly' ? MONTH_NAMES[i] : getWeekLabel(i);
    const val1     = data[i]  || 0;
    const val2     = data2[i] || 0;
    const row = document.createElement('div');
    // Collapse empty rows by default -- show rows with data, first 4 rows, or if expanded
    const hasValue = (data[i] !== null && data[i] !== undefined && data[i] !== 0) || (data2[i] !== null && data2[i] !== undefined && data2[i] !== 0);
    // Calculate current week index relative to FY_START
    const today = new Date();
    const msPerWeek = 7 * 24 * 60 * 60 * 1000;
    const currentWeekIndex = Math.floor((today - FY_START) / msPerWeek);
    const showFrom = Math.max(0, currentWeekIndex - 3); // 4 weeks ending at current week
    const showTo = Math.min(cfg.count - 1, currentWeekIndex);
    const inDefaultRange = i >= showFrom && i <= showTo;
    row.className = 'week-row' + (hasValue ? ' has-value' : '') + (!hasValue && !inDefaultRange && !window._incomeExpanded ? ' week-row-hidden' : '');
    row.id = 'wr' + i;
    const combined = val1 + val2;
    row.innerHTML = `
      <div class="wc wc-label">${label}</div>
      <div class="wc"><input class="wc-input" type="number" min="0" step="0.01" placeholder="0.00"
        id="wi${i}" value="${val1 ? val1 : ''}" oninput="onPeriodInput(${i})" onchange="onPeriodInput(${i})"></div>
      <div class="wc"><input class="wc-input" type="number" min="0" step="0.01" placeholder="0.00"
        id="wi2${i}" value="${val2 ? val2 : ''}" oninput="onPeriodInput2(${i})" onchange="onPeriodInput2(${i})"></div>
      <div class="wc wc-net ${combined ? '' : 'wc-empty'}" id="wn${i}">${combined ? fmt(combined) : '--'}</div>`;
    container.appendChild(row);
  }

  // Add expand/collapse toggle
  const existingToggle = document.getElementById('income-expand-toggle');
  if (existingToggle) existingToggle.remove();
  const toggle = document.createElement('div');
  toggle.id = 'income-expand-toggle';
  toggle.style.cssText = 'text-align:center;padding:10px;font-size:0.78rem;color:var(--ink-3);cursor:pointer;border-top:1px solid var(--rule)';
  toggle.onclick = toggleIncomeExpand;
  toggle.textContent = window._incomeExpanded ? '^ Show less' : 'v Show all ' + cfg.count + (TAX_MODE === 'weekly' ? ' weeks' : ' months');
  container.appendChild(toggle);

  refreshPeriodSummary();
}

function expandAndFocusCurrentWeek() {
  const empty = document.getElementById('income-empty-state');
  if (empty) empty.remove();
  const today = new Date();
  const idx = Math.max(0, Math.floor((today - FY_START) / (7 * 24 * 60 * 60 * 1000)));
  const el = document.getElementById('wi' + idx) || document.getElementById('wi0');
  if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.focus(); }
}

function toggleIncomeExpand() {
  window._incomeExpanded = !window._incomeExpanded;
  buildPeriodRows();
}

// FY_START is set dynamically from CURRENT_FY

function calMonthIndex(date) {
  // Returns FY month index (Jul=0 ... Jun=11) for a given date
  const m = date.getMonth();
  return m >= 6 ? m - 6 : m + 6;
}

function getWeekMonth(weekIndex) {
  // Returns FY month of the week's start day (used for budget mapping)
  const d = new Date(FY_START);
  d.setDate(FY_START.getDate() + weekIndex * 7);
  return calMonthIndex(d);
}

function getWeeksForMonth(monthIndex) {
  // Returns week indices where the majority of days fall in this month
  const weeks = [];
  for (let w = 0; w < 52; w++) {
    if (getWeekMonth(w) === monthIndex) weeks.push(w);
  }
  return weeks;
}

function syncWeeksToMonths() {
  // Split each week's earnings proportionally across the months its days fall in
  const monthTotals = new Array(12).fill(0);
  for (let w = 0; w < 52; w++) {
    const weekGross = APP_DATA.weeks[w] || 0;
    if (!weekGross) continue;
    const dailyRate = weekGross / 7;
    for (let d = 0; d < 7; d++) {
      const day = new Date(FY_START);
      day.setDate(FY_START.getDate() + w * 7 + d);
      monthTotals[calMonthIndex(day)] += dailyRate;
    }
  }
  for (let m = 0; m < 12; m++) {
    APP_DATA.months[m] = monthTotals[m] > 0 ? parseFloat(monthTotals[m].toFixed(2)) : null;
  }
}

function syncWeeks2ToMonths2() {
  const monthTotals = new Array(12).fill(0);
  for (let w = 0; w < 52; w++) {
    const weekGross = APP_DATA.weeks2[w] || 0;
    if (!weekGross) continue;
    const dailyRate = weekGross / 7;
    for (let d = 0; d < 7; d++) {
      const day = new Date(FY_START);
      day.setDate(FY_START.getDate() + w * 7 + d);
      monthTotals[calMonthIndex(day)] += dailyRate;
    }
  }
  for (let m = 0; m < 12; m++) {
    APP_DATA.months2[m] = monthTotals[m] > 0 ? parseFloat(monthTotals[m].toFixed(2)) : null;
  }
}

function onPeriodInput(i) {
  const val1 = parseFloat(document.getElementById('wi'+i).value) || 0;
  if (TAX_MODE === 'weekly') {
    APP_DATA.weeks[i] = val1 || null;
    syncWeeksToMonths();
    syncWeeks2ToMonths2();
  }
  if (TAX_MODE === 'monthly') {
    APP_DATA.months[i] = val1 || null;
  }
  // Read val2 from stored data (not DOM) to avoid stale values
  const val2 = TAX_MODE === 'weekly' ? (APP_DATA.weeks2[i] || 0) : (APP_DATA.months2[i] || 0);
  const combined = val1 + val2;
  refreshPeriodRow(i);
  refreshPeriodSummary();
  autoAddToBudget(i, combined);
  persist();
}

function onPeriodInput2(i) {
  const val2 = parseFloat(document.getElementById('wi2'+i).value) || 0;
  if (TAX_MODE === 'weekly') {
    APP_DATA.weeks2[i] = val2 || null;
    syncWeeks2ToMonths2();
  }
  if (TAX_MODE === 'monthly') {
    APP_DATA.months2[i] = val2 || null;
  }
  // Read val1 from stored data (not DOM) to avoid stale values
  const val1 = TAX_MODE === 'weekly' ? (APP_DATA.weeks[i] || 0) : (APP_DATA.months[i] || 0);
  const combined = val1 + val2;
  refreshPeriodRow(i);
  refreshPeriodSummary();
  autoAddToBudget(i, combined);
  persist();
}

function autoAddToBudget(periodIndex, netVal) {
  let budgetMonthIndex;
  if (TAX_MODE === 'monthly') {
    budgetMonthIndex = periodIndex;
  } else if (TAX_MODE === 'weekly') {
    budgetMonthIndex = getWeekMonth(periodIndex);
  } else {
    budgetMonthIndex = BUDGET_MONTH;
  }

  if (!APP_DATA.budget[budgetMonthIndex]) APP_DATA.budget[budgetMonthIndex] = [];

  if (TAX_MODE === 'weekly') {
    // Sum all weeks in this month -- combined income 1 + income 2
    let monthlyTotal = 0;
    for (let w = 0; w < 52; w++) {
      if (getWeekMonth(w) === budgetMonthIndex) {
        monthlyTotal += (APP_DATA.weeks[w] || 0) + (APP_DATA.weeks2[w] || 0);
      }
    }
    APP_DATA.budget[budgetMonthIndex] = APP_DATA.budget[budgetMonthIndex]
      .filter(e => e.autoTaxPeriod !== 'weekly_month_' + budgetMonthIndex);
    if (monthlyTotal > 0) {
      APP_DATA.budget[budgetMonthIndex].push({
        id: Date.now(),
        desc: MONTH_NAMES[budgetMonthIndex] + ' salary (after tax)',
        amount: parseFloat(monthlyTotal.toFixed(2)),
        type: 'income',
        cat: 'Salary/Wages',
        date: new Date().toLocaleDateString('en-AU'),
        autoTaxPeriod: 'weekly_month_' + budgetMonthIndex,
      });
    }
  } else {
    APP_DATA.budget[budgetMonthIndex] = APP_DATA.budget[budgetMonthIndex]
      .filter(e => e.autoTaxPeriod !== periodIndex + '_' + TAX_MODE);
    if (netVal > 0) {
      APP_DATA.budget[budgetMonthIndex].push({
        id: Date.now(),
        desc: MONTH_NAMES[periodIndex] + ' salary (after tax)',
        amount: parseFloat(netVal.toFixed(2)),
        type: 'income',
        cat: 'Salary/Wages',
        date: new Date().toLocaleDateString('en-AU'),
        autoTaxPeriod: periodIndex + '_' + TAX_MODE,
      });
    }
  }
  renderBudget();
}

function refreshPeriodRow(i) {
  const data1 = TAX_MODE === 'weekly' ? APP_DATA.weeks  : APP_DATA.months;
  const data2 = TAX_MODE === 'weekly' ? APP_DATA.weeks2 : APP_DATA.months2;
  const combined = (data1[i] || 0) + (data2[i] || 0);
  const row     = document.getElementById('wr'+i);
  const combEl  = document.getElementById('wn'+i);
  if (combined > 0) {
    row.classList.add('has-value');
    if (combEl) { combEl.textContent = fmt(combined); combEl.className = 'wc wc-net'; }
  } else {
    row.classList.remove('has-value');
    if (combEl) { combEl.textContent = '--'; combEl.className = 'wc wc-net wc-empty'; }
  }
}

function refreshPeriodSummary() {
  const cfg   = MODE_CONFIG[TAX_MODE];
  const data1 = TAX_MODE === 'weekly' ? APP_DATA.weeks  : APP_DATA.months;
  const data2 = TAX_MODE === 'weekly' ? APP_DATA.weeks2 : APP_DATA.months2;
  let totalNet = 0, filled = 0;
  for (let i = 0; i < cfg.count; i++) {
    const n = (data1[i] || 0) + (data2[i] || 0);
    if (n > 0) { totalNet += n; filled++; }
  }
  // Show net as the primary figure in summary -- tax is unknown (net only mode)
  document.getElementById('s-gross').textContent      = fmt(totalNet);
  document.getElementById('s-tax').textContent        = '--';
  document.getElementById('s-net').textContent        = '--';
  document.getElementById('eff-rate-pct').textContent = '--';
  document.getElementById('rate-fill').style.width    = '0%';
  document.getElementById('periods-filled').textContent = filled;

  // Annualised projection
  const annRow = document.getElementById('annualised-row');
  if (filled > 0 && filled < cfg.count) {
    const avgNet   = totalNet / filled;
    const projNet  = avgNet * cfg.count;
    document.getElementById('proj-gross').textContent = '--';
    document.getElementById('proj-net').textContent   = fmt(projNet);
    annRow.style.display = 'block';
  } else {
    annRow.style.display = 'none';
  }
}
// Sums all monthly entries and updates the annual view + right panel
function renderAnnualSummary() {
  const total = APP_DATA.months.reduce((sum, v, i) => sum + (v || 0) + (APP_DATA.months2[i] || 0), 0);
  const resultsEl = document.getElementById('annual-net-results');
  const displayEl = document.getElementById('annual-total-display');

  if (!total) {
    if (displayEl) { displayEl.textContent = '--'; displayEl.style.color = 'var(--ink-3)'; }
    if (resultsEl) resultsEl.style.display = 'none';
    setSummary(0, 0);
    return;
  }

  if (displayEl) { displayEl.textContent = fmt(total); displayEl.style.color = 'var(--ink)'; }
  document.getElementById('ar-monthly-net').textContent   = fmt(total / 12);
  document.getElementById('ar-fortnight-net').textContent = fmt(total / 26);
  document.getElementById('ar-weekly-net').textContent    = fmt(total / 52);
  if (resultsEl) resultsEl.style.display = 'block';
  // Update right panel with total (net entered directly, tax unknown)
  setSummary(total, 0);
}
// Standalone tax calculator -- never touches the right summary panel
function onTaxCalcInput() {
  let entered = parseFloat(document.getElementById('annual-input').value) || 0;
  const annual = INPUT_MODE === 'net' ? netToGrossAnnual(entered) : entered;

  if (!entered) {
    document.getElementById('annual-results').style.display    = 'none';
    document.getElementById('annual-breakdowns').style.display = 'none';
    highlightBracket(0, false);
    return;
  }

  const tax = calcTaxAnnual(annual);
  const net = annual - tax;

  document.getElementById('ar-tax').textContent  = fmtInt(tax);
  document.getElementById('ar-net').textContent  = fmtInt(net);
  document.getElementById('ar-rate').textContent = annual > 0 ? ((tax / annual) * 100).toFixed(1) + '%' : '0%';
  document.getElementById('annual-results').style.display = 'flex';

  const monthlyNet = net / 12,  monthlyTax = tax / 12;
  const fnNet      = net / 26,  fnTax      = tax / 26;
  const weeklyNet  = net / 52,  weeklyTax  = tax / 52;
  document.getElementById('ar-monthly-net-calc').textContent   = fmtInt(monthlyNet);
  document.getElementById('ar-monthly-tax').textContent        = 'tax: ' + fmtInt(monthlyTax);
  document.getElementById('ar-fortnight-net-calc').textContent = fmtInt(fnNet);
  document.getElementById('ar-fortnight-tax').textContent      = 'tax: ' + fmtInt(fnTax);
  document.getElementById('ar-weekly-net-calc').textContent    = fmtInt(weeklyNet);
  document.getElementById('ar-weekly-tax').textContent         = 'tax: ' + fmtInt(weeklyTax);
  document.getElementById('annual-breakdowns').style.display = 'grid';

  highlightBracket(annual, true);
}

function setSummary(gross, tax) {
  const net  = gross - tax;
  const rate = gross > 0 ? (tax / gross) * 100 : 0;
  document.getElementById('s-gross').textContent       = fmt(gross);
  document.getElementById('s-tax').textContent         = fmt(tax);
  document.getElementById('s-net').textContent         = fmt(net);
  document.getElementById('eff-rate-pct').textContent  = rate.toFixed(1) + '%';
  document.getElementById('rate-fill').style.width     = Math.min(rate, 60) * (100/60) + '%';
}

function highlightBracket(annualGross, hasData) {
  const active = getBracketAnnual(annualGross);
  for (let i = 0; i < 5; i++) {
    document.getElementById('br'+i).className = (i === active && hasData) ? 'b-active' : '';
  }
}

function jumpToPeriod(val) {
  const n = parseInt(val);
  const max = MODE_CONFIG[TAX_MODE].count;
  if (n >= 1 && n <= max) {
    const el = document.getElementById('wr'+(n-1));
    if (el) el.scrollIntoView({ behavior:'smooth', block:'center' });
  }
}

// Keep old name for enterApp compatibility
function buildWeekRows() { setMode(TAX_MODE); }

function toggleTaxCalc() {
  const body  = document.getElementById('tax-calc-body');
  const label = document.getElementById('tax-calc-toggle-label');
  const open  = body.style.display === 'none';
  body.style.display  = open ? 'block' : 'none';
  label.textContent   = open ? 'Hide' : 'Show';
}

async function changeFY(sourceId) {
  const id = sourceId || 'fy-select-tax';
  const el = document.getElementById(id);
  const key = el ? el.value : FY_OPTIONS[0].key;
  CURRENT_FY = FY_OPTIONS.find(f => f.key === key) || FY_OPTIONS[1];
  FY_START   = CURRENT_FY.start;
  // Sync both dropdowns
  ['fy-select-tax','fy-select-budget'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = CURRENT_FY.key;
  });
  await loadAllUserData();
  buildPeriodRows();
  refreshPeriodSummary();
  renderBudget();
  renderGoals();
  if (TAX_MODE === 'annual') renderAnnualSummary();
  document.getElementById('budget-month-select').value = BUDGET_MONTH;
}

function clearTaxData() {
  if (!confirm('Clear all tax data including weeks, months and annual?')) return;
  APP_DATA.weeks        = new Array(52).fill(null);
  APP_DATA.months       = new Array(12).fill(null);
  APP_DATA.weeks2       = new Array(52).fill(null);
  APP_DATA.months2      = new Array(12).fill(null);
  APP_DATA.annualIncome = 0;
  // Clear all auto-populated salary entries from budget
  Object.keys(APP_DATA.budget).forEach(m => {
    APP_DATA.budget[m] = (APP_DATA.budget[m] || []).filter(e => !e.autoTaxPeriod);
  });
  persist();
  document.getElementById('annual-input').value = '';
  renderAnnualSummary();
  buildPeriodRows();
  refreshPeriodSummary();
  renderBudget();
}

function exportCSV() {
  let csv, filename;
  if (TAX_MODE === 'annual') {
    const g = APP_DATA.months.reduce((s, v) => s + (v || 0), 0);
    csv = 'Period,Total Net Income\n';
    csv += `Annual,${g.toFixed(2)}\n`;
    filename = 'tayla-tax-annual';
  } else if (TAX_MODE === 'monthly') {
    csv = 'Month,Gross Pay,Tax,Net Pay\n';
    MONTH_NAMES.forEach((m, i) => {
      const g = APP_DATA.months[i] || 0;
      const t = calcTaxForPeriod(g, 'monthly');
      csv += `${m},${g.toFixed(2)},${t.toFixed(2)},${(g-t).toFixed(2)}\n`;
    });
    filename = 'tayla-tax-monthly';
  } else {
    csv = 'Week,Gross Pay,Tax,Net Pay\n';
    for (let i = 0; i < 52; i++) {
      const g = APP_DATA.weeks[i] || 0;
      const t = calcTaxForPeriod(g, 'weekly');
      csv += `${i+1},${g.toFixed(2)},${t.toFixed(2)},${(g-t).toFixed(2)}\n`;
    }
    filename = 'tayla-tax-weekly';
  }
  const a = document.createElement('a');
  a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
  a.download = filename + '-' + new Date().toISOString().split('T')[0] + '.csv';
  a.click();
}

/* ===================================================
   BUDGET TRACKER
=================================================== */
// Theme-aware pie chart palettes -- each is a harmonious set of
// desaturated hues tinted toward the theme's accent colour.
const THEME_PALETTES = {
  default: {
    'Salary/Wages':       '#4a6fa5','Freelance':           '#6b7fd7',
    'Other Income':       '#7e8fbf','Rent/Mortgage':       '#2d3561',
    'Utilities':          '#5c6bc0','Groceries':           '#546e8a',
    'Dining Out':         '#7986a3','Transport':           '#4a5568',
    'Entertainment':      '#7c6fa0','Clothing':            '#9c8fb5',
    'Insurance':          '#3d4f6e','Subscriptions':       '#6e5fa0',
    'Savings/Investment': '#3a5068','Emergency Fund':      '#4a6880',
    'Debt Repayments':    '#6b4f7a','Healthcare':          '#5b7fa6',
    'Education':          '#7b8fa8','Other Expense':       '#8892a4',
  },
  green: {
    'Salary/Wages':       '#3a6b4a','Freelance':           '#5a8c65',
    'Other Income':       '#7aaa82','Rent/Mortgage':       '#2a4a35',
    'Utilities':          '#4a7a58','Groceries':           '#5a8060',
    'Dining Out':         '#7a9878','Transport':           '#4a5e50',
    'Entertainment':      '#6a8a5a','Clothing':            '#8aaa80',
    'Insurance':          '#3a5a42','Subscriptions':       '#5a7a50',
    'Savings/Investment': '#3a6040','Emergency Fund':      '#4a7050',
    'Debt Repayments':    '#5a6a48','Healthcare':          '#5a8862',
    'Education':          '#789a78','Other Expense':       '#889a84',
  },
  blue: {
    'Salary/Wages':       '#3a5a8a','Freelance':           '#5570b0',
    'Other Income':       '#7090c8','Rent/Mortgage':       '#2a3a6a',
    'Utilities':          '#4560a0','Groceries':           '#4a6080',
    'Dining Out':         '#6878a8','Transport':           '#404e70',
    'Entertainment':      '#5a6898','Clothing':            '#8090b8',
    'Insurance':          '#344878','Subscriptions':       '#5060a0',
    'Savings/Investment': '#304878','Emergency Fund':      '#405888',
    'Debt Repayments':    '#506080','Healthcare':          '#4a70a8',
    'Education':          '#6880a8','Other Expense':       '#7888a8',
  },
  pink: {
    'Salary/Wages':       '#8a4a6a','Freelance':           '#a86080',
    'Other Income':       '#c08098','Rent/Mortgage':       '#6a2a4a',
    'Utilities':          '#9a5070','Groceries':           '#885068',
    'Dining Out':         '#a87088','Transport':           '#6a4a58',
    'Entertainment':      '#9a5878','Clothing':            '#b87890',
    'Insurance':          '#6a3858','Subscriptions':       '#985070',
    'Savings/Investment': '#684060','Emergency Fund':      '#785070',
    'Debt Repayments':    '#885068','Healthcare':          '#8a5878',
    'Education':          '#a07888','Other Expense':       '#a08088',
  },
  red: {
    'Salary/Wages':       '#8a4a3a','Freelance':           '#aa6050',
    'Other Income':       '#c08070','Rent/Mortgage':       '#6a2a20',
    'Utilities':          '#9a5040','Groceries':           '#886050',
    'Dining Out':         '#a87868','Transport':           '#6a4840',
    'Entertainment':      '#9a5848','Clothing':            '#b88878',
    'Insurance':          '#6a3830','Subscriptions':       '#985048',
    'Savings/Investment': '#684038','Emergency Fund':      '#785048',
    'Debt Repayments':    '#885048','Healthcare':          '#8a5850',
    'Education':          '#a07868','Other Expense':       '#a08070',
  },
  yellow: {
    'Salary/Wages':       '#8a7a3a','Freelance':           '#aa9a50',
    'Other Income':       '#c0b870','Rent/Mortgage':       '#6a5a20',
    'Utilities':          '#9a8a40','Groceries':           '#887a50',
    'Dining Out':         '#a89860','Transport':           '#6a6040',
    'Entertainment':      '#9a8840','Clothing':            '#b8b070',
    'Insurance':          '#6a5a30','Subscriptions':       '#98883a',
    'Savings/Investment': '#686030','Emergency Fund':      '#787040',
    'Debt Repayments':    '#887050','Healthcare':          '#8a8050',
    'Education':          '#a09860','Other Expense':       '#a0a068',
  },
  black: {
    'Salary/Wages':       '#5a7aaa','Freelance':           '#7080c8',
    'Other Income':       '#8090c0','Rent/Mortgage':       '#384878',
    'Utilities':          '#6070b0','Groceries':           '#587090',
    'Dining Out':         '#7080a8','Transport':           '#505870',
    'Entertainment':      '#7868a8','Clothing':            '#9888b8',
    'Insurance':          '#405070','Subscriptions':       '#706898',
    'Savings/Investment': '#405870','Emergency Fund':      '#506880',
    'Debt Repayments':    '#706880','Healthcare':          '#5878a8',
    'Education':          '#7080a8','Other Expense':       '#808898',
  },
};

function getCatColors() {
  const theme = document.documentElement.getAttribute('data-theme') || 'default';
  return THEME_PALETTES[theme] || THEME_PALETTES.default;
}

function getCurrentBudget() {
  if (!APP_DATA.budget[BUDGET_MONTH]) APP_DATA.budget[BUDGET_MONTH] = [];
  return APP_DATA.budget[BUDGET_MONTH];
}

// Returns the cumulative net balance up to (but not including) the given FY month index.
// This is the "opening balance" rolled into the current month view.
function getRolloverBalance(upToMonthIndex) {
  let balance = 0;
  for (let m = 0; m < upToMonthIndex; m++) {
    const entries = APP_DATA.budget[m] || [];
    entries.forEach(e => {
      if (e.type === 'income' || e.type === 'savings draw') balance += e.amount;
      if (e.type === 'expense' || e.type === 'debt repayment') balance -= e.amount;
    });
  }
  return balance;
}

let BUDGET_ENTRIES_SHOWN = 5;

function showMoreEntries() {
  BUDGET_ENTRIES_SHOWN += 10;
  renderBudget();
}

function showLessEntries() {
  BUDGET_ENTRIES_SHOWN = 5;
  renderBudget();
}

function changeBudgetMonth() {
  BUDGET_MONTH = parseInt(document.getElementById('budget-month-select').value);
  BUDGET_ENTRIES_SHOWN = 5; // reset on month change
  renderBudget();
}

function addBudgetEntry() {
  const desc   = document.getElementById('be-desc').value.trim();
  const amount = parseFloat(document.getElementById('be-amount').value);
  const catVal = document.getElementById('be-cat').value;
  if (!desc)          return alert('Please enter a description.');
  if (!amount || amount <= 0) return alert('Please enter a valid amount.');
  const [type, cat] = catVal.split('|');
  const entryDesc = type === 'savings draw' ? (desc || 'Savings Draw -- ' + cat) : desc;
  const entry = { id: Date.now(), desc: entryDesc, amount, type, cat, date: new Date().toLocaleDateString('en-AU') };
  getCurrentBudget().unshift(entry);

  // Debt repayment -- reduce the debt balance
  if (type === 'debt repayment') {
    const debtId = parseInt(cat);
    const debt = (APP_DATA.debts || []).find(d => d.id === debtId);
    if (debt) {
      debt.balance = Math.max(0, parseFloat((debt.balance - amount).toFixed(2)));
      if (debt.balance === 0) {
        setTimeout(() => alert(debt.name + ' is fully paid off! 🎉 You can remove it from the debt register.'), 100);
      }
    }
  }

  persist();
  document.getElementById('be-desc').value = '';
  document.getElementById('be-amount').value = '';
  renderBudget();
  renderDebts();
  if (HEALTH_MODE === 'auto') autoFillHealth();
}

function deleteBudgetEntry(id) {
  const entry = getCurrentBudget().find(e => e.id === id);
  // Restore debt balance if deleting a repayment
  if (entry && entry.type === 'debt repayment') {
    const debtId = parseInt(entry.cat);
    const debt = (APP_DATA.debts || []).find(d => d.id === debtId);
    if (debt) debt.balance = parseFloat((debt.balance + entry.amount).toFixed(2));
  }
  APP_DATA.budget[BUDGET_MONTH] = getCurrentBudget().filter(e => e.id !== id);
  persist();
  renderBudget();
  renderDebts();
  if (HEALTH_MODE === 'auto') autoFillHealth();
}

function renderBudget() {
  refreshDebtDropdown();
  const entries  = getCurrentBudget();
  const incomes  = entries.filter(e => e.type === 'income' || e.type === 'savings draw');
  const expenses = entries.filter(e => e.type === 'expense' || e.type === 'debt repayment');
  const totalInc = incomes.reduce((s,e) => s+e.amount, 0);
  const totalExp = expenses.reduce((s,e) => s+e.amount, 0);
  const thisMonthBalance = totalInc - totalExp;

  // Rollover: cumulative net from all prior months in this FY
  const rollover = getRolloverBalance(BUDGET_MONTH);
  const netBalance = rollover + thisMonthBalance;
  const saveRate = totalInc > 0 ? (thisMonthBalance / totalInc * 100) : 0;

  document.getElementById('bm-income').textContent      = fmtK(totalInc);
  document.getElementById('bm-income-count').textContent = incomes.length + ' entr' + (incomes.length===1?'y':'ies');
  document.getElementById('bm-expenses').textContent    = fmtK(totalExp);
  document.getElementById('bm-exp-count').textContent   = expenses.length + ' entr' + (expenses.length===1?'y':'ies');
  document.getElementById('bm-balance').textContent     = fmtK(Math.abs(netBalance));
  document.getElementById('bm-balance').style.color     = netBalance >= 0 ? 'var(--green)' : 'var(--red)';
  document.getElementById('bm-savings-rate').textContent = 'Savings rate: ' + (totalInc>0 ? saveRate.toFixed(1)+'%' : '--');

  // Show/hide opening balance rollover banner
  let rolloverBanner = document.getElementById('bm-rollover-banner');
  if (!rolloverBanner) {
    // Create it once and insert before the entry list
    rolloverBanner = document.createElement('div');
    rolloverBanner.id = 'bm-rollover-banner';
    rolloverBanner.style.cssText = [
      'display:flex', 'justify-content:space-between', 'align-items:center',
      'padding:8px 14px', 'margin-bottom:8px',
      'background:var(--paper-2)', 'border:1px solid var(--rule)',
      'border-radius:var(--r-sm)', 'font-size:0.78rem', 'color:var(--ink-3)',
    ].join(';');
    const entryList = document.getElementById('entry-list');
    if (entryList && entryList.parentNode) {
      entryList.parentNode.insertBefore(rolloverBanner, entryList);
    }
  }
  if (rollover !== 0) {
    const sign = rollover >= 0 ? '+' : '-';
    rolloverBanner.innerHTML =
      '<span>Opening balance (carried forward)</span>' +
      '<span style="font-family:\'IBM Plex Mono\',monospace;font-weight:600;color:' +
      (rollover >= 0 ? 'var(--green)' : 'var(--red)') + '">' +
      sign + fmtK(Math.abs(rollover)) + '</span>';
    rolloverBanner.style.display = 'flex';
  } else {
    rolloverBanner.style.display = 'none';
  }

  // Entry list
  const list = document.getElementById('entry-list');
  if (entries.length === 0) {
    list.innerHTML = '<div style="text-align:center;padding:32px;color:var(--ink-3);font-size:0.82rem">No entries yet.</div>';
  } else {
    const shown    = Math.min(BUDGET_ENTRIES_SHOWN, entries.length);
    const remaining = entries.length - shown;
    const renderEntry = e => {
      const isIncome  = e.type === 'income';
      const isSavings = e.type === 'savings rate';
      const isDraw    = e.type === 'savings draw';
      const isDebt    = e.type === 'debt repayment';
      const amtClass  = isIncome || isDraw ? 'income' : isSavings ? 'savings' : '';
      const prefix    = isIncome || isDraw ? '+' : isSavings ? '' : '-';
      const drawBadge = isDraw ? `<span style="font-size:0.68rem;background:var(--gold-dim);color:var(--gold);border-radius:4px;padding:1px 5px;margin-left:4px">draw</span>` : '';
      const debtName  = isDebt ? (APP_DATA.debts||[]).find(d => d.id === parseInt(e.cat))?.name || e.cat : null;
      const debtBadge = isDebt ? `<span style="font-size:0.68rem;background:#fdecea;color:var(--red);border-radius:4px;padding:1px 5px;margin-left:4px">debt</span>` : '';
      const catLabel  = isDebt ? (debtName || 'Debt Repayment') : e.cat;
      return `
      <div class="entry-item">
        <div class="entry-cat-dot" style="background:${isDebt ? 'var(--red)' : (getCatColors()[e.cat]||'#999')}"></div>
        <div>
          <div class="entry-desc">${escHtml(e.desc)}${drawBadge}${debtBadge}</div>
          <span class="entry-cat-label">${catLabel} · ${e.date}</span>
        </div>
        <div class="entry-amount ${amtClass}">${prefix}${fmt(e.amount)}</div>
        <button class="entry-del" onclick="deleteBudgetEntry(${e.id})" title="Delete">×</button>
      </div>`;
    };
    list.innerHTML = entries.slice(0, shown).map(renderEntry).join('');
    if (remaining > 0) {
      list.innerHTML += `<button onclick="showMoreEntries()" style="
        width:100%;padding:12px;margin-top:6px;background:var(--paper-2);
        border:1px solid var(--rule);border-radius:var(--r-sm);cursor:pointer;
        font-size:0.8rem;font-weight:600;color:var(--ink-3);font-family:inherit;
        transition:background 0.15s,color 0.15s;
      " onmouseover="this.style.background='var(--paper-3)';this.style.color='var(--ink)'"
         onmouseout="this.style.background='var(--paper-2)';this.style.color='var(--ink-3)'">
        Show ${remaining} more entr${remaining === 1 ? 'y' : 'ies'}
      </button>`;
    } else if (entries.length > 5) {
      list.innerHTML += `<button onclick="showLessEntries()" style="
        width:100%;padding:10px;margin-top:6px;background:none;
        border:none;cursor:pointer;font-size:0.75rem;color:var(--ink-3);font-family:inherit;
      ">Show less ↑</button>`;
    }
  }

  // Spending pie chart
  const catTotals = {};
  expenses.forEach(e => {
    const cat = e.type === 'debt repayment' ? 'Debt Repayments' : e.cat;
    catTotals[cat] = (catTotals[cat]||0) + e.amount;
  });
  const sorted = Object.entries(catTotals).sort((a,b)=>b[1]-a[1]);
  const barsEl = document.getElementById('spending-bars');
  if (sorted.length === 0) {
    barsEl.innerHTML = '<div style="text-align:center;padding:32px;color:var(--ink-3);font-size:0.82rem">Add expenses to see your breakdown.</div>';
  } else {
    const total = sorted.reduce((s,[,v])=>s+v, 0);
    // Build pie slices
    const cx = 110, cy = 110, r = 90, inner = 52;
    let angle = -Math.PI / 2;
    const slices = sorted.map(([cat, amt], idx) => {
      const slice = (amt / total) * 2 * Math.PI;
      const x1 = cx + r * Math.cos(angle);
      const y1 = cy + r * Math.sin(angle);
      const x2 = cx + r * Math.cos(angle + slice);
      const y2 = cy + r * Math.sin(angle + slice);
      const ix1 = cx + inner * Math.cos(angle);
      const iy1 = cy + inner * Math.sin(angle);
      const ix2 = cx + inner * Math.cos(angle + slice);
      const iy2 = cy + inner * Math.sin(angle + slice);
      const large = slice > Math.PI ? 1 : 0;
      const color = getCatColors()[cat] || '#5a7070';
      const midAngle = angle + slice / 2;
      const path = `M${ix1},${iy1} L${x1},${y1} A${r},${r} 0 ${large},1 ${x2},${y2} L${ix2},${iy2} A${inner},${inner} 0 ${large},0 ${ix1},${iy1} Z`;
      angle += slice;
      return { cat, amt, color, path, pct: (amt/total*100).toFixed(1), midAngle, idx };
    });

    const svgSlices = slices.map(s => `
      <path d="${s.path}" fill="${s.color}" stroke="var(--paper)" stroke-width="2"
        class="pie-slice" data-idx="${s.idx}"
        onclick="selectPieSlice(${s.idx})"
        style="cursor:pointer;transition:opacity 0.15s,transform 0.15s;transform-origin:${cx}px ${cy}px">
      </path>`).join('');

    const legend = slices.map(s => `
      <div class="pie-legend-row" id="pie-leg-${s.idx}" onclick="selectPieSlice(${s.idx})" style="cursor:pointer">
        <span class="pie-leg-dot" style="background:${s.color}"></span>
        <span class="pie-leg-name">${s.cat}</span>
        <span class="pie-leg-pct">${s.pct}%</span>
        <span class="pie-leg-amt">${fmt(s.amt)}</span>
      </div>`).join('');

    barsEl.innerHTML = `
      <div class="pie-wrap">
        <div class="pie-svg-wrap">
          <svg viewBox="0 0 220 220" width="220" height="220" id="pie-svg">
            ${svgSlices}
            <circle cx="${cx}" cy="${cy}" r="${inner}" fill="var(--paper)" />
            <text x="${cx}" y="${cy - 10}" text-anchor="middle" font-size="11" fill="var(--ink-3)" font-family="IBM Plex Sans,sans-serif" id="pie-center-label">Total</text>
            <text x="${cx}" y="${cy + 10}" text-anchor="middle" font-size="13" font-weight="600" fill="var(--ink)" font-family="IBM Plex Mono,monospace" id="pie-center-amt">${fmt(total)}</text>
          </svg>
        </div>
        <div class="pie-legend" id="pie-legend">${legend}</div>
      </div>`;

    // Store slices for interaction
    window._pieSlices = slices;
    window._pieSelected = null;
  }
  // Goals sync happens when Goals tab is viewed via renderGoals()
}

function selectPieSlice(idx) {
  const slices = window._pieSlices;
  if (!slices) return;
  const isSame = window._pieSelected === idx;
  window._pieSelected = isSame ? null : idx;

  // Update slice opacities
  slices.forEach(s => {
    const el = document.querySelector(`.pie-slice[data-idx="${s.idx}"]`);
    const leg = document.getElementById('pie-leg-' + s.idx);
    if (!el) return;
    const active = window._pieSelected === null || window._pieSelected === s.idx;
    el.style.opacity = active ? '1' : '0.3';
    el.style.transform = (window._pieSelected === s.idx) ? 'scale(1.04)' : 'scale(1)';
    if (leg) leg.style.opacity = active ? '1' : '0.4';
  });

  // Update centre text
  const labelEl = document.getElementById('pie-center-label');
  const amtEl   = document.getElementById('pie-center-amt');
  if (window._pieSelected === null) {
    const total = slices.reduce((s,x)=>s+x.amt, 0);
    labelEl.textContent = 'Total';
    amtEl.textContent   = fmt(total);
  } else {
    const s = slices[idx];
    labelEl.textContent = s.pct + '%';
    amtEl.textContent   = fmt(s.amt);
  }
}

function clearBudgetData() {
  if (!confirm('Clear all budget entries?')) return;
  APP_DATA.budget[BUDGET_MONTH] = [];
  persist(); renderBudget();
}

/* ===================================================
   FINANCIAL HEALTH
=================================================== */
// -- HEALTH MODE --
let HEALTH_MODE = 'auto'; // 'auto' | 'manual'

function setHealthMode(mode) {
  if (mode === 'auto' && !isPlus() && !isGuest()) {
    openModal('plus-upgrade-modal');
    return;
  }
  HEALTH_MODE = mode;
  document.getElementById('health-btn-auto').classList.toggle('active', mode === 'auto');
  document.getElementById('health-btn-manual').classList.toggle('active', mode === 'manual');
  document.getElementById('health-manual-card').style.display = mode === 'manual' ? 'block' : 'none';
  document.getElementById('health-auto-card').style.display   = mode === 'auto'   ? 'block' : 'none';
  const hint = document.getElementById('health-mode-hint');
  hint.textContent = mode === 'auto'
    ? 'Automatically calculated from your budget entries.'
    : 'Enter your own figures manually.';
  if (mode === 'auto') autoFillHealth();
  else calcHealth();
}

function autoFillHealth() {
  // Pull averages from all budget months that have data
  const allMonths = APP_DATA.budget || {};
  const monthsWithData = Object.values(allMonths).filter(m => m && m.length > 0);
  const count = monthsWithData.length || 1;

  let totalIncome = 0, totalExpenses = 0, totalSavings = 0, totalHousing = 0;
  monthsWithData.forEach(month => {
    month.forEach(e => {
      if (e.type === 'income' || e.type === 'savings draw') totalIncome   += e.amount;
      if (e.type === 'expense')                              totalExpenses += e.amount;
      if (e.type === 'savings rate')                         totalSavings  += e.amount;
      if (e.type === 'expense' && e.cat === 'Rent/Mortgage') totalHousing  += e.amount;
    });
  });

  const avgIncome   = totalIncome   / count;
  const avgExpenses = totalExpenses / count;
  const avgSavings  = totalSavings  / count;
  const avgHousing  = totalHousing  / count;

  // Emergency fund from goals
  const emergencyGoal = APP_DATA.goals.find(g => g.id === SYSTEM_GOAL_IDS.emergency);
  const emergencyAmt  = emergencyGoal ? (emergencyGoal.saved || 0) : 0;

  // Debt from debt register
  const totalDebt = (APP_DATA.debts || []).reduce((s, d) => s + (d.balance || 0), 0);

  // Show auto summary card
  const summaryEl = document.getElementById('health-auto-summary');
  if (summaryEl) {
    const rows = [
      ['Monthly Net Income',    fmt(avgIncome),   'avg across ' + count + ' month' + (count===1?'':'s')],
      ['Monthly Expenses',      fmt(avgExpenses), 'avg across ' + count + ' month' + (count===1?'':'s')],
      ['Monthly Savings',       fmt(avgSavings),  'avg across ' + count + ' month' + (count===1?'':'s')],
      ['Monthly Housing Cost',  fmt(avgHousing),  'from Rent/Mortgage entries'],
      ['Emergency Fund',        fmt(emergencyAmt),'from Portfolio'],
      ['Total Debt',            fmt(totalDebt),   'from Debt Register'],
    ];
    summaryEl.innerHTML = rows.map(([label, val, sub]) => `
      <div class="health-metric-row" style="flex-direction:column;align-items:flex-start;gap:2px;padding:8px 0">
        <div style="display:flex;justify-content:space-between;width:100%">
          <span class="hm-label">${label}</span>
          <span style="font-family:'IBM Plex Mono',monospace;font-size:0.88rem;font-weight:600;color:var(--ink)">${val}</span>
        </div>
        <span style="font-size:0.72rem;color:var(--ink-3)">${sub}</span>
      </div>`).join('');
  }

  if (count === 0 || avgIncome === 0) {
    document.getElementById('health-grade').textContent = 'Add budget entries';
    document.getElementById('health-desc').textContent  = 'Log at least one month of income and expenses in the Budget tab to auto-calculate your health score.';
    document.getElementById('health-score').textContent = '--';
    return;
  }

  // Feed into score calculation directly
  calcHealthFromValues(avgIncome, avgExpenses, emergencyAmt, totalDebt, avgHousing, avgSavings);
}

function calcHealth() {
  const get = id => parseFloat(document.getElementById(id).value) || 0;
  const income    = get('h-income');
  const expenses  = get('h-expenses');
  const emergency = get('h-emergency');
  const debt      = get('h-debt');
  const housing   = get('h-housing');
  const savings   = get('h-savings');

  APP_DATA.health = { income, expenses, emergency, debt, housing, savings };
  persist();

  if (!income) return;
  calcHealthFromValues(income, expenses, emergency, debt, housing, savings);
}

function calcHealthFromValues(income, expenses, emergency, debt, housing, savings) {
  const savingsRate  = income > 0 ? (savings / income * 100) : 0;
  const emerMonths   = expenses > 0 ? (emergency / expenses) : 0;
  const dti          = income > 0 ? (debt / (income * 12) * 100) : 0;
  const housingRatio = income > 0 ? (housing / income * 100) : 0;

  let score = 0;
  if (savingsRate >= 20) score += 25; else if (savingsRate >= 10) score += 15; else if (savingsRate > 0) score += 8;
  if (emerMonths >= 6)   score += 25; else if (emerMonths >= 3)   score += 15; else if (emerMonths >= 1) score += 8;
  if (dti <= 20)         score += 25; else if (dti <= 40)         score += 15; else if (dti <= 60)       score += 8;
  if (housingRatio <= 28)score += 25; else if (housingRatio <= 35)score += 15; else if (housingRatio<=50)score += 8;

  document.getElementById('health-score').textContent = score;
  const grade = score >= 80 ? 'Excellent' : score >= 60 ? 'Good' : score >= 40 ? 'Fair' : 'Needs Attention';
  const desc  = score >= 80 ? "You're in great financial shape. Keep building on these habits." :
                score >= 60 ? "Good foundation. A few areas to strengthen." :
                score >= 40 ? "You're on the right track but some key areas need focus." :
                              "Some important financial fundamentals need attention. Start with an emergency fund.";
  document.getElementById('health-grade').textContent = grade;
  document.getElementById('health-desc').textContent  = desc;

  const setMetric = (id, val, good, warn) => {
    const el = document.getElementById(id);
    el.textContent = val;
    el.className   = 'hm-value ' + (good ? 'hm-good' : warn ? 'hm-warn' : 'hm-bad');
  };
  setMetric('hm-savings-rate', savingsRate.toFixed(1)+'%',   savingsRate>=20, savingsRate>=10);
  setMetric('hm-emergency',    emerMonths.toFixed(1)+' mths', emerMonths>=6,   emerMonths>=3);
  setMetric('hm-dti',          dti.toFixed(1)+'%',           dti<=20,          dti<=40);
  setMetric('hm-housing',      housingRatio.toFixed(1)+'%',  housingRatio<=28, housingRatio<=35);
}

/* -- DEBT REGISTER -- */
function refreshDebtDropdown() {
  const optgroup = document.getElementById('debt-repayment-options');
  if (!optgroup) return;
  const debts = APP_DATA.debts || [];
  optgroup.innerHTML = debts.filter(d => d.balance > 0).map(d =>
    `<option value="debt repayment|${d.id}">Repay -- ${escHtml(d.name)} (${fmt(d.balance)} remaining)</option>`
  ).join('');
}

function addDebt() {
  if (!isPlus()) { openModal('plus-upgrade-modal'); return; }
  const name    = document.getElementById('debt-name').value.trim();
  const balance = parseFloat(document.getElementById('debt-balance').value) || 0;
  const rate    = parseFloat(document.getElementById('debt-rate').value) || 0;
  if (!name)         return alert('Please enter a debt name.');
  if (balance <= 0)  return alert('Please enter a valid balance.');
  if (!APP_DATA.debts) APP_DATA.debts = [];
  APP_DATA.debts.push({ id: Date.now(), name, balance, rate });
  document.getElementById('debt-name').value    = '';
  document.getElementById('debt-balance').value = '';
  document.getElementById('debt-rate').value    = '';
  persist();
  renderDebts();
  refreshDebtDropdown();
  if (HEALTH_MODE === 'auto') autoFillHealth();
}

function deleteDebt(id) {
  APP_DATA.debts = (APP_DATA.debts || []).filter(d => d.id !== id);
  persist();
  renderDebts();
  refreshDebtDropdown();
  if (HEALTH_MODE === 'auto') autoFillHealth();
}

function renderDebts() {
  const debts = APP_DATA.debts || [];
  const list  = document.getElementById('debt-list');
  const totalRow = document.getElementById('debt-total-row');
  const totalAmt = document.getElementById('debt-total-amt');

  if (debts.length === 0) {
    list.innerHTML = '<div style="text-align:center;padding:20px;color:var(--ink-3);font-size:0.82rem">No debts added yet.</div>';
    if (totalRow) totalRow.style.display = 'none';
    const debtEl = document.getElementById('h-debt');
    if (debtEl) { debtEl.value = ''; }
    refreshAccruedDebtOptions();
    return;
  }

  const total = debts.reduce((s, d) => s + d.balance, 0);
  list.innerHTML = debts.map(d => `
    <div class="entry-item">
      <div class="entry-cat-dot" style="background:var(--red)"></div>
      <div>
        <div class="entry-desc">${escHtml(d.name)}</div>
        <span class="entry-cat-label">${d.rate > 0 ? d.rate + '% p.a.' : 'No interest'}</span>
      </div>
      <div class="entry-amount" style="color:var(--red)">-${fmt(d.balance)}</div>
      <button class="entry-del" onclick="deleteDebt(${d.id})" title="Delete">×</button>
    </div>`).join('');

  if (totalRow) totalRow.style.display = 'flex';
  if (totalAmt) totalAmt.textContent = fmt(total);

  // Auto-populate debt field in manual mode
  const debtEl = document.getElementById('h-debt');
  if (debtEl) { debtEl.value = total > 0 ? total : ''; calcHealth(); }
  refreshAccruedDebtOptions();
}

/* ===================================================
   ACCRUED EXPENSES
   Recurring bills (subscriptions, phone, etc.) that
   auto-post to Budget on their due day each month.
=================================================== */

// Convert a day-of-month (1–31) to a display suffix
function daySuffix(d) {
  if (d >= 11 && d <= 13) return d + 'th';
  const s = ['th','st','nd','rd'];
  return d + (s[d % 10] || 'th');
}

// Work out which FY month index a calendar date falls in
function fyMonthFromDate(date) {
  const m = date.getMonth(); // 0=Jan … 11=Dec
  return m >= 6 ? m - 6 : m + 6; // 0=Jul … 11=Jun
}

// Called on load and whenever the health tab is opened.
// For each accrued expense, if today is on or past its due day
// this calendar month and no entry has been injected yet this month,
// add it to the budget automatically.
function applyAccruedExpenses() {
  const accrued = APP_DATA.accrued || [];
  if (accrued.length === 0) return;

  const today     = new Date();
  const todayDay  = today.getDate();
  const monthKey  = today.getFullYear() + '-' + (today.getMonth() + 1); // e.g. "2025-3"
  const fyMonth   = fyMonthFromDate(today);

  if (!APP_DATA.budget[fyMonth]) APP_DATA.budget[fyMonth] = [];

  let changed = false;

  accrued.forEach(exp => {
    // Only inject if today is on or past the due day this month
    if (todayDay < exp.day) return;

    // Check if already injected for this calendar month
    const alreadyAdded = APP_DATA.budget[fyMonth].some(
      e => e.autoAccruedId === exp.id && e.autoAccruedMonth === monthKey
    );
    if (alreadyAdded) return;

    APP_DATA.budget[fyMonth].unshift({
      id:               Date.now() + Math.random(),
      desc:             exp.name,
      amount:           exp.amount,
      type:             exp.debtId ? 'debt repayment' : 'expense',
      cat:              exp.debtId ? String(exp.debtId) : (exp.cat || 'Subscriptions'),
      date:             new Date(today.getFullYear(), today.getMonth(), exp.day)
                          .toLocaleDateString('en-AU'),
      autoAccruedId:    exp.id,
      autoAccruedMonth: monthKey,
    });

    // Reduce debt balance if this is a repayment
    if (exp.debtId) {
      const debt = (APP_DATA.debts || []).find(d => d.id === exp.debtId);
      if (debt) {
        debt.balance = Math.max(0, parseFloat((debt.balance - exp.amount).toFixed(2)));
      }
    }

    changed = true;
  });

  if (changed) persist();
}

// Keep the debt repayment options in the accrued category select in sync with the debt register
function refreshAccruedDebtOptions() {
  const optgroup = document.getElementById('ac-debt-options');
  if (!optgroup) return;
  const debts = (APP_DATA.debts || []).filter(d => d.balance > 0);
  if (debts.length === 0) {
    optgroup.innerHTML = '<option disabled>No debts registered</option>';
  } else {
    optgroup.innerHTML = debts.map(d =>
      `<option value="debt-repayment|${d.id}">Repay -- ${escHtml(d.name)} (${fmt(d.balance)} remaining)</option>`
    ).join('');
  }
}

// Keyword map -- name fragments -> category value
const ACCRUED_CAT_KEYWORDS = {
  'Rent/Mortgage': [
    'rent','mortgage','home loan','landlord','property','strata','body corporate',
    'body corp','hoa','housing','accommodation','board',
  ],
  Subscriptions: [
    'netflix','stan','disney','binge','paramount','apple tv','prime video','spotify',
    'youtube','adobe','microsoft 365','office 365','icloud','google one','dropbox',
    'canva','slack','zoom','chatgpt','claude','antivirus','vpn','gaming','xbox',
    'playstation','nintendo','twitch','patreon','substack','audible','kindle',
    'subscription','streaming','app','software','saas',
  ],
  Utilities: [
    'phone','mobile','telstra','optus','vodafone','tpg','belong','boost',
    'electricity','electric','power','energy','gas','water','internet','broadband',
    'nbn','wifi','wi-fi','foxtel','fetch','kayo','council','rates',
    'bill','utility','utilities',
  ],
  Insurance: [
    'insurance','cover','allianz','medibank','bupa','hcf','nib','aami','gio',
    'budget direct','youi','racq','rac','racv','life insurance','car insurance',
    'health insurance','home insurance','contents','income protection',
  ],
  Transport: [
    'toll','opal','myki','go card','translink','parking','rego','registration',
    'lease','car payment','fuel','petrol','uber','didi','ola',
  ],
  Healthcare: [
    'gym','fitness','yoga','pilates','crossfit','anytime','goodlife','planet fitness',
    'f45','medicare','dental','physio','therapy','medication','pharmacy',
  ],
  Education: [
    'tafe','uni','university','course','udemy','coursera','masterclass','duolingo',
    'school','tuition','tutoring',
  ],
};

function autoSuggestAccruedCat() {
  const name = document.getElementById('ac-name').value.toLowerCase().trim();
  const select = document.getElementById('ac-cat');
  const hint   = document.getElementById('ac-cat-hint');
  if (!name) { hint.textContent = ''; return; }

  for (const [cat, keywords] of Object.entries(ACCRUED_CAT_KEYWORDS)) {
    if (keywords.some(k => name.includes(k))) {
      select.value = cat;
      hint.textContent = '← auto-selected';
      return;
    }
  }
  hint.textContent = '';
}

function addAccrued() {
  if (!isPlus()) { openModal('plus-upgrade-modal'); return; }
  const name   = document.getElementById('ac-name').value.trim();
  const day    = parseInt(document.getElementById('ac-day').value);
  const amount = parseFloat(document.getElementById('ac-amount').value);
  const catVal = document.getElementById('ac-cat').value;

  if (!name)                       return showAlert('ac-error', 'Please enter an expense name.');
  if (!day || day < 1 || day > 31) return showAlert('ac-error', 'Please enter a valid day (1–31).');
  if (!amount || amount <= 0)      return showAlert('ac-error', 'Please enter a valid amount.');

  if (!APP_DATA.accrued) APP_DATA.accrued = [];

  // Debt repayment -- catVal will be 'debt-repayment|<debtId>'
  const isDebtRepayment = catVal.startsWith('debt-repayment|');
  const debtId = isDebtRepayment ? parseInt(catVal.split('|')[1]) : null;
  const cat    = isDebtRepayment ? 'Debt Repayments' : catVal;

  APP_DATA.accrued.push({ id: Date.now(), name, day, amount, cat, debtId });
  persist();
  applyAccruedExpenses();
  renderAccrued();
  renderBudget();
  renderDebts();

  document.getElementById('ac-name').value   = '';
  document.getElementById('ac-day').value    = '';
  document.getElementById('ac-amount').value = '';
  document.getElementById('ac-cat-hint').textContent = '';
  refreshAccruedDebtOptions(); // reset select back to top
}

function deleteAccrued(id) {
  APP_DATA.accrued = (APP_DATA.accrued || []).filter(a => a.id !== id);
  // Remove any auto-injected budget entries for this accrued expense
  Object.keys(APP_DATA.budget).forEach(m => {
    APP_DATA.budget[m] = (APP_DATA.budget[m] || []).filter(e => e.autoAccruedId !== id);
  });
  persist();
  renderAccrued();
  renderBudget();
}

function renderAccrued() {
  const list    = document.getElementById('accrued-list');
  const accrued = APP_DATA.accrued || [];

  if (accrued.length === 0) {
    list.innerHTML = '<div style="text-align:center;padding:20px;color:var(--ink-3);font-size:0.82rem">No recurring expenses added yet.</div>';
    return;
  }

  const today    = new Date();
  const monthKey = today.getFullYear() + '-' + (today.getMonth() + 1);
  const fyMonth  = fyMonthFromDate(today);

  list.innerHTML = accrued.map(a => {
    const injected = (APP_DATA.budget[fyMonth] || []).some(
      e => e.autoAccruedId === a.id && e.autoAccruedMonth === monthKey
    );
    const isDebtRepay = !!a.debtId;
    const debt = isDebtRepay ? (APP_DATA.debts || []).find(d => d.id === a.debtId) : null;
    const catLabel = isDebtRepay
      ? 'Debt repayment -- ' + (debt ? escHtml(debt.name) : 'unknown debt')
      : a.cat;
    const dotColor = isDebtRepay ? getCatColors()['Debt Repayments'] : (getCatColors()[a.cat] || '#5a7070');
    const statusBadge = injected
      ? '<span style="font-size:0.65rem;background:#e6f4ea;color:#2e7d32;border-radius:4px;padding:1px 7px;margin-left:6px;font-weight:600">✓ Added this month</span>'
      : '<span style="font-size:0.65rem;background:var(--paper-2);color:var(--ink-3);border-radius:4px;padding:1px 7px;margin-left:6px">Due ' + daySuffix(a.day) + '</span>';
    return `
    <div class="entry-item">
      <div class="entry-cat-dot" style="background:${dotColor}"></div>
      <div>
        <div class="entry-desc">${escHtml(a.name)}${statusBadge}</div>
        <span class="entry-cat-label">${catLabel} · every ${daySuffix(a.day)} of the month</span>
      </div>
      <div class="entry-amount" style="color:var(--red)">-${fmt(a.amount)}</div>
      <button class="entry-del" onclick="deleteAccrued(${a.id})" title="Delete">×</button>
    </div>`;
  }).join('');
}

/* ===================================================
   GOALS
=================================================== */
// System goals that always exist and cannot be deleted

function ensureSystemGoals() {
  const hasEmergency = APP_DATA.goals.find(g => g.id === SYSTEM_GOAL_IDS.emergency);
  const hasSavings   = APP_DATA.goals.find(g => g.id === SYSTEM_GOAL_IDS.savings);
  if (!hasEmergency) APP_DATA.goals.unshift({ id: SYSTEM_GOAL_IDS.emergency, name: 'Emergency Fund',        icon: '🛡️', system: true, target: null, saved: 0, monthly: 0 });
  if (!hasSavings)   APP_DATA.goals.unshift({ id: SYSTEM_GOAL_IDS.savings,   name: 'Savings & Investments', icon: '📈', system: true, target: null, saved: 0, monthly: 0 });
}

let _goalSyncLock = false;

async function syncSystemGoalsFromBudget() {
  let totalEmergency = 0, totalSavings = 0;

  if (CURRENT_USER && CURRENT_USER.id) {
    // Authenticated: sum across ALL FY rows in Supabase
    const { data: rows } = await sb
      .from('user_data')
      .select('data')
      .eq('user_id', CURRENT_USER.id);
    (rows || []).forEach(row => {
      Object.values((row.data || {}).budget || {}).forEach(monthEntries => {
        (monthEntries || []).forEach(e => {
          if (e.type === 'savings rate') {
            if (e.cat === 'Emergency Fund')     totalEmergency += e.amount;
            if (e.cat === 'Savings/Investment') totalSavings   += e.amount;
          }
          if (e.type === 'savings draw') {
            if (e.cat === 'Emergency Fund')     totalEmergency -= e.amount;
            if (e.cat === 'Savings/Investment') totalSavings   -= e.amount;
          }
        });
      });
    });
  } else {
    // Guest: only current FY in memory
    Object.values(APP_DATA.budget || {}).forEach(monthEntries => {
      (monthEntries || []).forEach(e => {
        if (e.type === 'savings rate') {
          if (e.cat === 'Emergency Fund')     totalEmergency += e.amount;
          if (e.cat === 'Savings/Investment') totalSavings   += e.amount;
        }
        if (e.type === 'savings draw') {
          if (e.cat === 'Emergency Fund')     totalEmergency -= e.amount;
          if (e.cat === 'Savings/Investment') totalSavings   -= e.amount;
        }
      });
    });
  }

  // Remove ALL system goals first, then add exactly two fresh ones
  APP_DATA.goals = APP_DATA.goals.filter(g => !g.system);
  APP_DATA.goals.unshift({ id: SYSTEM_GOAL_IDS.savings,   name: 'Savings & Investments', icon: '📈', system: true, target: null, saved: totalSavings,   monthly: 0 });
  APP_DATA.goals.unshift({ id: SYSTEM_GOAL_IDS.emergency, name: 'Emergency Fund',        icon: '🛡️', system: true, target: null, saved: totalEmergency, monthly: 0 });
}

async function renderGoals() {
  if (_goalSyncLock) return;
  _goalSyncLock = true;
  try {
    await syncSystemGoalsFromBudget();
    persist();
    const grid  = document.getElementById('goals-grid');
  const goals = APP_DATA.goals;
  grid.innerHTML = goals.map(g => {
    const isSystem  = g.system === true;
    const hasTarget = g.target && g.target > 0;
    const pct    = hasTarget ? Math.min(g.saved / g.target * 100, 100) : null;
    const rem    = hasTarget ? Math.max(g.target - g.saved, 0) : null;
    const months = (hasTarget && g.monthly > 0) ? Math.ceil(rem / g.monthly) : null;
    const eta    = months ? (months >= 12 ? (months/12).toFixed(1)+' years' : months+' months') : null;
    const deleteBtn = isSystem
      ? '<span style="font-size:0.65rem;color:var(--gold);font-weight:700;letter-spacing:0.05em;text-transform:uppercase;padding:3px 8px;background:var(--gold-dim);border-radius:10px">Auto-tracked</span>'
      : '<button class="btn btn-ghost btn-sm" onclick="deleteGoal(' + g.id + ')" title="Delete" style="padding:5px 8px">×</button>';
    const cardStyle = isSystem ? 'style="border:1.5px solid var(--gold);background:linear-gradient(135deg,var(--paper) 80%,rgba(212,118,90,0.06))"' : '';
    const savedLine = (hasTarget ? 'Target: ' + fmt(g.target) + ' · ' : '') + 'Total saved: <strong style="color:var(--green)">' + fmt(g.saved) + '</strong>' + (isSystem ? ' <span style="font-size:0.7rem;color:var(--ink-3)">· synced from budget</span>' : '');
    const progressHtml = hasTarget
      ? '<div class="goal-progress-bar"><div class="goal-progress-fill" style="width:' + pct.toFixed(1) + '%"></div></div><div class="goal-progress-labels"><span>' + pct.toFixed(0) + '% complete</span><span>' + fmt(rem) + ' to go</span></div>' + (eta ? '<div class="goal-eta">📅 At ' + fmt(g.monthly) + '/month -- est. <strong>' + eta + '</strong></div>' : '')
      : '<div style="font-size:0.75rem;color:var(--ink-3);padding-top:6px;border-top:1px solid var(--rule)">' + (isSystem ? '💡 Add entries in Budget Tracker to update this automatically' : '') + '</div>';
    return '<div class="goal-card" ' + cardStyle + '><div class="goal-header"><div class="goal-icon">' + g.icon + '</div><div class="goal-actions">' + deleteBtn + '</div></div><div class="goal-name">' + escHtml(g.name) + '</div><div class="goal-target" style="margin-bottom:' + (hasTarget ? '14px' : '8px') + '">' + savedLine + '</div>' + progressHtml + '</div>';
  }).join('') + '<button class="add-goal-btn" onclick="openModal(&apos;add-goal-modal&apos;)"><span>＋</span>Add a Goal</button>';
  } finally {
    _goalSyncLock = false;
  }
}

function addGoal() {
  const name    = document.getElementById('goal-name').value.trim();
  const target  = parseFloat(document.getElementById('goal-target').value);
  const saved   = parseFloat(document.getElementById('goal-saved').value) || 0;
  const monthly = parseFloat(document.getElementById('goal-monthly').value) || 0;
  const icon    = document.getElementById('goal-icon').value.trim() || '🎯';
  if (!name)      return showAlert('goal-error', 'Please enter a goal name.');
  if (!target || target <= 0) return showAlert('goal-error', 'Please enter a target amount.');
  APP_DATA.goals.push({ id: Date.now(), name, target, saved, monthly, icon });
  persist(); renderGoals();
  closeModal('add-goal-modal');
  ['goal-name','goal-target','goal-saved','goal-monthly','goal-icon'].forEach(id => document.getElementById(id).value='');
}

function deleteGoal(id) {
  if (id === SYSTEM_GOAL_IDS.emergency || id === SYSTEM_GOAL_IDS.savings) return;
  APP_DATA.goals = APP_DATA.goals.filter(g => g.id !== id);
  persist(); renderGoals();
}

/* ===================================================
   DATA RIGHTS (APP 12)
=================================================== */
function viewMyData() {
  if (!CURRENT_USER) return;
  const consents = getConsents(CURRENT_USER.email);
  const summary = {
    account: { name: CURRENT_USER.name, email: CURRENT_USER.email },
    consents: consents,
    financialData: "(encrypted and stored securely on Tayla's servers)",
    note: 'Exported under your APP 12 access rights. Tayla Privacy Policy applies.'
  };
  document.getElementById('data-view-content').textContent = JSON.stringify(summary, null, 2);
  openModal('data-view-modal');
}

function exportMyData() {
  if (!CURRENT_USER) return;
  const all = {
    exportDate: new Date().toISOString(),
    account:  { name: CURRENT_USER.name, email: CURRENT_USER.email },
    consents:  getConsents(CURRENT_USER.email),
    appData:   APP_DATA,
    note: 'Exported under your APP 12 access rights. Tayla Privacy Policy applies.'
  };
  const a = document.createElement('a');
  a.href = 'data:application/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(all, null, 2));
  a.download = 'tayla-data-export-' + new Date().toISOString().split('T')[0] + '.json';
  a.click();
}

async function confirmDeleteAccount() {
  if (!CURRENT_USER) return;
  if (!confirm('This will permanently delete your account and all associated data. This cannot be undone.\n\nContinue?')) return;
  // Delete from Supabase
  if (CURRENT_USER.id) {
    await sb.from('user_data').delete().eq('user_id', CURRENT_USER.id);
    await sb.auth.admin?.deleteUser(CURRENT_USER.id).catch(() => {});
  }
  // Clear consents from localStorage
  localStorage.removeItem('ft_consents_' + CURRENT_USER.email);
  await sb.auth.signOut();
  alert('Your account and all data have been deleted.');
  location.reload();
}

/* ===================================================
   UTILS
=================================================== */
const escHtml = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

/* ===================================================
   INIT
=================================================== */
(async function init() {
  // Hard timeout: if anything goes wrong, dismiss the splash after 6s max
  const splashTimeout = setTimeout(() => hideSplash(), 6000);

  try {
    // Apply saved theme immediately to avoid flash of default
    const savedTheme = localStorage.getItem(THEME_LS_KEY);
    if (savedTheme && savedTheme !== 'default') {
      document.documentElement.setAttribute('data-theme', savedTheme);
    }
    const { data: { session } } = await sb.auth.getSession();
    if (session) {
      const email = session.user.email;
      const name  = session.user.user_metadata?.name || email.split('@')[0];
      await enterApp(email, name, session.user.id);
    } else {
      showScreen('auth-screen');
      hideSplash();
    }
  } catch (err) {
    console.error('Init error:', err);
    hideSplash();
    showScreen('auth-screen');
  } finally {
    clearTimeout(splashTimeout);
  }
})();

/* ===================================================
   TOOLS TAB (Health + Portfolio combined)
=================================================== */

let _toolsSubtab = 'health';

function renderToolsTab() {
  openToolsSubtab(_toolsSubtab);
}

function openToolsSubtab(sub) {
  _toolsSubtab = sub;
  document.querySelectorAll('.tools-subtab').forEach(b => b.classList.remove('active'));
  document.getElementById('stab-' + sub)?.classList.add('active');

  const healthContent = document.getElementById('tools-health-content');
  const goalsContent  = document.getElementById('tools-goals-content');
  if (!healthContent || !goalsContent) return;

  if (sub === 'health') {
    healthContent.style.display = 'block';
    goalsContent.style.display  = 'none';
    // Move health panel content in if not already there
    const healthPanel = document.getElementById('panel-health');
    if (healthPanel && !healthContent.hasChildNodes()) {
      while (healthPanel.firstChild) healthContent.appendChild(healthPanel.firstChild);
    }
    renderDebts();
    renderAccrued();
    refreshAccruedDebtOptions();
    applyAccruedExpenses();
    if (isPlus()) setHealthMode(HEALTH_MODE); else setHealthMode('manual');
  } else {
    healthContent.style.display = 'none';
    goalsContent.style.display  = 'block';
    const goalsPanel = document.getElementById('panel-goals');
    if (goalsPanel && !goalsContent.hasChildNodes()) {
      while (goalsPanel.firstChild) goalsContent.appendChild(goalsPanel.firstChild);
    }
    renderGoals();
  }
}

/* ===================================================
   WORKFORCE TAB
=================================================== */

const WORKFORCE_URL  = 'https://whedwekxzjfqwjuoarid.supabase.co';
const WORKFORCE_SYNC_SECRET = ''; // Set after Edge Functions deployed

let _wfConnection     = null; // { workforce_business_id, workforce_employee_id, business_name }
let _wfSubtab         = 'shifts';
let _wfAvailability   = {}; // { 0..6: { available, start_time, end_time, notes } }
let _wfAvailabilityDirty = false;

function refreshWorkforceLock() {
  const hasConnection = !!_wfConnection;
  const lockBadge     = document.querySelector('.workforce-lock-badge');
  const mnavWf        = document.getElementById('mnav-workforce');
  const navWf         = document.getElementById('nav-workforce');
  if (lockBadge) lockBadge.style.display = hasConnection ? 'none' : 'inline';
  // Don't hard-lock — let the panel explain the connect flow
}

async function renderWorkforceTab() {
  if (!CURRENT_USER) return;

  // Load connection from Tayla DB
  const { data, error } = await sb
    .from('workforce_connections')
    .select('*')
    .eq('user_id', CURRENT_USER.id)
    .eq('status', 'active')
    .maybeSingle();

  _wfConnection = data || null;

  const promptEl  = document.getElementById('workforce-connect-prompt');
  const contentEl = document.getElementById('workforce-content');
  if (!promptEl || !contentEl) return;

  if (!_wfConnection) {
    promptEl.style.display  = 'block';
    contentEl.style.display = 'none';
    refreshWorkforceLock();
    return;
  }

  promptEl.style.display  = 'none';
  contentEl.style.display = 'block';
  refreshWorkforceLock();

  // Render employer card
  const empCard = document.getElementById('wf-employer-card');
  if (empCard) {
    empCard.innerHTML = `
      <div class="employer-icon">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <path d="M3 21h18M3 7l9-4 9 4M4 7v14M20 7v14M9 21v-4a3 3 0 016 0v4"/>
          <rect x="9" y="10" width="2" height="3" rx="0.5"/><rect x="13" y="10" width="2" height="3" rx="0.5"/>
        </svg>
      </div>
      <div class="employer-info">
        <div class="employer-name">${_wfConnection.business_name || 'Your Employer'}</div>
        <div class="employer-date">Connected · ${new Date(_wfConnection.connected_at).toLocaleDateString('en-AU',{day:'numeric',month:'long',year:'numeric'})}</div>
      </div>
      <span class="badge-connected">✓ Connected</span>
    `;
  }

  openWfSubtab(_wfSubtab);

  // Retry any leave requests stuck in 'syncing' status
  retrySyncingLeaveRequests();
}

function openWfSubtab(sub) {
  // 'leave' is now inside the 'availability' tab — redirect
  const mappedSub = sub === 'leave' ? 'availability' : sub;
  _wfSubtab = mappedSub;

  ['shifts','payslips','availability'].forEach(s => {
    const el = document.getElementById(`wf-${s}-content`);
    if (el) el.style.display = s === mappedSub ? 'block' : 'none';
    document.getElementById(`wstab-${s}`)?.classList.toggle('active', s === mappedSub);
  });

  if (mappedSub === 'shifts')       renderWfShifts();
  if (mappedSub === 'payslips')     renderWfPayslips();
  if (mappedSub === 'availability') {
    // If originally navigating to leave, open the leave sub-panel
    if (sub === 'leave') {
      openWfAvailSubtab('leave');
    } else {
      openWfAvailSubtab('availability');
    }
  }
}

function openWfAvailSubtab(sub) {
  // Toggle between My Availability and Leave Requests inside the Availability tab
  const availPanel = document.getElementById('wf-avail-panel');
  const leavePanel = document.getElementById('wf-leave-panel');
  const availBtn   = document.getElementById('wf-avsubnav-avail');
  const leaveBtn   = document.getElementById('wf-avsubnav-leave');

  if (!availPanel || !leavePanel) return;

  const showAvail = sub === 'availability';
  availPanel.style.display = showAvail ? 'block' : 'none';
  leavePanel.style.display = showAvail ? 'none' : 'block';
  availBtn?.classList.toggle('active', showAvail);
  leaveBtn?.classList.toggle('active', !showAvail);

  if (showAvail) renderWfAvailability();
  else           renderWfLeave();
}

// ── Shifts ──────────────────────────────────────────

async function renderWfShifts() {
  const el = document.getElementById('wf-shifts-list');
  if (!el || !CURRENT_USER) return;
  el.innerHTML = '<div style="color:var(--ink-2);font-size:13px;padding:16px 0;">Loading shifts…</div>';

  const today = new Date().toISOString().split('T')[0];
  const { data, error } = await sb
    .from('shift_notifications')
    .select('*')
    .eq('user_id', CURRENT_USER.id)
    .gte('shift_date', today)
    .order('shift_date', { ascending: true })
    .limit(20);

  if (!data?.length) {
    el.innerHTML = '<div class="wf-empty">No upcoming shifts. Your roster will appear here once your employer publishes it.</div>';
    return;
  }

  el.innerHTML = data.map(s => `
    <div class="wf-shift-card">
      <div class="wf-shift-date">${new Date(s.shift_date).toLocaleDateString('en-AU',{weekday:'long',day:'numeric',month:'short'})}</div>
      <div class="wf-shift-times">${fmtWfTime(s.start_time)} – ${fmtWfTime(s.end_time)}</div>
      ${s.notes ? `<div class="wf-shift-notes">${s.notes}</div>` : ''}
      <span class="wf-status-badge wf-status-${s.status}">${s.status}</span>
    </div>
  `).join('');
}

// ── Payslips ─────────────────────────────────────────

async function renderWfPayslips() {
  const el = document.getElementById('wf-payslips-list');
  if (!el || !CURRENT_USER) return;
  el.innerHTML = '<div style="color:var(--ink-2);font-size:13px;padding:16px 0;">Loading payslips…</div>';

  const { data } = await sb
    .from('payslips')
    .select('*')
    .eq('user_id', CURRENT_USER.id)
    .order('pay_period_end', { ascending: false })
    .limit(24);

  if (!data?.length) {
    el.innerHTML = '<div class="wf-empty">No payslips yet. They will appear here once your employer processes your pay.</div>';
    return;
  }

  el.innerHTML = data.map(p => `
    <div class="wf-payslip-card" onclick="openPayslipDetail('${p.id}')">
      <div>
        <div style="font-weight:700;font-size:14px;">${fmtPayPeriod(p.pay_period_start, p.pay_period_end)}</div>
        <div style="font-size:12px;color:var(--ink-2);">${p.business_name || 'Employer'} · ${p.hours_worked ? p.hours_worked + 'h' : ''}</div>
      </div>
      <div style="text-align:right;">
        <div style="font-weight:700;font-size:16px;color:var(--green,#38a169);">$${Number(p.net_pay).toFixed(2)}</div>
        <div style="font-size:11px;color:var(--ink-2);">net pay</div>
      </div>
    </div>
  `).join('');
}

function openPayslipDetail(id) {
  // Full payslip detail modal — built in next phase
  console.log('Payslip detail:', id);
}

// ── Availability ─────────────────────────────────────

const DAY_NAMES_FULL = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

async function renderWfAvailability() {
  const el = document.getElementById('wf-availability-grid');
  if (!el || !CURRENT_USER) return;

  // Load from DB
  const { data } = await sb
    .from('availability')
    .select('*')
    .eq('user_id', CURRENT_USER.id);

  _wfAvailability = {};
  (data || []).forEach(row => {
    _wfAvailability[row.day_of_week] = {
      available:  row.available,
      start_time: row.start_time || '',
      end_time:   row.end_time   || '',
      notes:      row.notes      || '',
    };
  });

  renderAvailabilityGrid();
}

function renderAvailabilityGrid() {
  const el = document.getElementById('wf-availability-grid');
  if (!el) return;

  // Mon–Sun order (1–6, then 0)
  const days = [1,2,3,4,5,6,0];

  el.innerHTML = days.map(dow => {
    const avail = _wfAvailability[dow] || { available: true, start_time: '09:00', end_time: '17:00', notes: '' };
    return `
      <div class="wf-avail-row ${avail.available ? '' : 'unavailable'}" id="avail-row-${dow}">
        <div class="wf-avail-day">
          <label class="wf-avail-toggle">
            <input type="checkbox" ${avail.available ? 'checked' : ''}
              onchange="toggleAvailDay(${dow}, this.checked)">
            <span class="wf-avail-day-name">${DAY_NAMES_FULL[dow]}</span>
          </label>
        </div>
        <div class="wf-avail-times" id="avail-times-${dow}" style="${avail.available ? '' : 'opacity:.35;pointer-events:none;'}">
          <input type="time" value="${avail.start_time || '09:00'}" class="wf-time-input"
            onchange="updateAvailTime(${dow},'start_time',this.value)">
          <span style="color:var(--ink-2);font-size:13px;">to</span>
          <input type="time" value="${avail.end_time || '17:00'}" class="wf-time-input"
            onchange="updateAvailTime(${dow},'end_time',this.value)">
        </div>
        <div class="wf-avail-notes">
          <input type="text" placeholder="Notes (optional)" value="${avail.notes || ''}" class="wf-notes-input"
            onchange="updateAvailTime(${dow},'notes',this.value)">
        </div>
      </div>
    `;
  }).join('');
}

function toggleAvailDay(dow, available) {
  if (!_wfAvailability[dow]) _wfAvailability[dow] = { available: true, start_time: '09:00', end_time: '17:00', notes: '' };
  _wfAvailability[dow].available = available;
  _wfAvailabilityDirty = true;
  const row   = document.getElementById(`avail-row-${dow}`);
  const times = document.getElementById(`avail-times-${dow}`);
  if (row)   row.classList.toggle('unavailable', !available);
  if (times) { times.style.opacity = available ? '' : '.35'; times.style.pointerEvents = available ? '' : 'none'; }
}

function updateAvailTime(dow, field, value) {
  if (!_wfAvailability[dow]) _wfAvailability[dow] = { available: true, start_time: '09:00', end_time: '17:00', notes: '' };
  _wfAvailability[dow][field] = value;
  _wfAvailabilityDirty = true;
}

async function saveAvailability() {
  if (!CURRENT_USER) return;
  const btn = document.querySelector('[onclick="saveAvailability()"]');
  if (btn) { btn.textContent = 'Saving…'; btn.disabled = true; }

  const rows = Object.entries(_wfAvailability).map(([dow, v]) => ({
    user_id:    CURRENT_USER.id,
    day_of_week: parseInt(dow),
    available:  v.available,
    start_time: v.start_time || null,
    end_time:   v.end_time   || null,
    notes:      v.notes      || null,
    updated_at: new Date().toISOString(),
  }));

  const { error } = await sb.from('availability').upsert(rows, { onConflict: 'user_id,day_of_week' });

  if (btn) { btn.textContent = error ? '⚠ Error' : '✓ Saved'; btn.disabled = false; }
  setTimeout(() => { if (btn) { btn.textContent = 'Save Changes'; } }, 2000);

  if (!error) {
    _wfAvailabilityDirty = false;
    // Sync to Workforce — will be wired to Edge Function in next phase
    syncAvailabilityToWorkforce();
  }
}

async function syncAvailabilityToWorkforce() {
  if (!_wfConnection) return;
  // Placeholder — wired to Edge Function in next build phase
  console.log('Syncing availability to Workforce for employee:', _wfConnection.workforce_employee_id);
}

// ── Leave ────────────────────────────────────────────

async function renderWfLeave() {
  const el = document.getElementById('wf-leave-list');
  if (!el || !CURRENT_USER) return;

  // Retry any stuck 'syncing' requests in the background
  retrySyncingLeaveRequests();

  const { data } = await sb
    .from('leave_requests')
    .select('*')
    .eq('user_id', CURRENT_USER.id)
    .order('submitted_at', { ascending: false });

  if (!data?.length) {
    el.innerHTML = `
      <div class="wf-empty" style="
        background: var(--paper-2, #f7f7f5);
        border: 1px dashed var(--border, #e2e2e0);
        border-radius: 12px;
        padding: 32px 20px;
        text-align: center;
        color: var(--ink-3, #999);
        font-size: 13px;
      ">
        No leave requests yet.<br>
        <span style="font-size:12px;">Tap <strong>+ Request Leave</strong> above to submit one.</span>
      </div>`;
    return;
  }

  const statusConfig = {
    pending:     { colour: 'var(--gold, #d4a017)',   bg: 'rgba(212,160,23,0.10)',  label: 'Pending' },
    approved:    { colour: 'var(--green, #38a169)',  bg: 'rgba(56,161,105,0.10)',  label: 'Approved' },
    declined:    { colour: 'var(--red, #e53e3e)',    bg: 'rgba(229,62,62,0.10)',   label: 'Declined' },
    rejected:    { colour: 'var(--red, #e53e3e)',    bg: 'rgba(229,62,62,0.10)',   label: 'Declined' },
    syncing:     { colour: 'var(--ink-3, #aaa)',     bg: 'rgba(0,0,0,0.05)',       label: 'Sending…' },
    sync_failed: { colour: 'var(--red, #e53e3e)',    bg: 'rgba(229,62,62,0.10)',   label: 'Failed' },
  };

  const leaveTypeLabel = {
    annual: 'Annual Leave', sick: 'Sick Leave', personal: 'Personal Leave',
    unpaid: 'Unpaid Leave', other: 'Other Leave',
  };

  el.innerHTML = data.map(r => {
    const s = statusConfig[r.status] || statusConfig.syncing;
    const typeLabel = leaveTypeLabel[r.leave_type] || (r.leave_type.charAt(0).toUpperCase() + r.leave_type.slice(1));
    const syncNote = r.status === 'sync_failed'
      ? `<div style="font-size:11px;color:var(--red,#e53e3e);margin-top:4px;">⚠ Could not reach employer. Will retry automatically.</div>`
      : r.status === 'syncing'
      ? `<div style="font-size:11px;color:var(--ink-3,#aaa);margin-top:4px;">Sending to your employer…</div>`
      : '';

    return `
      <div class="wf-leave-card" style="
        background: var(--surface, #fff);
        border: 1px solid var(--border, #e8e8e6);
        border-radius: 12px;
        padding: 14px 16px;
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 10px;
        box-shadow: 0 1px 3px rgba(0,0,0,0.04);
      ">
        <div style="flex:1;min-width:0;">
          <div style="font-weight:700;font-size:14px;color:var(--ink-1);margin-bottom:3px;">${typeLabel}</div>
          <div style="font-size:12px;color:var(--ink-2);">
            ${fmtDate(r.start_date)}${r.start_date !== r.end_date ? ' – ' + fmtDate(r.end_date) : ''}
          </div>
          ${r.notes ? `<div style="font-size:11px;color:var(--ink-3);margin-top:4px;font-style:italic;">${r.notes}</div>` : ''}
          ${syncNote}
        </div>
        <span style="
          font-size:11px;
          font-weight:700;
          color:${s.colour};
          background:${s.bg};
          padding: 4px 10px;
          border-radius: 20px;
          white-space: nowrap;
          flex-shrink: 0;
          align-self: flex-start;
        ">${s.label}</span>
      </div>
    `;
  }).join('');
}

async function submitLeaveRequest() {
  if (!CURRENT_USER || !_wfConnection) return;
  const type  = document.getElementById('leave-type').value;
  const start = document.getElementById('leave-start').value;
  const end   = document.getElementById('leave-end').value;
  const notes = document.getElementById('leave-notes').value.trim();
  const errEl = document.getElementById('leave-error');
  const btn   = document.querySelector('[onclick="submitLeaveRequest()"]');
  errEl.style.display = 'none';

  if (!start || !end) { errEl.textContent = 'Please select start and end dates.'; errEl.style.display = 'block'; return; }
  if (end < start)    { errEl.textContent = 'End date must be after start date.'; errEl.style.display = 'block'; return; }

  if (btn) { btn.textContent = 'Submitting…'; btn.disabled = true; }

  // Step 1 — Insert into Personal leave_requests with status 'syncing'
  const { data: inserted, error: insertErr } = await sb
    .from('leave_requests')
    .insert({
      user_id:               CURRENT_USER.id,
      workforce_employee_id: _wfConnection.workforce_employee_id,
      leave_type:            type,
      start_date:            start,
      end_date:              end,
      notes:                 notes || null,
      status:                'syncing',
      submitted_at:          new Date().toISOString(),
    })
    .select('id')
    .single();

  if (insertErr) {
    errEl.textContent = 'Failed to submit. Please try again.';
    errEl.style.display = 'block';
    if (btn) { btn.textContent = 'Submit Request'; btn.disabled = false; }
    return;
  }

  // Step 2 — Call Workforce Edge Function to sync across
  try {
    const res = await fetch(
      'https://whedwekxzjfqwjuoarid.supabase.co/functions/v1/sync-leave-request',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          personal_user_id:      CURRENT_USER.id,
          personal_leave_id:     inserted.id,
          workforce_employee_id: _wfConnection.workforce_employee_id,
          workforce_business_id: _wfConnection.workforce_business_id,
          leave_type:            type,
          start_date:            start,
          end_date:              end,
          notes:                 notes || null,
        }),
      }
    );

    if (!res.ok) {
      // Sync failed — status stays 'syncing', will show warning in UI
      console.warn('Leave sync to Workforce failed:', await res.text());
    }
  } catch (e) {
    // Network error — status stays 'syncing', will retry on next app open
    console.warn('Leave sync network error:', e);
  }

  if (btn) { btn.textContent = 'Submit Request'; btn.disabled = false; }
  closeModal('leave-request-modal');
  await renderWfLeave();
  openWfSubtab('leave');
}

// Retry any leave requests stuck in 'syncing' status
async function retrySyncingLeaveRequests() {
  if (!CURRENT_USER || !_wfConnection) return;

  const { data } = await sb
    .from('leave_requests')
    .select('*')
    .eq('user_id', CURRENT_USER.id)
    .eq('status', 'syncing');

  if (!data?.length) return;

  for (const req of data) {
    try {
      await fetch(
        'https://whedwekxzjfqwjuoarid.supabase.co/functions/v1/sync-leave-request',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            personal_user_id:      CURRENT_USER.id,
            personal_leave_id:     req.id,
            workforce_employee_id: req.workforce_employee_id,
            workforce_business_id: _wfConnection.workforce_business_id,
            leave_type:            req.leave_type,
            start_date:            req.start_date,
            end_date:              req.end_date,
            notes:                 req.notes || null,
          }),
        }
      );
    } catch (e) {
      console.warn('Retry sync failed for leave request', req.id, e);
    }
  }
}

// ── Helpers ──────────────────────────────────────────

function fmtWfTime(t) {
  if (!t) return '—';
  const [h, m] = t.split(':').map(Number);
  const period = h >= 12 ? 'pm' : 'am';
  return `${h % 12 || 12}:${String(m).padStart(2,'0')}${period}`;
}

function fmtPayPeriod(start, end) {
  const s = new Date(start), e = new Date(end);
  return `${s.toLocaleDateString('en-AU',{day:'numeric',month:'short'})} – ${e.toLocaleDateString('en-AU',{day:'numeric',month:'short',year:'numeric'})}`;
}

function fmtDate(d) {
  return d ? new Date(d).toLocaleDateString('en-AU',{day:'numeric',month:'short',year:'numeric'}) : '—';
}

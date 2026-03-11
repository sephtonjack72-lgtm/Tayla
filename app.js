/* ═══════════════════════════════════════════════════════════
   TAYLA — APPLICATION JAVASCRIPT
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
═══════════════════════════════════════════════════════════ */

/* ═══════════════════════════════════════════════════
   SUPABASE SETUP
═══════════════════════════════════════════════════ */
const SUPABASE_URL  = 'https://anspwetxfykbmydrnkwh.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFuc3B3ZXR4ZnlrYm15ZHJua3doIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI5NTY0NjUsImV4cCI6MjA4ODUzMjQ2NX0.7yPIZFWRGaHNyXm-ZXzNXl6epi_C37HfXwVVagpBQJU';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON);

let CURRENT_USER = null; // { email, name, id }

/* ═══════════════════════════════════════════════════
   STORAGE HELPERS (consents stored in browser, all app data via Supabase)
═══════════════════════════════════════════════════ */
const getConsents  = email => { try { return JSON.parse(localStorage.getItem('ft_consents_' + email)) || {}; } catch { return {}; } };
const saveConsents = (email, c) => localStorage.setItem('ft_consents_' + email, JSON.stringify(c));

/* ═══════════════════════════════════════════════════
   AUTH
═══════════════════════════════════════════════════ */
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

  const name = data.user.user_metadata?.name || email.split('@')[0];
  enterApp(email, name, data.user.id);
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

  const now = new Date().toISOString();
  saveConsents(email, {
    tos:         { given: true,  timestamp: now, version: '1.0' },
    disclaimer:  { given: true,  timestamp: now },
    age:         { given: true,  timestamp: now },
    categoryData:{ given: cCat,  timestamp: now, canWithdraw: true },
  });

  showAlert('reg-success', '✓ Account created! Check your email to confirm, then sign in.', 'success');
}

async function doLogout() {
  await sb.auth.signOut();
  CURRENT_USER = null;
  document.getElementById('main-nav').style.display = 'none';
  document.getElementById('privacy-banner').style.display = 'none';
  document.getElementById('mobile-nav').style.display = 'none';
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

/* ═══════════════════════════════════════════════════
   SCREENS & TABS
═══════════════════════════════════════════════════ */
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

async function enterApp(email, name, id) {
  CURRENT_USER = { email, name, id };
  document.getElementById('nav-username').textContent = name;
  document.getElementById('main-nav').style.display = 'block';
  document.getElementById('privacy-banner').style.display = 'flex';
  document.getElementById('mobile-nav').style.display = 'block';
  showScreen('app-screen');
  await loadAllUserData();
  syncConsentUI();
  buildWeekRows();
  renderBudget();
  document.getElementById('budget-month-select').value = BUDGET_MONTH;
}

function setMobileNav(el) {
  document.querySelectorAll('.mobile-nav-item').forEach(i => i.classList.remove('active'));
  el.classList.add('active');
}

function openTab(t) {
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.sidebar-item[id^=nav-]').forEach(i => i.classList.remove('active'));
  document.getElementById('panel-' + t).classList.add('active');
  if (document.getElementById('nav-' + t)) document.getElementById('nav-' + t).classList.add('active');
  if (t === 'goals')  renderGoals();
  if (t === 'health') { renderDebts(); if (HEALTH_MODE === 'auto') autoFillHealth(); else calcHealth(); }
}

/* ═══════════════════════════════════════════════════
   MODALS
═══════════════════════════════════════════════════ */
function openModal(id)  { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }
// Close on backdrop click
document.querySelectorAll('.modal-overlay').forEach(o => {
  o.addEventListener('click', e => { if (e.target === o) o.classList.remove('open'); });
});

/* ═══════════════════════════════════════════════════
   CONSENT / SETTINGS LOGIC
═══════════════════════════════════════════════════ */
function syncConsentUI() {
  if (!CURRENT_USER) return;
  const c = getConsents(CURRENT_USER.email);
  const hasCat = c.categoryData && c.categoryData.given;
  document.getElementById('settings-cat-toggle').checked = hasCat;
  document.getElementById('cat-toggle-status').textContent = hasCat ? 'On' : 'Off';
  document.getElementById('sidebar-consent-status').textContent = hasCat ? 'on' : 'off';
  document.getElementById('cat-consent-notice').style.display = hasCat ? 'block' : 'none';
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

/* ═══════════════════════════════════════════════════
   DATA LOAD / SAVE
═══════════════════════════════════════════════════ */
let APP_DATA = { weeks: new Array(52).fill(null), months: new Array(12).fill(null), annualIncome: 0, budget: {}, health: {}, goals: [] };
let BUDGET_MONTH = new Date().getMonth() >= 6 ? new Date().getMonth() - 6 : new Date().getMonth() + 6;
const SYSTEM_GOAL_IDS = { emergency: 'system_emergency', savings: 'system_savings' };

const FY_OPTIONS = [
  { label: 'FY2024-25', key: 'fy2024', start: new Date(2024, 5, 24) }, // 24 Jun 2024
  { label: 'FY2025-26', key: 'fy2025', start: new Date(2025, 5, 30) }, // 30 Jun 2025
  { label: 'FY2026-27', key: 'fy2026', start: new Date(2026, 5, 29) }, // 29 Jun 2026
];
let CURRENT_FY = FY_OPTIONS[1]; // default FY2025-26
let FY_START   = CURRENT_FY.start;


async function loadAllUserData() {
  let saved = {};
  if (CURRENT_USER && CURRENT_USER.id) {
    const { data, error } = await sb
      .from('user_data')
      .select('data')
      .eq('user_id', CURRENT_USER.id)
      .eq('fy_key', CURRENT_FY.key)
      .maybeSingle();
    if (!error && data) saved = data.data || {};
  }
  APP_DATA = {
    weeks:        saved.weeks        || new Array(52).fill(null),
    months:       saved.months       || new Array(12).fill(null),
    annualIncome: saved.annualIncome || 0,
    budget:       saved.budget       || {},
    health:       saved.health       || {},
    goals:        saved.goals        || [],
    debts:        saved.debts        || [],
  };
  const h = APP_DATA.health;
  ['income','expenses','emergency','debt','housing','savings'].forEach(k => {
    const el = document.getElementById('h-' + k);
    if (el && h[k]) { el.value = h[k]; }
  });
  // Restore health mode UI
  setHealthMode(HEALTH_MODE);
}

async function persist() {
  if (!CURRENT_USER || !CURRENT_USER.id) return;
  await sb.from('user_data').upsert({
    user_id: CURRENT_USER.id,
    fy_key:  CURRENT_FY.key,
    data:    APP_DATA,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id,fy_key' });
}

/* ═══════════════════════════════════════════════════
   TAX CALCULATOR — multi-mode
═══════════════════════════════════════════════════ */

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

// ── INPUT MODE (gross vs net) ──
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
    hint.innerHTML = 'Enter your <strong>take-home pay</strong> — Tayla reverse-calculates your gross and tax.';
    if (inputCol) inputCol.textContent = 'Net Pay ($)';
    if (rightCol) rightCol.textContent = 'Gross Pay';
    if (annLabel) annLabel.textContent = 'Enter your annual net (take-home) income';
    if (modeDesc && cfg) modeDesc.textContent = cfg.desc.replace('gross', 'net (take-home)');
  } else {
    hint.innerHTML = 'Enter your pay <strong>before tax</strong> — Tayla calculates your take-home.';
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

// ── MODE STATE ──
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

  // Desc
  document.getElementById('mode-desc').textContent = INPUT_MODE === 'net'
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

  // Annualised projection row — only show in weekly/monthly
  document.getElementById('annualised-row').style.display = isAnnual ? 'none' : 'none'; // shown after data entry

  if (!isAnnual) buildPeriodRows();
  else {
    // Restore annual input if saved
    const saved = APP_DATA.annualIncome || '';
    document.getElementById('annual-input').value = saved;
    if (saved) onAnnualInput();
    else {
      setSummary(0, 0);
      document.getElementById('annual-results').style.display = 'none';
      document.getElementById('annual-breakdowns').style.display = 'none';
    }
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

  for (let i = 0; i < cfg.count; i++) {
    const label = TAX_MODE === 'monthly' ? MONTH_NAMES[i] : getWeekLabel(i);
    const grossStored = data[i] || 0;
    // In net mode, show the net value in the input field
    const displayVal = INPUT_MODE === 'net' && grossStored
      ? parseFloat((grossStored - calcTaxForPeriod(grossStored, TAX_MODE)).toFixed(2))
      : grossStored;
    const row = document.createElement('div');
    row.className = 'week-row' + (grossStored ? ' has-value' : '');
    row.id = 'wr' + i;

    if (INPUT_MODE === 'net') {
      // Net mode: input(net) | tax | gross
      row.innerHTML = `
        <div class="wc wc-label">${label}</div>
        <div class="wc"><input class="wc-input" type="number" min="0" step="0.01" placeholder="0.00"
          id="wi${i}" value="${displayVal ? displayVal : ''}" oninput="onPeriodInput(${i})"></div>
        <div class="wc wc-tax wc-empty" id="wt${i}">—</div>
        <div class="wc wc-gross wc-empty" id="wn${i}">—</div>`;
    } else {
      // Gross mode: input(gross) | tax | net
      row.innerHTML = `
        <div class="wc wc-label">${label}</div>
        <div class="wc"><input class="wc-input" type="number" min="0" step="0.01" placeholder="0.00"
          id="wi${i}" value="${grossStored ? grossStored : ''}" oninput="onPeriodInput(${i})"></div>
        <div class="wc wc-tax wc-empty" id="wt${i}">—</div>
        <div class="wc wc-net wc-empty" id="wn${i}">—</div>`;
    }
    container.appendChild(row);
    if (grossStored) refreshPeriodRow(i);
  }
  refreshPeriodSummary();
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
    // Count how many days of this week fall in each FY month
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

function onPeriodInput(i) {
  let val = parseFloat(document.getElementById('wi'+i).value) || 0;
  // If user entered net, reverse-calculate gross before storing
  const grossVal = INPUT_MODE === 'net' ? netToGrossPeriod(val, TAX_MODE) : val;
  if (TAX_MODE === 'weekly') {
    APP_DATA.weeks[i] = grossVal || null;
    syncWeeksToMonths(); // weekly → monthly only, never reverse
  }
  if (TAX_MODE === 'monthly') {
    APP_DATA.months[i] = grossVal || null;
    // monthly does NOT backfill weekly — independent
  }
  refreshPeriodRow(i);
  refreshPeriodSummary();
  autoAddToBudget(i, grossVal);
  persist();
}

function autoAddToBudget(periodIndex, grossVal) {
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
    // Sum all weeks that belong to this month into a single entry
    let monthlyTotal = 0;
    for (let w = 0; w < 52; w++) {
      if (getWeekMonth(w) === budgetMonthIndex) {
        const g = APP_DATA.weeks[w] || 0;
        if (g > 0) monthlyTotal += g - calcTaxForPeriod(g, 'weekly');
      }
    }
    // Remove old auto entry for this month and replace with single updated total
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
    // Monthly or annual — single entry per period
    const tax    = calcTaxForPeriod(grossVal, TAX_MODE);
    const netPay = grossVal - tax;
    APP_DATA.budget[budgetMonthIndex] = APP_DATA.budget[budgetMonthIndex]
      .filter(e => e.autoTaxPeriod !== periodIndex + '_' + TAX_MODE);
    if (grossVal > 0) {
      APP_DATA.budget[budgetMonthIndex].push({
        id: Date.now(),
        desc: MONTH_NAMES[periodIndex] + ' salary (after tax)',
        amount: parseFloat(netPay.toFixed(2)),
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
  const data = TAX_MODE === 'weekly' ? APP_DATA.weeks : APP_DATA.months;
  const g = data[i] || 0; // always stored as gross
  const t = calcTaxForPeriod(g, TAX_MODE);
  const n = g - t;
  const taxEl   = document.getElementById('wt'+i);
  const rightEl = document.getElementById('wn'+i);
  const row     = document.getElementById('wr'+i);
  if (g === 0) {
    taxEl.textContent   = '—'; taxEl.className   = 'wc wc-tax wc-empty';
    rightEl.textContent = '—'; rightEl.className = INPUT_MODE === 'net' ? 'wc wc-gross wc-empty' : 'wc wc-net wc-empty';
    row.classList.remove('has-value');
  } else {
    taxEl.textContent = fmt(t); taxEl.className = 'wc wc-tax';
    if (INPUT_MODE === 'net') {
      // Right col shows gross
      rightEl.textContent = fmt(g); rightEl.className = 'wc wc-gross';
    } else {
      // Right col shows net
      rightEl.textContent = fmt(n); rightEl.className = 'wc wc-net';
    }
    row.classList.add('has-value');
  }
}

function refreshPeriodSummary() {
  const cfg  = MODE_CONFIG[TAX_MODE];
  const data = TAX_MODE === 'weekly' ? APP_DATA.weeks : APP_DATA.months;
  let gross = 0, tax = 0, filled = 0;
  for (let i = 0; i < cfg.count; i++) {
    const g = data[i] || 0;
    if (g > 0) { gross += g; tax += calcTaxForPeriod(g, TAX_MODE); filled++; }
  }
  setSummary(gross, tax);
  document.getElementById('periods-filled').textContent = filled;

  // Update annual gross income field to reflect total
  const annualTotal = TAX_MODE === 'weekly'
    ? APP_DATA.months.reduce((s, v) => s + (v || 0), 0)  // months already synced from weeks
    : APP_DATA.months.reduce((s, v) => s + (v || 0), 0);
  if (annualTotal > 0) {
    APP_DATA.annualIncome = parseFloat(annualTotal.toFixed(2));
    document.getElementById('annual-input').value = APP_DATA.annualIncome;
  }

  // Annualised projection
  const annRow = document.getElementById('annualised-row');
  if (filled > 0 && filled < cfg.count) {
    const avgGross = gross / filled;
    const avgTax   = tax / filled;
    const projGross = avgGross * cfg.count;
    const projNet   = (avgGross - avgTax) * cfg.count;
    document.getElementById('proj-gross').textContent = fmtInt(projGross);
    document.getElementById('proj-net').textContent   = fmtInt(projNet);
    annRow.style.display = 'block';
  } else {
    annRow.style.display = 'none';
  }

  // Bracket highlight (annualise avg period)
  const avgPeriodGross = filled > 0 ? gross / filled : 0;
  const annualised = avgPeriodGross * (TAX_MODE === 'weekly' ? 52 : 12);
  highlightBracket(annualised, gross > 0);
}

function onAnnualInput() {
  let entered = parseFloat(document.getElementById('annual-input').value) || 0;
  // If net mode, reverse-calculate gross first
  const annual = INPUT_MODE === 'net' ? netToGrossAnnual(entered) : entered;
  APP_DATA.annualIncome = annual;
  persist();

  if (!entered) {
    setSummary(0, 0);
    document.getElementById('annual-results').style.display = 'none';
    document.getElementById('annual-breakdowns').style.display = 'none';
    highlightBracket(0, false);
    return;
  }

  const tax = calcTaxAnnual(annual);
  const net = annual - tax;
  setSummary(annual, tax);

  // Big result row
  document.getElementById('ar-tax').textContent  = fmtInt(tax);
  document.getElementById('ar-net').textContent  = fmtInt(net);
  document.getElementById('ar-rate').textContent = ((tax/annual)*100).toFixed(1) + '%';
  // If net mode, also show the calculated gross
  if (INPUT_MODE === 'net') {
    document.getElementById('ar-tax').title = 'Gross: ' + fmtInt(annual);
  }
  document.getElementById('annual-results').style.display = 'flex';

  // Breakdowns
  const weeklyNet  = (annual - tax) / 52;
  const weeklyTax  = tax / 52;
  const fnNet      = (annual - tax) / 26;
  const fnTax      = tax / 26;
  const monthlyNet = (annual - tax) / 12;
  const monthlyTax = tax / 12;
  document.getElementById('ar-monthly-net').textContent   = fmtInt(monthlyNet);
  document.getElementById('ar-monthly-tax').textContent   = 'tax: ' + fmtInt(monthlyTax);
  document.getElementById('ar-fortnight-net').textContent = fmtInt(fnNet);
  document.getElementById('ar-fortnight-tax').textContent = 'tax: ' + fmtInt(fnTax);
  document.getElementById('ar-weekly-net').textContent    = fmtInt(weeklyNet);
  document.getElementById('ar-weekly-tax').textContent    = 'tax: ' + fmtInt(weeklyTax);
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

async function changeFY(sourceId) {
  const id = sourceId || 'fy-select-tax';
  const el = document.getElementById(id);
  const key = el ? el.value : FY_OPTIONS[1].key;
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
  document.getElementById('annual-input').value = APP_DATA.annualIncome || '';
  document.getElementById('budget-month-select').value = BUDGET_MONTH;
}

function clearTaxData() {
  if (!confirm('Clear all tax data including weeks, months and annual?')) return;
  APP_DATA.weeks        = new Array(52).fill(null);
  APP_DATA.months       = new Array(12).fill(null);
  APP_DATA.annualIncome = 0;
  // Clear all auto-populated salary entries from budget
  Object.keys(APP_DATA.budget).forEach(m => {
    APP_DATA.budget[m] = (APP_DATA.budget[m] || []).filter(e => !e.autoTaxPeriod);
  });
  persist();
  document.getElementById('annual-input').value = '';
  setSummary(0, 0);
  document.getElementById('annual-results').style.display    = 'none';
  document.getElementById('annual-breakdowns').style.display = 'none';
  buildPeriodRows();
  refreshPeriodSummary();
  renderBudget();
}

function exportCSV() {
  let csv, filename;
  if (TAX_MODE === 'annual') {
    const g = APP_DATA.annualIncome || 0;
    const t = calcTaxAnnual(g);
    csv = 'Period,Gross Income,Tax,Net Income\n';
    csv += `Annual,${g.toFixed(2)},${t.toFixed(2)},${(g-t).toFixed(2)}\n`;
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

/* ═══════════════════════════════════════════════════
   BUDGET TRACKER
═══════════════════════════════════════════════════ */
const CAT_COLORS = {
  'Salary/Wages':'#1a7a8c','Freelance':'#1a6080','Other Income':'#2a6e5e',
  'Groceries':'#5a7a2a','Rent/Mortgage':'#a83232','Transport':'#1a6080',
  'Utilities':'#4a6868','Dining Out':'#7a5a1a','Entertainment':'#4a3a8a',
  'Healthcare':'#1a7a8c','Clothing':'#7a3a3a','Education':'#2a6e5e',
  'Insurance':'#4a6868','Subscriptions':'#1e3535','Savings/Investment':'#1a7a8c','Emergency Fund':'#1a6080',
  'Other Expense':'#5a7070',
};

function getCurrentBudget() {
  if (!APP_DATA.budget[BUDGET_MONTH]) APP_DATA.budget[BUDGET_MONTH] = [];
  return APP_DATA.budget[BUDGET_MONTH];
}

function changeBudgetMonth() {
  BUDGET_MONTH = parseInt(document.getElementById('budget-month-select').value);
  renderBudget();
}

function addBudgetEntry() {
  const desc   = document.getElementById('be-desc').value.trim();
  const amount = parseFloat(document.getElementById('be-amount').value);
  const catVal = document.getElementById('be-cat').value;
  if (!desc)          return alert('Please enter a description.');
  if (!amount || amount <= 0) return alert('Please enter a valid amount.');
  const [type, cat] = catVal.split('|');
  const entryDesc = type === 'savings draw' ? (desc || 'Savings Draw — ' + cat) : desc;
  const entry = { id: Date.now(), desc: entryDesc, amount, type, cat, date: new Date().toLocaleDateString('en-AU') };
  getCurrentBudget().unshift(entry);

  // Debt repayment — reduce the debt balance
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
  const balance  = totalInc - totalExp;
  const saveRate = totalInc > 0 ? (balance / totalInc * 100) : 0;

  document.getElementById('bm-income').textContent      = fmtK(totalInc);
  document.getElementById('bm-income-count').textContent = incomes.length + ' entr' + (incomes.length===1?'y':'ies');
  document.getElementById('bm-expenses').textContent    = fmtK(totalExp);
  document.getElementById('bm-exp-count').textContent   = expenses.length + ' entr' + (expenses.length===1?'y':'ies');
  document.getElementById('bm-balance').textContent     = fmtK(Math.abs(balance));
  document.getElementById('bm-balance').style.color     = balance >= 0 ? 'var(--green)' : 'var(--red)';
  document.getElementById('bm-savings-rate').textContent = 'Savings rate: ' + (totalInc>0 ? saveRate.toFixed(1)+'%' : '—');

  // Entry list
  const list = document.getElementById('entry-list');
  if (entries.length === 0) {
    list.innerHTML = '<div style="text-align:center;padding:32px;color:var(--ink-3);font-size:0.82rem">No entries yet.</div>';
  } else {
    list.innerHTML = entries.slice(0, 40).map(e => {
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
        <div class="entry-cat-dot" style="background:${isDebt ? 'var(--red)' : (CAT_COLORS[e.cat]||'#999')}"></div>
        <div>
          <div class="entry-desc">${escHtml(e.desc)}${drawBadge}${debtBadge}</div>
          <span class="entry-cat-label">${catLabel} · ${e.date}</span>
        </div>
        <div class="entry-amount ${amtClass}">${prefix}${fmt(e.amount)}</div>
        <button class="entry-del" onclick="deleteBudgetEntry(${e.id})" title="Delete">×</button>
      </div>`;
    }).join('');
  }

  // Spending pie chart
  const catTotals = {};
  expenses.forEach(e => { catTotals[e.cat] = (catTotals[e.cat]||0) + e.amount; });
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
      const color = CAT_COLORS[cat] || '#5a7070';
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

/* ═══════════════════════════════════════════════════
   FINANCIAL HEALTH
═══════════════════════════════════════════════════ */
// ── HEALTH MODE ──
let HEALTH_MODE = 'auto'; // 'auto' | 'manual'

function setHealthMode(mode) {
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
      ['Emergency Fund',        fmt(emergencyAmt),'from Goals'],
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
    document.getElementById('health-score').textContent = '—';
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

/* ── DEBT REGISTER ── */
function refreshDebtDropdown() {
  const optgroup = document.getElementById('debt-repayment-options');
  if (!optgroup) return;
  const debts = APP_DATA.debts || [];
  optgroup.innerHTML = debts.filter(d => d.balance > 0).map(d =>
    `<option value="debt repayment|${d.id}">Repay — ${escHtml(d.name)} (${fmt(d.balance)} remaining)</option>`
  ).join('');
}

function addDebt() {
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
    // Clear debt field in manual mode
    const debtEl = document.getElementById('h-debt');
    if (debtEl) { debtEl.value = ''; }
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
}

/* ═══════════════════════════════════════════════════
   GOALS
═══════════════════════════════════════════════════ */
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
      ? '<div class="goal-progress-bar"><div class="goal-progress-fill" style="width:' + pct.toFixed(1) + '%"></div></div><div class="goal-progress-labels"><span>' + pct.toFixed(0) + '% complete</span><span>' + fmt(rem) + ' to go</span></div>' + (eta ? '<div class="goal-eta">📅 At ' + fmt(g.monthly) + '/month — est. <strong>' + eta + '</strong></div>' : '')
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

/* ═══════════════════════════════════════════════════
   DATA RIGHTS (APP 12)
═══════════════════════════════════════════════════ */
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

/* ═══════════════════════════════════════════════════
   UTILS
═══════════════════════════════════════════════════ */
const escHtml = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

/* ═══════════════════════════════════════════════════
   INIT
═══════════════════════════════════════════════════ */
(async function init() {
  const { data: { session } } = await sb.auth.getSession();
  if (session) {
    const email = session.user.email;
    const name  = session.user.user_metadata?.name || email.split('@')[0];
    enterApp(email, name, session.user.id);
  } else {
    showScreen('auth-screen');
  }
})();

// LFMP Sub-account Builder page.
// Lock + encrypted token follow the LeadPro KPI admin page. All client data is read from the PRIVATE
// repo through the GitHub API with the user's token; nothing private is fetched from this public site.
import * as S from './shared.js';
import * as W from './webforms.js';
import * as K from './kpi.js';
import * as RV from './review-ui.js';
import * as RVR from './review.js';
import * as ST from './status.js';
import * as FCU from './find-client.js';
import * as FC from './find-client-fields.js';
import { createLogin } from './lfmp-login.js';

const CFG = window.BUILDER_CONFIG;
const API = CFG.api.replace(/\/$/, '');
const R = `/repos/${CFG.repo}`;
const OWNER = CFG.repo.split('/')[0];
const BRANCH = CFG.branch || 'main';
const WHO_KEY = 'sab-created-by';
const POLL_MS = Number(CFG.pollMs) || 5000;

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const enc = new TextEncoder(), dec = new TextDecoder();
const toB64 = u8 => { let s = ''; for (const b of u8) s += String.fromCharCode(b); return btoa(s); };
const fromB64 = b => Uint8Array.from(atob(b.replace(/\s/g, '')), c => c.charCodeAt(0));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} },
};
const ICON = {
  eye: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>',
  eyeOff: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 3l18 18"/><path d="M10.6 5.1A10.7 10.7 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.2M6.6 6.6A16.6 16.6 0 0 0 2 12s3.5 7 10 7a9.8 9.8 0 0 0 5.4-1.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>',
  tick: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>',
  cross: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M7 7l10 10M17 7 7 17"/></svg>',
  bang: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M12 6v8M12 18h.01"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  ext: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>',
  copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a1 1 0 0 1 1-1h9"/></svg>',
  sync: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M20 11a8 8 0 0 0-14.3-4.9L4 8M4 4v4h4M4 13a8 8 0 0 0 14.3 4.9L20 16m0 4v-4h-4"/></svg>',
  sun: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
  moon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/></svg>',
  pencil: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L19 9l-4-4L4 16v4Z"/><path d="m13.5 6.5 4 4"/></svg>',
};

let ghToken = null;
// One login (v1.2.0; the old page lock was removed in v1.3.0): the shared sign-in (lfmp-login.js + lfmp-lock.json) unlocks
// this page, the KPI admin and the Automation Review admin together, and the GitHub token lives in its shared vault.
let login = null;
const state = { records: [], attention: [], snapshots: [], snapshotNames: {}, subaccounts: [], loaded: false, form: null, run: null,
  desk: { csm: [], projects: [] }, deskSettings: {}, settings: {}, sending: {}, wfProj: {}, editLink: null, detailsId: null };

// ---------------------------------------------------------------- views
function show(view) { for (const v of ['setupView', 'tokenView', 'appView']) $(v).hidden = v !== view; }
function toast(msg, ms = 2600) { const t = $('toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => { t.hidden = true; }, ms); }
async function copy(text, what = 'Copied') {
  try { await navigator.clipboard.writeText(text); toast(`${what} copied`); }
  catch { const ta = document.createElement('textarea'); ta.value = text; document.body.append(ta); ta.select(); try { document.execCommand('copy'); toast(`${what} copied`); } catch { toast("Couldn't copy: select it and copy by hand"); } ta.remove(); }
}

// theme: Auto · Light · Dark (same control and saved key "lfmp-theme" as the KPI admin page). Auto follows the device and saves nothing.
const THEMES = [['auto', 'Auto'], ['light', 'Light'], ['dark', 'Dark']];
const themeMode = () => document.documentElement.getAttribute('data-theme') || 'auto';
const themeSegHtml = () => THEMES.map(([k, l], i) => `${i ? '<span class="sep" aria-hidden="true">·</span>' : ''}<button type="button" data-theme-set="${k}" aria-pressed="${k === themeMode()}" title="${k === 'auto' ? 'Follow this device\'s setting' : `Always ${l.toLowerCase()}`}">${l}</button>`).join('');
function applyTheme(mode) {
  if (!THEMES.some(t => t[0] === mode)) mode = 'auto';
  if (mode === 'auto') document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme', mode);
  store.set('lfmp-theme', mode === 'auto' ? null : mode);
  paintThemeBtn();
}
function paintThemeBtn() { for (const s of document.querySelectorAll('.themeseg')) s.innerHTML = themeSegHtml(); }

// small ⋯ menus: one open at a time; outside click or Esc closes
function closeMenus(except) {
  for (const m of document.querySelectorAll('.menu:not([hidden])')) if (m !== except) { m.hidden = true; document.querySelector(`[data-menu="${m.id}"]`)?.setAttribute('aria-expanded', 'false'); }
}

// What's new (builder only): page/whats-new.json holds the plain cards; CHANGELOG.md stays the developer history.
const NEWS_SEEN = 'sab-news-seen';
let newsData = null;
async function loadNews() {
  if (newsData) return newsData;
  try { const r = await fetch(`./whats-new.json?t=${Date.now()}`, { cache: 'no-store' }); newsData = r.ok ? await r.json() : { versions: [] }; } catch { newsData = { versions: [] }; }
  return newsData;
}
const newsUnseen = () => RVR.semverNewer(S.VERSION, store.get(NEWS_SEEN) || '0.0.0');
function paintNewsDot() { const d = $('newsDot'); if (d) d.hidden = !newsUnseen(); }
function markNewsSeen() { store.set(NEWS_SEEN, S.VERSION); paintNewsDot(); $('wnToast').hidden = true; }
const TYPE_LABEL = { new: 'New', improved: 'Improved', fixed: 'Fixed' };
async function showNewsToast() {
  if (!newsUnseen()) return;
  const v = (await loadNews()).versions?.find(x => x.version === S.VERSION); if (!v || !newsUnseen()) return;
  const more = v.items.length - 2;
  $('wnToast').innerHTML = `<div class="wnmeta"><span class="wnbadge">Updated</span><span>v${esc(v.version)} · ${esc(v.date)}</span></div>
    <h3>${esc(v.title)}</h3><ul>${v.items.slice(0, 2).map(i => `<li>${esc(i.text)}</li>`).join('')}${more > 0 ? `<li>…and ${more} more</li>` : ''}</ul>
    <div class="btnrow"><button class="btn p" type="button" data-act="news">See what's new →</button><button class="btn" type="button" data-act="newsgot">Got it</button></div>`;
  $('wnToast').hidden = false;
}

// ---------------------------------------------------------------- sign-in (shared one login)
const saveToken = token => login.vaultSet({ gh: token });

async function boot() {
  $('ver').textContent = `v${S.VERSION}`;
  $('verChipText').textContent = `v${S.VERSION}`;
  paintNewsDot();
  if ($('tokOwner')) $('tokOwner').textContent = OWNER;
  paintThemeBtn();
  for (const b of document.querySelectorAll('[data-eye]')) b.innerHTML = ICON.eye;
  // One message only: the page's own "file is missing" text, or the other reason in its place.
  const notReady = msg => { show('setupView'); if (msg && !/lfmp-lock\.json is missing/.test(msg)) $('setupMsg').textContent = msg; };
  if (!window.crypto?.subtle) { notReady("This browser can't run the builder. Use an up-to-date Chrome, Safari, Edge or Firefox."); return; }
  login = createLogin({ tool: 'builder', onUnlock: unlocked, onLock: () => lockNow({ fromLogin: true }) });
  if (await login.start() === 'error') notReady(login.error);
}

// Shared sign-in done (password typed, or a live session from any of the three tools in this tab).
async function unlocked({ vault, reset }) {
  if (vault.gh) { ghToken = vault.gh; return openApp(); }
  askToken(reset ? 'The saved GitHub token was locked with an older admin password, so it was cleared. Paste the token again.'
    : 'Connect GitHub once for the Builder and the KPI admin. The token is saved in this browser only, encrypted with the admin password.');
}

function askToken(why) {
  show('tokenView'); $('tokenErr').textContent = ''; $('permList').hidden = true;
  if (why) $('tokenWhy').textContent = why;
  $('tokenIn').value = ''; $('tokenIn').focus();
}

// Connect check: tests each permission the page needs, without changing anything.
// Write checks send requests GitHub must reject (a branch that doesn't exist / an empty commit id):
// 422 means "allowed, but invalid input" (permission present); 403 means the permission is missing.
const PERMS = [
  { key: 'meta', label: 'Metadata: Read (can see the private repo)', fix: `Repository access must include ghl-subaccount-builder, with resource owner ${OWNER}.` },
  { key: 'contentsRead', label: 'Contents: Read', fix: 'Set Contents to "Read and write".' },
  { key: 'contentsWrite', label: 'Contents: Write', fix: 'Set Contents to "Read and write".' },
  { key: 'actionsRead', label: 'Actions: Read', fix: 'Set Actions to "Read and write".' },
  { key: 'actionsWrite', label: 'Actions: Write (start the create workflow)', fix: 'Set Actions to "Read and write".' },
  // KPI dashboard setup (Phase 2). Not needed to create sub-accounts, so a missing one never blocks Connect.
  { key: 'kpiSecrets', optional: true, label: 'LeadPro KPI repo: Secrets read/write (KPI setup)', fix: 'Add the repository leadpro-kpi to the token, with Secrets "Read and write".' },
  { key: 'kpiActions', optional: true, label: 'LeadPro KPI repo: Actions write (KPI setup)', fix: 'Add the repository leadpro-kpi to the token, with Actions "Read and write".' },
];
async function rawFetch(method, path, body) {
  return fetch(API + path, { method, cache: 'no-store', headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${ghToken}`, 'X-GitHub-Api-Version': '2022-11-28', ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
}
export async function connectCheck() {
  const res = {};
  const meta = await rawFetch('GET', R);
  if (meta.status === 401) throw new Error("GitHub didn't accept that token. Check you copied all of it, and that it hasn't expired.");
  res.meta = meta.ok ? 'yes' : 'no';
  if (!meta.ok) { for (const p of PERMS.slice(1)) res[p.key] = 'no'; return res; }
  res.contentsRead = (await rawFetch('GET', `${R}/contents/README.md?ref=${BRANCH}`)).ok ? 'yes' : 'no';
  res.actionsRead = (await rawFetch('GET', `${R}/actions/workflows`)).ok ? 'yes' : 'no';
  const aw = await rawFetch('POST', `${R}/actions/workflows/create.yml/dispatches`, { ref: 'connect-check-no-such-branch', inputs: { payload: '{}', request_id: 'connect-check' } });
  res.actionsWrite = aw.status === 422 ? 'yes' : aw.status === 403 ? 'no' : 'maybe';
  const cw = await rawFetch('POST', `${R}/git/refs`, { ref: 'refs/heads/connect-check-probe', sha: '0000000000000000000000000000000000000000' });
  res.contentsWrite = cw.status === 422 ? 'yes' : cw.status === 403 ? 'no' : 'maybe';
  const KR = `/repos/${CFG.kpiRepo || 'peejayedz/leadpro-kpi'}`;
  const ks = await rawFetch('GET', `${KR}/actions/secrets/public-key`);   // needs Secrets: Read (write comes with it in the token settings)
  res.kpiSecrets = ks.ok ? 'yes' : [403, 404].includes(ks.status) ? 'no' : 'maybe';
  const ka = await rawFetch('POST', `${KR}/actions/workflows/new-firm.yml/dispatches`, { ref: 'connect-check-no-such-branch', inputs: {} });
  res.kpiActions = ka.status === 422 ? 'yes' : [403, 404].includes(ka.status) ? 'no' : 'maybe';
  return res;
}
function paintPerms(res) {
  $('permList').hidden = false;
  $('permList').innerHTML = PERMS.map(p => { const v = res[p.key]; return `<li class="${v}" data-perm="${p.key}"><span class="pi">${v === 'yes' ? '✓' : v === 'no' ? '✕' : '?'}</span><span>${esc(p.label)}${v === 'no' ? ` <span class="hint">· missing. ${esc(p.fix)}</span>` : v === 'maybe' ? ' <span class="hint">· could not confirm</span>' : ''}</span></li>`; }).join('');
}
$('tokenForm').addEventListener('submit', async e => {
  e.preventDefault();
  const t = $('tokenIn').value.trim(); if (!t) return;
  $('tokenGo').disabled = true; $('tokenGo').textContent = 'Checking…'; $('tokenErr').textContent = '';
  try {
    ghToken = t;
    const res = await connectCheck();
    paintPerms(res);
    const missing = PERMS.filter(p => !p.optional && res[p.key] === 'no').map(p => p.label.split(' (')[0]);
    if (missing.length) { ghToken = null; $('tokenErr').textContent = `Missing: ${missing.join(', ')}. Edit the token on GitHub (the token itself stays the same) and press Connect again.`; return; }
    await saveToken(t); $('tokenIn').value = '';
    await openApp();
  } catch (err) { ghToken = null; $('tokenErr').textContent = err.message; }
  finally { $('tokenGo').disabled = false; $('tokenGo').textContent = 'Connect and check'; }
});

function lockNow({ fromLogin = false } = {}) {
  if (!fromLogin) { login.lock(''); return; }   // Lock = all three tools; the shared login calls back here
  ghToken = null; stopRun(); closeMenus(); $('wnToast').hidden = true; state.loaded = false; $('panel-list').innerHTML = ''; $('panel-new').innerHTML = ''; closeDialog();
  show(null); }

// ---------------------------------------------------------------- GitHub API
function ghError(status, msg, path) {
  if (status === 401) return "GitHub didn't accept the saved token (expired or revoked). Use Forget token and connect a new one.";
  if (status === 403 && /rate limit/i.test(msg)) return 'GitHub rate limit reached. Wait a few minutes and try again.';
  if (status === 403) return `The GitHub token is missing a permission for this (${/actions/.test(path) ? 'Actions: Read and write' : 'Contents: Read and write'}).`;
  if (status === 404) return "GitHub couldn't find the repo or file. Check the token's repository access includes ghl-subaccount-builder.";
  if (status === 422) return `GitHub refused the request: ${msg}`;
  return `GitHub error ${status}${msg ? `: ${msg}` : ''}`;
}
async function gh(method, path, body, { allow404 = false, raw = false } = {}) {
  let r;
  try {
    r = await fetch(API + path, { method, cache: 'no-store', headers: { Accept: raw ? 'application/vnd.github.raw' : 'application/vnd.github+json', Authorization: `Bearer ${ghToken}`, 'X-GitHub-Api-Version': '2022-11-28', ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  } catch { throw new Error("Couldn't reach GitHub. Check your internet connection."); }
  if (r.status === 404 && allow404) return null;
  if (!r.ok) { let m = ''; try { m = (await r.json()).message; } catch {} const e = new Error(ghError(r.status, m, path)); e.status = r.status; throw e; }
  const text = r.status === 204 ? '' : await r.text();
  return raw ? text : (text ? JSON.parse(text) : {});
}
const contentPath = p => p.split('/').map(encodeURIComponent).join('/');
async function getJSON(path) { const t = await gh('GET', `${R}/contents/${contentPath(path)}?ref=${BRANCH}`, null, { allow404: true, raw: true }); return t === null ? null : JSON.parse(t); }
async function listDir(path) { const r = await gh('GET', `${R}/contents/${contentPath(path)}?ref=${BRANCH}`, null, { allow404: true }); return Array.isArray(r) ? r : []; }
async function mapLimit(items, n, fn) { const out = new Array(items.length); let i = 0; await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; try { out[k] = await fn(items[k]); } catch { out[k] = null; } } })); return out; }

// The page's only write to the repo: saving ONE client record (records/<id>.json), or that record's review package
// preview (records/<id>/review-package/package.json), through GitHub's contents API. Each save is a commit.
// Anything else is refused here (tests/unit/safety.test.mjs checks it).
async function putContents(path, text, sha, message) {
  if (!/^records\/[a-z0-9-]{1,60}(\/review-package\/package)?\.json$/.test(path)) throw new Error('Blocked: the page may only save client records and their review package preview.');
  return gh('PUT', `${R}/contents/${contentPath(path)}`, { message, content: toB64(enc.encode(text)), sha, branch: BRANCH });
}
// Review package preview (Phase 4): one file per record.
async function getPackage(id) {
  const r = await gh('GET', `${R}/contents/${contentPath(`records/${id}/review-package/package.json`)}?ref=${BRANCH}`, null, { allow404: true });
  return r ? { pkg: JSON.parse(dec.decode(fromB64(r.content))), sha: r.sha } : null;
}
async function savePackage(id, pkg, sha, message) {
  const path = `records/${id}/review-package/package.json`;
  if (sha === undefined || sha === null) { const cur = await gh('GET', `${R}/contents/${contentPath(path)}?ref=${BRANCH}`, null, { allow404: true }); sha = cur?.sha; }
  return putContents(path, `${JSON.stringify(pkg, null, 2)}\n`, sha || undefined, message);
}
// Re-reads the record, applies `mutate`, saves. Retries when someone else saved in between.
async function saveRecord(id, mutate, message) {
  const path = `records/${id}.json`;
  for (let i = 0; ; i++) {
    const r = await gh('GET', `${R}/contents/${contentPath(path)}?ref=${BRANCH}`);
    const rec = JSON.parse(dec.decode(fromB64(r.content)));
    mutate(rec);
    rec.updatedAt = new Date().toISOString();
    try { await putContents(path, `${JSON.stringify(rec, null, 2)}\n`, r.sha, message); }
    catch (e) { if ((e.status === 409 || e.status === 422) && i < 2) { await sleep(800); continue; } throw e; }
    const k = state.records.findIndex(x => x.id === id);
    if (k >= 0) state.records[k] = rec; else state.records.unshift(rec);
    return rec;
  }
}

async function dispatch(workflow, inputs) {
  const t0 = Date.now();
  await gh('POST', `${R}/actions/workflows/${workflow}/dispatches`, { ref: BRANCH, inputs });
  return t0;
}
async function findRun(workflow, title, since = 0) {
  const r = await gh('GET', `${R}/actions/workflows/${workflow}/runs?event=workflow_dispatch&per_page=20`);
  return (r.workflow_runs || []).filter(x => x.display_title === title && Date.parse(x.created_at) >= since - 60000)
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))[0] || null;
}
// Waits for a dispatched workflow to finish. Returns the run.
async function waitRun(workflow, title, t0, { limitMs = 5 * 60e3, onTick } = {}) {
  const end = t0 + limitMs;
  for (;;) {
    await sleep(POLL_MS);
    const run = await findRun(workflow, title, t0);
    onTick?.(run);
    if (run?.status === 'completed') return run;
    if (Date.now() > end) throw new Error(run ? 'GitHub is still working on it. Check again in a minute.' : "GitHub didn't start the job. Its Actions minutes or billing may need attention.");
  }
}

// ---------------------------------------------------------------- app shell
async function openApp() {
  show('appView');
  renderList(); renderNew();
  selectTab('list');
  showNewsToast();
  await loadAll();
}
function selectTab(tab) {
  for (const t of document.querySelectorAll('.tab')) { t.setAttribute('aria-selected', String(t.dataset.tab === tab)); if (t.tagName === 'A') t.toggleAttribute('aria-current', t.dataset.tab === tab); if (t.dataset.tab === tab) t.setAttribute('aria-current', 'page'); }
  for (const b of document.querySelectorAll('.bnav [data-tab]')) b.classList.toggle('on', b.dataset.tab === tab);
  $('panel-list').hidden = tab !== 'list'; $('panel-new').hidden = tab !== 'new';
  $('fabNew').hidden = tab !== 'list';
}

function paintRefresh() {
  if (!state.refreshedAt) return;
  const d = new Date(state.refreshedAt), today = d.toDateString() === new Date().toDateString();
  $('lastRefresh').textContent = d.toLocaleString('en-US', today ? { hour: 'numeric', minute: '2-digit' } : { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  $('lastRefresh').title = d.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
  const m = Math.round((Date.now() - state.refreshedAt) / 60000);
  $('refreshAgo').textContent = m < 1 ? 'Just now' : m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`;
}
setInterval(paintRefresh, 60e3);

async function loadAll() {
  $('listBody').innerHTML = '<p class="muted" style="padding:24px 2px">Loading sub-accounts…</p>';
  try {
    const [snaps, names, subs] = await Promise.all([getJSON('data/snapshots.json'), getJSON('data/snapshot-names.json'), getJSON('data/subaccounts.json'), loadDesk()]);
    state.snapshots = snaps || []; state.snapshotNames = names || {}; state.subaccounts = subs || [];
    await loadRecords();
    state.loaded = true; state.refreshedAt = Date.now(); paintRefresh();
    paintSnapshotSelect(); paintCsmSelect();
  } catch (e) { $('listBody').innerHTML = `<div class="errbox">${esc(e.message)}</div>`; }
}
async function loadDesk() {
  const [desk, ds, st] = await Promise.all([getJSON('data/desk.json'), getJSON('data/desk-settings.json'), getJSON('data/settings.json')]);
  state.desk = { csm: desk?.csm || [], projects: desk?.projects || [], refreshedAt: desk?.refreshedAt || null };
  state.deskSettings = ds || {}; state.settings = st || {};
}
async function loadRecords() {
  const files = (await listDir('records')).filter(f => f.type === 'file' && f.name.endsWith('.json'));
  state.records = (await mapLimit(files, 6, f => getJSON(f.path))).filter(Boolean)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  // Runs that are still going, or that stopped without a sub-account (newest 15 only).
  const runs = (await listDir('runs')).filter(f => f.type === 'file' && f.name.endsWith('.json')).sort((a, b) => b.name.localeCompare(a.name)).slice(0, 15);
  const recIds = new Set(state.records.map(r => r.requestId));
  const week = Date.now() - 7 * 864e5;
  state.attention = (await mapLimit(runs, 6, f => getJSON(f.path))).filter(Boolean)
    .filter(r => !recIds.has(r.requestId) || !S.FINAL_RUN.includes(r.status))
    .filter(r => !S.FINAL_RUN.includes(r.status) || Date.parse(r.updatedAt || r.startedAt) > week)
    .filter(r => r.status !== 'done');
  paintList();
}

// ---------------------------------------------------------------- Sub-accounts tab
const snapName = (id, fallback) => state.snapshotNames[id] || fallback || state.snapshots.find(s => s.id === id)?.name || id;
const fmtDate = iso => { try { return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso)); } catch { return iso; } };

function renderList() {
  if (state.showTests === undefined) state.showTests = store.get(SHOW_TESTS) === '1';
  $('panel-list').innerHTML = `
    <section class="hero hero2"><div><p class="ey">LFMP · Sub-account builder</p><h1 class="disp" id="heroTitle">Every client. <span class="g">One place.</span></h1></div>
      <button class="btn p" type="button" data-act="gonew">${ICON.plus} New sub-account →</button></section>
    <div class="strip" id="statStrip" role="group" aria-label="Summary"><span>Loading…</span></div>
    <div class="listbar">
      <div class="segscroll"><div class="seg" id="listTabs" role="group" aria-label="Show"></div></div>
      <label class="showtests"><input type="checkbox" id="showTests"${state.showTests ? ' checked' : ''}> Show tests</label>
      <input type="search" class="search" id="q" placeholder="Search clients…" title="Name, domain, ticket #, link, email, location ID…" aria-label="Search clients (name, domain, ticket #, link)">
    </div>
    <div id="listBody"></div>`;
  $('q').addEventListener('input', paintList);
  $('showTests').addEventListener('change', e => { state.showTests = e.target.checked; store.set(SHOW_TESTS, state.showTests ? '1' : null); paintList(); });
  $('listTabs').addEventListener('click', e => { const b = e.target.closest('[data-ltab]'); if (b) { state.listTab = b.dataset.ltab; paintList(); } });
  $('statStrip').addEventListener('click', e => { const b = e.target.closest('[data-ltab]'); if (b) { state.listTab = state.listTab === b.dataset.ltab ? 'all' : b.dataset.ltab; paintList(); } });
}
const SHOW_TESTS = 'sab-show-tests';
const isTest = r => /\btest\b|^zz\b/i.test(r.businessName || '');
// Status + setup squares for one record (page/status.js).
function rowInfo(r) {
  const kpi = K.kpiState(r), review = RV_STATE(r), forms = W.webformsStatus(r);
  const parts = ST.setupParts(r, { kpi, review, forms });
  return { r, parts, kpi, review, forms, reviewKey: review.key, overall: ST.overallStatus(r, { kpi, review, forms }), problem: ST.problem(r, { kpi, review, forms }) };
}
const showInTab = (tab, x) => ST.inTab(tab, x.overall);
function setupHtml(x) {
  const label = { kpi: ['KPI', x.kpi.label], review: ['Review', x.review.label], forms: ['Forms', x.forms.label] };
  const chipName = { kpi: 'kpi', review: 'review', forms: 'webforms' };
  const pre = { kpi: 'KPI', review: 'Review', forms: 'Webforms' };
  return `<div class="setup" aria-label="Setup">${x.parts.map(p => `<span class="sp ${p.state}" data-chip="${chipName[p.name]}" title="${esc(`${pre[p.name]}: ${label[p.name][1]}`)}" aria-label="${esc(`${pre[p.name]}: ${label[p.name][1]}`)}">${label[p.name][0]}</span>`).join('')}</div>`;
}
function rowHtml(x) {
  const r = x.r, o = x.overall, bad = o.key === 'attention';
  return `<div class="row" data-rec="${esc(r.id)}">
      <div class="rname"><h3>${esc(r.businessName)}</h3>
        <p class="meta"><span>${esc(snapName(r.snapshot?.id, r.snapshot?.name))}</span><span title="${esc(fmtDate(r.createdAt))}">Created ${esc(shortDate(r.createdAt))}</span>${isTest(r) ? '<span>Test</span>' : ''}</p></div>
      <div class="rst"><span class="stag rstag tone-${o.tone}" data-chip="status" title="${esc((S.RECORD_STATUS[r.status] || {}).label || r.status || '')}">${esc(o.label)}</span>
        ${x.problem ? `<button class="fixlink" type="button" data-act="details" data-id="${esc(r.id)}">${esc(x.problem.text)} →</button>` : ''}</div>
      ${setupHtml(x)}
      <div class="ractions">
        <a class="btn sm" href="${esc(r.links?.ghl || W.ghlLinkFor(r.locationId))}" target="_blank" rel="noopener" aria-label="Open ${esc(r.businessName)} in GHL">GHL ↗</a>
        <button class="btn sm${bad ? ' p' : ''}" type="button" data-act="details" data-id="${esc(r.id)}" aria-label="Details for ${esc(r.businessName)}">Details →</button>
      </div>
      <div class="rstatus" id="rs-${esc(r.id)}">${r.lastStatusCheck && !r.lastStatusCheck.ok ? `<span class="chip bad">Last check failed</span> ${esc(r.lastStatusCheck.message)}` : ''}</div>
    </div>`;
}
const shortDate = iso => { try { return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: new Date(iso).getFullYear() === new Date().getFullYear() ? undefined : 'numeric' }).format(new Date(iso)); } catch { return ''; } };
function statusChip(rec) { const s = S.RECORD_STATUS[rec.status] || { label: rec.status || 'Unknown', tone: '' }; return `<span class="chip ${s.tone}" data-chip="status"><span class="dot"></span>${esc(s.label)}${rec.status === 'snapshot_loading' && rec.snapshotProgress?.percent ? ` · ${rec.snapshotProgress.percent}%` : ''}</span>`; }
const RV_STATE = r => RVR.reviewState(r, RV.liveOf(r.id).tplLatest);
const runLabel = r =>({ failed: ['Failed', 'bad'], duplicate: ['Stopped: similar name exists', 'warn'], snapshot_still_loading: ['Snapshot loading', 'warn'] }[r.status] || ['In progress', 'info']);

function paintList() {
  const body = $('listBody'); if (!body) return;

  const q = S.normName($('q')?.value || '');
  const hay = r => S.normName([r.businessName, snapName(r.snapshot?.id, r.snapshot?.name), r.createdBy, r.locationId, r.submitted?.email, r.submitted?.city,
    r.webforms?.domain, W.ticketOf(r)?.id, r.csm?.name, ...Object.values(W.recordLinks(r))].join(' '));
  const every = state.records.map(rowInfo);
  const all = state.showTests ? every : every.filter(x => !isTest(x.r));   // test clients are hidden unless "Show tests" is on
  const tab = state.listTab || 'all';
  const match = x => !q || hay(x.r).includes(q);
  const shown = all.filter(x => match(x) && showInTab(tab, x));
  const hiddenTests = state.showTests ? 0 : every.filter(x => isTest(x.r) && match(x) && showInTab(tab, x)).length;
  // top line (real records): N sub-accounts / N setting up / N need attention → (filters to Needs attention)
  const s = ST.stats(all);
  $('recCount').textContent = all.length;   // same count as the top line (test clients only when shown)
  $('statStrip').innerHTML = `<span>${s.total} sub-account${s.total === 1 ? '' : 's'}</span><span>${s.settingUp} setting up</span><button type="button" class="${s.attention ? 'hot' : ''}" data-ltab="attention" aria-pressed="${tab === 'attention'}">${s.attention} need${s.attention === 1 ? 's' : ''} attention →</button>`;
  $('listTabs').innerHTML = ST.TABS.map(([k, l, short]) => `<button type="button" data-ltab="${k}" aria-pressed="${tab === k}"><span class="wl">${l}</span><span class="n">${all.filter(x => ST.inTab(k, x.overall)).length}</span></button>`).join('');
  if (matchMedia('(max-width:760px)').matches) for (const b of $('listTabs').querySelectorAll('[data-ltab]')) b.querySelector('.wl').textContent = ST.TABS.find(t => t[0] === b.dataset.ltab)[2];
  let html = '';
  if (state.attention.length) {
    html += `<p class="sectionlabel">In progress or needs attention</p><div class="attn">${state.attention.map(r => { const [l, t] = runLabel(r); return `<div class="row" data-run="${esc(r.requestId)}"><div><h3>${esc(r.businessName || 'Unnamed')}</h3><p class="meta"><span>Started ${esc(fmtDate(r.startedAt))}</span>${r.payload?.createdBy ? `<span>by ${esc(r.payload.createdBy)}</span>` : ''}</p><div class="chips"><span class="chip ${t}"><span class="dot"></span>${esc(l)}</span></div></div><div class="acts"><button class="btn" type="button" data-act="viewrun" data-id="${esc(r.requestId)}">View progress</button></div></div>`; }).join('')}</div>`;
  }
  if (!state.records.length) {
    html += `<div class="empty" id="emptyState"><h2>No sub-accounts yet</h2><p class="sub">Sub-accounts created with this builder are listed here.</p><button class="btn primary big" type="button" data-act="gonew">${ICON.plus} Create your first sub-account</button></div>`;
  } else if (!shown.length) {
    html += `<div class="empty">${q ? `No sub-accounts match “${esc($('q').value)}”` : 'No clients here'}${tab !== 'all' ? ' in this view' : ''}. ${tab !== 'all' ? '<button class="linkbtn" type="button" data-ltabset="all">Show all</button>' : ''}${hiddenTests ? ` <button class="linkbtn" type="button" data-act="showtests">Show ${hiddenTests} hidden test client${hiddenTests === 1 ? '' : 's'}</button>` : ''}</div>`;
  } else {
    if (state.attention.length) html += '<p class="sectionlabel">Created</p>';
    html += `<div class="ctable"><div class="chead" aria-hidden="true"><span>Client</span><span>Status</span><span>Setup</span><span></span></div><div class="list" id="recList">${shown.map(rowHtml).join('')}</div></div>`;
  }
  body.innerHTML = html;
}

function recTz(r) { return r.timezone || r.submitted?.timezone || ''; }

async function refreshStatus(id, btn) {
  const rec = state.records.find(r => r.id === id); if (!rec) return;
  const out = $(`rs-${id}`);
  btn.disabled = true; btn.innerHTML = `${ICON.sync} Checking…`;
  out.innerHTML = '<span class="muted">Asking GHL for the snapshot status (about 30–90 seconds)…</span>';
  try {
    const rid = S.newRequestId();
    const t0 = await dispatch('status.yml', { record: id, request_id: rid });
    const run = await waitRun('status.yml', `status ${rid}`, t0, { onTick: r => { if (r && r.status !== 'completed') out.innerHTML = '<span class="muted">GitHub is checking…</span>'; } });
    const fresh = await getJSON(`records/${id}.json`);
    if (fresh) Object.assign(rec, fresh);
    paintList();
    const o2 = $(`rs-${id}`);
    if (run.conclusion !== 'success' && fresh?.lastStatusCheck?.ok !== true) { o2.innerHTML = `<span class="chip bad">Check failed</span> ${esc(fresh?.lastStatusCheck?.message || `The GitHub run ended "${run.conclusion}".`)}`; }
    else toast(`${rec.businessName}: ${(S.RECORD_STATUS[rec.status] || {}).label || rec.status}`);
  } catch (e) { out.innerHTML = `<span class="chip bad">Couldn't check</span> ${esc(e.message)}`; }
  finally { const b = document.querySelector(`[data-act="refresh"][data-id="${CSS.escape(id)}"]`); if (b) { b.disabled = false; b.innerHTML = `${ICON.sync} Refresh status`; } }
}

// ---------------------------------------------------------------- dialogs
// side: the record's details as a right-side panel (full screen on phones). Its own header has the close button.
let dialogReturn = null;
function openDialog({ title, body, ok, danger, onOk, wide, side, cancel = 'Cancel' }) {
  closeMenus();
  if (!$('ovl')) dialogReturn = document.activeElement;
  $('dialogHost').innerHTML = `<div class="ovl${side ? ' side' : ''}" id="ovl"><div class="dlg ${wide ? 'wide' : ''}${side ? ' side' : ''}" role="dialog" aria-modal="true" aria-labelledby="dlgT"><h3 id="dlgT">${esc(title)}</h3>${body}<div class="btnrow">${cancel ? `<button class="btn" type="button" id="dlgCancel">${esc(cancel)}</button>` : ''}${ok ? `<button class="btn ${danger ? 'danger' : 'primary'}" type="button" id="dlgOk">${esc(ok)}</button>` : ''}</div></div></div>`;
  $('ovl').addEventListener('click', e => { if (e.target.id === 'ovl') closeDialog(); });
  $('dlgCancel')?.addEventListener('click', closeDialog);
  if (ok) $('dlgOk').addEventListener('click', onOk);
  if (!side) ($('dlgOk') || $('dlgCancel'))?.focus();
}
function closeDialog() { const had = !!$('ovl'); $('dialogHost').innerHTML = ''; if (had && dialogReturn?.isConnected) dialogReturn.focus(); dialogReturn = null; }
// Esc closes the topmost: a ⋯ menu, then the review preview overlay is left to its own handler, then a dialog/panel, then the What's new toast.
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  const m = document.querySelector('.menu:not([hidden])');
  if (m) { closeMenus(); document.querySelector(`[data-menu="${m.id}"]`)?.focus(); return; }
  if ($('ovl')) { closeDialog(); return; }
  if (!$('wnToast').hidden) markNewsSeen();
});

function kv(rows) { return `<dl class="kv">${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v === '' || v === undefined || v === null ? '<span class="empty-val">—</span>' : v}</dd>`).join('')}</dl>`; }
const tzCell = id => (id ? `${esc(S.tzLabel(id))} <span class="mono hint">${esc(id)}</span>` : '');
function fieldRows(p) {
  const yesno = v => (v === true ? 'Yes' : v === false ? 'No' : '');
  return {
    business: [['Business name', esc(p.businessName)], ['Business phone', esc(S.formatPhone(p.phone))], ['Website', esc(p.website)]],
    address: [['Street', esc(p.address)], ['City', esc(p.city)], ['State', esc(p.state)], ['ZIP', esc(p.postalCode)], ['Country', esc(p.country)], ['Time zone', tzCell(p.timezone)]],
    contact: [['First name', esc(p.firstName)], ['Last name', esc(p.lastName)], ['Email', esc(p.email)]],
    social: S.SOCIAL.map(([k, l]) => [l, esc(p.social?.[k])]),
    settings: S.SETTINGS.map(([k, l]) => [l, typeof p.settings?.[k] === 'boolean' ? yesno(p.settings[k]) : '<span class="empty-val">GHL default</span>']),
    webforms: [['Brand', esc(p.brand || 'LFMP')], ['CSM', esc(p.csm?.name || '')], ['Webforms ticket', p.webformsRequested === false ? 'Not needed' : 'Needed · sent later from the record'],
      ['Mastersheet', p.mastersheet ? `<a href="${esc(p.mastersheet)}" target="_blank" rel="noopener">${esc(p.mastersheet)}</a>` : '<span class="empty-val">Not added yet</span>']],
  };
}
const DTABS = [['overview', 'Overview'], ['kpi', 'KPI'], ['review', 'Review'], ['forms', 'Forms']];
function openDetails(id, tab) {
  const r = state.records.find(x => x.id === id); if (!r) return;
  // Opens on Overview: the needs-attention box (with Retry) comes first there.
  state.detTab = tab || 'overview';
  openDialog({ title: r.businessName, side: true, cancel: null, body: '<div id="detBody"></div>' });
  state.detailsId = id; state.editLink = null; delete state.wfProj[id];
  paintDetails();
  document.querySelector('#detBody .dtabs [aria-selected="true"]')?.focus();
}
function selectDetTab(tab) {
  state.detTab = tab;
  for (const b of document.querySelectorAll('#detBody .dtabs [data-dtab]')) b.setAttribute('aria-selected', String(b.dataset.dtab === tab));
  for (const p of document.querySelectorAll('#detBody .dpane')) p.hidden = p.dataset.pane !== tab;
}
// Re-paints the open record dialog (after a save, a send or a refresh).
function paintDetails() {
  const host = $('detBody'); if (!host) return;
  const r = state.records.find(x => x.id === state.detailsId); if (!r) return;
  const keepScroll = host.closest('.dlg')?.scrollTop;
  const keepInfo = host.querySelector('.recinfo')?.open;
  host.innerHTML = detailsHtml(r);
  if (keepInfo) host.querySelector('.recinfo').open = true;
  selectDetTab(state.detTab || 'overview');
  if (keepScroll) host.closest('.dlg').scrollTop = keepScroll;
  paintProjects(r);
  paintWfState(r);
  RV.warm(r.id);   // loads the review preview + latest template version once, then repaints the card
}
function detailsHtml(r) {
  const f = fieldRows({ brand: r.brand, csm: r.csm, webformsRequested: r.webformsRequested, mastersheet: r.links?.sheet, ...r.submitted });
  f.webforms = f.webforms.filter(([k]) => k === 'Brand' || k === 'CSM');
  const sp = r.snapshotProgress;
  const x = rowInfo(r), tz = recTz(r);
  const bad = n => (x.parts.find(p => p.name === n)?.state === 'failed' ? '<span class="bad" aria-label="needs attention">1</span>' : '');
  return `<div class="dhead">
      <button class="dclose" type="button" id="dlgCancel" data-act="closedet" aria-label="Close details"><span class="x" aria-hidden="true">${ICON.cross}</span><span class="bk">‹ Clients</span></button>
      <div class="row1"><div><p class="ey">Client details${isTest(r) ? ' · Test' : ''}</p><h2>${esc(r.businessName)}</h2></div></div>
      <p class="meta"><span>${esc(snapName(r.snapshot?.id, r.snapshot?.name))}</span>${tz ? `<span title="${esc(tz)}">${esc(S.tzLabel(tz))}</span>` : ''}<span title="${esc(fmtDate(r.createdAt))}">Created ${esc(shortDate(r.createdAt))}</span></p>
      ${r.status !== 'ready' ? `<div class="chips" style="display:flex;gap:6px;flex-wrap:wrap">${statusChip(r)}</div>` : ''}
      <div class="acts"><a class="btn sm" href="${esc(r.links?.ghl || W.ghlLinkFor(r.locationId))}" target="_blank" rel="noopener">Open in GHL ↗</a>${FC.isContactId(r.lfmpContactId) ? `<a class="btn sm" href="${esc(FC.crmLink(r.lfmpContactId))}" target="_blank" rel="noopener" id="crmLink">Client in LFMP CRM ↗</a>` : ''}<button class="btn sm" type="button" data-act="copyid" data-id="${esc(r.locationId)}">${ICON.copy} Copy location ID</button><button class="btn sm" type="button" data-act="refresh" data-id="${esc(r.id)}">${ICON.sync} Refresh</button></div>
      <div class="dtabs" role="tablist" aria-label="Record sections">${DTABS.map(([k, l]) => `<button type="button" role="tab" data-dtab="${k}" aria-selected="false">${l}${k === 'overview' ? '' : bad(k)}</button>`).join('')}</div>
    </div>
    <div class="dbody">
    <div class="dpane" data-pane="overview" role="tabpanel">
    ${attnBox(r, x)}
    ${linksSection(r)}
    <div class="ovsetup"><p class="lbl">Setup</p>${setupHtml(x)}</div>
    <details class="recinfo"><summary>Record details</summary><div class="rv">
    <div><h4>Sub-account</h4>${kv([['Location ID', `<span class="mono">${esc(r.locationId)}</span> <button class="linkbtn" type="button" data-act="copyid" data-id="${esc(r.locationId)}">Copy</button>`], ['Open in GHL', `<a href="${esc(r.links?.ghl)}" target="_blank" rel="noopener">${esc(r.links?.ghl)}</a>`], ['Client login', `<a href="${esc(r.links?.clientLogin)}" target="_blank" rel="noopener">${esc(r.links?.clientLogin)}</a>`], ['Snapshot', esc(snapName(r.snapshot?.id, r.snapshot?.name))], ['Snapshot load', sp ? esc(`${sp.percent}% · ${sp.completed} done, ${sp.pending} pending · GHL status "${sp.status}" · checked ${fmtDate(sp.checkedAt)}`) : ''], ['LFMP CRM contact', FC.isContactId(r.lfmpContactId) ? `<a href="${esc(FC.crmLink(r.lfmpContactId))}" target="_blank" rel="noopener">Client in LFMP CRM ↗</a> <span class="mono hint">${esc(r.lfmpContactId)}</span>` : '']])}</div>
    <div><h4>Business</h4>${kv(f.business)}</div><div><h4>Address</h4>${kv(f.address)}</div><div><h4>Primary contact</h4>${kv(f.contact)}</div>
    <div><h4>Add-ons</h4>${kv([['KPI dashboard', `${r.kpiRequested ? `Requested · ${esc(r.practiceArea)}` : 'Not requested'} · ${esc(K.kpiState(r).label)}`], ['Automation review page', r.reviewRequested ? `Requested · audience “${esc(r.audience)}” · healthcare: ${r.smsHealthcare ? 'yes' : 'no'}` : 'Not requested']])}</div>
    <div><h4>Social links</h4>${kv(f.social)}</div><div><h4>Advanced</h4>${kv(f.settings)}</div>
    <div><h4>Internal</h4>${kv([...f.webforms, ['Created by', esc(r.createdBy)], ['Created', `${esc(fmtDate(r.createdAt))} · ${esc(r.createdAtManila)}`], ['Package / notes', esc(r.notes).replace(/\n/g, '<br>')], ['Request ID', `<span class="mono">${esc(r.requestId)}</span>`]])}</div></div></details></div>
    <div class="dpane" data-pane="kpi" role="tabpanel">${K.kpiCardHtml(r)}</div>
    <div class="dpane" data-pane="review" role="tabpanel">${RV.reviewCardHtml(r)}</div>
    <div class="dpane" data-pane="forms" role="tabpanel">${webformsCard(r)}</div></div>`;
}
// Overview: the needs-attention box, first. KPI gets Retry right here; Review and Forms open their tab (their retry needs the card's checks).
function attnBox(r, x) {
  const p = x.problem; if (!p) return '';
  const tabBtn = (t, l, gold) => `<button class="btn${gold ? ' p' : ''}" type="button" data-goto="${t}">${l} →</button>`;
  const box = (title, tag, body, btns) => `<section class="panel attnbox" id="attnBox" role="alert"><div class="ah"><b>${esc(title)}</b><span class="ftag">${esc(tag)}</span></div>${body}<div class="btnrow">${btns}</div></section>`;
  if (p.part === 'kpi') {
    const pr = K.kpiProgress(r);
    const bar = pr ? `<div class="pbar" aria-hidden="true"><span style="width:${Math.round((pr.done / pr.total) * 100)}%"></span></div>` : '';
    return box('KPI dashboard', r.kpi?.error?.step === 'sync' ? 'Sync failed' : 'Setup failed', `${bar}<p class="sub">${pr ? `${pr.done} of ${pr.total} steps · ` : ''}Nothing is lost. Retry finishes what's missing.</p>`,
      `<button class="btn p" type="button" data-act="kpistart" data-id="${esc(r.id)}" data-goto="kpi">${ICON.sync} Retry</button>${tabBtn('kpi', 'Open KPI tab')}`);
  }
  if (p.part === 'review') return box('Review package', 'Publish failed', `<p class="sub">${esc(r.review?.error?.message || 'The publish stopped.')} Nothing is lost: Retry publish on the Review tab finishes it.</p>`, tabBtn('review', 'Open Review tab', true));
  if (p.part === 'forms') return box('Webforms ticket', 'Not sent', `<p class="sub">${esc(x.forms.reason || 'The ticket was not sent.')}</p>`, tabBtn('forms', 'Open Forms tab', true));
  return box('Sub-account', 'Failed', `<p class="sub">${esc((S.RECORD_STATUS[r.status] || {}).label || 'The sub-account setup failed.')} Refresh checks GHL again.</p>`, `<button class="btn p" type="button" data-act="refresh" data-id="${esc(r.id)}">${ICON.sync} Refresh</button>`);
}

// ---------------------------------------------------------------- record: Links
const whoName = () => (store.get(WHO_KEY) || '').trim();
// Overview links: label on the left; Open ↗ · Copy · Edit, or Not set · Add (editing opens the same inline editor as before).
const LINK_ORDER = ['ghl', 'kpi', 'review', 'reviewMessages', 'zap', 'webhook', 'ticket', 'sheet'];
const LINK_NAME = { review: 'Review · Plan (A)', reviewMessages: 'Review · Messages (B)', zap: 'Zap' };
function linksSection(r) {
  const l = W.recordLinks(r), edits = r.linkEdits || {};
  const keys = [...LINK_ORDER.filter(k => W.LINK[k]), ...W.LINKS.map(k => k.key).filter(k => !LINK_ORDER.includes(k))];
  const rows = keys.map(key => {
    const k = W.LINK[key], v = l[key], ed = edits[key], editing = state.editLink === key, name = LINK_NAME[key] || k.label;
    const by = ed && !ed.auto ? `<span class="hint lkby">Edited by ${esc(ed.by)} · ${esc(fmtDate(ed.at))}</span>` : '';
    const sep = '<span class="sep" aria-hidden="true">·</span>';
    const acts = v
      ? `<a class="lkurl" href="${esc(v)}" target="_blank" rel="noopener" title="${esc(v)}" aria-label="Open ${esc(k.label)}">Open ↗</a>${sep}<button class="linkbtn" type="button" data-act="copytext" data-text="${esc(v)}" data-what="${esc(k.label)} link" aria-label="Copy ${esc(k.label)} link">Copy</button>${k.readOnly ? '' : `${sep}<button class="linkbtn" type="button" data-act="editlink" data-k="${key}" aria-label="Edit ${esc(k.label)} link" title="Paste or fix the link">Edit</button>`}`
      : `<span class="empty-val" title="${esc(k.missing)}">Not set</span>${k.readOnly ? '' : `${sep}<button class="linkbtn" type="button" data-act="editlink" data-k="${key}" aria-label="Add ${esc(k.label)} link">Add</button>`}`;
    const editor = editing ? `<div class="lkedit">
        <input type="url" id="lk-in" value="${esc(v)}" placeholder="https://…" aria-label="${esc(k.label)} link" spellcheck="false">
        ${whoName() ? '' : '<input type="text" id="lk-who" placeholder="Your name" aria-label="Your name">'}
        <div class="btnrow"><button class="btn primary sm" type="button" data-act="savelink" data-k="${key}">Save</button><button class="btn sm" type="button" data-act="canceledit">Cancel</button>${key === 'ghl' ? '<span class="hint">Leave empty to use the automatic link.</span>' : ''}</div>
        <span class="ferr" id="lk-err" role="alert"></span></div>` : '';
    return `<li data-lk="${key}"><span class="lkname">${esc(name)}${by}</span><span class="lkacts2">${acts}</span>${editor}</li>`;
  }).join('');
  return `<section class="ovlinks" id="linksSec"><p class="lbl">Links</p><ul class="linklist2">${rows}</ul></section>`;
}
async function saveLink(key, btn) {
  const r = state.records.find(x => x.id === state.detailsId); if (!r) return;
  const v = $('lk-in').value.trim(), err = $('lk-err');
  const who = whoName() || ($('lk-who')?.value || '').trim();
  const m = W.checkLink(key, v);
  if (m) { err.textContent = m; $('lk-in').focus(); return; }
  if (!who) { err.textContent = 'Enter your name, so the record shows who changed the link.'; $('lk-who')?.focus(); return; }
  if (!whoName()) store.set(WHO_KEY, who);
  btn.disabled = true; btn.textContent = 'Saving…';
  try {
    const label = W.LINK[key].label;
    await saveRecord(r.id, rec => {
      rec.links = { ...(rec.links || {}) };
      rec.links[key] = key === 'ghl' && !v ? W.ghlLinkFor(rec.locationId) : v;
      rec.linkEdits = { ...(rec.linkEdits || {}), [key]: { by: who, at: new Date().toISOString() } };
    }, `${r.businessName}: ${label} link ${v ? 'set' : 'cleared'} by ${who}`);
    state.editLink = null;
    toast(`${label} link saved`);
    paintList(); paintDetails();
  } catch (e) { err.textContent = `Couldn't save: ${e.message}`; btn.disabled = false; btn.textContent = 'Save'; }
}

// ---------------------------------------------------------------- record: Webforms card
const wfRec = id => state.records.find(x => x.id === id);
// The card's current (possibly unsaved) values applied to a copy of the record.
function wfDraft(r) {
  const v = id => ($(id)?.value ?? '').trim();
  if (!$('wf-webhook')) return r;
  const csmId = Number(v('wf-csm')) || null;
  const csm = csmId ? (state.desk.csm.find(c => c.id === csmId) || (r.csm?.id === csmId ? r.csm : null)) : null;
  const proj = state.wfProj[r.id] !== undefined ? state.wfProj[r.id] : (r.webforms?.project || null);
  return { ...r, brand: v('wf-brand') || r.brand || 'LFMP', csm,
    links: { ...(r.links || {}), webhook: v('wf-webhook'), zap: v('wf-zap'), sheet: v('wf-sheet') },
    webforms: { ...(r.webforms || {}), domain: v('wf-domain').toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, ''), project: proj } };
}
const wfDirty = r => { const d = wfDraft(r); return ['webhook', 'zap', 'sheet'].some(k => (d.links[k] || '') !== (r.links?.[k] || '')) || d.brand !== (r.brand || 'LFMP') || (d.csm?.id || null) !== (r.csm?.id || null) || d.webforms.domain !== (r.webforms?.domain || W.domainOf(r.submitted?.website)) || JSON.stringify(d.webforms.project || null) !== JSON.stringify(r.webforms?.project || null); };

function webformsCard(r) {
  const st = W.webformsStatus(r);
  const head = `<div class="wfhead"><h4>Webforms</h4><span class="chip ${st.tone}" id="wfStatus">${st.key === 'sending' ? '<span class="spin" aria-hidden="true"></span>' : ''}${esc(st.label)}</span></div>`;
  if (st.key === 'off') return `<section class="panel wfcard" id="wfCard">${head}<p class="sub">The webforms ticket isn't requested for this client.</p><div class="btnrow"><button class="btn" type="button" data-act="wfon">Request webforms ticket</button></div></section>`;
  if (st.key === 'sent') {
    const t = r.webforms?.ticket || {};
    return `<section class="panel wfcard" id="wfCard">${head}
      <div class="okmsg" id="wfSent"><b>Ticket #${esc(st.ticket.id)} is in Desk.</b>${t.sentAt ? ` Sent ${esc(fmtDate(t.sentAt))}${t.by ? ` by ${esc(t.by)}` : ''}.` : ' Linked by hand.'}</div>
      ${t.project && !t.projectLinked ? '<div class="warnbox">Desk didn\'t confirm the project link. Link the project by hand in Desk.</div>' : ''}
      <div class="btnrow"><a class="btn primary" href="${esc(st.ticket.url)}" target="_blank" rel="noopener" id="wfOpenDesk">${ICON.ext} Open in Desk</a><button class="btn" type="button" data-act="copytext" data-text="${esc(st.ticket.url)}" data-what="Ticket link">${ICON.copy} Copy link</button></div>
      ${t.subject ? kv([['Subject', esc(t.subject)], ['Project', t.project ? esc(`${t.project.name} (#${t.project.id})`) : 'No project'], ['Domain tag', `${esc(r.webforms?.domain || '')}${t.domainTagCreated ? ' · created' : ' · already existed'}`]]) : ''}
    </section>`;
  }
  const name = r.businessName, l = W.recordLinks(r), wf = r.webforms || {};
  const domain = wf.domain || W.domainOf(r.submitted?.website);
  const folder = state.settings.zapierFolderUrl;
  const copyBtn = (text, what) => `<button class="btn sm" type="button" data-act="copytext" data-text="${esc(text)}" data-what="${esc(what)}">${ICON.copy} Copy</button>`;
  const csmOpts = state.desk.csm.slice(); if (r.csm?.id && !csmOpts.some(c => c.id === r.csm.id)) csmOpts.unshift(r.csm);
  const failed = st.key === 'failed';
  const la = wf.lastAttempt;
  return `<section class="panel wfcard" id="wfCard">${head}
    ${failed ? `<div class="errbox" id="wfFail" role="alert"><b>Not sent.</b> ${esc(st.reason)}${st.existingId ? ` <a href="${esc(W.deskTicketUrl(st.existingId))}" target="_blank" rel="noopener">Open #${esc(st.existingId)} in Desk</a>` : ''}</div>
      ${st.existingId ? `<div class="btnrow"><button class="btn" type="button" data-act="wfuseexisting" data-tid="${esc(st.existingId)}">Use #${esc(st.existingId)} as this client's ticket</button></div>` : ''}
      ${la?.technical ? `<details class="tech"><summary>Technical details</summary><pre>${esc(la.technical)}</pre></details>` : ''}` : ''}
    <div class="wfsteps"><p class="sub"><b>1. Set up the Zap in Zapier</b></p>
      <ol>
        <li>${folder ? `<a class="btn sm" href="${esc(folder)}" target="_blank" rel="noopener" id="wfFolder">${ICON.ext} Open GHL_Clients in Zapier</a>` : '<span class="hint">Open My folders → GHL_Clients in Zapier. <i>(The folder link isn\'t set yet: data/settings.json → zapierFolderUrl.)</i></span>'}</li>
        <li>New sub-folder named <b class="mono">${esc(name)}</b> ${copyBtn(name, 'Folder name')}</li>
        <li>Inside it, a new Zap named <b class="mono">${esc(name)}</b> ${copyBtn(name, 'Zap name')}</li>
        <li>Trigger: <b>Webhooks by Zapier → Catch Hook</b>. Copy the webhook URL.</li>
        <li>Paste the webhook URL and the Zap's link below.</li>
      </ol>
      <p class="hint">Or ask Claude: <span class="mono">set up Zapier for ${esc(name)}</span> ${copyBtn(`set up Zapier for ${name}`, 'Request')}</p></div>
    <p class="sub"><b>2. Ticket details</b></p>
    <div class="grid2 wfgrid" id="wfFields">
      <div class="full">${wfField('webhook', 'Webhook URL', `<input type="url" id="wf-webhook" value="${esc(l.webhook)}" placeholder="https://hooks.zapier.com/hooks/catch/…" spellcheck="false">`)}</div>
      <div class="full">${wfField('zap', 'Zap link', `<input type="url" id="wf-zap" value="${esc(l.zap)}" placeholder="https://zapier.com/editor/…" spellcheck="false">`)}</div>
      <div class="full">${wfField('sheet', 'Mastersheet link', `<input type="url" id="wf-sheet" value="${esc(l.sheet)}" placeholder="https://docs.google.com/spreadsheets/…" spellcheck="false">`)}</div>
      ${wfField('domain', 'Website domain', `<input type="text" id="wf-domain" value="${esc(domain)}" placeholder="emerylawoffice.com" spellcheck="false">`, 'Used in the subject and as a Desk tag.')}
      ${wfField('csm', 'CSM', `<select id="wf-csm">${sel(csmOpts.map(c => [String(c.id), c.name]), String(r.csm?.id || ''), csmOpts.length ? 'Choose…' : 'No CSMs loaded: press Refresh Desk data')}</select>`, 'Adds the "CSM-…" tag; Desk adds the CSM as follower.')}
      ${wfField('brand', 'Brand', `<select id="wf-brand">${sel(W.BRANDS.map(b => [b, b]), r.brand || 'LFMP')}</select>`, 'Adds the LFMP or WPP tag.')}
      <div class="full">${wfField('proj', 'Teamwork project', `<input type="search" id="wf-projq" value="${esc(name)}" placeholder="Search projects by client name" aria-describedby="wfProjHint">`, '<span id="wfProjHint">Pick the client\'s "… - CMP" project. Several projects can share a name: check the id.</span>')}
        <div class="projlist" id="wfProjList" role="radiogroup" aria-label="Teamwork project"></div></div>
    </div>
    <div class="btnrow wfbar"><button class="btn sm linkbtn2" type="button" data-act="refreshdesk">${ICON.sync} Refresh Desk data</button><span class="hint" id="deskInfo">${state.desk.refreshedAt ? `Desk data from ${esc(fmtDate(state.desk.refreshedAt))}` : 'Desk data not refreshed yet'}</span></div>
    <div id="wfProblems"></div>
    <div class="btnrow"><button class="btn" type="button" data-act="wfsave" id="wfSave">Save details</button><button class="btn" type="button" data-act="wfpreview" id="wfPreviewBtn">Preview ticket</button><button class="btn primary" type="button" data-act="wfsend" id="wfSend">Send webforms ticket</button></div>
    <p class="ferr" id="wfErr" role="alert"></p>
    <div id="wfPreview" hidden></div>
  </section>`;
}
const wfField = (id, label, input, hint) => `<label class="f" for="wf-${id === 'proj' ? 'projq' : id}" id="wfw-${id}"><span>${esc(label)}</span>${hint ? `<span class="hint">${hint}</span>` : ''}${input}<span class="ferr" id="wfe-${id}"></span></label>`;

function paintProjects(r) {
  const box = $('wfProjList'); if (!box) return;
  const q = $('wf-projq').value;
  const chosen = state.wfProj[r.id] !== undefined ? state.wfProj[r.id] : (r.webforms?.project || null);
  let list = W.matchProjects(q, state.desk.projects);
  if (chosen?.id && !list.some(p => p.id === chosen.id)) list = [chosen, ...list];
  const dup = W.sharedNames(list);
  const opt = (val, label, extra, checked) => `<label class="check projopt"><input type="radio" name="wfproj" value="${esc(val)}"${checked ? ' checked' : ''}> <span>${label}${extra}</span></label>`;
  box.innerHTML = (list.length ? list.map(p => opt(p.id, esc(p.name), ` <span class="mono hint">#${esc(p.id)}</span>${dup.has(p.name) ? ' <span class="chip warn">same name as another project</span>' : ''}`, chosen?.id === p.id)).join('')
    : `<p class="hint" style="margin:0">${state.desk.projects.length ? 'No project matches. Try another word, or choose "No project".' : 'No projects loaded yet: press Refresh Desk data.'}</p>`)
    + opt('none', 'No project', ' <span class="hint">· the ticket won\'t be linked to a project</span>', !!chosen?.none)
    + (dup.size ? `<p class="warnbox" style="margin:6px 0 0">${dup.size === 1 ? 'Two projects' : 'Some projects'} have the same name. Pick the right one by its id.</p>` : '');
}
// Field errors, what's still missing, Save enabled only when something changed.
function paintWfState(r) {
  if (!$('wf-webhook')) return;
  const d = wfDraft(r);
  for (const k of ['webhook', 'zap', 'sheet']) $(`wfe-${k}`).textContent = W.checkLink(k, d.links[k]);
  $('wfe-domain').textContent = d.webforms.domain && !W.isDomain(d.webforms.domain) ? `"${d.webforms.domain}" doesn't look like a website domain.` : '';
  for (const k of ['webhook', 'zap', 'sheet', 'domain']) $(`wfw-${k}`).classList.toggle('invalid', !!$(`wfe-${k}`).textContent);
  const plan = W.ticketPlan(d, state.deskSettings);
  const sending = W.webformsStatus(r).key === 'sending' || state.sending[r.id];
  const warn = plan.warnings.length ? `<div class="warnbox">${plan.warnings.map(esc).join('<br>')}</div>` : '';
  $('wfProblems').innerHTML = plan.ok ? (warn || '<div class="okmsg">Everything the ticket needs is here.</div>')
    : `<div class="note" id="wfMissing"><b>Before sending:</b><ul>${plan.problems.map(p => `<li>${esc(p)}</li>`).join('')}</ul></div>${warn}`;
  $('wfSave').disabled = !wfDirty(r) || sending;
  $('wfSend').disabled = !plan.ok || sending;
  if (sending) $('wfSend').textContent = 'Sending…';
}

async function wfSave(r, extra) {
  const d = wfDraft(r);
  const bad = ['webhook', 'zap', 'sheet'].map(k => W.checkLink(k, d.links[k])).find(Boolean) || (d.webforms.domain && !W.isDomain(d.webforms.domain) ? 'Fix the website domain.' : '');
  if (bad) throw new Error(bad);
  const who = whoName() || 'unknown';
  const at = new Date().toISOString();
  return saveRecord(r.id, rec => {
    rec.brand = d.brand; rec.csm = d.csm ? { id: d.csm.id, tag: d.csm.tag || `CSM-${d.csm.name}`, name: d.csm.name } : null;
    rec.links = { ...(rec.links || {}) }; rec.linkEdits = { ...(rec.linkEdits || {}) };
    for (const k of ['webhook', 'zap', 'sheet']) if ((rec.links[k] || '') !== d.links[k]) { rec.links[k] = d.links[k]; rec.linkEdits[k] = { by: who, at }; }
    rec.webforms = { ...(rec.webforms || {}), domain: d.webforms.domain, project: d.webforms.project || null };
    extra?.(rec);
  }, extra ? `${r.businessName}: send webforms ticket (by ${who})` : `${r.businessName}: webforms details saved by ${who}`);
}

function wfPreview(r) {
  const plan = W.ticketPlan(wfDraft(r), state.deskSettings);
  const box = $('wfPreview'); box.hidden = false;
  const tagChips = plan.tags.map(t => `<span class="chip ${t.id || t.domainTag ? 'info' : 'bad'}">${esc(t.name || '(missing)')}</span>`).join(' ')
    + '<span class="hint" style="display:block">The domain tag is reused if Desk has it, else created when sending.</span>';
  box.innerHTML = `<div class="preview" id="wfPreviewBox"><h4>Ticket preview</h4>
    ${plan.ok ? '' : '<div class="warnbox">Not ready to send yet: see "Before sending" above. This is how it will look.</div>'}
    ${kv([['Subject', `<b>${esc(plan.subject)}</b>`], ['Inbox', esc(plan.inbox.name)], ['Customer', esc(plan.customer.name || `#${plan.customer.id}`)], ['Assigned to', esc(plan.agent.name)],
      ['Type', esc(plan.type.name)], ['Priority', esc(plan.priority.name)], ['Source', esc(plan.source?.name || 'Desk default')], ['Tags', tagChips],
      ['Project', plan.project ? `${esc(plan.project.name)} <span class="mono hint">#${esc(plan.project.id)}</span>` : '<span class="chip warn">No project</span>'], ['Notify customer', 'No']])}
    <p class="hint" style="margin:10px 0 4px">Body</p><div class="tbody" id="wfBody">${plan.bodyHtml}</div>
    <p class="hint" style="margin:6px 0 0">Desk adds your signature and its own followers (WEBTEAM and "CSM - ${esc(plan.csm?.name || '…')}" triggers).</p></div>`;
  box.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

async function wfSend(r, btn) {
  if (state.sending[r.id]) return;                      // second click while the first is going: ignored
  const plan = W.ticketPlan(wfDraft(r), state.deskSettings);
  if (!plan.ok) { paintWfState(r); return; }
  state.sending[r.id] = true; btn.disabled = true; btn.textContent = 'Sending…'; $('wfErr').textContent = '';
  const rid = S.newRequestId(), by = whoName() || r.createdBy || 'unknown';
  try {
    const rec = await wfSave(r, x => { x.webforms.send = { requestId: rid, at: new Date().toISOString(), by }; });
    paintList(); if (state.detailsId === r.id) paintDetails();
    let t0;
    try { t0 = await dispatch('desk-ticket.yml', { payload: JSON.stringify({ recordId: rec.id, by }), request_id: rid }); }
    catch (e) {
      await saveRecord(rec.id, x => { x.webforms = { ...(x.webforms || {}), lastAttempt: { requestId: rid, ok: false, status: 'not_started', message: `Couldn't send it to GitHub: ${e.message}`, at: new Date().toISOString(), by } }; }, `${rec.businessName}: webforms ticket not started`);
      throw new Error('');
    }
    let run = null;
    try { run = await waitRun('desk-ticket.yml', `ticket ${rid}`, t0, { limitMs: 6 * 60e3 }); } catch (e) { toast(e.message, 5000); }
    const fresh = await getJSON(`records/${rec.id}.json`);
    if (fresh) { const k = state.records.findIndex(x => x.id === rec.id); if (k >= 0) state.records[k] = fresh; }
    const st = W.webformsStatus(fresh || rec);
    if (st.key === 'sent') toast(`Ticket #${st.ticket.id} sent`);
    else if (run && run.conclusion !== 'success' && fresh?.webforms?.lastAttempt?.requestId !== rid) {
      await saveRecord(rec.id, x => { x.webforms = { ...(x.webforms || {}), lastAttempt: { requestId: rid, ok: false, status: 'run_failed', message: `The GitHub run stopped (${run.conclusion}) before it finished. Nothing was saved; check Desk before trying again.`, at: new Date().toISOString(), by } }; }, `${rec.businessName}: webforms ticket run ${run.conclusion}`);
    }
  } catch (e) { if (e.message && $('wfErr')) $('wfErr').textContent = e.message; }
  finally { delete state.sending[r.id]; paintList(); if (state.detailsId === r.id) paintDetails(); }
}

async function refreshDesk(btn) {
  btn.disabled = true; const label = btn.innerHTML; btn.textContent = 'Refreshing Desk data… (about a minute)';
  const info = $('deskInfo') || $('csmInfo');
  try {
    const rid = S.newRequestId();
    const t0 = await dispatch('desk-lookup.yml', { request_id: rid });
    const run = await waitRun('desk-lookup.yml', `desk ${rid}`, t0);
    if (run.conclusion !== 'success') throw new Error(`The refresh ended "${run.conclusion}". Open the GitHub run for details.`);
    await loadDesk();
    paintCsmSelect(); if (state.detailsId) paintDetails();
    toast(`${state.desk.csm.length} CSMs and ${state.desk.projects.length} projects loaded`);
  } catch (e) { if (info) info.textContent = e.message; }
  finally { if (btn.isConnected) { btn.disabled = false; btn.innerHTML = label; } }
}
// The developer text per version from CHANGELOG.md ("## [1.1.0] - 2026-11-15"), shown under "Technical details".
export function changelogByVersion(md) {
  const out = {}; let cur = null;
  for (const line of String(md || '').split('\n')) {
    const h = /^##\s+\[?(\d+\.\d+\.\d+)\]?/.exec(line);
    if (h) { cur = out[h[1]] = []; continue; }
    if (cur && /^-\s+/.test(line)) cur.push(line.replace(/^-\s+/, ''));
    else if (cur && line.trim() && cur.length && !/^#/.test(line)) cur[cur.length - 1] += ` ${line.trim()}`;
  }
  return out;
}
const inlineMd = t => esc(t).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
async function openNews() {
  closeMenus();
  const [news, md] = await Promise.all([loadNews(), fetch(`./CHANGELOG.md?t=${Date.now()}`, { cache: 'no-store' }).then(r => (r.ok ? r.text() : '')).catch(() => '')]);
  const tech = changelogByVersion(md);
  const cards = (news.versions || []).map((v, i) => `<details class="vcard"${i === 0 ? ' open' : ''}><summary><span class="vt"><b>v${esc(v.version)}</b>${i === 0 ? '<span class="pill">Latest</span>' : ''}<span class="vdate">${esc(v.date)}</span></span><svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="m6 9 6 6 6-6"/></svg><p class="vsum">${esc(v.title)}</p></summary>
      <div class="vbody"><ul class="plain">${v.items.map(it => `<li><span><span class="tag tg-${esc(it.type)}">${TYPE_LABEL[it.type] || 'Improved'}</span></span><span>${esc(it.text)}</span></li>`).join('')}</ul>
      ${tech[v.version]?.length ? `<details class="vtech"><summary class="linkbtn">Technical details</summary><ul>${tech[v.version].map(t => `<li>${inlineMd(t)}</li>`).join('')}</ul></details>` : ''}</div></details>`).join('');
  openDialog({ title: `What's new · v${S.VERSION}`, body: `<div class="news">${cards || '<p class="sub">No release notes found.</p>'}</div>`, wide: true, cancel: 'Close' });
  markNewsSeen();
}

// ---------------------------------------------------------------- New sub-account tab
const F = { // id suffix -> payload key
  snapshot: 'snapshotId', name: 'businessName', phone: 'phone', website: 'website', street: 'address', city: 'city', state: 'state', stateText: 'state', zip: 'postalCode', country: 'country', tz: 'timezone',
  first: 'firstName', last: 'lastName', email: 'email', area: 'practiceArea', areaOther: 'practiceArea', audience: 'audience', who: 'createdBy', notes: 'notes',
  brand: 'brand', csm: 'csm', sheet: 'mastersheet',
};
const sel = (opts, value, placeholder) => `${placeholder !== undefined ? `<option value="">${esc(placeholder)}</option>` : ''}${opts.map(([v, l]) => `<option value="${esc(v)}"${v === value ? ' selected' : ''}>${esc(l)}</option>`).join('')}`;
const field = (id, label, input, { req, hint, cls = '' } = {}) => `<label class="f ${cls}" for="f-${id}" id="w-${id}"><span class="${req ? 'req' : ''}">${esc(label)}</span>${hint ? `<span class="hint">${hint}</span>` : ''}${input}<span class="ferr" id="e-${id}"></span></label>`;

function renderNew() {
  FCU.reset(); state.fcFilled = {};
  $('panel-new').innerHTML = `<div class="formwrap"><div id="formView"></div><div id="runView" hidden></div></div>`;
  $('formView').innerHTML = `
  <div class="head"><p class="ey">LFMP · Sub-account builder</p><h1 class="disp" id="newTitle">New <span class="g">sub-account.</span></h1><p class="sub">Creates the GHL sub-account from a snapshot. Nothing is created until you check the details and say yes.</p></div>
  ${FCU.startHtml()}
  <form class="form" id="nf" novalidate autocomplete="off">
    <fieldset class="grp"><legend>Snapshot</legend>
      <div class="grid2">
        <div>${field('snapshot', 'Snapshot', `<select id="f-snapshot"></select>`, { req: true, hint: 'The template the new sub-account is built from.' })}
        <div class="snaprow"><span class="hint" id="snapInfo"></span><button class="linkbtn" type="button" data-act="refreshsnaps" id="refreshSnaps">Refresh snapshots</button></div></div>
      </div>
    </fieldset>
    <fieldset class="grp"><legend>Business</legend>
      <div class="grid2">
        <div class="full">${field('name', 'Business name', `<input type="text" id="f-name" maxlength="100">`, { req: true, hint: 'Becomes the sub-account name, exactly as typed.' })}<div class="dupbox" id="dupBox" hidden></div></div>
        ${field('phone', 'Business phone', `<input type="tel" id="f-phone" inputmode="tel" placeholder="+1 (561) 555-0123">`, { hint: 'With country code.' })}
        ${field('website', 'Website', `<input type="url" id="f-website" inputmode="url" placeholder="lawfirm.com">`, { hint: 'The main site, e.g. lawfirm.com.' })}
      </div>
    </fieldset>
    <fieldset class="grp"><legend>Address</legend>
      <div class="grid2">
        <div class="full">${field('street', 'Street', `<input type="text" id="f-street" autocomplete="off">`)}</div>
        ${field('city', 'City', `<input type="text" id="f-city">`)}
        <div>${field('state', 'State', `<select id="f-state">${sel(S.US_STATES.map(([c, n]) => [c, `${n} (${c})`]), '', 'Choose…')}</select>`)}${field('stateText', 'State / region', `<input type="text" id="f-stateText">`, { cls: 'hidden-init' })}</div>
        ${field('zip', 'ZIP', `<input type="text" id="f-zip" inputmode="numeric" maxlength="10">`)}
        ${field('country', 'Country', `<select id="f-country">${sel(S.COUNTRIES, 'US')}</select>`, { req: true })}
        <div class="full">${field('tz', 'Time zone', `<select id="f-tz" aria-required="true"><option value="">Choose a time zone…</option><optgroup label="United States">${sel(S.COMMON_TIMEZONES, '')}</optgroup><optgroup label="All other time zones">${sel(S.OTHER_TIMEZONES, '')}</optgroup></select>`, { req: true, hint: '<span id="tzHint">Suggested from the state once you choose one. You can always change it.</span>' })}</div>
      </div>
    </fieldset>
    <fieldset class="grp"><legend>Primary contact</legend>
      <div class="grid3">
        ${field('first', 'First name', `<input type="text" id="f-first">`, { req: true })}
        ${field('last', 'Last name', `<input type="text" id="f-last">`, { req: true })}
        ${field('email', 'Email', `<input type="email" id="f-email" inputmode="email" spellcheck="false">`, { req: true })}
      </div>
    </fieldset>
    <fieldset class="grp"><legend>Add-ons</legend>
      <div style="display:flex;flex-direction:column;gap:12px">
        <div class="optbox"><label class="check big"><input type="checkbox" id="f-kpi"> Set up KPI dashboard</label>
          <div class="sub2" id="kpiOpts" hidden>
            ${field('area', 'Practice area', `<select id="f-area">${sel(S.PRACTICE.map(p => [p, p]), '', 'Choose…')}</select>`, { req: true })}
            ${field('areaOther', 'Practice area (other)', `<input type="text" id="f-areaOther" placeholder="e.g. Medical Malpractice">`, { req: true, cls: 'hidden-init' })}
            <p class="hint full" style="margin:0">Phase 1 only saves this on the record. Phase 2 sets the dashboard up.</p>
          </div></div>
        <div class="optbox"><label class="check big"><input type="checkbox" id="f-review"> Set up automation review page</label>
          <div class="sub2" id="reviewOpts" hidden>
            ${field('audience', 'Audience word', `<input type="text" id="f-audience" value="Lead">`, { req: true, hint: 'What the client calls a new enquiry, e.g. Lead, Patient, Client.' })}
            <div class="f static"><span>Healthcare client?</span><span class="hint">Changes the SMS wording rules.</span><span class="radios"><label class="check"><input type="radio" name="hc" value="no" id="f-hcNo" checked> No</label><label class="check"><input type="radio" name="hc" value="yes" id="f-hcYes"> Yes</label></span></div>
            <p class="hint full" style="margin:0">Phase 1 only saves this on the record. A later phase builds the page automatically.</p>
          </div></div>
        <div class="optbox"><label class="check big"><input type="checkbox" id="f-webforms" checked> Webforms ticket needed</label>
          <div class="sub2" id="webformsOpts">
            <div class="full">${field('sheet', 'Mastersheet link', `<input type="url" id="f-sheet" inputmode="url" placeholder="https://docs.google.com/spreadsheets/…" spellcheck="false">`, { hint: 'Optional now. You can add it later on the record.' })}</div>
            <p class="hint full" style="margin:0">After the sub-account is created: set up the Zap, then send the ticket from the record (View details → Webforms).</p>
          </div></div>
      </div>
    </fieldset>
    <details class="more" id="socialBox"><summary><span class="sumtext">Social links <span class="hint" id="socialCount"></span></span></summary><div class="inner"><div class="grid2">
      ${S.SOCIAL.map(([k, l, kind]) => field(`s-${k}`, l, `<input type="${kind === 'url' ? 'url' : 'text'}" id="f-s-${k}" ${kind === 'url' ? 'inputmode="url" placeholder="https://…"' : ''}>`)).join('')}
    </div></div></details>
    <details class="more" id="advBox"><summary><span class="sumtext">Advanced <span class="hint">Leave as GHL default unless you need to change it</span></span></summary><div class="inner"><div class="grid2">
      ${S.SETTINGS.map(([k, l]) => field(`a-${k}`, l, `<select id="f-a-${k}">${sel([['', 'GHL default'], ['true', 'Yes'], ['false', 'No']], '')}</select>`)).join('')}
    </div></div></details>
    <fieldset class="grp"><legend>Internal</legend>
      <div class="grid2">
        ${field('who', 'Created by', `<input type="text" id="f-who" placeholder="Your name">`, { req: true, hint: 'Remembered in this browser.' })}
        ${field('brand', 'Brand', `<select id="f-brand">${sel(W.BRANDS.map(b => [b, b]), 'LFMP')}</select>`, { req: true, hint: 'Used for the Desk ticket tag.' })}
        <div>${field('csm', 'CSM', `<select id="f-csm"></select>`, { hint: 'From the Desk tags that start with "CSM-".' })}
        <div class="snaprow"><span class="hint" id="csmInfo"></span><button class="linkbtn" type="button" data-act="refreshdesk" id="refreshDeskForm">Refresh Desk data</button></div></div>
        <div class="full">${field('notes', 'Package / notes', `<textarea id="f-notes" maxlength="2000" placeholder="Package sold, anything the team should know"></textarea>`)}</div>
      </div>
    </fieldset>
    <div class="formfoot"><span class="hint" id="formSummary"></span><button class="btn primary big" type="submit" id="toReview">Create sub-account</button></div>
  </form>`;
  for (const el of document.querySelectorAll('.hidden-init')) el.hidden = true;
  $('f-who').value = store.get(WHO_KEY) || '';
  const nf = $('nf');
  nf.addEventListener('input', onFormInput);
  nf.addEventListener('change', onFormInput);
  nf.addEventListener('focusout', e => { const id = e.target.id?.replace(/^f-/, ''); if (id) { touched.add(id); paintErrors(); } });
  nf.addEventListener('submit', e => { e.preventDefault(); goReview(); });
  state.allowDuplicate = false; state.tzManual = false; state.showAll = false;
  paintSnapshotSelect(); paintCsmSelect();
  FCU.paint(); paintFormVis();
}

// ---------------------------------------------------------------- Find client in GHL: fill + marks (v1.4.0)
// GHL value -> form field id. The time zone is suggested from the state (not marked as From GHL).
const GHL_FIELD = { country: 'country', businessName: 'name', phone: 'phone', website: 'website', address: 'street', city: 'city', postalCode: 'zip', firstName: 'first', lastName: 'last', email: 'email', brand: 'brand' };
const FIELD_DEFAULT = { country: 'US', brand: 'LFMP' };
const TYPED_IDS = ['name', 'phone', 'website', 'street', 'city', 'zip', 'first', 'last', 'email', 'stateText', 'notes'];
const hasTyped = () => TYPED_IDS.some(id => ($(`f-${id}`)?.value || '').trim()) || !!$('f-state')?.value;
// Find mode shows the form once a client is picked (or something is already typed); manual mode always shows it.
function paintFormVis() { const nf = $('nf'); if (nf) nf.hidden = FCU.mode() === 'ghl' && !FCU.picked() && !hasTyped(); }
const isFromGhl = id => state.fcFilled?.[id] !== undefined && ($(`f-${id}`)?.value ?? '') === state.fcFilled[id];
function resetGhlFields() {
  for (const id of Object.keys(state.fcFilled || {})) if (isFromGhl(id)) $(`f-${id}`).value = FIELD_DEFAULT[id] || '';
  state.fcFilled = {};
}
function applyGhl(values) {
  resetGhlFields();   // a different client: drop what the last pick filled (only fields nobody changed since)
  const filled = {};
  const put = (id, v) => { const el = $(`f-${id}`); if (!el || !v) return; el.value = v; if (el.value === v) filled[id] = v; };
  put('country', values.country);
  onFormInput({ target: {} });   // State select or State / region box follows the country
  for (const [k, id] of Object.entries(GHL_FIELD)) if (k !== 'country') put(id, values[k]);
  if (values.state) put(($('f-country').value || 'US') === 'US' ? 'state' : 'stateText', values.state);
  if (values.timezone && !state.tzManual) $('f-tz').value = values.timezone;
  state.fcFilled = filled; state.allowDuplicate = false;
  touched.clear(); state.showAll = false;
  onFormInput({ target: {} });
  window.scrollTo(0, 0);
  return Object.keys(filled).length;
}
function clearGhl() { resetGhlFields(); onFormInput({ target: {} }); }
function paintGhlMarks() {
  const picked = !!FCU.picked();
  const need = new Set(['snapshot', 'name', 'tz', 'first', 'last', 'email', 'who']);
  if ($('f-kpi')?.checked) need.add($('f-area').value === 'Other' ? 'areaOther' : 'area');
  if ($('f-review')?.checked) need.add('audience');
  for (const lab of document.querySelectorAll('#nf label.f')) {
    const id = lab.id.slice(2);
    lab.classList.toggle('fromghl', isFromGhl(id));
    lab.classList.toggle('needfill', picked && need.has(id) && !lab.hidden && !($(`f-${id}`)?.value || '').trim());
  }
}
function paintCsmSelect() {
  const s = $('f-csm'); if (!s) return;
  const cur = s.value;
  s.innerHTML = sel(state.desk.csm.map(c => [String(c.id), c.name]), cur, state.desk.csm.length ? 'Choose…' : 'No CSMs loaded: press Refresh Desk data');
  $('csmInfo').textContent = state.loaded ? `${state.desk.csm.length} CSM${state.desk.csm.length === 1 ? '' : 's'} from Desk.` : '';
}
const touched = new Set();

function paintSnapshotSelect() {
  const s = $('f-snapshot'); if (!s) return;
  const cur = s.value;
  const opts = state.snapshots.map(x => [x.id, snapName(x.id, x.name)]).sort((a, b) => a[1].localeCompare(b[1]));
  s.innerHTML = sel(opts, cur, opts.length ? 'Choose a snapshot…' : 'No snapshots loaded yet: press Refresh snapshots');
  $('snapInfo').textContent = state.loaded ? `${opts.length} snapshot${opts.length === 1 ? '' : 's'} available.` : '';
}

export function readForm() {
  const v = id => ($(`f-${id}`)?.value ?? '');
  const country = v('country');
  const kpi = $('f-kpi').checked, review = $('f-review').checked;
  const area = v('area') === 'Other' ? v('areaOther').trim() : v('area');
  const snapshotId = v('snapshot');
  const p = {
    snapshotId, snapshotName: snapshotId ? snapName(snapshotId) : '',
    businessName: v('name').trim(), phone: S.toE164(v('phone')), website: v('website').trim() ? S.normalizeUrl(v('website')) : '',
    address: v('street').trim(), city: v('city').trim(), state: country === 'US' ? v('state') : v('stateText').trim(), postalCode: v('zip').trim(), country, timezone: v('tz'),
    firstName: v('first').trim(), lastName: v('last').trim(), email: v('email').trim(),
    kpi: { requested: kpi, practiceArea: kpi ? area : '' },
    review: { requested: review, audience: review ? v('audience').trim() : '', smsHealthcare: review ? $('f-hcYes').checked : false },
    social: {}, settings: {},
    createdBy: v('who').trim(), notes: v('notes').trim(), allowDuplicate: !!state.allowDuplicate,
    brand: v('brand') || 'LFMP', csm: null, webformsRequested: $('f-webforms').checked, mastersheet: v('sheet').trim(),
  };
  const csm = state.desk.csm.find(c => String(c.id) === v('csm'));
  if (csm) p.csm = { id: csm.id, tag: csm.tag, name: csm.name };
  if (FCU.picked()) p.lfmpContactId = FCU.picked().id;   // optional: the client's contact in LFMP's CRM
  for (const [k] of S.SOCIAL) { const x = v(`s-${k}`).trim(); if (x) p.social[k] = k === 'googlePlacesId' ? x : S.normalizeUrl(x); }
  for (const [k] of S.SETTINGS) { const x = v(`a-${k}`); if (x) p.settings[k] = x === 'true'; }
  return p;
}
function fillForm(p) {
  const set = (id, val) => { const el = $(`f-${id}`); if (el) el.value = val ?? ''; };
  set('snapshot', p.snapshotId); set('name', p.businessName); set('phone', S.formatPhone(p.phone)); set('website', p.website);
  set('street', p.address); set('city', p.city); set('country', p.country || 'US');
  if ((p.country || 'US') === 'US') set('state', p.state); else set('stateText', p.state);
  set('zip', p.postalCode); set('tz', p.timezone);
  // Keep a hand pick made earlier in this form (even one that matches the suggestion); otherwise a zone that differs from the suggestion counts as picked by hand.
  state.tzManual = !!p.timezone && (state.tzManual || p.timezone !== (p.country === 'US' ? S.suggestTimezone(p.state) : ''));
  set('first', p.firstName); set('last', p.lastName); set('email', p.email);
  $('f-kpi').checked = !!p.kpi?.requested;
  if (p.kpi?.requested) { if (S.PRACTICE.includes(p.kpi.practiceArea)) set('area', p.kpi.practiceArea); else { set('area', 'Other'); set('areaOther', p.kpi.practiceArea); } }
  $('f-review').checked = !!p.review?.requested;
  if (p.review?.requested) { set('audience', p.review.audience); $(p.review.smsHealthcare ? 'f-hcYes' : 'f-hcNo').checked = true; }
  for (const [k] of S.SOCIAL) set(`s-${k}`, p.social?.[k]);
  for (const [k] of S.SETTINGS) set(`a-${k}`, typeof p.settings?.[k] === 'boolean' ? String(p.settings[k]) : '');
  set('who', p.createdBy); set('notes', p.notes);
  set('brand', p.brand || 'LFMP'); set('csm', p.csm?.id ? String(p.csm.id) : ''); set('sheet', p.mastersheet);
  $('f-webforms').checked = p.webformsRequested !== false;
  state.allowDuplicate = !!p.allowDuplicate;
  onFormInput({ target: {} });
}

// error key -> field id
const ERR_FIELD = { snapshotId: 'snapshot', businessName: 'name', phone: 'phone', website: 'website', country: 'country', postalCode: 'zip', state: 'state', timezone: 'tz', firstName: 'first', lastName: 'last', email: 'email', practiceArea: 'area', audience: 'audience', createdBy: 'who', notes: 'notes', duplicate: 'name', brand: 'brand', csm: 'csm', mastersheet: 'sheet' };
function formErrors() {
  const p = readForm();
  const errs = S.validate(p, { snapshotIds: state.snapshots.map(s => s.id) });
  const out = {};
  for (const [k, m] of Object.entries(errs)) {
    let id = k.startsWith('social.') ? `s-${k.slice(7)}` : k.startsWith('settings.') ? `a-${k.slice(9)}` : ERR_FIELD[k];
    if (id === 'state' && p.country !== 'US') id = 'stateText';
    if (id === 'area' && $('f-area').value === 'Other') id = 'areaOther';
    if (id) out[id] = m;
  }
  const dups = S.findDuplicates(p.businessName, state.subaccounts);
  if (dups.length && !state.allowDuplicate && !out.name) out.name = 'A sub-account with a similar name exists. Check the list below, or press "Create anyway".';
  return { p, out, dups };
}
function paintErrors(all = false) {
  if (all) state.showAll = true;          // after the first Review press, every error stays visible
  all = all || state.showAll;
  const { out } = formErrors();
  for (const el of document.querySelectorAll('#nf .ferr')) {
    const id = el.id.slice(2);
    const show = (all || touched.has(id)) && out[id];
    el.textContent = show ? out[id] : '';
    el.closest('label.f')?.classList.toggle('invalid', !!show);
  }
  if (state.showAll && $('formSummary')) { const n = Object.keys(out).length; $('formSummary').textContent = n ? `${n} thing${n === 1 ? '' : 's'} to fix before review.` : ''; }
  return out;
}
function onFormInput(e) {
  const t = e.target || {};
  if (t.id === 'f-phone' && e.type === 'input') { const pos = t.value.length; const f = S.formatPhone(t.value); if (f !== t.value && pos === t.value.length) t.value = f; }
  if (t.id === 'f-who') store.set(WHO_KEY, t.value.trim() || null);
  if (t.id === 'f-tz') state.tzManual = !!t.value; // a choice you make is never overwritten by the state; clearing it re-enables the suggestion
  if (t.id === 'f-name') state.allowDuplicate = false;
  const country = $('f-country').value;
  $('w-state').hidden = country !== 'US'; $('w-stateText').hidden = country === 'US';
  $('w-zip').querySelector('span').textContent = country === 'US' ? 'ZIP' : 'Postal code';
  const st = $('f-state').value, sug = country === 'US' ? S.suggestTimezone(st) : '';
  if (sug && !state.tzManual && (t.id === 'f-state' || t.id === 'f-country')) $('f-tz').value = sug; // only a State/Country change fills it in
  $('tzHint').textContent = sug ? `Suggested for ${st}: ${S.tzLabel(sug)}.${$('f-tz').value !== sug ? ' You chose a different one; it stays as you set it.' : ' You can change it.'}` : 'Suggested from the state once you choose one. You can always change it.';
  $('kpiOpts').hidden = !$('f-kpi').checked;
  $('w-areaOther').hidden = $('f-area').value !== 'Other';
  $('reviewOpts').hidden = !$('f-review').checked;
  $('webformsOpts').hidden = !$('f-webforms').checked;
  const nSocial = S.SOCIAL.filter(([k]) => $(`f-s-${k}`).value.trim()).length;
  $('socialCount').textContent = nSocial ? `${nSocial} added` : '';
  paintDup();
  paintErrors();
  paintGhlMarks(); paintFormVis();
}
function paintDup() {
  const name = $('f-name').value.trim();
  const dups = name.length >= 2 ? S.findDuplicates(name, state.subaccounts) : [];
  const box = $('dupBox');
  if (!dups.length) { box.hidden = true; box.innerHTML = ''; return; }
  box.hidden = false;
  box.innerHTML = state.allowDuplicate
    ? `<div class="note">Creating anyway, even though a similar name exists (${dups.map(d => `“${esc(d.name)}”`).join(', ')}). <button class="linkbtn" type="button" data-act="undodup">Undo</button></div>`
    : `<div class="warnbox" role="alert"><b>A sub-account with a similar name already exists:</b><ul>${dups.map(d => `<li>${esc(d.name)} <span class="mono hint">${esc(d.id)}</span></li>`).join('')}</ul>If this is a different business, press <b>Create anyway</b>. <div class="btnrow" style="margin-top:8px"><button class="btn" type="button" data-act="allowdup">Create anyway</button></div></div>`;
}

function goReview() {
  const out = paintErrors(true);
  const keys = Object.keys(out);
  if (keys.length) {
    $('formSummary').textContent = `${keys.length} thing${keys.length === 1 ? '' : 's'} to fix before creating.`;
    const first = $(`f-${keys.find(k => $(`f-${k}`) && !$(`w-${k}`)?.hidden && !$(`f-${k}`).closest('[hidden]')) || keys[0]}`);
    const det = first?.closest('details'); if (det) det.open = true;
    first?.focus(); first?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    return;
  }
  $('formSummary').textContent = '';
  const p = readForm();
  state.form = p;
  openConfirm(p);
}

// "Create this sub-account?" popup (v1.4.0; replaces the old "Check the details" screen). Nothing starts until Yes.
function openConfirm(p) {
  const g = (...ids) => (ids.some(isFromGhl) ? ' <span class="ghlmark">From GHL</span>' : '');
  const yes = v => (v ? `<span class="cfyes">${ICON.tick} Yes</span>` : '<span class="empty-val">No</span>');
  const addr = [p.address, p.city, [p.state, p.postalCode].filter(Boolean).join(' '), p.country].filter(Boolean).join(', ');
  const f = fieldRows(p);
  const rows = [
    ['Business name', `<b>${esc(p.businessName)}</b>${g('name')}`],
    ['Snapshot', esc(p.snapshotName)],
    ['Time zone', tzCell(p.timezone)],
    ['Address', addr ? `${esc(addr)}${g('street', 'city', 'state', 'stateText', 'zip')}` : ''],
    ['Business phone', p.phone ? `${esc(S.formatPhone(p.phone))}${g('phone')}` : ''],
    ['Website', p.website ? `${esc(p.website)}${g('website')}` : ''],
    ['Primary contact', `${esc(`${p.firstName} ${p.lastName}`)}${g('first', 'last')}<br><span class="hint">${esc(p.email)}</span>${g('email')}`],
    ['Brand', `${esc(p.brand || 'LFMP')}${g('brand')}`],
  ];
  const ticks = [
    ['KPI dashboard', p.kpi.requested ? `${yes(true)} · ${esc(p.kpi.practiceArea)}` : yes(false)],
    ['Automation Review', p.review.requested ? `${yes(true)} · audience “${esc(p.review.audience)}” · healthcare: ${p.review.smsHealthcare ? 'yes' : 'no'}` : yes(false)],
    ['Webforms ticket', yes(p.webformsRequested !== false)],
  ];
  const nSocial = S.SOCIAL.filter(([k]) => p.social?.[k]).length, nAdv = S.SETTINGS.filter(([k]) => typeof p.settings?.[k] === 'boolean').length;
  openDialog({ title: 'Create this sub-account?', wide: true, cancel: null, body: `<div class="cfm" id="confirmDlg">
    <p class="sub">This creates <b>${esc(p.businessName)}</b> in GHL now. Check the details first.</p>
    ${state.allowDuplicate ? '<div class="warnbox">You chose <b>Create anyway</b>: a sub-account with a similar name already exists.</div>' : ''}
    ${kv(rows)}
    <div class="cfticks"><p class="lbl">Ticked</p>${kv(ticks)}</div>
    <details class="cfmore"><summary>Everything else <span class="hint">CSM, Mastersheet, ${nSocial} social link${nSocial === 1 ? '' : 's'}, ${nAdv} advanced setting${nAdv === 1 ? '' : 's'}, notes</span></summary><div class="rv">
      <div><h4>Webforms</h4>${kv(f.webforms.filter(([k]) => k !== 'Brand'))}</div>
      <div><h4>Social links</h4>${kv(f.social)}</div><div><h4>Advanced</h4>${kv(f.settings)}</div>
      <div><h4>Internal</h4>${kv([['Created by', esc(p.createdBy)], ['Package / notes', esc(p.notes).replace(/\n/g, '<br>')], ['LFMP CRM contact', p.lfmpContactId ? `<a href="${esc(FC.crmLink(p.lfmpContactId))}" target="_blank" rel="noopener">Client in LFMP CRM ↗</a>` : '']])}</div>
    </div></details>
    <p class="ferr" id="createErr" role="alert"></p>
    <div class="btnrow cfbtns"><button class="btn big" type="button" data-act="backedit">Go back and edit</button><button class="btn primary big" type="button" id="createBtn" data-act="create">Yes, create sub-account</button></div>
  </div>` });
  $('createBtn').focus({ preventScroll: true });   // the popup opens at its top (title + business name first), also on phones
  const dlg = document.querySelector('#ovl .dlg'); if (dlg) dlg.scrollTop = 0;
}

async function submitCreate() {
  const btn = $('createBtn'); if (!btn || btn.disabled || state.creating) return;   // a double click = one sub-account
  state.creating = true;
  btn.disabled = true; btn.textContent = 'Sending…';
  for (const b of document.querySelectorAll('#confirmDlg [data-act="backedit"]')) b.disabled = true;
  const requestId = S.newRequestId();
  const payload = { ...state.form, requestId };
  try {
    const t0 = await dispatch('create.yml', { payload: JSON.stringify(payload), request_id: requestId });
    closeDialog();
    startRunView({ requestId, payload, t0 });
  } catch (e) {
    $('createErr').textContent = `Couldn't send it to GitHub: ${e.message}`; btn.disabled = false; btn.textContent = 'Yes, create sub-account';
    for (const b of document.querySelectorAll('#confirmDlg [data-act="backedit"]')) b.disabled = false;
  } finally { state.creating = false; }
}

// ---------------------------------------------------------------- progress view
const STEPS = [
  ['sent', 'Sent to GitHub'],
  ['waiting', 'Waiting for GitHub to start', 'GitHub Actions usually takes 10–60 seconds to start.'],
  ['checking', 'Checking details', 'Validating the form and checking for a similar name in GHL.'],
  ['creating', 'Creating sub-account'],
  ['loading_snapshot', 'Loading snapshot', 'GHL copies the snapshot into the new sub-account. This can take several minutes.'],
  ['saving', 'Saving record'],
  ['done', 'Done'],
];
function stopRun() { if (state.run) { state.run.stopped = true; clearInterval(state.run.timer); clearTimeout(state.run.poll); state.run = null; } }

function startRunView({ requestId, payload, t0, resume, minAttempt = 0 }) {
  stopRun();
  selectTab('new');
  $('formView').hidden = true; $('runView').hidden = false;
  const run = state.run = { requestId, payload, minAttempt, t0: t0 || Date.now(), stopped: false, ghRun: null, file: null, sentOk: !resume, startedAt: null, missSince: Date.now() };
  $('runView').innerHTML = `<div class="runhead"><div><h2 id="runTitle">${esc(payload?.businessName || 'Sub-account')}</h2><p class="sub">Request <span class="mono">${esc(requestId)}</span> · You can leave this page: the run continues and the record will show it.</p></div><span class="note">Elapsed <b class="elapsed" id="runElapsed">0:00</b></span></div>
    <ol class="steps" id="runSteps">${STEPS.map(([k, t, d]) => `<li class="step pending" data-k="${k}"><span class="ic" aria-hidden="true"></span><span class="t">${esc(t)}</span><span class="d">${esc(d || '')}</span><div class="e"></div><div class="slot"></div></li>`).join('')}</ol>
    <div id="runResult"></div>`;
  const tick = () => { const base = run.file?.startedAt && resume ? Date.parse(run.file.startedAt) : run.t0; const end = run.file?.finishedAt ? Date.parse(run.file.finishedAt) : Date.now(); const s = Math.max(0, Math.floor((end - base) / 1000)); const el = $('runElapsed'); if (el) el.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
  run.timer = setInterval(tick, 1000); tick();
  paintSteps();
  pollRun();
  window.scrollTo(0, 0);
}
function setStep(k, st, detail, extra) {
  const el = document.querySelector(`#runSteps [data-k="${k}"]`); if (!el) return;
  if (el.dataset.state !== st) {
    el.className = `step ${st}`; el.dataset.state = st;
    el.querySelector('.ic').innerHTML = st === 'ok' ? ICON.tick : st === 'fail' ? ICON.cross : st === 'warn' ? ICON.bang : '';
    el.setAttribute('aria-label', `${STEPS.find(s => s[0] === k)[1]}: ${({ run: 'in progress', ok: 'done', fail: 'failed', warn: 'needs attention', pending: 'not started' })[st]}`);
  }
  if (detail !== undefined) el.querySelector('.d').innerHTML = detail;
  el.querySelector('.e').innerHTML = extra?.error ? `<div class="errbox">${esc(extra.error)}</div>` : '';
  if (extra?.slot !== undefined) el.querySelector('.slot').innerHTML = extra.slot;
}
function snapshotSlot(snap, running) {
  if (!snap) return running ? '<div class="pbar indet" aria-label="Waiting for GHL"><span></span></div>' : '';
  const total = snap.completed.length + snap.pending.length;
  const pct = snap.percent ?? 0;
  const list = (arr, cls) => arr.slice(0, 24).map(a => `<span class="asset ${cls}" title="${esc(a)}">${esc(a)}</span>`).join('') + (arr.length > 24 ? `<span class="asset">+${arr.length - 24} more</span>` : '');
  return `<div class="pbar ${total ? '' : 'indet'}" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}" aria-label="Snapshot load"><span style="width:${pct}%"></span></div>
    <p class="hint" style="margin:6px 0 0">${total ? `${snap.completed.length} of ${total} parts loaded (${pct}%)` : 'Waiting for GHL to report progress…'} · GHL status “${esc(snap.status || 'not started')}”</p>
    ${total ? `<div class="assets">${list(snap.pending, '')}${list(snap.completed, 'done')}</div>` : ''}`;
}

function paintSteps() {
  const run = state.run; if (!run) return;
  const f = run.file, g = run.ghRun;
  setStep('sent', run.sentOk || f || g ? 'ok' : 'run');
  const started = !!f || g?.status === 'in_progress' || g?.status === 'completed';
  setStep('waiting', started ? 'ok' : 'run', started ? 'GitHub started the run.' : undefined);
  const stages = f?.stages || {};
  // Backup: run file not written yet but GitHub says the job is running -> "Checking details" is active.
  const backupChecking = !f && g?.status === 'in_progress';
  for (const k of S.STAGES) {
    const s = stages[k]?.state;
    let st = s === 'running' ? 'run' : s === 'ok' ? 'ok' : s === 'fail' ? 'fail' : s === 'warn' ? 'warn' : 'pending';
    if (k === 'checking' && backupChecking) st = 'run';
    let detail, extra = {};
    if (k === 'creating' && f?.locationId) detail = `Created. Location ID <span class="mono">${esc(f.locationId)}</span>`;
    if (k === 'loading_snapshot' && (st === 'run' || st === 'ok' || st === 'warn' || st === 'fail')) extra.slot = snapshotSlot(f?.snapshot, st === 'run');
    if (k === 'loading_snapshot' && st === 'warn') detail = 'Still loading after 15 minutes. The sub-account is ready to open; use Refresh status later.';
    if (st === 'fail' && f?.error?.stage === k) extra.error = f.error.message;
    if (k === 'done' && f && ['done', 'snapshot_still_loading'].includes(f.status)) st = 'ok';
    setStep(k, st, detail, extra);
  }
  if (f?.status === 'duplicate') setStep('checking', 'fail', 'Stopped: a similar name exists.');
}

async function pollRun() {
  const run = state.run; if (!run || run.stopped) return;
  try {
    const [g, f] = await Promise.all([findRun('create.yml', `create ${run.requestId}`, run.t0).catch(() => run.ghRun), getJSON(`runs/${run.requestId}.json`).catch(() => run.file)]);
    if (run.stopped) return;
    if (g) run.ghRun = g;
    // A retry re-uses the same run file: ignore the old final state until this attempt's file shows up.
    if (f && (!run.minAttempt || (f.attempts || 0) >= run.minAttempt)) run.file = f;
    if (run.file?.payload && !run.payload) run.payload = run.file.payload;
    if (run.file?.businessName) $('runTitle').textContent = run.file.businessName;
    paintSteps();
    const fin = run.file && S.FINAL_RUN.includes(run.file.status);
    if (fin) { clearInterval(run.timer); return showResult(); }
    // The GitHub run ended but the run file never reached a final state.
    if (run.ghRun?.status === 'completed' && Date.now() - Date.parse(run.ghRun.updated_at) > 15000) {
      clearInterval(run.timer);
      let why = `The GitHub run stopped (${run.ghRun.conclusion}) before it finished.`;
      if (run.ghRun.conclusion === 'cancelled') why = 'GitHub cancelled this run, usually because another sub-account was being created at the same time. Retry is safe.';
      else if (!run.file) {
        try { const jobs = await gh('GET', `${R}/actions/runs/${run.ghRun.id}/jobs`); if (!(jobs.jobs?.[0]?.steps || []).length) why = "GitHub didn't start the job. The org's Actions minutes or billing may need attention. Nothing was created."; } catch {}
      }
      return showResult({ error: why });
    }
    if (!run.ghRun && !run.file && Date.now() - run.t0 > 3 * 60e3) { clearInterval(run.timer); return showResult({ error: "GitHub hasn't started the run after 3 minutes. Its Actions minutes or billing may need attention. Nothing was created." }); }
  } catch (e) { setStep('waiting', state.run?.file ? 'ok' : 'run', `Having trouble reaching GitHub (${esc(e.message)}). Still trying…`); }
  if (!run.stopped) run.poll = setTimeout(pollRun, POLL_MS);
}

async function showResult(extra = {}) {
  const run = state.run; if (!run) return;
  const f = run.file || {};
  const host = $('runResult');
  const elapsed = f.startedAt && f.finishedAt ? Math.round((Date.parse(f.finishedAt) - Date.parse(f.startedAt)) / 1000) : null;
  const took = elapsed !== null ? `${Math.floor(elapsed / 60)} min ${elapsed % 60} s` : '';
  if (!extra.error && ['done', 'snapshot_still_loading'].includes(f.status)) {
    let rec = null; try { rec = f.recordPath ? await getJSON(f.recordPath) : null; } catch {}
    const p = rec?.submitted ? { ...rec.submitted } : (run.payload || {});
    const fr = fieldRows(p);
    const still = f.status === 'snapshot_still_loading';
    const kpi = rec ? rec.kpiRequested : run.payload?.kpi?.requested, rev = rec ? rec.reviewRequested : run.payload?.review?.requested;
    const ghlLink = rec?.links?.ghl || `https://app.lawfirmmarketingpros.com/v2/location/${f.locationId}/dashboard`;
    const login = rec?.links?.clientLogin || 'https://app.lawfirmmarketingpros.com/';
    host.innerHTML = `<div class="result success" id="donePanel">
      <div class="bighead ${still ? 'warn' : 'good'}"><span class="badge2">${still ? ICON.bang : ICON.tick}</span><div><h2>${still ? 'Sub-account created. Snapshot still loading' : 'Sub-account created'}</h2><p class="sub">${esc(p.businessName || f.businessName)}${took ? ` · took ${took}` : ''}</p></div></div>
      ${still ? '<div class="warnbox">GHL was still loading the snapshot after 15 minutes. The sub-account exists and can be opened. Use <b>Refresh status</b> on the Sub-accounts tab later.</div>' : ''}
      <div class="btnrow"><a class="btn primary big" href="${esc(ghlLink)}" target="_blank" rel="noopener">${ICON.ext} Open in GHL</a><button class="btn big" type="button" data-act="another">${ICON.plus} Create another</button><button class="btn big" type="button" data-act="golist">Back to the list</button></div>
      <div><h4>Sub-account</h4>${kv([['Location ID', `<span class="mono">${esc(f.locationId)}</span> <button class="btn" type="button" data-act="copyid" data-id="${esc(f.locationId)}">${ICON.copy} Copy</button>`], ['Client login link', `<a href="${esc(login)}" target="_blank" rel="noopener">${esc(login)}</a> <button class="btn" type="button" data-act="copytext" data-text="${esc(login)}" data-what="Login link">${ICON.copy} Copy</button>`], ['Snapshot used', esc(rec?.snapshot?.name || run.payload?.snapshotName || '')], ['Time taken', esc(took)]])}</div>
      ${rec ? K.kpiCardHtml(rec, { where: 'done' }) : ''}
      ${rec && rec.reviewRequested ? RV.reviewCardHtml(rec) : ''}
      <div><h4>Business</h4>${kv(fr.business)}</div><div><h4>Address</h4>${kv(fr.address)}</div><div><h4>Primary contact</h4>${kv(fr.contact)}</div>
      <div><h4>Webforms</h4>${kv(fr.webforms)}</div>
      <div><h4>Next steps</h4><ul class="checklist">
        ${p.webformsRequested !== false ? '<li>Webforms ticket <span class="later">· set up the Zap, then send the ticket from the record (Sub-accounts → View details → Webforms)</span></li>' : ''}
        <li>Share the sub-account with the client / create the client user</li>
        <li>Phone number + A2P registration</li>
        <li>Email sending domain</li>
        <li>Connect the calendar</li>
        ${kpi ? `<li>KPI dashboard <span class="later">· ${still ? 'set it up from the record once the snapshot has loaded' : 'setting up below'}</span></li>` : ''}
        ${rev ? `<li>Automation review package <span class="later">· ${still ? 'create it from the record once the snapshot has loaded' : 'preview created below; tailor it after the kickoff call, then Publish'}</span></li>` : ''}
      </ul></div>
    </div>`;
    if (rec) {
      // The record is needed in memory for the KPI card; then start KPI setup by itself when it was asked
      // for and the snapshot has loaded (the passphrase is made in this browser, so it must start here).
      rec.id ||= f.recordPath.replace(/^records\/|\.json$/g, '');
      const k = state.records.findIndex(x => x.id === rec.id); if (k >= 0) state.records[k] = rec; else state.records.unshift(rec);
      if (rec.kpiRequested && f.status === 'done' && !rec.kpi?.status) K.startKpi(rec.id, { auto: true });
      if (rec.reviewRequested && f.status === 'done' && !rec.review?.status) RV.autoCreate(rec.id);   // preview only; Publish stays a click
    }
    loadRecords().catch(() => {});
  } else {
    const dup = f.status === 'duplicate';
    const msg = extra.error || f.error?.message || 'Something went wrong.';
    const created = f.locationId ? `<div class="note">The sub-account <b>was</b> created (Location ID <span class="mono">${esc(f.locationId)}</span>). Retry continues from the snapshot check; it will <b>not</b> create a second one.</div>` : '';
    host.innerHTML = `<div class="result" id="failPanel">
      <div class="bighead ${dup ? 'warn' : 'bad'}"><span class="badge2">${dup ? ICON.bang : ICON.cross}</span><div><h2>${dup ? 'A similar sub-account already exists' : "It didn't finish"}</h2><p class="sub">${esc(f.businessName || run.payload?.businessName || '')}</p></div></div>
      <div class="${dup ? 'warnbox' : 'errbox'}" id="failMsg">${esc(msg)}</div>
      ${dup && f.duplicates?.length ? `<ul>${f.duplicates.map(d => `<li>${esc(d.name)} <span class="mono hint">${esc(d.id)}</span></li>`).join('')}</ul><p class="sub">Nothing was created. If this is a different business, press <b>Create anyway</b>.</p>` : ''}
      ${created}
      ${f.error?.technical || run.ghRun?.html_url ? `<details class="tech"><summary>Technical details</summary><pre>${esc([f.error?.technical, run.ghRun?.html_url ? `GitHub run: ${run.ghRun.html_url}` : '', `Request: ${run.requestId}`].filter(Boolean).join('\n'))}</pre></details>` : ''}
      <div class="btnrow">${dup ? '<button class="btn primary big" type="button" data-act="createanyway">Create anyway</button>' : '<button class="btn primary big" type="button" data-act="retry">Retry</button>'}<button class="btn big" type="button" data-act="backform">Back to form</button></div>
      <p class="ferr" id="retryErr"></p>
    </div>`;
  }
  host.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

async function retry({ allowDuplicate = false } = {}) {
  const run = state.run; if (!run) return;
  const btn = document.querySelector('[data-act="retry"],[data-act="createanyway"]'); if (btn?.disabled) return;
  if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }
  const payload = { ...(run.file?.payload || run.payload), requestId: run.requestId };
  if (allowDuplicate) payload.allowDuplicate = true;
  try {
    const t0 = await dispatch('create.yml', { payload: JSON.stringify(payload), request_id: run.requestId });
    startRunView({ requestId: run.requestId, payload, t0, minAttempt: (run.file?.attempts || 0) + 1 });
  } catch (e) { $('retryErr').textContent = `Couldn't send it to GitHub: ${e.message}`; if (btn) { btn.disabled = false; btn.textContent = allowDuplicate ? 'Create anyway' : 'Retry'; } }
}
function backToForm() {
  const p = state.run?.file?.payload || state.run?.payload;
  stopRun();
  $('runView').hidden = true; $('formView').hidden = false;
  if (p) fillForm(p);
  window.scrollTo(0, 0);
}
function newForm() { stopRun(); renderNew(); touched.clear(); selectTab('new'); }

async function refreshSnapshots(btn) {
  btn.disabled = true; const label = btn.innerHTML; btn.textContent = 'Refreshing… (about a minute)';
  try {
    const rid = S.newRequestId();
    const t0 = await dispatch('snapshots.yml', { request_id: rid });
    const run = await waitRun('snapshots.yml', `snapshots ${rid}`, t0);
    if (run.conclusion !== 'success') throw new Error(`The refresh ended "${run.conclusion}". Open the GitHub run for details.`);
    const [snaps, names] = await Promise.all([getJSON('data/snapshots.json'), getJSON('data/snapshot-names.json')]);
    state.snapshots = snaps || []; state.snapshotNames = names || {};
    paintSnapshotSelect(); toast(`${state.snapshots.length} snapshots loaded`);
  } catch (e) { $('snapInfo').textContent = e.message; }
  finally { btn.disabled = false; btn.innerHTML = label; }
}

// ---------------------------------------------------------------- clicks
document.addEventListener('click', e => {
  const eye = e.target.closest('[data-eye]');
  if (eye) { const i = $(eye.dataset.eye); const vis = i.type === 'password'; i.type = vis ? 'text' : 'password'; eye.innerHTML = vis ? ICON.eyeOff : ICON.eye; eye.setAttribute('aria-label', vis ? 'Hide' : 'Show'); return; }
  const mb = e.target.closest('[data-menu]');
  if (mb) { const m = $(mb.dataset.menu); closeMenus(m); m.hidden = !m.hidden; mb.setAttribute('aria-expanded', String(!m.hidden)); if (!m.hidden) m.querySelector('button,a')?.focus(); return; }
  if (!e.target.closest('.menu')) closeMenus();
  else if (e.target.closest('.menu button, .menu a')) setTimeout(() => closeMenus(), 0);
  const th = e.target.closest('[data-theme-set]'); if (th) { applyTheme(th.dataset.themeSet); document.querySelector(`.themeseg [data-theme-set="${th.dataset.themeSet}"]`)?.focus(); return; }
  const tab = e.target.closest('.tab, .bnav [data-tab]'); if (tab) { e.preventDefault(); if (tab.dataset.tab === 'new') { if (!state.run) { selectTab('new'); $('formView').hidden = false; } else selectTab('new'); } else selectTab(tab.dataset.tab); window.scrollTo(0, 0); return; }
  const dt = e.target.closest('[data-dtab]'); if (dt) { selectDetTab(dt.dataset.dtab); return; }
  const go = e.target.closest('[data-goto]'); if (go) { selectDetTab(go.dataset.goto); if (!go.dataset.act) { document.querySelector(`#detBody [data-dtab="${go.dataset.goto}"]`)?.focus(); return; } }
  const lt = e.target.closest('[data-ltabset]'); if (lt) { state.listTab = lt.dataset.ltabset; paintList(); return; }
  const a = e.target.closest('[data-act]'); if (!a) return;
  const act = a.dataset.act;
  if (act === 'lock') lockNow();
  else if (act === 'news') openNews();
  else if (act === 'newsgot') markNewsSeen();
  else if (act === 'closedet') closeDialog();
  else if (act === 'more') openDialog({ title: 'More', cancel: 'Close', body: `<div class="rv"><div><h4>Theme</h4><div class="themeseg">${themeSegHtml()}</div></div><div class="btnrow" style="margin:0;flex-direction:column;align-items:stretch"><button class="btn big" type="button" data-act="reload">${ICON.sync} Refresh list</button><button class="btn big" type="button" data-act="news">What's new · v${esc(S.VERSION)}</button><button class="btn big" type="button" data-act="forget">Forget token</button><button class="btn big" type="button" data-act="lock">Lock</button></div></div>` });
  else if (act === 'forget') openDialog({ title: 'Forget token in this browser?', body: `<p class="sub">The saved GitHub token (shared with the KPI admin) is removed from this browser. You will need to paste a token again next time. The token itself stays valid on GitHub; revoke it there if this device is lost.</p>`, ok: 'Forget token', danger: true, onOk: async () => { await login.vaultSet({ gh: null }); ghToken = null; stopRun(); closeDialog(); askToken('Token removed from this browser. Paste a token to continue.'); } });
  else if (act === 'reload') { closeDialog(); loadAll(); }
  else if (act === 'showtests') { state.showTests = true; store.set(SHOW_TESTS, '1'); if ($('showTests')) $('showTests').checked = true; paintList(); }
  else if (act === 'gonew') { closeDialog(); if (!state.run) { selectTab('new'); $('formView').hidden = false; } else newForm(); window.scrollTo(0, 0); }
  else if (act === 'golist') { selectTab('list'); }
  else if (act === 'copyid') copy(a.dataset.id, 'Location ID');
  else if (act === 'copytext') copy(a.dataset.text, a.dataset.what || 'Text');
  else if (act === 'details') openDetails(a.dataset.id);
  else if (act === 'refresh') refreshStatus(a.dataset.id, a);
  else if (act === 'refreshsnaps') refreshSnapshots(a);
  else if (act === 'allowdup') { state.allowDuplicate = true; onFormInput({ target: {} }); }
  else if (act === 'undodup') { state.allowDuplicate = false; onFormInput({ target: {} }); }
  else if (act === 'backedit') { if (!a.disabled) closeDialog(); }
  else if (act.startsWith('fc')) FCU.onAct(act, a);
  else if (act === 'create') submitCreate();
  else if (act === 'retry') retry();
  else if (act === 'createanyway') retry({ allowDuplicate: true });
  else if (act === 'backform') backToForm();
  else if (act === 'another') newForm();
  else if (act === 'refreshdesk') refreshDesk(a);
  else if (act === 'editlink') { state.editLink = a.dataset.k; paintDetails(); $('lk-in')?.focus(); }
  else if (act === 'canceledit') { state.editLink = null; paintDetails(); }
  else if (act === 'savelink') saveLink(a.dataset.k, a);
  else if (act.startsWith('kpi')) K.onKpiAct(act, a);
  else if (act.startsWith('rv')) RV.onReviewAct(act, a);
  else if (['wfon', 'wfsave', 'wfpreview', 'wfsend', 'wfuseexisting'].includes(act)) {
    const r = wfRec(state.detailsId); if (!r) return;
    if (act === 'wfpreview') wfPreview(r);
    else if (act === 'wfsend') wfSend(r, a);
    else {
      a.disabled = true;
      const who = whoName() || 'unknown';
      const job = act === 'wfsave' ? wfSave(r)
        : act === 'wfon' ? saveRecord(r.id, x => { x.webformsRequested = true; x.webforms = { domain: W.domainOf(x.submitted?.website), ...(x.webforms || {}) }; }, `${r.businessName}: webforms ticket requested by ${who}`)
        : saveRecord(r.id, x => { const url = W.deskTicketUrl(Number(a.dataset.tid)); x.links = { ...(x.links || {}), ticket: url }; x.linkEdits = { ...(x.linkEdits || {}), ticket: { by: who, at: new Date().toISOString() } }; }, `${r.businessName}: ticket #${a.dataset.tid} linked by ${who}`);
      job.then(() => { delete state.wfProj[r.id]; toast(act === 'wfsave' ? 'Webforms details saved' : act === 'wfon' ? 'Webforms ticket requested' : `Ticket #${a.dataset.tid} linked`); paintList(); paintDetails(); })
        .catch(e => { if ($('wfErr')) $('wfErr').textContent = `Couldn't save: ${e.message}`; a.disabled = false; });
    }
  }
  else if (act === 'viewrun') { const r = state.attention.find(x => x.requestId === a.dataset.id); startRunView({ requestId: a.dataset.id, payload: r?.payload, t0: Date.parse(r?.startedAt || '') || Date.now(), resume: true }); }
});

// Webforms card + link editor: live checks while typing.
function onCardInput(e) {
  const t = e.target; if (!t.closest?.('#detBody')) return;
  const r = wfRec(state.detailsId); if (!r) return;
  const inCard = !!t.closest('#wfCard');   // read before repainting: the project list replaces its own radios
  if (t.name === 'wfproj') { state.wfProj[r.id] = t.value === 'none' ? { none: true } : state.desk.projects.concat(r.webforms?.project?.id ? [r.webforms.project] : []).find(p => String(p.id) === t.value) || null; paintProjects(r); }
  else if (t.id === 'wf-projq') paintProjects(r);
  else if (t.id === 'lk-in' && e.type === 'input') { $('lk-err').textContent = ''; }
  if (inCard) { paintWfState(r); if (!$('wfPreview').hidden) wfPreview(r); }
}
document.addEventListener('input', onCardInput);
document.addEventListener('change', onCardInput);
document.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.id === 'lk-in') { e.preventDefault(); document.querySelector('[data-act="savelink"]')?.click(); } });

document.addEventListener('submit', e => { if (FCU.onSubmit(e)) return; });
FCU.initFind({ dispatch, findRun, getJSON, esc, ICON, newRequestId: () => S.newRequestId(), pollMs: POLL_MS, slowMs: Number(CFG.findSlowMs) || 0, subaccounts: () => state.subaccounts, findDuplicates: S.findDuplicates,
  onPick: values => { const n = applyGhl(values); return n; }, onClear: () => clearGhl(), onMode: () => { paintFormVis(); paintGhlMarks(); } });
K.initKpi({ gh, saveRecord, record: id => state.records.find(x => x.id === id), esc, ICON, toast, copy, who: () => whoName(), cfg: CFG,
  newRequestId: () => S.newRequestId(), paintList: () => paintList(), sleep, pollMs: POLL_MS,
  detailsOpen: () => ($('detBody') ? state.detailsId : null), paintDetails: () => paintDetails() });
RV.initReview({ gh, saveRecord, savePackage, getPackage, getJSON, dispatch, record: id => state.records.find(x => x.id === id),
  setRecord: (id, rec) => { const k = state.records.findIndex(x => x.id === id); if (k >= 0) state.records[k] = rec; },
  esc, ICON, toast, copy, who: () => whoName(), setWho: n => store.set(WHO_KEY, String(n || '').trim() || null), cfg: CFG, newRequestId: () => S.newRequestId(), paintList: () => paintList(), sleep, pollMs: POLL_MS,
  detailsOpen: () => ($('detBody') ? state.detailsId : null), paintDetails: () => paintDetails() });
boot();

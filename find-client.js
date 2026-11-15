// New sub-account: "Find client in GHL" (default) or "Enter details manually" (v1.4.0).
//
// Search = the read-only find-client.yml workflow. This tab makes a one-time key pair; the public half goes with the
// search, the workflow encrypts the matches with it, and only this tab can read them (the private key is never
// stored or sent, and is dropped after the search, on Cancel and on a new search).
// The page never calls GHL itself.

import * as FC from './find-client-fields.js';

let D = null;   // deps from app.js: dispatch, findRun, getJSON, esc, ICON, newRequestId, pollMs, subaccounts, findDuplicates, onPick, onMode, onClear
const st = { mode: 'ghl', query: '', search: null, view: 'box', results: null, error: null, picked: null };
const SLOW_MS = 90e3, NO_START_MS = 3 * 60e3;
const STEPS = [['sent', 'Sent'], ['starting', 'GitHub starting'], ['searching', 'Searching LFMP contacts'], ['results', 'Getting results']];
const $ = id => document.getElementById(id);
const b64 = u => { let s = ''; for (const x of new Uint8Array(u)) s += String.fromCharCode(x); return btoa(s); };
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const mmss = ms => { const s = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const SEARCH_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/></svg>';
const PEN_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L19 9l-4-4L4 16v4Z"/><path d="m13.5 6.5 4 4"/></svg>';

export function initFind(deps) { D = deps; }
export const mode = () => st.mode;
export const picked = () => st.picked;
export const busy = () => !!st.search;
export function reset() { stop(); Object.assign(st, { mode: 'ghl', query: '', view: 'box', results: null, error: null, picked: null }); }
export function setPicked(p) { st.picked = p; }

// ---------------------------------------------------------------- markup
export function startHtml() {
  const opt = (m, icon, title, sub) => `<button type="button" class="startopt" data-act="fcmode" data-mode="${m}" aria-pressed="${st.mode === m}"><span class="sic" aria-hidden="true">${icon}</span><span class="stx"><b>${title}</b><span class="hint">${sub}</span></span></button>`;
  return `<div class="startpick" role="group" aria-label="How to start">
    ${opt('ghl', SEARCH_ICON, 'Find client in GHL', 'Search LFMP’s CRM by name, firm or email and fill the form. You add anything missing.')}
    ${opt('manual', PEN_ICON, 'Enter details manually', 'Type every detail yourself.')}
  </div>
  <section class="fcpanel" id="fcPanel" aria-live="polite"></section>`;
}

export function paint() {
  for (const b of document.querySelectorAll('[data-act="fcmode"]')) b.setAttribute('aria-pressed', String(b.dataset.mode === st.mode));
  const host = $('fcPanel'); if (!host) return;
  host.hidden = st.mode !== 'ghl';
  if (st.mode !== 'ghl') return;
  if (st.picked && st.view === 'picked') { host.innerHTML = pickedHtml(); return; }
  if (st.search) { if (!$('fcAnim')) host.innerHTML = animHtml(); paintAnim(); return; }
  if (st.view === 'results') { host.innerHTML = resultsHtml(); return; }
  if (st.view === 'error') { host.innerHTML = errorHtml(); return; }
  host.innerHTML = boxHtml();
}

function boxHtml() {
  const e = D.esc;
  return `<form class="fcbox" id="fcForm" novalidate role="search">
    <label class="f" for="fcQ"><span>Find client in GHL</span><span class="hint">Searches the contacts in LFMP’s own GHL (read-only). Takes about 30 seconds.</span>
      <span class="fcrow"><input type="search" id="fcQ" value="${e(st.query)}" placeholder="Name, firm or email" maxlength="100" autocomplete="off" spellcheck="false"><button class="btn primary" type="submit" id="fcGo">${SEARCH_ICON} Search</button></span></label>
    <span class="ferr" id="fcErr" role="alert"></span>
    ${st.picked ? `<p class="hint" style="margin:0">Filled from: <b>${e(st.picked.label)}</b>. <button class="linkbtn" type="button" data-act="fcback">Back to the filled form</button></p>` : ''}
  </form>`;
}

function animHtml() {
  const e = D.esc;
  return `<div class="fcanim" id="fcAnim">
    <div class="scanbar" aria-hidden="true"><span></span></div>
    <p class="fct" role="status">Searching GHL for “${e(st.search.query)}”…</p>
    <ol class="steps fcsteps" id="fcSteps">${STEPS.map(([k, t]) => `<li class="step pending" data-k="${k}"><span class="ic" aria-hidden="true"></span><span class="t">${t}</span></li>`).join('')}</ol>
    <p class="hint fctime"><b id="fcElapsed">0:00</b> · usually about 30 seconds</p>
    <div id="fcSlow"></div>
    <div class="btnrow"><button class="btn" type="button" data-act="fccancel">Cancel</button></div>
  </div>`;
}

function stepState(s) {
  const g = s.ghRun, f = s.file;
  const started = !!f || g?.status === 'in_progress' || g?.status === 'completed';
  const done = f?.status === 'done' || f?.status === 'failed';
  return {
    sent: s.sent ? 'ok' : 'run',
    starting: !s.sent ? 'pending' : started ? 'ok' : 'run',
    searching: !started ? 'pending' : f?.status === 'failed' ? 'fail' : done ? 'ok' : 'run',
    results: f?.status === 'done' ? (s.decrypted ? 'ok' : 'run') : 'pending',
  };
}
function paintAnim() {
  const s = st.search; if (!s || !$('fcSteps')) return;
  const ss = stepState(s);
  for (const [k, t] of STEPS) {
    const el = document.querySelector(`#fcSteps [data-k="${k}"]`);
    if (el.dataset.state === ss[k]) continue;
    el.dataset.state = ss[k]; el.className = `step ${ss[k]}`;
    el.querySelector('.ic').innerHTML = ss[k] === 'ok' ? D.ICON.tick : ss[k] === 'fail' ? D.ICON.cross : '';
    el.setAttribute('aria-label', `${t}: ${({ run: 'in progress', ok: 'done', fail: 'failed', pending: 'not started' })[ss[k]]}`);
  }
  const el = $('fcElapsed'); if (el) el.textContent = mmss(Date.now() - s.t0);
  const slow = Date.now() - s.t0 > (D.slowMs || SLOW_MS);
  const box = $('fcSlow');
  if (box && slow && !box.innerHTML) box.innerHTML = `<div class="warnbox fcslow">Taking longer than usual, still working. <button class="btn sm" type="button" data-act="fcretry">Retry</button></div>`;
}

function resultsHtml() {
  const e = D.esc, r = st.results;
  const again = '<button class="btn" type="button" data-act="fcagain">Search again</button>';
  const manual = '<button class="btn" type="button" data-act="fcmanual">Enter details manually</button>';
  if (!r.list.length) {
    return `<div class="fcres" id="fcRes"><div class="note fcnone"><b>No client found for “${e(r.query)}”.</b> Try a shorter name, the firm name or the email.</div><div class="btnrow">${again}${manual}</div></div>`;
  }
  const subs = D.subaccounts();
  const rows = r.list.map((x, i) => {
    const s = FC.resultSummary(x);
    const dups = s.firm ? D.findDuplicates(s.firm, subs) : [];
    const tags = s.brandTags.map(t => `<span class="chip ${t === 'wpp client' ? 'info' : 'warn'}">${t === 'wpp client' ? 'WPP client' : 'LFMP client'}</span>`).join('');
    return `<li class="fcitem" data-i="${i}">
      <div class="fcwho"><b>${e(s.name || s.email || 'No name')}</b>${s.firm ? `<span class="fcfirm">${e(s.firm)}</span>` : '<span class="fcfirm empty-val">No firm on the contact</span>'}</div>
      <div class="fcmeta">${s.email ? `<span>${e(s.email)}</span>` : ''}${s.place ? `<span>${e(s.place)}</span>` : ''}${tags}</div>
      ${dups.length ? `<div class="warnbox fcdup">A sub-account with this name already exists: ${dups.slice(0, 3).map(d => `<b>${e(d.name)}</b>`).join(', ')}. You can still use this client.</div>` : ''}
      <div class="fcuse"><button class="btn${i === 0 ? ' primary' : ''}" type="button" data-act="fcpick" data-i="${i}" aria-label="Use ${e(s.name || s.firm || 'this client')}">Use this client</button></div>
    </li>`;
  }).join('');
  return `<div class="fcres" id="fcRes">
    <div class="fchead"><p><b>${r.list.length} match${r.list.length === 1 ? '' : 'es'}</b> for “${e(r.query)}”${r.more ? ' · showing the first 10, add a word to narrow it' : ''}</p>${again}</div>
    <ul class="fclist">${rows}</ul></div>`;
}

function errorHtml() {
  const e = D.esc, x = st.error || {};
  return `<div class="fcres" id="fcRes"><div class="errbox" id="fcFail"><b>The search didn't finish.</b> ${e(x.message || 'Something went wrong.')}</div>
    ${x.technical ? `<details class="tech"><summary>Technical details</summary><pre>${e(x.technical)}</pre></details>` : ''}
    <div class="btnrow"><button class="btn primary" type="button" data-act="fcretry">Retry</button><button class="btn" type="button" data-act="fcmanual">Enter details manually</button></div></div>`;
}

function pickedHtml() {
  const e = D.esc, p = st.picked;
  return `<div class="fcpicked" id="fcPicked"><div><p class="lbl">Filled from GHL</p><p class="fcpname"><b>${e(p.label)}</b></p>
    <p class="hint">${p.count} field${p.count === 1 ? '' : 's'} filled (marked <span class="ghlmark">From GHL</span>). Check them, and fill in the highlighted ones.</p></div>
    <div class="fcpacts"><a class="btn sm" href="${e(FC.crmLink(p.id))}" target="_blank" rel="noopener">Client in LFMP CRM ↗</a><button class="btn sm" type="button" data-act="fcagain">Search again</button><button class="btn sm" type="button" data-act="fcclear">Clear</button></div></div>`;
}

// ---------------------------------------------------------------- search
function stop() { const s = st.search; if (s) { s.stopped = true; clearTimeout(s.poll); clearInterval(s.timer); s.keys = null; } st.search = null; }

export async function startSearch(query) {
  const q = String(query ?? '').replace(/\s+/g, ' ').trim();
  if (q.length < 2) { const er = $('fcErr'); if (er) er.textContent = 'Type at least 2 characters: a name, the firm or an email.'; $('fcQ')?.focus(); return; }
  stop();
  st.query = q; st.error = null;
  const s = st.search = { query: q, rid: D.newRequestId(), t0: Date.now(), sent: false, ghRun: null, file: null, decrypted: false, stopped: false, keys: null };
  paint();
  s.timer = setInterval(() => (st.search === s ? paintAnim() : clearInterval(s.timer)), 1000);
  try {
    s.keys = await crypto.subtle.generateKey({ name: 'RSA-OAEP', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, false, ['encrypt', 'decrypt']);
    const spki = b64(await crypto.subtle.exportKey('spki', s.keys.publicKey));
    if (s.stopped) return;
    s.sentAt = await D.dispatch('find-client.yml', { query: q, request_id: s.rid, key: spki });
    s.sent = true; paintAnim();
  } catch (err) { if (!s.stopped) return failed(s, { message: `Couldn't send the search to GitHub: ${err.message}` }); return; }
  poll(s);
}

async function poll(s) {
  if (s.stopped) return;
  try {
    const [g, f] = await Promise.all([D.findRun('find-client.yml', `find ${s.rid}`, s.sentAt || s.t0).catch(() => s.ghRun), D.getJSON(`searches/${s.rid}.json`).catch(() => s.file)]);
    if (s.stopped) return;
    if (g) s.ghRun = g; if (f) s.file = f;
    paintAnim();
    if (f?.status === 'done') return finish(s);
    if (f?.status === 'failed') return failed(s, f.error || {});
    if (s.ghRun?.status === 'completed' && Date.now() - Date.parse(s.ghRun.updated_at) > 15000) {
      return failed(s, { message: s.ghRun.conclusion === 'cancelled' ? 'GitHub cancelled the search.' : `The GitHub run stopped (${s.ghRun.conclusion}) before it finished.`, technical: s.ghRun.html_url ? `GitHub run: ${s.ghRun.html_url}` : '' });
    }
    if (!s.ghRun && !s.file && Date.now() - s.t0 > NO_START_MS) return failed(s, { message: "GitHub hasn't started the search after 3 minutes. Its Actions minutes or billing may need attention." });
  } catch { /* keep trying */ }
  if (!s.stopped) s.poll = setTimeout(() => poll(s), D.pollMs);
}

async function finish(s) {
  paintAnim();
  try {
    const x = s.file.enc;
    const aes = await crypto.subtle.decrypt({ name: 'RSA-OAEP' }, s.keys.privateKey, unb64(x.key));
    const k = await crypto.subtle.importKey('raw', aes, 'AES-GCM', false, ['decrypt']);
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(x.iv) }, k, unb64(x.data));
    const data = JSON.parse(new TextDecoder().decode(plain));
    if (s.stopped) return;
    s.decrypted = true; paintAnim();
    const list = (data.results || []).filter(r => FC.isContactId(r.id)).slice(0, FC.MAX_RESULTS);
    stop();
    st.results = { query: s.query, list, more: !!s.file.more, fieldsUsed: s.file.fieldsUsed || [] };
    st.view = 'results'; paint();
    $('fcRes')?.querySelector('button')?.focus({ preventScroll: true });
  } catch { if (!s.stopped) failed(s, { message: "The results couldn't be opened in this tab. Search again." }); }
}

function failed(s, err) {
  if (st.search !== s) return;
  stop();
  st.error = { message: err.message, technical: err.technical || '' };
  st.view = 'error'; paint();
}

// ---------------------------------------------------------------- actions (data-act="fc…")
export function onAct(act, el) {
  if (act === 'fcmode') { st.mode = el.dataset.mode; if (st.mode === 'ghl' && st.picked && !st.search) st.view = 'picked'; paint(); D.onMode(st.mode); if (st.mode === 'ghl' && !st.picked && !st.search) $('fcQ')?.focus(); return; }
  if (act === 'fcmanual') { stop(); st.mode = 'manual'; paint(); D.onMode('manual'); return; }
  if (act === 'fccancel') { stop(); st.view = 'box'; paint(); $('fcQ')?.focus(); return; }
  if (act === 'fcretry') { startSearch(st.search?.query || st.query); return; }
  if (act === 'fcagain') { stop(); st.view = 'box'; paint(); const q = $('fcQ'); if (q) { q.focus(); q.select(); } D.onMode(st.mode); return; }
  if (act === 'fcback') { st.view = 'picked'; paint(); D.onMode(st.mode); return; }
  if (act === 'fcclear') { D.onClear(); st.picked = null; st.view = 'box'; paint(); D.onMode(st.mode); $('fcQ')?.focus(); return; }
  if (act === 'fcpick') {
    const x = st.results?.list?.[Number(el.dataset.i)]; if (!x) return;
    const s = FC.resultSummary(x);
    const values = FC.contactToForm(x);
    const count = D.onPick(values);
    st.picked = { id: x.id, label: [s.name, s.firm].filter(Boolean).join(' · ') || s.email || 'GHL contact', count };
    st.view = 'picked'; paint(); D.onMode(st.mode);
  }
}
export function onSubmit(e) { if (e.target?.id !== 'fcForm') return false; e.preventDefault(); startSearch($('fcQ')?.value); return true; }

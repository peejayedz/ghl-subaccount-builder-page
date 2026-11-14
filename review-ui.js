// Automation Review package on the builder record (Phase 4): the "Review" card.
//   Create review package (at setup or later) → Preview A (plan) / B (messages) → tailor after kickoff →
//   Publish (review-publish.yml: commit to automation-review, register, smoke test) → links A/B on the record.
//   Template resync and "Paste from GHL" update the PREVIEW only; Publish again sends the changes.
// Writes: the record and its preview file records/<id>/review-package/package.json (through app.js's guarded
// saveRecord / savePackage), and one review-publish.yml start. It never talks to GHL or to the Automation Review backend.
import * as R from './review.js';
import * as G from './review-ghl.js';
import { consoleScript, bookmarklet } from './ghl-copy.js';

export const PUBLISH_STEPS = [
  ['check', 'Checking the package', 'Valid, nothing to overwrite, no other package for this firm.'],
  ['commit', 'Committing the 3 files to automation-review', 'One commit.'],
  ['pages', 'Waiting for GitHub Pages', 'Usually 1–2 minutes.'],
  ['register', 'Registering the client in the backend', 'Adds one line to CLIENTS; nothing else changes.'],
  ['smoke', 'Smoke test', 'One Looks good + one change request as "LFMP smoke test", then deleted.'],
  ['save', 'Saving links A and B on the record']
];

let D = null;    // { gh, saveRecord, savePackage, getJSON, dispatch, record, esc, ICON, toast, copy, who, cfg, newRequestId, paintList, sleep, pollMs, detailsOpen, paintDetails }
export function initReview(deps) { D = deps; }
const live = {}; // record id -> { pkg, sha, loading, busy, steps, error, runUrl, existing, tplLatest, resync, paste, msg, preview }
export const liveOf = id => (live[id] ||= { steps: {} });
const AR = () => D.cfg.reviewRepo || 'peejayedz/automation-review';
// ?tpltest=1 (S4 only): read a TEST template from this page's own test-templates/ folder instead of automation-review.
// Same origin only, so a link can't point the builder at someone else's template. The card says so in red.
export const TEMPLATE_TEST = () => new URLSearchParams(location.search).get('tpltest') === '1';
const TPL_BASE = () => (TEMPLATE_TEST() ? `test-templates/${R.TEMPLATE_ID}/` : (D.cfg.reviewTemplateBase || `https://raw.githubusercontent.com/${AR()}/main/templates/${R.TEMPLATE_ID}/`)).replace(/\/?$/, '/');
const PAGES = () => (D.cfg.reviewPagesBase || R.REVIEW_BASE).replace(/\/?$/, '/');
const nowIso = () => new Date().toISOString();

// ---------------------------------------------------------------- loading
let tplP = null;
export function loadTemplate(force = false) {
  if (force) tplP = null;
  return tplP ||= Promise.all(R.TEMPLATE_FILES.map(f => fetch(`${TPL_BASE()}${f}.json?t=${Date.now()}`, { cache: 'no-store' }).then(r => { if (!r.ok) throw new Error(r.status === 404 ? 'The LeadPro standard template isn\'t in automation-review yet (it goes in once PJ approves it).' : `Couldn't load the template (${r.status}).`); return r.json(); })))
    .then(a => Object.fromEntries(R.TEMPLATE_FILES.map((f, i) => [f, a[i]])))
    .catch(e => { tplP = null; throw e; });
}
let existingP = null;
async function existingPackages() {
  return existingP ||= (async () => {
    const list = (await D.gh('GET', `/repos/${AR()}/contents/data?ref=main`, null, { allow404: true })) || [];
    const out = [];
    for (const f of list.filter(f => /^[a-z0-9-]+\.json$/.test(f.name) && !/\.(messages|plan)\.json$/.test(f.name))) {
      try { const j = JSON.parse(await D.gh('GET', `/repos/${AR()}/contents/data/${f.name}?ref=main`, null, { raw: true })); out.push({ code: f.name.replace(/\.json$/, ''), name: j.client?.name || '', hasPlan: list.some(x => x.name === f.name.replace(/\.json$/, '.plan.json')) }); } catch {}
    }
    return out;
  })().catch(e => { existingP = null; throw e; });
}
async function loadPkg(id) {
  const L = liveOf(id);
  const got = await D.getPackage(id);
  L.pkg = got?.pkg || null; L.sha = got?.sha || null;
  return L.pkg;
}
// Called when the card is drawn: loads the preview + the latest template version once.
export async function warm(id) {
  const L = liveOf(id), r = D.record(id);
  if (L.loading || L.warm) return;
  L.loading = true;
  try {
    if (r.review?.code && r.review.status !== 'linked') await loadPkg(id);
    try { const t = await loadTemplate(); L.tplLatest = t.template.version; if (L.pkg && R.semverNewer(t.template.version, L.pkg.template?.version || '0')) L.resync = R.templateResync(L.pkg, t, r); } catch (e) { L.tplError = e.message; }
    L.warm = true;
  } catch (e) { L.error = { message: e.message }; }
  finally { L.loading = false; paint(id); }
}

// ---------------------------------------------------------------- actions
async function create(id) {
  const L = liveOf(id); if (L.busy) return;
  L.busy = 'create'; L.error = null; paint(id);
  try {
    const r = D.record(id), who = D.who() || 'unknown';
    const [tpl, ex] = await Promise.all([loadTemplate(true), existingPackages()]);
    const twin = R.findExisting(r.businessName, ex);
    if (twin) { L.existing = twin; return; }                          // offer "Link existing package"
    const code = r.review?.code || R.makeCode(r.businessName);
    if (ex.some(x => x.code === code)) throw new Error(`The code ${code} is already used in automation-review. Press Create again for a new one.`);
    const pkg = R.generatePackage(tpl, r, { code, by: who });
    const problems = R.validatePackage(pkg);
    if (problems.length) throw new Error(`The new package didn't pass the checks: ${problems[0]}`);
    await savePkg(id, pkg, `${r.businessName}: review package preview created (${who})`);
    await D.saveRecord(id, x => { x.review = { status: 'preview', code, templateVersion: tpl.template.version, generatedAt: nowIso(), by: who, dirty: false }; x.reviewRequested = true; }, `${r.businessName}: review package preview (${who})`);
    L.tplLatest = tpl.template.version; L.resync = null; L.repaintAll = true;
    D.toast('Review package created (preview)');
  } catch (e) { L.error = { message: e.message }; }
  finally { L.busy = null; paint(id); D.paintList(); }
}
async function linkExisting(id) {
  const L = liveOf(id), r = D.record(id), who = D.who() || 'unknown', x = L.existing; if (!x || L.busy) return;
  L.busy = 'link'; paint(id);
  try {
    await D.saveRecord(id, rec => {
      rec.review = { status: 'linked', code: x.code, linkedAt: nowIso(), by: who, links: { plan: x.hasPlan ? R.planUrl(x.code) : `${R.REVIEW_BASE}?c=${x.code}`, messages: R.messagesUrl(x.code) } };
      rec.links = { ...(rec.links || {}), review: rec.review.links.plan, reviewMessages: rec.review.links.messages };
      rec.linkEdits = { ...(rec.linkEdits || {}), review: { by: who, at: nowIso(), auto: true }, reviewMessages: { by: who, at: nowIso(), auto: true } };
    }, `${r.businessName}: linked its existing review package ${x.code} (${who})`);
    L.existing = null; L.repaintAll = true; D.toast('Existing review package linked');
  } catch (e) { L.error = { message: e.message }; }
  finally { L.busy = null; paint(id); D.paintList(); }
}
async function savePkg(id, pkg, message) {
  const L = liveOf(id);
  const res = await D.savePackage(id, pkg, L.sha, message);
  L.pkg = pkg; L.sha = res?.content?.sha || null;
}
async function markChanged(id, message) {
  const r = D.record(id);
  if (r.review?.status === 'published' || r.review?.status === 'publish_failed') await D.saveRecord(id, x => { x.review = { ...(x.review || {}), dirty: !!x.review?.published, templateVersion: liveOf(id).pkg.template.version }; }, message);
  else await D.saveRecord(id, x => { x.review = { ...(x.review || {}), templateVersion: liveOf(id).pkg.template.version }; }, message);
}
// One preview change: run it, check it, save it (one commit), mark the record, re-run Compare so the lists update.
async function change(id, busy, fn, { log, commit, toast, after } = {}) {
  const L = liveOf(id), r = D.record(id), who = D.who() || 'unknown'; if (L.busy) return false;
  L.busy = busy; L.error = null; paint(id);
  try {
    let next = await fn(L.pkg, who);
    if (log) next = G.logChange(next, { by: who, ...log });
    const problems = R.validatePackage(next); if (problems.length) throw new Error(problems[0]);
    await savePkg(id, next, `${r.businessName}: ${commit} (${who})`);
    await markChanged(id, `${r.businessName}: review preview changed (${who})`);
    if (L.pasteRaw) { try { L.paste = G.ghlDiff(L.pkg, L.pasteRaw, r); } catch { L.paste = null; } }
    if (after) after();
    L.repaintAll = true; if (toast) D.toast(toast);
    return true;
  } catch (e) { L.error = { message: e.message }; return false; }
  finally { L.busy = null; paint(id); D.paintList(); }
}
async function saveEdit(id, msgId) {
  const k = msgId.replace(/[^a-z0-9]/gi, '_');
  const text = document.getElementById(`rvT-${k}`)?.value ?? '', subject = document.getElementById(`rvS-${k}`)?.value;
  if (!text.trim()) { D.toast('The wording can\'t be empty'); return; }
  await change(id, 'edit', pkg => R.editMessage(pkg, msgId, { text, subject }), { log: { reason: 'kickoff edit', message: msgId }, commit: `review wording changed (${msgId}) by ${D.who() || 'unknown'}`, toast: 'Wording saved in the preview', after: () => { liveOf(id).edit = null; } });
}
async function resync(id) {
  const L = liveOf(id); if (!L.resync) return;
  let res = null;
  await change(id, 'resync', async pkg => { const tpl = await loadTemplate(true); res = R.templateResync(pkg, tpl, D.record(id)); return res.pkg; },
    { log: { reason: 'template resync' }, commit: 'review preview resynced to the latest template', after: () => { L.resyncDone = res; L.resync = null; D.toast(`Resynced: ${res.messages} message${res.messages === 1 ? '' : 's'} updated in the preview`); } });
}
function comparePaste(id) {
  const L = liveOf(id), r = D.record(id);
  const raw = document.getElementById(`rvPaste-${id}`)?.value || '';
  try { L.paste = G.ghlDiff(L.pkg, raw, r); L.pasteRaw = raw; L.pasteError = null; }
  catch (e) { L.paste = null; L.pasteRaw = null; L.pasteError = e.message; }
  paint(id);
}
async function applyPaste(id) {
  const L = liveOf(id); if (!L.paste?.diffs.length) return;
  const n = L.paste.diffs.length;
  await change(id, 'apply', pkg => G.applyGhl(pkg, L.paste.diffs, safeLinks(L)), { log: { reason: 'GHL resync', messages: L.paste.diffs.map(d => d.id) }, commit: `review preview updated from GHL (${n} message${n === 1 ? '' : 's'})`, toast: `${n} change${n === 1 ? '' : 's'} from GHL applied to the preview` });
}
async function useGhl(id, i) {
  const L = liveOf(id), d = L.paste?.conflicts[i]; if (!d) return;
  await change(id, 'usegh', pkg => G.applyGhl(pkg, [d], L.paste.links.filter(l => l.id === d.id)), { log: { reason: 'GHL resync', messages: [d.id] }, commit: `review preview: GHL wording kept for ${d.id}`, toast: 'GHL wording used' });
}
async function keepBuilder(id, i) {
  const L = liveOf(id), d = L.paste?.conflicts[i]; if (!d) return;
  // keep the preview; remember what GHL says now, so it shows as "update GHL" from here on
  await change(id, 'keep', pkg => G.saveLinks(pkg, L.paste.links.filter(l => l.id === d.id)), { commit: `review preview: builder wording kept for ${d.id} (update GHL)`, toast: 'Kept: it\'s on the Before go-live in GHL list' });
}
// Links (and so "what GHL says now") for every matched message EXCEPT undecided conflicts: those wait for Use GHL / Keep.
const safeLinks = L => (L.paste?.links || []).filter(l => !(L.paste?.conflicts || []).some(c => c.id === l.id));
const findNew = (L, wid) => [...(L.paste?.newWorkflows.build || []), ...(L.paste?.newWorkflows.other || [])].find(w => (w.id || w.name) === wid);
const pasteWf = (L, wid) => L.paste?.paste.workflows.find(w => (w.id || w.name) === wid);
async function addWorkflows(id, wids) {
  const L = liveOf(id);
  const names = wids.map(w => findNew(L, w)?.name).filter(Boolean);
  await change(id, 'addwf', (pkg, who) => wids.reduce((p, w) => G.addWorkflow(G.saveLinks(p, safeLinks(L)), pasteWf(L, w), { by: who }).pkg, pkg),
    { commit: `review package: added ${names.map(n => `"${n}"`).join(', ')} from GHL`, toast: `Added ${names.length} automation${names.length === 1 ? '' : 's'}: write each summary under Tailor the wording, then Publish` });
}
async function addMsg(id, i) {
  const L = liveOf(id), nm = L.paste?.newMessages[i]; if (!nm) return;
  await change(id, 'addmsg', (pkg, who) => G.addMessage(G.saveLinks(pkg, safeLinks(L)), nm, { by: who }), { commit: `review package: new ${nm.kind.toLowerCase()} from GHL in ${nm.automationName}`, toast: 'Message added to the preview' });
}
// Before removing: the backend's public read of this client's responses (rows + content edits). Nothing is ever deleted there.
async function sheetResponses(id) {
  const r = D.record(id), code = r.review?.code;
  if (!r.review?.published) return { rows: [], content: [] };   // never published: nobody could have responded
  let url = D.cfg.reviewSaveUrl;
  if (!url) { const cfg = await fetch(`${PAGES()}config.js?t=${Date.now()}`, { cache: 'no-store' }).then(x => x.text()); url = (cfg.match(/saveUrl:\s*["']([^"']+)["']/) || [])[1]; }
  if (!url) throw new Error('Couldn\'t find the review backend to check for responses. Nothing was removed.');
  const j = await fetch(`${url}?client=${encodeURIComponent(code)}&t=${Date.now()}`, { cache: 'no-store' }).then(x => x.json()).catch(() => null);
  if (!j || !j.ok) throw new Error('Couldn\'t check the Sheet for responses right now. Nothing was removed; try again.');
  return { rows: j.rows || [], content: j.content || [] };
}
async function removeMsg(id, msgId) {
  await change(id, 'rmmsg', async (pkg, who) => { const s = await sheetResponses(id); const i = msgId.lastIndexOf('.'); return G.removeMessage(pkg, msgId, G.responsesFor(s, msgId.slice(0, i), msgId.slice(i + 1)), { by: who }); },
    { commit: `review package: removed ${msgId} (gone from GHL)`, toast: 'Message removed from the preview' });
}
async function removeWf(id, automation) {
  await change(id, 'rmwf', async (pkg, who) => G.removeAutomation(pkg, automation, G.responsesFor(await sheetResponses(id), automation), { by: who }),
    { commit: `review package: removed automation ${automation} (gone from GHL)`, toast: 'Automation removed from the preview' });
}
async function matchWf(id, automation) {
  const L = liveOf(id), wid = document.getElementById(`rvMatch-${automation}`)?.value; if (!wid) { D.toast('Pick the GHL workflow first'); return; }
  await change(id, 'match', pkg => G.matchWorkflow(pkg, automation, pasteWf(L, wid)), { commit: `review package: ${automation} matched to GHL "${pasteWf(L, wid)?.name}"`, toast: 'Matched' });
}
async function saveSummary(id, automation) {
  liveOf(id).newOpen = true;
  const text = document.getElementById(`rvSum-${automation}`)?.value || '';
  await change(id, 'summary', pkg => G.setSummary(pkg, automation, text), { log: { reason: 'new workflow', automation }, commit: `review summary for ${automation}`, toast: 'Summary saved' });
}
async function addQ(id, automation) {
  liveOf(id).newOpen = true;
  const v = k => document.getElementById(`rvQ${k}-${automation}`)?.value || '';
  await change(id, 'question', pkg => G.addQuestion(pkg, automation, { q: v('q'), why: v('w'), opts: v('o').split(',') }), { commit: `review question added for ${automation}`, toast: 'Question added' });
}

// Publish: starts review-publish.yml once (the button locks at the first click) and follows its run file.
export async function publish(id) {
  const L = liveOf(id); if (L.busy) return;
  L.busy = 'publish';                    // set before any await: a double click can't start a second run
  const r = D.record(id), who = D.who() || 'unknown';
  L.error = null; L.steps = {}; paint(id);
  try {
    if (!L.pkg) await loadPkg(id);
    const problems = R.validatePackage(L.pkg); if (problems.length) throw new Error(`Fix the preview first: ${problems[0]}`);
    const retry = r.review?.status === 'publish_failed' && r.review?.error?.requestId;
    const requestId = retry ? r.review.error.requestId : D.newRequestId();
    const t0 = await D.dispatch('review-publish.yml', { payload: JSON.stringify({ recordId: id, by: who }), request_id: requestId });
    await follow(id, requestId, t0);
  } catch (e) { L.error = { message: e.message }; }
  finally { L.busy = null; paint(id); D.paintList(); }
}
async function follow(id, requestId, t0) {
  const L = liveOf(id);
  for (;;) {
    await D.sleep(D.pollMs);
    const f = await D.getJSON(`runs/review-${requestId}.json`).catch(() => null);
    if (!f) { if (Date.now() - t0 > 3 * 60e3) throw new Error('GitHub didn\'t start the publish within 3 minutes. Press Publish again (it never publishes twice).'); continue; }
    L.steps = f.steps || {}; L.runFile = f; paint(id);
    if (f.status === 'done' || f.status === 'failed') {
      const rec = await D.getJSON(`records/${id}.json`); if (rec) D.setRecord(id, rec);
      await loadPkg(id).catch(() => {});
      if (f.status === 'failed') L.error = { message: f.error?.message || 'The publish stopped.', step: f.error?.step };
      else D.toast('Published — ready for Andy');
      L.repaintAll = true; return;
    }
    if (Date.now() - t0 > 35 * 60e3) throw new Error('The publish is taking longer than expected. Open it again later; it keeps going on GitHub.');
  }
}

// ---------------------------------------------------------------- preview A/B (the real pages, nothing saved)
// Fetches automation-review's plan.html / messages.html and shows them in a sandboxed frame, fed with this
// record's preview files. The pages' save URL is emptied, so the message page runs in "Preview only" mode.
export function previewDoc(html, { code, files, pagesBase, page }) {
  const params = `?c=${code}&demo`;
  const hits = html.split('new URLSearchParams(location.search)').length - 1;
  if (hits !== 1) throw new Error(`${page}.html has changed shape (client code lookup found ${hits} times). Preview can't be shown safely.`);
  const shim = `<base href="${pagesBase}"><script>(function(){var F=${JSON.stringify(files)};var of=window.fetch;
window.fetch=function(u,o){var s=String(u);for(var k in F){if(s.indexOf('data/'+k)!==-1)return Promise.resolve(new Response(F[k],{status:200,headers:{'Content-Type':'application/json'}}));}
if(/script\\.google/.test(s))return Promise.reject(new Error('preview: no saving'));return of.apply(this,arguments);};
window.REVIEW_CONFIG={saveUrl:""};
document.addEventListener('click',function(e){var a=e.target.closest&&e.target.closest('a[href]');if(!a)return;var h=a.getAttribute('href')||'';
if(/messages\\.html/.test(h)){e.preventDefault();parent.postMessage({rvNav:'B'},'*');}else if(/plan\\.html/.test(h)){e.preventDefault();parent.postMessage({rvNav:'A'},'*');}else if(!/^#/.test(h)){e.preventDefault();}},true);})();<\/script>`;
  return html.replace(/<head>/i, `<head>${shim}`)
    .replace('<script src="config.js"></script>', '<script>window.REVIEW_CONFIG={saveUrl:""};</script>')
    .replace('new URLSearchParams(location.search)', `new URLSearchParams(${JSON.stringify(params)})`);
}
const pageCache = {};
async function openPreview(id, which = 'A') {
  const L = liveOf(id), { esc, ICON } = D;
  if (!L.pkg) await loadPkg(id);
  const host = document.getElementById('rvOverlay') || document.body.appendChild(Object.assign(document.createElement('div'), { id: 'rvOverlay' }));
  const page = which === 'A' ? 'plan' : 'messages';
  host.innerHTML = `<div class="rvov" role="dialog" aria-modal="true" aria-label="Review package preview"><div class="rvbar">
      <b>Preview · ${esc(D.record(id).businessName)}</b><span class="chip info">Nothing is saved or sent</span>
      <div class="seg" role="tablist"><button type="button" role="tab" class="btn sm ${which === 'A' ? 'on' : ''}" aria-selected="${which === 'A'}" data-act="rvprevA" data-id="${esc(id)}">A · Plan</button><button type="button" role="tab" class="btn sm ${which === 'B' ? 'on' : ''}" aria-selected="${which === 'B'}" data-act="rvprevB" data-id="${esc(id)}">B · Messages</button></div>
      <button type="button" class="btn sm" data-act="rvprevclose" aria-label="Close preview">${ICON.cross}<span>Close</span></button></div>
      <div class="rvframe"><p class="hint" id="rvLoading">Loading ${page}.html…</p></div></div>`;
  host.querySelector('[data-act="rvprevclose"]').focus();
  try {
    const html = pageCache[page] ||= await fetch(`${PAGES()}${page}.html?t=${Date.now()}`, { cache: 'no-store' }).then(r => { if (!r.ok) throw new Error(`Couldn't load ${page}.html (${r.status}).`); return r.text(); });
    const files = R.packageFiles(L.pkg);
    const doc = previewDoc(html, { code: L.pkg.code, files: Object.fromEntries(Object.entries(files).map(([n, t]) => [n, t])), pagesBase: PAGES(), page });
    const fr = document.createElement('iframe');
    fr.setAttribute('sandbox', 'allow-scripts');
    fr.title = which === 'A' ? 'Plan page preview' : 'Messages page preview';
    fr.srcdoc = doc;
    host.querySelector('.rvframe').replaceChildren(fr);
  } catch (e) { host.querySelector('.rvframe').innerHTML = `<div class="errbox" role="alert">${esc(e.message)}</div>`; }
}
window.addEventListener('message', e => {
  const host = document.getElementById('rvOverlay'); if (!host?.firstChild || !e.data?.rvNav) return;
  const id = host.querySelector('[data-act="rvprevA"]')?.dataset.id; if (id) openPreview(id, e.data.rvNav);
});
document.addEventListener('keydown', e => { if (e.key === 'Escape' && document.getElementById('rvOverlay')?.firstChild) { document.getElementById('rvOverlay').innerHTML = ''; e.stopImmediatePropagation(); } }, true);

// ---------------------------------------------------------------- Compare results (three lists)
const trim = (t, n = 160) => { const s = String(t || '').replace(/\s+/g, ' ').trim(); return s.length > n ? `${s.slice(0, n)}…` : s; };
function diffLine(f, esc) {
  return `<p class="rvd"><span class="hint">${f.field === 'subject' ? 'Subject' : 'Text'}:</span> ${f.diff.map(x => x.op === '=' ? esc(x.text.length > 90 ? `${x.text.slice(0, 40)} … ${x.text.slice(-40)}` : x.text) : x.op === '+' ? `<ins>${esc(x.text)}</ins>` : `<del>${esc(x.text)}</del>`).join(' ')}</p>`;
}
const msgLi = (m, esc, extra = '') => `<li><div class="rvmh"><span class="kind">${esc(m.kind)}</span><span class="when">${esc(m.when || '')}</span>${extra}</div><p class="rvtext">${m.subject ? `<b>${esc(m.subject)}</b> · ` : ''}${esc(trim(m.text, 220))}</p></li>`;
function newWfHtml(w, esc, btn) {
  const key = w.id || w.name;
  return `<li class="rvnewwf"><div class="rvmh"><b>${esc(w.name)}</b><span class="chip ${w.status === 'Draft' ? 'warn' : 'info'}">${esc(w.status)}</span><span class="hint">${esc(w.folder || 'no folder')}</span></div>
    <p class="rvtext">Starts when: ${esc(w.triggers.join(' or ') || 'not set')} · ${esc(w.counts)}${w.unknown.length ? ` · <span class="warnword">to fill in: ${w.unknown.map(u => `[${esc(u)}]`).join(', ')}</span>` : ''}</p>
    <details><summary>Show the ${w.msgs.length} message${w.msgs.length === 1 ? '' : 's'}</summary><ul class="rvdiffs">${w.msgs.map(m => msgLi(m, esc)).join('')}</ul></details>
    <div class="btnrow">${btn('rvaddwf', 'Add to review package', D.ICON.plus, 'sm primary', ` data-w="${esc(key)}"`)}</div></li>`;
}
function pasteResultsHtml(r, L, btn) {
  const { esc, ICON } = D, P = L.paste;
  let h = P.warnings.map(w => `<div class="warnbox">${esc(w)}</div>`).join('');
  // 1. changed messages: who changed it decides what you can do
  const head = (d, extra = '') => `<div class="rvmh"><span class="kind">${esc(d.kind)}</span><span class="when">${esc(d.when)}</span><span class="mono hint">${esc(d.id)} · GHL "${esc(d.ghlStep)}"</span>${extra}</div>`;
  // builder → GHL direction: show what to type in GHL (GHL's words struck, the builder's added)
  const toGhl = f => ({ ...f, diff: R.wordDiff(f.ghl, f.preview) });
  h += `<h5 class="rvh">Changed messages</h5>`;
  h += `<p class="okline">${ICON.tick} ${P.matched.length} message${P.matched.length === 1 ? '' : 's'} match GHL.</p>`;
  if (P.diffs.length) h += `<p><b>Changed in GHL (${P.diffs.length})</b>: bring GHL's wording into the preview.</p><ul class="rvdiffs">${P.diffs.map(d => `<li>${head(d, '<span class="chip info">Changed in GHL</span>')}${d.fields.map(f => diffLine(f, esc)).join('')}</li>`).join('')}</ul>
      <div class="btnrow">${btn('rvapply', L.busy === 'apply' ? 'Applying…' : `Apply ${P.diffs.length} change${P.diffs.length === 1 ? '' : 's'} from GHL`, ICON.tick, 'primary')}</div>`;
  if (P.tailored.length) h += `<p><b>Tailored in builder, not in GHL yet (${P.tailored.length})</b>: update GHL to this wording. Nothing to apply here; it's on the "Before go-live in GHL" list.</p><ul class="rvdiffs">${P.tailored.map(d => `<li>${head(d, '<span class="chip warn">Update GHL</span>')}${d.fields.map(f => diffLine(toGhl(f), esc)).join('')}</li>`).join('')}</ul>`;
  if (P.conflicts.length) h += `<p><b>Changed in both (${P.conflicts.length})</b>: the builder and GHL each changed it. Pick one.</p><ul class="rvdiffs">${P.conflicts.map((d, i) => `<li>${head(d, '<span class="chip bad">Changed in both</span>')}${d.fields.map(f => diffLine(f, esc)).join('')}<div class="btnrow">${btn('rvusegh', 'Use GHL wording', ICON.tick, 'sm', ` data-i="${i}"`)}${btn('rvkeep', "Keep the builder's (update GHL)", ICON.pencil, 'sm', ` data-i="${i}"`)}</div></li>`).join('')}</ul>`;
  if (P.missing.length) h += `<p class="hint">${P.missing.length === 1 ? '1 automation wasn\'t' : `${P.missing.length} automations weren't`} found in GHL, so ${P.missing.length === 1 ? 'its messages weren\'t' : 'their messages weren\'t'} compared: see Removed / renamed below.</p>`;
  if (P.newMessages.length || P.removedMessages.length) {
    h += `<p class="hint">Inside the workflows already in the package:</p><ul class="rvdiffs">`
      + P.newMessages.map((m, i) => msgLi(m, esc, `<span class="chip info">New message</span><span class="hint">in ${esc(m.automationName)}</span>${btn('rvaddmsg', 'Add', D.ICON.plus, 'sm', ` data-i="${i}"`)}`)).join('')
      + P.removedMessages.map(m => msgLi(m, esc, `<span class="chip warn">Removed in GHL</span><span class="mono hint">${esc(m.id)}</span>${btn('rvrmmsg', 'Remove', D.ICON.cross, 'sm', ` data-m="${esc(m.id)}"`)}`)).join('') + '</ul>';
  }
  // 2. new in GHL
  const nb = P.newWorkflows.build, no = P.newWorkflows.other;
  h += `<h5 class="rvh">New in GHL <span class="hint">(${esc(P.buildFolders.join(', '))})</span></h5>`;
  h += nb.length ? `<ul class="rvwfs">${nb.map(w => newWfHtml(w, esc, btn)).join('')}</ul>${nb.length > 1 ? `<div class="btnrow">${btn('rvaddall', `Add all new (${nb.length})`, ICON.plus)}</div>` : ''}` : '<p class="hint">No new workflows in the build folder.</p>';
  if (no.length) h += `<label class="check"><input type="checkbox" data-act="rvothers" data-id="${esc(r.id)}"${L.showOthers ? ' checked' : ''}> Show other folders (${no.length})</label>${L.showOthers ? `<ul class="rvwfs">${no.map(w => newWfHtml(w, esc, btn)).join('')}</ul>` : ''}`;
  // 3. removed / renamed
  h += `<h5 class="rvh">Removed / renamed</h5>`;
  h += P.missing.length ? `<ul class="rvwfs">${P.missing.map(m => `<li><div class="rvmh"><b>${esc(m.name)}</b><span class="hint">was "${esc(m.ghl)}" in GHL · not in the paste</span></div>
      <div class="copyrow"><select id="rvMatch-${esc(m.automation)}" aria-label="Match ${esc(m.name)} to a GHL workflow"><option value="">Match to…</option>${m.candidates.map(c => `<option value="${esc(c.id || c.name)}">${esc(c.name)}${c.folder ? ` (${esc(c.folder)})` : ''}</option>`).join('')}</select>${btn('rvmatch', 'Match', ICON.tick, 'sm', ` data-a="${esc(m.automation)}"`)}${btn('rvrmwf', 'Remove from the package', ICON.cross, 'sm', ` data-a="${esc(m.automation)}"`)}</div>
      <p class="hint">Remove is refused if the client has already responded to it (responses are never deleted).</p></li>`).join('')}</ul>` : '<p class="hint">Every automation in the package is still in GHL.</p>';
  return h;
}

// ---------------------------------------------------------------- the card
export function reviewCardHtml(r) {
  const { esc, ICON } = D, L = liveOf(r.id), v = r.review || {}, s = R.reviewState(r, L.tplLatest);
  const noName = !(D.who() || '').trim();
  const btn = (act, label, icon, cls = '', extra = '') => `<button class="btn ${cls}" type="button" data-act="${act}" data-id="${esc(r.id)}"${extra}${L.busy || (noName && !act.startsWith('rvprev')) ? ' disabled' : ''}>${icon || ''}<span>${label}</span></button>`;
  const err = L.error ? `<div class="errbox" role="alert">${esc(L.error.message)}</div>` : (v.status === 'publish_failed' && v.error && !L.busy ? `<div class="errbox" role="alert">Publish stopped at <b>${esc(v.error.step)}</b>: ${esc(v.error.message)}</div>` : '');
  const linkRow = (label, url, what) => `<li><span class="lkname">${esc(label)}</span><a class="lkurl" href="${esc(url)}" target="_blank" rel="noopener" title="${esc(url)}">${esc(url.replace(/^https:\/\//, ''))}</a><span class="lkacts"><a class="btn sm" href="${esc(url)}" target="_blank" rel="noopener" aria-label="Open ${esc(what)}">${ICON.ext}<span>Open</span></a><button class="btn sm" type="button" data-act="copytext" data-text="${esc(url)}" data-what="${esc(what)}" aria-label="Copy ${esc(what)}">${ICON.copy}<span>Copy</span></button></span></li>`;
  const links = v.links ? `<ul class="linklist rvlinks">${linkRow('A · Plan page (send this)', v.links.plan, 'Review link A')}${linkRow('B · Messages only (re-reviews)', v.links.messages, 'Review link B')}</ul>` : '';
  const pubSteps = (L.busy === 'publish' || (Object.keys(L.steps).length && v.status !== 'published')) ? `<ol class="steps kpisteps" aria-label="Publish progress">${PUBLISH_STEPS.map(([k, t, d]) => { const x = L.steps[k] || { state: 'pending' }; const st = x.state === 'run' ? 'run' : x.state; return `<li class="step ${st}" data-k="${k}"><span class="ic" aria-hidden="true">${st === 'ok' ? ICON.tick : st === 'fail' ? ICON.cross : ''}</span><span class="t">${esc(t)}</span><span class="d">${esc(x.detail || (st === 'pending' || st === 'run' ? d || '' : ''))}</span></li>`; }).join('')}</ol>` : '';
  let body = '', actions = '';
  if (L.busy === 'publish' && !Object.keys(L.steps).length) body += '<p class="hint">Starting the publish on GitHub (10–60 seconds)…</p>';
  if (L.existing) {
    body += `<div class="warnbox">${esc(r.businessName)} already has a review package in automation-review: <span class="mono">${esc(L.existing.code)}</span> (${esc(L.existing.name)}). The builder links it and never recreates or overwrites it.</div>`;
    actions = btn('rvlink', 'Link existing package', ICON.review, 'primary');
  } else if (!v.status || v.status === 'none') {
    body += `<p class="hint">${r.reviewRequested ? 'Requested at setup. ' : ''}Makes the LeadPro standard review package (plan + messages) from the template as a <b>preview</b> kept with this record. Nothing goes to automation-review until you press Publish.</p>`;
    actions = r.status === 'ready' ? btn('rvcreate', L.busy === 'create' ? 'Creating…' : 'Create review package', ICON.plus, r.reviewRequested ? 'primary' : '') : '<p class="hint">Available once the snapshot has loaded.</p>';
  } else if (v.status === 'linked') {
    body += `<p class="hint">Linked to the existing package <span class="mono">${esc(v.code)}</span> (managed in automation-review). The builder doesn't change it.</p>${links}`;
  } else {
    const pkg = L.pkg, problems = pkg ? R.validatePackage(pkg) : [];
    const msgs = pkg ? R.allMessages(pkg) : [];
    body += `<p class="kv1"><span>Code <span class="mono">${esc(v.code)}</span></span><span>Template ${esc(pkg?.template?.version || v.templateVersion || '')}</span>${pkg ? `<span>${msgs.length} messages · ${pkg.files.messages.questions.length} open items</span><span>Status: ${esc(pkg.status)}</span>` : ''}</p>`;
    if (!pkg && L.loading) body += '<p class="hint">Loading the preview…</p>';
    if (problems.length) body += `<div class="errbox">The preview doesn't pass the checks yet: ${esc(problems[0])}</div>`;
    if (L.resync) body += `<div class="warnbox rvupdate"><b>Template updated (${esc(pkg.template.version)} → ${esc(L.tplLatest)}): ${L.resync.messages} message${L.resync.messages === 1 ? '' : 's'} changed.</b>
        ${L.resync.changed.length ? `<ul>${L.resync.changed.map(c => `<li>${esc(c.name)}: ${c.messages} message${c.messages === 1 ? '' : 's'}${c.to !== c.from ? ` · version ${esc(c.from)} → ${esc(c.to)} (new review round)` : ''}</li>`).join('')}</ul>` : ''}
        ${L.resync.customised.length ? `<p>Not changed (tailored for this client): ${L.resync.customised.map(c => esc(c.name)).join(', ')}.</p>` : ''}
        <div class="btnrow">${btn('rvresync', L.busy === 'resync' ? 'Resyncing…' : 'Resync the preview', ICON.sync, 'primary')}</div></div>`;
    if (L.resyncDone) body += `<p class="hint">Resynced: ${L.resyncDone.changed.map(c => esc(c.name)).join(', ') || 'nothing to change'}${L.resyncDone.customised.length ? `; left alone (tailored): ${L.resyncDone.customised.map(c => esc(c.name)).join(', ')}` : ''}.</p>`;
    if (v.status === 'published') body += `<p class="pubstate">${ICON.tick}<span><b>${esc(R.PUBLISHED_STATUS)}</b> · ${esc(v.published?.at ? new Date(v.published.at).toLocaleString() : '')}${v.dirty ? ' · <span class="warnword">the preview has changes that aren\'t published yet</span>' : ''}</span></p>${links}`;
    if (pkg) {
      body += `<div class="btnrow left">${btn('rvprevA', 'Preview A · Plan', ICON.eye)}${btn('rvprevB', 'Preview B · Messages', ICON.eye)}</div>`;
      body += `<details class="rvsub" ${L.edit ? 'open' : ''}><summary>Tailor the wording (after the kickoff call)</summary><p class="hint">Changes the preview only. A changed automation is marked "customised", so template updates leave it alone.</p><ol class="rvmsgs">${msgs.map(m => {
        const k = m.id.replace(/[^a-z0-9]/gi, '_'), open = L.edit === m.id;
        const cur = m.kind === 'Alert' ? m.text.replace(/^Everyone on your team gets this text:\s*/, '') : m.text;
        return `<li><div class="rvmh"><span class="kind">${esc(m.kind)}</span><span class="when">${esc(m.when)}</span><span class="mono hint">${esc(m.id)}</span>${open ? '' : `<button class="btn sm" type="button" data-act="rvedit" data-id="${esc(r.id)}" data-m="${esc(m.id)}"${L.busy ? ' disabled' : ''}>${ICON.pencil}<span>Edit</span></button>`}</div>
          ${open ? `${m.kind === 'Email' ? `<label class="f">Subject<input id="rvS-${k}" value="${esc(m.subject)}"></label>` : ''}<label class="f">${m.kind === 'Alert' ? 'Alert text' : 'Wording'}<textarea id="rvT-${k}" rows="${Math.min(14, 3 + cur.split('\n').length)}">${esc(cur)}</textarea></label>
            <div class="btnrow"><button class="btn primary sm" type="button" data-act="rveditsave" data-id="${esc(r.id)}" data-m="${esc(m.id)}"${L.busy ? ' disabled' : ''}>Save wording</button><button class="btn sm" type="button" data-act="rveditcancel" data-id="${esc(r.id)}">Cancel</button></div>`
            : `<p class="rvtext">${m.subject ? `<b>${esc(m.subject)}</b> · ` : ''}${esc(cur.length > 140 ? `${cur.slice(0, 140)}…` : cur)}</p>`}</li>`;
      }).join('')}</ol></details>`;
      // New automations (added from GHL): summary + questions before Publish
      const customs = pkg.files.data.automations.filter(a => a.source === 'custom');
      if (customs.length) body += `<details class="rvsub" ${L.newOpen || customs.some(a => String(a.summary).endsWith(G.SUMMARY_PLACEHOLDER)) ? 'open' : ''}><summary>New automations from GHL (${customs.length})</summary>${customs.map(a => {
        const ph = String(a.summary).endsWith(G.SUMMARY_PLACEHOLDER), qs = pkg.files.messages.questions.filter(q => q.id.startsWith(`${a.id}-q`));
        return `<div class="rvnew"><div class="rvmh"><b>${esc(a.name)}</b><span class="chip ${ph ? 'warn' : 'good'}">${ph ? 'Summary needed' : 'Summary written'}</span><span class="mono hint">${esc(a.id)} · v${esc(a.version)}</span></div>
          <label class="f">Summary (what it does, one or two sentences; shown to the client)<textarea id="rvSum-${esc(a.id)}" rows="2" placeholder="${esc(`${a.name}: when … the lead gets …`)}">${ph ? '' : esc(a.summary)}</textarea></label>
          <div class="btnrow">${btn('rvsummary', 'Save summary', ICON.tick, ph ? 'primary sm' : 'sm', ` data-a="${esc(a.id)}"`)}</div>
          ${qs.length ? `<ul class="rvqs">${qs.map(q => `<li><span class="hint">Question for the client:</span> ${esc(q.q)}${q.opts.length ? ` <span class="hint">(${q.opts.map(esc).join(' / ')})</span>` : ''}</li>`).join('')}</ul>` : ''}
          <details class="rvq"><summary>Add a question for the client</summary><label class="f">Question<input id="rvQq-${esc(a.id)}"></label><label class="f">Why we ask <span class="hint">(optional)</span><input id="rvQw-${esc(a.id)}"></label><label class="f">Options, comma-separated <span class="hint">(leave empty for a typed answer)</span><input id="rvQo-${esc(a.id)}" placeholder="Yes, No"></label><div class="btnrow">${btn('rvaddq', 'Add question', ICON.plus, 'sm', ` data-a="${esc(a.id)}"`)}</div></details></div>`;
      }).join('')}</details>`;
      const P = L.paste;
      body += `<details class="rvsub" ${P || L.pasteError || L.pasteOpen ? 'open' : ''}><summary>Paste from GHL (resync with the client's workflows)</summary>
        <ol class="clicks"><li>In GHL, open <b>${esc(r.businessName)}</b> (any page inside the sub-account).</li><li>Run <b>Copy workflows</b>: drag this to your bookmarks bar and click it there → <a class="btn sm bm" href="${esc(bookmarklet())}" draggable="true" onclick="return false" title="Drag me to the bookmarks bar">${ICON.copy}<span>Copy workflows</span></a>, or ${btn('rvcopyscript', 'Copy the console script', ICON.copy, 'sm')} and paste it in the browser console on the GHL tab.</li><li>It copies the workflows (read-only; nothing in GHL changes, no tokens). Paste below and press Compare.</li></ol>
        <label class="f">Workflows from GHL<textarea id="rvPaste-${esc(r.id)}" rows="3" spellcheck="false" placeholder='{"kind":"lfmp-ghl-workflows", …}'></textarea></label>
        <div class="btnrow">${btn('rvcompare', 'Compare with the preview', ICON.sync)}</div>
        ${L.pasteError ? `<div class="errbox" role="alert">${esc(L.pasteError)}</div>` : ''}
        ${P ? pasteResultsHtml(r, L, btn) : ''}</details>`;
      const todos = G.ghlTodos(pkg), golive = [...todos.map(t => t.text), ...(pkg.checklist || []).map(c => c.text)];
      if (golive.length) body += `<details class="rvsub"${todos.length ? ' open' : ''}><summary>Before go-live in GHL (${golive.length}${todos.length ? ` · ${todos.length} to update in GHL` : ''})</summary><ul class="checklist">${golive.map(t => `<li${t.startsWith('Update GHL:') ? ' class="todo"' : ''}>${esc(t)}</li>`).join('')}</ul></details>`;
      const hist = v.history || [];
      if (hist.length) body += `<details class="rvsub"><summary>History (${hist.length})</summary><ol class="rvhist">${hist.map(h => `<li><div class="rvmh"><b>${esc(new Date(h.at).toLocaleString())}</b><span>${esc(h.by || '')}</span><span class="hint">${esc((h.reasons || []).join(' · '))}</span></div>${h.total != null && !h.messages?.length ? `<p class="hint">First publish: ${h.total} messages sent for review.</p>` : h.messages?.length ? `<ul>${h.messages.map(m => `<li><span class="mono hint">${esc(m.id)}</span> ${m.change === 'changed' ? `<del>${esc(trim(m.old))}</del> → <ins>${esc(trim(m.new))}</ins>` : m.change === 'added' ? `<ins>added</ins> ${esc(trim(m.new))}` : `<del>removed</del> ${esc(trim(m.old))}`}</li>`).join('')}</ul>` : '<p class="hint">No message changes.</p>'}</li>`).join('')}</ol></details>`;
      const blockers = G.publishBlockers(pkg);
      if (blockers.length) body += `<div class="warnbox">${blockers.map(esc).join('<br>')}</div>`;
      const canPublish = !problems.length && !blockers.length && (v.status !== 'published' || v.dirty) && !TEMPLATE_TEST();
      const label = L.busy === 'publish' ? 'Publishing…' : v.status === 'publish_failed' ? 'Retry publish' : v.status === 'published' ? 'Publish changes' : 'Publish';
      if (v.status !== 'published' || v.dirty || L.busy === 'publish') actions = btn('rvpublish', label, ICON.ext, 'primary', canPublish ? '' : ' disabled');
      if (v.status !== 'published') body += '<p class="hint">Publish = ready for Andy to send: commits the 3 files to automation-review, registers the client, runs a smoke test, then saves links A and B here.</p>';
    }
  }
  if (noName) body = `<div class="warnbox rvwho"><label class="f">Your name (saved in this browser, so each change shows who made it)<span class="copyrow"><input id="rvWho-${esc(r.id)}" autocomplete="name" placeholder="e.g. PJ"><button class="btn primary sm" type="button" data-act="rvwho" data-id="${esc(r.id)}">Save name</button></span></label></div>${body}`;
  if (TEMPLATE_TEST()) body = `<div class="errbox"><b>Test template mode</b> (?tpltest=1): template updates here come from the builder's test-templates folder, not automation-review. Don't publish in this mode.</div>${body}`;
  return `<section class="panel rvcard" data-review="${esc(r.id)}" aria-live="polite">
    <div class="kpihead"><h4>Automation review</h4><span class="chip ${s.tone}" data-chip="reviewstate"><span class="dot"></span>${esc(s.label)}</span>${L.busy === 'publish' ? '<span class="hint">You can leave this page; GitHub keeps going.</span>' : ''}</div>
    ${body}${pubSteps}${err}${actions ? `<div class="btnrow">${actions}</div>` : ''}</section>`;
}
export function paint(id) {
  const r = D.record(id); if (!r) return;
  if (D.detailsOpen?.() === id && liveOf(id).repaintAll) { liveOf(id).repaintAll = false; D.paintDetails(); return; }
  for (const el of document.querySelectorAll(`[data-review="${CSS.escape(id)}"]`)) {
    const keep = {}; el.querySelectorAll('textarea[id],input[id]').forEach(i => { keep[i.id] = i.value; });
    const openD = [...el.querySelectorAll('details')].map(d => d.open);
    el.outerHTML = reviewCardHtml(r);
    const fresh = document.querySelector(`[data-review="${CSS.escape(id)}"]`);
    Object.entries(keep).forEach(([k, v]) => { const i = document.getElementById(k); if (i) i.value = v; });
    fresh?.querySelectorAll('details').forEach((d, i) => { if (openD[i]) d.open = true; });
  }
  if (!liveOf(id).warm) warm(id);
}
export function onReviewAct(act, el) {
  if (act === 'rvprevclose') { const o = document.getElementById('rvOverlay'); if (o) o.innerHTML = ''; return true; }
  const id = el.dataset.id, L = liveOf(id); if (!D.record(id)) return false;
  const map = {
    rvcreate: () => create(id), rvlink: () => linkExisting(id), rvpublish: () => publish(id), rvresync: () => resync(id),
    rvprevA: () => openPreview(id, 'A'), rvprevB: () => openPreview(id, 'B'), rvprevclose: () => { document.getElementById('rvOverlay').innerHTML = ''; },
    rvedit: () => { L.edit = el.dataset.m; paint(id); document.getElementById(`rvT-${el.dataset.m.replace(/[^a-z0-9]/gi, '_')}`)?.focus(); },
    rveditcancel: () => { L.edit = null; paint(id); }, rveditsave: () => saveEdit(id, el.dataset.m),
    rvwho: () => { const v = (document.getElementById(`rvWho-${id}`)?.value || '').trim(); if (!v) { D.toast('Type your name first'); return; } D.setWho(v); D.toast(`Saved: ${v}`); paint(id); },
    rvcopyscript: () => D.copy(consoleScript(), 'Copy-workflows script'), rvcompare: () => comparePaste(id), rvapply: () => applyPaste(id),
    rvusegh: () => useGhl(id, Number(el.dataset.i)), rvkeep: () => keepBuilder(id, Number(el.dataset.i)),
    rvaddwf: () => addWorkflows(id, [el.dataset.w]), rvaddall: () => addWorkflows(id, L.paste.newWorkflows.build.map(w => w.id || w.name)),
    rvaddmsg: () => addMsg(id, Number(el.dataset.i)), rvrmmsg: () => removeMsg(id, el.dataset.m), rvrmwf: () => removeWf(id, el.dataset.a), rvmatch: () => matchWf(id, el.dataset.a),
    rvothers: () => { L.showOthers = el.checked; paint(id); }, rvsummary: () => saveSummary(id, el.dataset.a), rvaddq: () => addQ(id, el.dataset.a)
  };
  if (!map[act]) return false;
  map[act](); return true;
}
// Auto-create at setup ("Set up automation review page" ticked): after create + snapshot load.
export function autoCreate(id) { const r = D.record(id); if (r?.reviewRequested && r.status === 'ready' && !r.review?.status) create(id); }

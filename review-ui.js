// Automation Review package on the builder record (Phase 4): the "Review" card.
//   Create review package (at setup or later) → Preview A (plan) / B (messages) → tailor after kickoff →
//   Publish (review-publish.yml: commit to automation-review, register, smoke test) → links A/B on the record.
//   Template resync and "Paste from GHL" update the PREVIEW only; Publish again sends the changes.
// Writes: the record and its preview file records/<id>/review-package/package.json (through app.js's guarded
// saveRecord / savePackage), and one review-publish.yml start. It never talks to GHL or to the Automation Review backend.
import * as R from './review.js';
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
const TPL_BASE = () => (D.cfg.reviewTemplateBase || `https://raw.githubusercontent.com/${AR()}/main/templates/${R.TEMPLATE_ID}/`).replace(/\/?$/, '/');
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
async function saveEdit(id, msgId) {
  const L = liveOf(id), who = D.who() || 'unknown'; if (L.busy) return;
  const k = msgId.replace(/[^a-z0-9]/gi, '_');
  const text = document.getElementById(`rvT-${k}`)?.value ?? '', subject = document.getElementById(`rvS-${k}`)?.value;
  if (!text.trim()) { D.toast('The wording can\'t be empty'); return; }
  L.busy = 'edit'; paint(id);
  try {
    const next = R.editMessage(L.pkg, msgId, { text, subject });
    const problems = R.validatePackage(next); if (problems.length) throw new Error(problems[0]);
    await savePkg(id, next, `${D.record(id).businessName}: review wording changed (${msgId}) by ${who}`);
    await markChanged(id, `${D.record(id).businessName}: review preview edited by ${who}`);
    L.edit = null; L.repaintAll = true; D.toast('Wording saved in the preview');
  } catch (e) { L.error = { message: e.message }; }
  finally { L.busy = null; paint(id); }
}
async function resync(id) {
  const L = liveOf(id), r = D.record(id), who = D.who() || 'unknown'; if (L.busy || !L.resync) return;
  L.busy = 'resync'; paint(id);
  try {
    const tpl = await loadTemplate(true);
    const res = R.templateResync(L.pkg, tpl, r);
    const problems = R.validatePackage(res.pkg); if (problems.length) throw new Error(problems[0]);
    await savePkg(id, res.pkg, `${r.businessName}: review preview resynced to template ${tpl.template.version} (${who})`);
    await markChanged(id, `${r.businessName}: review template ${tpl.template.version} (${who})`);
    L.resyncDone = res; L.resync = null; L.repaintAll = true;
    D.toast(`Resynced: ${res.messages} message${res.messages === 1 ? '' : 's'} updated in the preview`);
  } catch (e) { L.error = { message: e.message }; }
  finally { L.busy = null; paint(id); D.paintList(); }
}
function comparePaste(id) {
  const L = liveOf(id), r = D.record(id);
  try { L.paste = R.ghlDiff(L.pkg, document.getElementById(`rvPaste-${id}`)?.value || '', r); L.pasteError = null; }
  catch (e) { L.paste = null; L.pasteError = e.message; }
  paint(id);
}
async function applyPaste(id) {
  const L = liveOf(id), r = D.record(id), who = D.who() || 'unknown'; if (L.busy || !L.paste?.diffs.length) return;
  L.busy = 'apply'; paint(id);
  try {
    const next = R.applyGhl(L.pkg, L.paste.diffs);
    const problems = R.validatePackage(next); if (problems.length) throw new Error(problems[0]);
    await savePkg(id, next, `${r.businessName}: review preview updated from GHL (${L.paste.diffs.length} message${L.paste.diffs.length === 1 ? '' : 's'}, ${who})`);
    await markChanged(id, `${r.businessName}: review preview updated from GHL (${who})`);
    D.toast(`${L.paste.diffs.length} change${L.paste.diffs.length === 1 ? '' : 's'} from GHL applied to the preview`);
    L.paste = null; L.repaintAll = true;
  } catch (e) { L.error = { message: e.message }; }
  finally { L.busy = null; paint(id); }
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

// ---------------------------------------------------------------- the card
export function reviewCardHtml(r) {
  const { esc, ICON } = D, L = liveOf(r.id), v = r.review || {}, s = R.reviewState(r, L.tplLatest);
  const btn = (act, label, icon, cls = '', extra = '') => `<button class="btn ${cls}" type="button" data-act="${act}" data-id="${esc(r.id)}"${extra}${L.busy ? ' disabled' : ''}>${icon || ''}<span>${label}</span></button>`;
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
      const P = L.paste;
      body += `<details class="rvsub" ${P || L.pasteError || L.pasteOpen ? 'open' : ''}><summary>Paste from GHL (resync with the client's workflows)</summary>
        <ol class="clicks"><li>In GHL, open <b>${esc(r.businessName)}</b> (any page inside the sub-account).</li><li>Run <b>Copy workflows</b>: drag this to your bookmarks bar and click it there → <a class="btn sm bm" href="${esc(bookmarklet())}" draggable="true" onclick="return false" title="Drag me to the bookmarks bar">${ICON.copy}<span>Copy workflows</span></a>, or ${btn('rvcopyscript', 'Copy the console script', ICON.copy, 'sm')} and paste it in the browser console on the GHL tab.</li><li>It copies the workflows (read-only; nothing in GHL changes, no tokens). Paste below and press Compare.</li></ol>
        <label class="f">Workflows from GHL<textarea id="rvPaste-${esc(r.id)}" rows="3" spellcheck="false" placeholder='{"kind":"lfmp-ghl-workflows", …}'></textarea></label>
        <div class="btnrow">${btn('rvcompare', 'Compare with the preview', ICON.sync)}</div>
        ${L.pasteError ? `<div class="errbox" role="alert">${esc(L.pasteError)}</div>` : ''}
        ${P ? `${P.warnings.map(w => `<div class="warnbox">${esc(w)}</div>`).join('')}
          ${P.diffs.length ? `<p><b>${P.diffs.length} message${P.diffs.length === 1 ? ' differs' : 's differ'} from GHL</b> (${P.matched.length} match).</p><ul class="rvdiffs">${P.diffs.map(d => `<li><div class="rvmh"><span class="kind">${esc(d.kind)}</span><span class="when">${esc(d.when)}</span><span class="mono hint">${esc(d.id)} · GHL "${esc(d.ghlStep)}"</span></div>${d.fields.map(f => `<p class="rvd"><span class="hint">${f.field === 'subject' ? 'Subject' : 'Text'}:</span> ${f.diff.map(x => x.op === '=' ? esc(x.text.length > 90 ? `${x.text.slice(0, 40)} … ${x.text.slice(-40)}` : x.text) : x.op === '+' ? `<ins>${esc(x.text)}</ins>` : `<del>${esc(x.text)}</del>`).join(' ')}</p>`).join('')}</li>`).join('')}</ul>
            <div class="btnrow">${btn('rvapply', L.busy === 'apply' ? 'Applying…' : `Apply ${P.diffs.length} change${P.diffs.length === 1 ? '' : 's'} to the preview`, ICON.tick, 'primary')}</div>` : (P.warnings.length ? '' : `<p class="okline">${ICON.tick} All ${P.matched.length} messages match GHL.</p>`)}` : ''}</details>`;
      if (pkg.checklist?.length) body += `<details class="rvsub"><summary>Before go-live in GHL (${pkg.checklist.length})</summary><ul class="checklist">${pkg.checklist.map(c => `<li>${esc(c.text)}</li>`).join('')}</ul></details>`;
      const canPublish = !problems.length && (v.status !== 'published' || v.dirty);
      const label = L.busy === 'publish' ? 'Publishing…' : v.status === 'publish_failed' ? 'Retry publish' : v.status === 'published' ? 'Publish changes' : 'Publish';
      if (v.status !== 'published' || v.dirty || L.busy === 'publish') actions = btn('rvpublish', label, ICON.ext, 'primary', canPublish ? '' : ' disabled');
      if (v.status !== 'published') body += '<p class="hint">Publish = ready for Andy to send: commits the 3 files to automation-review, registers the client, runs a smoke test, then saves links A and B here.</p>';
    }
  }
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
    rvcopyscript: () => D.copy(consoleScript(), 'Copy-workflows script'), rvcompare: () => comparePaste(id), rvapply: () => applyPaste(id)
  };
  if (!map[act]) return false;
  map[act](); return true;
}
// Auto-create at setup ("Set up automation review page" ticked): after create + snapshot load.
export function autoCreate(id) { const r = D.record(id); if (r?.reviewRequested && r.status === 'ready' && !r.review?.status) create(id); }

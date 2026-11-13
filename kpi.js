// KPI dashboard setup from the builder (Phase 2, Part B).
// After a sub-account is created (or from the record's button), this:
//   1. checks the LeadPro KPI firm list (never two firms for one location),
//   2. makes the dashboard passphrase IN THIS BROWSER, shows it once, and seals it into the KPI repo's
//      PASSPHRASE_<KEY> secret (libsodium, same as the KPI admin page),
//   3. starts leadpro-kpi's new-firm.yml with non-secret inputs and follows its jobs,
//   4. saves the KPI link on the record (Links row → KPI).
// The only writes: the PASSPHRASE_<KEY> secret and the new-firm.yml dispatch in the KPI repo (guarded
// below; tests/unit/safety.test.mjs checks it), and the client record (through app.js's saveRecord).
// It never talks to GHL. The passphrase lives in memory only and is never saved by the page.

export const KPI_PAGES = 'https://peejayedz.github.io/leadpro-kpi/';
export const slugify = name => String(name || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48).replace(/-+$/, '');
export const secretKeyFor = slug => slug.toUpperCase().replace(/-/g, '_');
export const dashUrl = slug => `${KPI_PAGES}firms/${slug}/`;
export const ghlLink = (slug, pass) => `${dashUrl(slug)}#k=${encodeURIComponent(pass)}`;
const RESERVED = ['admin', 'app', 'scripts'];
const WORDS = 'acorn amber anchor apple arrow aspen autumn badge bamboo banjo barley basil beacon berry birch blossom bonfire breeze brook cactus candle canyon carbon cedar cherry cinder citrus clover cobalt comet copper coral cotton crater cricket crystal daisy delta desert dolphin dragon ember falcon fern fiddle flint forest fossil galaxy garnet ginger glacier granite harbor hazel heron hickory honey horizon indigo island ivory jasmine juniper kettle kiwi lagoon lantern lemon lilac linen lotus maple marble meadow mesa mint monarch mosaic nectar nickel nutmeg oasis ocean olive onyx orbit orchid otter paddle pebble pepper pine planet plum polar poppy prairie quartz quill raven reef ribbon river robin saffron sage salmon sapphire sequoia shadow silver sparrow spruce summit sunset thistle thunder timber topaz tulip tundra valley velvet violet walnut willow winter yarrow zephyr'.split(' ');
export function makePassphrase(rand = () => crypto.getRandomValues(new Uint32Array(1))[0]) {
  const out = [], lim = Math.floor(2 ** 32 / WORDS.length) * WORDS.length;
  while (out.length < 4) { const r = rand(); if (r < lim) { const w = WORDS[r % WORDS.length]; if (!out.includes(w)) out.push(w); } }
  return out.join('-');
}
// A slug no other firm uses ("zz-test-2", then "zz-test-2-2", …). taken(slug) → true when it can't be used.
export async function chooseSlug(name, taken) {
  const base = slugify(name) || 'firm';
  for (let n = 1; n < 50; n++) {
    const s = n === 1 ? base : `${base.slice(0, 45)}-${n}`;
    if (!RESERVED.includes(s) && !(await taken(s))) return s;
  }
  throw new Error('Couldn\'t find a free dashboard name.');
}

// Plain-language steps. GitHub jobs → steps: prepare→app, token→token, setup→setup, first-sync→sync, menu-link→menu.
export const KPI_STEPS = [
  ['check', 'Checking the KPI firm list'],
  ['pass', 'Making the dashboard passphrase'],
  ['start', 'Starting the setup on GitHub', 'GitHub usually starts in 10–60 seconds.'],
  ['app', 'Waiting for the LeadPro Connector app', 'GHL adds the app to a new sub-account by itself, usually within a few minutes.'],
  ['token', 'Getting the firm\'s GHL token'],
  ['setup', 'Reading GHL and setting up the dashboard'],
  ['sync', 'First sync', 'Pulls the numbers from GHL (a new sub-account shows zeros).'],
  ['menu', 'GHL menu link'],
  ['save', 'Saving the KPI link on the record'],
];
const JOB_STEP = { prepare: 'app', token: 'token', setup: 'setup', 'first-sync': 'sync', 'menu-link': 'menu' };
export const STEP_ERRORS = {
  'Check the firm list': 'The KPI setup refused this firm: the dashboard name or the location is already used by another firm. Check the KPI admin page, then Retry.',
  'Check the passphrase was saved': 'The dashboard passphrase didn\'t reach GitHub. Retry.',
  'Wait for the app on the sub-account': 'The LeadPro Connector app didn\'t show up on this sub-account within 15 minutes, or the app\'s agency token had expired. In GHL (agency view) → Marketplace → LFMP LeadPro Connector, check it\'s installed on all sub-accounts, and check the KPI admin page\'s bell for token keeper issues. Then Retry.',
  'Get the firm\'s GHL token': 'GitHub couldn\'t get a GHL token for this sub-account from the app. Check the KPI admin page\'s bell (token keeper), then Retry.',
  'Read the sub-account\'s pipelines and stages': 'GitHub couldn\'t read this sub-account\'s pipelines from GHL. Retry in a few minutes.',
  'Set up the dashboard': 'GitHub couldn\'t set up the dashboard files. Retry.',
  'Save the firm': 'GitHub couldn\'t save the new dashboard to the KPI repo. Retry.',
  'First sync': 'The dashboard was created, but its first sync failed. Retry, or press Re-sync for this firm on the KPI admin page.',
};
export function errorFor(jobs) {
  const job = (jobs || []).find(j => j.conclusion === 'failure' || j.conclusion === 'cancelled' || j.conclusion === 'timed_out');
  if (!job) return null;
  if (job.conclusion === 'cancelled') return { step: JOB_STEP[job.name] || 'start', message: 'GitHub cancelled the setup. Retry is safe: it never creates the firm twice.' };
  const st = (job.steps || []).find(s => s.conclusion === 'failure');
  return { step: JOB_STEP[job.name] || 'start', message: STEP_ERRORS[st?.name] || `The setup stopped at "${st?.name || job.name}". Retry, or open the GitHub run for details.` };
}

// The record's KPI state for chips and the card.
export function kpiState(r) {
  const k = r.kpi || {};
  if (k.status === 'ready' || k.status === 'existing') return { key: 'ready', label: k.review && k.review !== 'none' ? 'Ready · review mapping' : 'Ready', tone: k.review && k.review !== 'none' ? 'warn' : 'good' };
  if (k.status === 'setting_up') return { key: 'setting_up', label: 'Setting up', tone: 'info' };
  if (k.status === 'failed') return { key: 'failed', label: 'Setup failed', tone: 'bad' };
  return r.kpiRequested ? { key: 'requested', label: 'Requested', tone: 'info' } : { key: 'none', label: 'Not requested', tone: '' };
}

// ---------------------------------------------------------------- wiring (set by app.js)
let D = null;   // { gh, saveRecord, record(id), esc, ICON, toast, copy, who(), cfg, newRequestId, paintList, sleep, pollMs }
export function initKpi(deps) { D = deps; }
const KR = () => `/repos/${D.cfg.kpiRepo || 'peejayedz/leadpro-kpi'}`;
const live = {};   // record id -> { running, steps, passphrase, passHidden, error, runUrl, menu, review, typedPass }
export const liveOf = id => (live[id] ||= { steps: {} });

async function kgh(method, path, body, opts) {
  try { return await D.gh(method, `${KR()}${path}`, body, opts); }
  catch (e) {
    if (e.status === 403 || e.status === 404) { const x = new Error('Your GitHub token can\'t reach the LeadPro KPI repo. On GitHub, edit the token: add the repository leadpro-kpi with Actions, Contents and Secrets set to "Read and write" (the token itself stays the same).'); x.status = e.status; throw x; }
    throw e;
  }
}
const readIndex = async () => JSON.parse((await kgh('GET', '/contents/firms/index.json?ref=main', null, { raw: true })) || '[]');
const secretExists = async name => (await kgh('GET', `/actions/secrets/${name}`, null, { allow404: true })) !== null;

let sodiumP = null;
function loadSodium() {
  const src = D.cfg.sodium || { src: 'https://cdnjs.cloudflare.com/ajax/libs/libsodium-wrappers/0.5.4/sodium.min.js', integrity: 'sha384-wwHUJSIg+zP+JE6uHrrp1XCv4UtKW9xE4+LO+lwfrocCav+zHsDN57+5bvmKRCnu' };
  return sodiumP ||= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src.src; if (src.integrity) s.integrity = src.integrity; s.crossOrigin = 'anonymous'; s.referrerPolicy = 'no-referrer';
    s.onload = async () => { const so = window.sodium; if (!so?.crypto_box_seal) { sodiumP = null; return reject(new Error('The encryption library loaded but is not usable.')); } if (so.ready) await so.ready; resolve(so); };
    s.onerror = () => { sodiumP = null; s.remove(); reject(new Error('Couldn\'t load the encryption library from cdnjs. Check your connection and Retry.')); };
    document.head.appendChild(s);
  });
}
// The page's only secret write: one firm's dashboard passphrase, sealed with the KPI repo's public key.
async function putPassphrase(key, value) {
  const name = `PASSPHRASE_${key}`;
  if (!/^PASSPHRASE_[A-Z0-9_]{1,80}$/.test(name)) throw new Error('Blocked: the page may only save a dashboard passphrase.');
  const so = await loadSodium();
  const pk = await kgh('GET', '/actions/secrets/public-key');
  const sealed = so.crypto_box_seal(so.from_string(value), so.from_base64(pk.key));
  await kgh('PUT', `/actions/secrets/${name}`, { encrypted_value: so.to_base64(sealed), key_id: pk.key_id });
}
// The page's only workflow start in the KPI repo.
async function startNewFirm(inputs) {
  const t0 = Date.now();
  await kgh('POST', '/actions/workflows/new-firm.yml/dispatches', { ref: 'main', inputs });
  return t0;
}

// ---------------------------------------------------------------- the setup
function setStep(id, k, st, detail) {
  const L = liveOf(id), old = L.steps[k];
  L.steps[k] = { st, detail: detail ?? (old?.st === st ? old?.detail : undefined), at: old?.st === st ? old.at : Date.now() };
  paint(id);
}
const DONE_TEXT = { token: 'Saved as the firm\'s own GHL token (refreshed every hour by the token keeper).', setup: 'Pipelines read; stage mapping applied; dashboard saved.', sync: 'Done.' };
const nowIso = () => new Date().toISOString();

export async function startKpi(id, { auto = false } = {}) {
  const L = liveOf(id);
  if (L.running) return;
  Object.assign(L, { running: true, steps: {}, error: null, runUrl: null, menu: null, review: null, auto });
  paint(id);
  let rec = D.record(id);
  const who = D.who() || 'unknown';
  const requestId = D.newRequestId();
  try {
    setStep(id, 'check', 'run');
    const index = await readIndex();
    const same = index.find(f => f.locationId === rec.locationId);
    if (same && same.tokenSource !== 'app') {
      await D.saveRecord(id, x => { x.kpi = { status: 'existing', slug: same.slug, at: nowIso(), by: who }; setKpiLink(x, same.slug, who); }, `${rec.businessName}: linked its existing KPI dashboard (${who})`);
      L.repaintAll = true;
      setStep(id, 'check', 'ok', `This sub-account already has a KPI dashboard (${D.esc(same.name)}). It's now linked on the record.`);
      L.done = 'existing'; return;
    }
    let slug = same?.slug;
    if (!slug) slug = await chooseSlug(rec.businessName, async s => index.some(f => f.slug === s) || (rec.kpi?.slug !== s && await secretExists(`PASSPHRASE_${secretKeyFor(s)}`)));
    setStep(id, 'check', 'ok', same ? `Finishing the earlier setup of <span class="mono">${D.esc(slug)}</span>.` : `Not in the list yet. Dashboard name: <span class="mono">${D.esc(slug)}</span>.`);

    setStep(id, 'pass', 'run');
    const key = secretKeyFor(slug);
    if ((same || rec.kpi?.slug === slug) && await secretExists(`PASSPHRASE_${key}`)) {
      setStep(id, 'pass', 'ok', 'Using the passphrase saved earlier (it was shown when it was made).');
    } else {
      const pass = makePassphrase();
      await putPassphrase(key, pass);
      L.passphrase = pass; L.passSlug = slug; L.passHidden = false;
      setStep(id, 'pass', 'ok', 'Made in this browser and saved to GitHub (sealed). Shown once below.');
    }
    rec = await D.saveRecord(id, x => { x.kpi = { ...(x.kpi || {}), status: 'setting_up', slug, requestId, startedAt: nowIso(), by: who, error: null }; }, `${rec.businessName}: KPI dashboard setup started (${who})`);
    D.paintList();

    setStep(id, 'start', 'run');
    const t0 = await startNewFirm({ name: rec.businessName, location: rec.locationId, slug, practice_area: rec.practiceArea || rec.kpi?.practiceArea || '', timezone: rec.timezone || 'America/New_York', snapshot_id: rec.snapshot?.id || '', request: requestId });
    await follow(id, slug, requestId, t0);
  } catch (e) {
    await fail(id, { step: Object.entries(liveOf(id).steps).find(([, v]) => v.st === 'run')?.[0] || 'check', message: e.message });
  } finally { L.running = false; paint(id); D.paintList(); }
}

// Follows new-firm.yml: its jobs become the steps above.
async function follow(id, slug, requestId, t0) {
  const L = liveOf(id), title = `New firm ${slug} [${requestId}]`;
  let run = null;
  for (;;) {
    await D.sleep(D.pollMs);
    if (!run) {
      const r = await kgh('GET', '/actions/workflows/new-firm.yml/runs?event=workflow_dispatch&per_page=20');
      run = (r.workflow_runs || []).find(x => x.display_title === title) || null;
      if (!run) { if (Date.now() - t0 > 3 * 60e3) throw new Error('GitHub didn\'t start the KPI setup within 3 minutes. Retry is safe.'); continue; }
      L.runUrl = run.html_url; setStep(id, 'start', 'ok', 'GitHub started the setup.');
    }
    const [r2, jobs] = await Promise.all([kgh('GET', `/actions/runs/${run.id}`), kgh('GET', `/actions/runs/${run.id}/jobs`)]);
    run = r2 || run;
    for (const j of jobs.jobs || []) {
      const k = JOB_STEP[j.name]; if (!k) continue;
      // A job GitHub skipped (because an earlier one failed) never ran: it stays empty, not ticked.
      const st = j.status !== 'completed' ? (j.status === 'in_progress' ? 'run' : 'pending') : j.conclusion === 'success' ? 'ok' : j.conclusion === 'skipped' ? 'pending' : 'fail';
      let detail = st === 'ok' ? DONE_TEXT[k] : undefined;
      if (k === 'app' && st === 'run') { const cur = (j.steps || []).find(s => s.status === 'in_progress'); if (cur?.name === 'Wait for the app on the sub-account') detail = 'Waiting for GHL to add the app to this sub-account (checks every 30 seconds, up to 15 minutes)…'; }
      if (k === 'app' && st === 'ok') detail = 'The app is on the sub-account.';
      if (k === 'sync' && st === 'run') detail = 'Syncing (a few minutes; it may wait for a sync already running).';
      setStep(id, k, st === 'fail' && k === 'menu' ? 'warn' : st, detail);
    }
    if (run.status !== 'completed') continue;
    const err = errorFor(jobs.jobs);
    if (err && err.step !== 'menu') return fail(id, err);
    return finish(id, slug);
  }
}

async function finish(id, slug) {
  const L = liveOf(id), rec = D.record(id), who = D.who() || 'unknown';
  setStep(id, 'save', 'run');
  let cfg = null; try { cfg = JSON.parse(await kgh('GET', `/contents/firms/${slug}/config.json?ref=main`, null, { raw: true })); } catch {}
  L.review = cfg?.mappingReview?.reason || 'none';
  L.menu = cfg?.menuLink?.status === 'created' || cfg?.menuLink?.status === 'exists' ? cfg.menuLink.status : 'manual';
  setStep(id, 'menu', L.menu === 'manual' ? 'warn' : 'ok', L.menu === 'created' ? '"KPI Dashboard" added to this sub-account\'s menu (opens in a new tab).' : L.menu === 'exists' ? 'This sub-account already had a "KPI Dashboard" link.' : 'Not added automatically. Add it by hand: see below.');
  await D.saveRecord(id, x => { x.kpi = { ...(x.kpi || {}), status: 'ready', slug, finishedAt: nowIso(), review: L.review, menu: L.menu, error: null }; setKpiLink(x, slug, who); }, `${rec.businessName}: KPI dashboard ready (${who})`);
  L.repaintAll = true;
  setStep(id, 'save', 'ok', 'Saved. The KPI button on the Sub-accounts list opens it.');
  L.done = 'ready';
}
async function fail(id, err) {
  const L = liveOf(id), rec = D.record(id);
  L.error = err;
  if (L.steps[err.step]) L.steps[err.step].st = 'fail'; else L.steps[err.step] = { st: 'fail' };
  for (const k of Object.keys(L.steps)) if (L.steps[k].st === 'run') L.steps[k].st = 'pending';
  try { await D.saveRecord(id, x => { x.kpi = { ...(x.kpi || {}), status: 'failed', error: { step: err.step, message: err.message, at: nowIso(), runUrl: L.runUrl || null } }; }, `${rec.businessName}: KPI setup failed at ${err.step}`); } catch {}
  paint(id);
}
function setKpiLink(x, slug, who) {
  x.links = { ...(x.links || {}), kpi: dashUrl(slug) };
  x.linkEdits = { ...(x.linkEdits || {}), kpi: { by: who, at: nowIso(), auto: true } };
}

// ---------------------------------------------------------------- the card (done panel + record details)
export function kpiCardHtml(r, { where = 'details' } = {}) {
  const { esc, ICON } = D, L = liveOf(r.id), k = r.kpi || {}, s = kpiState(r);
  const running = L.running || (k.status === 'setting_up' && Object.keys(L.steps).length);
  const showSteps = Object.keys(L.steps).length > 0;
  const steps = showSteps ? `<ol class="steps kpisteps">${KPI_STEPS.map(([key, t, d]) => { const v = L.steps[key] || { st: 'pending' }; return `<li class="step ${v.st}${v.at && Date.now() - v.at < 700 ? ' just' : ''}" data-k="${key}"><span class="ic" aria-hidden="true">${v.st === 'ok' ? ICON.tick : v.st === 'fail' ? ICON.cross : v.st === 'warn' ? ICON.bang : ''}</span><span class="t">${esc(t)}</span><span class="d">${v.detail || (v.st === 'run' || v.st === 'pending' ? esc(d || '') : '')}</span></li>`; }).join('')}</ol>` : '';
  const pass = L.passphrase && !L.passHidden ? `<div class="passbox" id="kpiPass-${esc(r.id)}" role="group" aria-label="Dashboard passphrase">
      <p class="passlabel"><b>Dashboard passphrase</b> · shown once</p>
      <div class="copyrow"><code class="passval" aria-label="Dashboard passphrase" data-kpi-pass="${esc(r.id)}">${esc(L.passphrase)}</code><button class="btn primary" type="button" data-act="kpicopypass" data-id="${esc(r.id)}">${ICON.copy}<span>Copy</span></button></div>
      <p class="hint">Save it in the password manager now (e.g. "${esc(r.businessName)} – KPI dashboard"). It unlocks names on the dashboard and goes in the GHL menu link. It won't be shown again.</p>
      <button class="btn sm" type="button" data-act="kpihidepass" data-id="${esc(r.id)}">I've saved it</button></div>` : '';
  const url = k.slug ? dashUrl(k.slug) : '';
  const link = url && (k.status === 'ready' || k.status === 'existing') ? `<p class="kpilink"><a class="btn" href="${esc(url)}" target="_blank" rel="noopener">${ICON.ext}<span>Open dashboard</span></a><button class="btn" type="button" data-act="copytext" data-text="${esc(url)}" data-what="Dashboard link">${ICON.copy}<span>Copy dashboard link</span></button></p>` : '';
  const review = (L.review || k.review) && (L.review || k.review) !== 'none' && k.status === 'ready' ? `<div class="warnbox">The pipeline stages were <b>guessed</b> (${(L.review || k.review) === 'unknown-snapshot' ? 'no mapping preset for this snapshot yet' : 'some preset stages weren\'t found'}). Check them on the KPI admin page: <b>Edit mapping</b> for this firm. <a href="${esc(KPI_PAGES)}admin/" target="_blank" rel="noopener">Open KPI admin</a></div>` : '';
  const menuManual = k.status === 'ready' && (L.menu || k.menu) === 'manual';
  const menu = menuManual ? `<details class="menuhelp"${L.passphrase ? ' open' : ''}><summary>Add the "KPI Dashboard" menu link in GHL</summary>
      ${L.passphrase ? `<div class="copyrow"><input type="password" readonly class="mono" value="${esc(ghlLink(k.slug, L.passphrase))}" aria-label="GHL menu link"><button class="btn primary" type="button" data-act="kpicopylink" data-id="${esc(r.id)}">${ICON.copy}<span>Copy GHL link</span></button></div>`
        : `<label class="f">Type the dashboard passphrase to build the link (not saved)<span class="copyrow"><input type="password" id="kpiTyped-${esc(r.id)}" autocomplete="off" spellcheck="false"><button class="btn" type="button" data-act="kpicopylink" data-id="${esc(r.id)}">${ICON.copy}<span>Copy GHL link</span></button></span></label>`}
      <ol class="clicks"><li>In GHL (agency view): <b>Settings → Custom Menu Links → Create new</b>.</li><li>Title <b>KPI Dashboard</b>, any chart icon, paste the link as the URL.</li><li>Open in: <b>New tab</b>.</li><li>Show on: <b>sub-accounts → only ${esc(r.businessName)}</b> (not the agency, not all sub-accounts). Save.</li></ol></details>` : '';
  const err = L.error || (k.status === 'failed' ? k.error : null);
  const errBox = err ? `<div class="errbox" role="alert">${esc(err.message)}${(L.runUrl || err.runUrl) ? ` <a href="${esc(L.runUrl || err.runUrl)}" target="_blank" rel="noopener">GitHub run</a>` : ''}</div>` : '';
  let btn = '';
  if (!L.running) {
    if (k.status === 'failed') btn = `<button class="btn primary" type="button" data-act="kpistart" data-id="${esc(r.id)}">${ICON.sync}<span>Retry KPI setup</span></button>`;
    else if (!k.status && r.status === 'ready') btn = `<button class="btn ${r.kpiRequested ? 'primary' : ''}" type="button" data-act="kpistart" data-id="${esc(r.id)}">${ICON.plus}<span>Set up KPI dashboard</span></button>`;
    else if (k.status === 'setting_up' && !showSteps) btn = `<button class="btn" type="button" data-act="kpistart" data-id="${esc(r.id)}">${ICON.sync}<span>Check / resume KPI setup</span></button>`;
  }
  const lead = !k.status && r.status !== 'ready' ? '<p class="hint">Available once the snapshot has loaded (use Refresh status on the list).</p>'
    : !k.status && !showSteps ? `<p class="hint">${r.kpiRequested ? `Requested · ${esc(r.practiceArea || '')}. ` : ''}Makes a LeadPro KPI dashboard for this sub-account: no token to paste; about 5–15 minutes.</p>`
    : k.status === 'setting_up' && !showSteps ? `<p class="hint">Started ${esc(k.startedAt ? new Date(k.startedAt).toLocaleString() : '')} by ${esc(k.by || '')}. Press the button to check on it; it never creates the firm twice.</p>` : '';
  return `<section class="panel kpicard" data-kpi="${esc(r.id)}" aria-live="polite">
    <div class="kpihead"><h4>KPI dashboard</h4><span class="chip ${s.tone}" data-chip="kpistate"><span class="dot"></span>${esc(s.label)}</span>${running ? '<span class="hint">You can leave this page; GitHub keeps going.</span>' : ''}</div>
    ${lead}${steps}${pass}${errBox}${link}${review}${menu}${btn ? `<div class="btnrow">${btn}</div>` : ''}</section>`;
}
export function paint(id) {
  const r = D.record(id); if (!r) return;
  if (D.detailsOpen?.() === id && liveOf(id).repaintAll) { liveOf(id).repaintAll = false; D.paintDetails(); return; }   // record saved: redraw the whole dialog (Links, chips)
  for (const el of document.querySelectorAll(`[data-kpi="${CSS.escape(id)}"]`)) {
    const keep = el.querySelector('input[id^="kpiTyped-"]')?.value;
    el.outerHTML = kpiCardHtml(r);
    if (keep) { const i = document.getElementById(`kpiTyped-${id}`); if (i) i.value = keep; }
  }
}
export function onKpiAct(act, el) {
  const id = el.dataset.id, L = liveOf(id), r = D.record(id); if (!r) return false;
  if (act === 'kpistart') { startKpi(id); return true; }
  if (act === 'kpicopypass') { D.copy(L.passphrase, 'Passphrase'); return true; }
  if (act === 'kpihidepass') { L.passHidden = true; paint(id); return true; }
  if (act === 'kpicopylink') {
    const pass = L.passphrase || document.getElementById(`kpiTyped-${id}`)?.value || '';
    if (!pass) { D.toast('Type the passphrase first'); return true; }
    D.copy(ghlLink(r.kpi.slug, pass), 'GHL link'); return true;
  }
  return false;
}

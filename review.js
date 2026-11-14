// Automation Review package (Phase 4). Shared by the page (browser) and scripts/review/*.mjs (Node),
// so the preview and what gets published are built and checked by the same code. No DOM, no Node APIs.
//
// The template lives in the automation-review repo: templates/leadpro-standard/{template,data,messages,plan}.json.
// It holds {{PLACEHOLDER}} markers; a generated package must contain no "{{" at all.

import { AGENCY_LOGOS } from './brand/agency-logos.js';

export const TEMPLATE_ID = 'leadpro-standard';
export const TEMPLATE_FILES = ['template', 'data', 'messages', 'plan'];
export const REVIEW_BASE = 'https://peejayedz.github.io/automation-review/';
export const PREVIEW_STATUS = 'Preview — tailor after kickoff';
export const STEP_TYPES = ['start', 'sms', 'email', 'call', 'vm', 'team', 'end', 'chat'];
export const STEP_WHO = ['patient', 'team'];
export const MSG_KINDS = ['Text', 'Email', 'Alert'];
// The tab names the Apps Script uses for itself: a client tab can never be called this.
export const RESERVED_TABS = ['To-do', 'Content', 'Revision Log', 'Responses'];

export const CODE_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*-[a-z0-9]{6}$/;
export const isCode = c => typeof c === 'string' && c.length <= 60 && CODE_RE.test(c);

export const planUrl = code => `${REVIEW_BASE}plan.html?c=${encodeURIComponent(code)}`;       // link A (default)
export const messagesUrl = code => `${REVIEW_BASE}messages.html?c=${encodeURIComponent(code)}`; // link B (re-reviews)
export const fileNames = code => ({ data: `${code}.json`, messages: `${code}.messages.json`, plan: `${code}.plan.json` });

const US_STATES = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware',
  DC: 'District of Columbia', FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa',
  KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota',
  MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey',
  NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon',
  PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah',
  VT: 'Vermont', VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming', PR: 'Puerto Rico'
};
const norm = s => String(s ?? '').trim().replace(/\s+/g, ' ');

// ---------- code ----------
// "McCarthy & Akers, PLC" -> "mccarthy-akers". Legal suffixes dropped; at most 40 characters, cut at a hyphen.
export function codeSlug(name) {
  let s = norm(name).normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/&/g, ' ').replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  s = s.replace(/(?:-(?:llc|pllc|plc|llp|pc|p-c|pa|p-a|inc|ltd|esq|co))+$/, '');
  if (s.length > 40) s = s.slice(0, 41).replace(/-[^-]*$/, '') || s.slice(0, 40);
  return s.replace(/-+$/, '') || 'client';
}
const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';
// randomBytes(n) -> Uint8Array; defaults to Web Crypto (browser and Node 20+). Rejection sampling: no bias.
export function randomSuffix(randomBytes = n => globalThis.crypto.getRandomValues(new Uint8Array(n))) {
  let out = '';
  while (out.length < 6) for (const b of randomBytes(12)) { if (b < 252 && out.length < 6) out += ALPHABET[b % 36]; }
  return out;
}
export const makeCode = (name, randomBytes) => `${codeSlug(name)}-${randomSuffix(randomBytes)}`;

// Sheet tab for the client: the firm name without "," and "=" (they separate entries in the CLIENTS script property).
export function tabName(name) {
  const t = norm(String(name ?? '').replace(/[,=]/g, ' ')).slice(0, 90).trim();
  return RESERVED_TABS.some(r => r.toLowerCase() === t.toLowerCase()) ? `${t} (client)` : t;
}

// ---------- placeholders ----------
export function locationText(rec) {
  const s = rec.submitted || {};
  const city = norm(s.city), st = norm(s.state), country = norm(s.country || 'US').toUpperCase();
  const state = country === 'US' ? (US_STATES[st.toUpperCase()] || st) : st;
  return [city, state].filter(Boolean).join(', ');
}
export function reviewerName(rec) {
  const s = rec.submitted || {};
  return norm(`${s.firstName || ''} ${s.lastName || ''}`) || norm(rec.businessName);
}
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export function dateTexts(now = new Date(), timeZone = 'America/New_York') {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: 'numeric', day: 'numeric' })
    .formatToParts(now).filter(x => x.type !== 'literal').map(x => [x.type, Number(x.value)]));
  const m = MONTHS[p.month - 1];
  return { sent: `${m.slice(0, 3)} ${p.day}, ${p.year}`, monthYear: `${m} ${p.year}` };
}
export const AGENCIES = { LFMP: 'Law Firm Marketing Pros', WPP: 'Web Promotion Partners' };
export const agencyOf = rec => (AGENCIES[String(rec.brand || '').toUpperCase()] ? String(rec.brand).toUpperCase() : 'LFMP');
export function placeholderValues(rec, { code, now, templateVersion }) {
  const d = dateTexts(now, rec.timezone || 'America/New_York');
  return {
    AGENCY: agencyOf(rec),
    AGENCY_NAME: AGENCIES[agencyOf(rec)],
    CODE: code,
    FIRM_NAME: norm(rec.businessName),
    LOCATION: locationText(rec),
    AUDIENCE: norm(rec.audience) || 'Lead',
    SMS_HEALTHCARE: rec.smsHealthcare === true,
    REVIEWER: reviewerName(rec),
    PRACTICE_AREA: norm(rec.practiceArea) || 'not set yet',
    SENT_DATE: d.sent,
    MONTH_YEAR: d.monthYear,
    TEMPLATE_VERSION: String(templateVersion || '')
  };
}
// Replaces {{NAME}} in every string. A string that is exactly one placeholder takes the value as it is
// (so {{SMS_HEALTHCARE}} becomes true/false). An unknown placeholder is an error.
export function fill(node, vals) {
  if (typeof node === 'string') {
    const whole = node.match(/^\{\{([A-Z_]+)\}\}$/);
    if (whole && whole[1] in vals) return vals[whole[1]];
    return node.replace(/\{\{([A-Z_]+)\}\}/g, (m, k) => {
      if (!(k in vals)) throw new Error(`Unknown placeholder ${m} in the template`);
      return String(vals[k]);
    });
  }
  if (Array.isArray(node)) return node.map(x => fill(x, vals));
  if (node && typeof node === 'object') return Object.fromEntries(Object.entries(node).map(([k, v]) => [k, fill(v, vals)]));
  return node;
}

// ---------- generate ----------
// tpl = {template, data, messages, plan} (parsed JSON). rec = builder record. Returns the package (files + meta).
export function generatePackage(tpl, rec, { code, now = new Date(), by = '' } = {}) {
  for (const f of TEMPLATE_FILES) if (!tpl || !tpl[f]) throw new Error(`Template file ${f}.json is missing`);
  if (!isCode(code)) throw new Error(`"${code}" is not a valid client code`);
  if (!norm(rec.businessName)) throw new Error('The record has no business name');
  const vals = placeholderValues(rec, { code, now, templateVersion: tpl.template.version });
  const files = { data: fill(tpl.data, vals), messages: fill(tpl.messages, vals), plan: fill(tpl.plan, vals) };
  // WPP's logo travels in the messages file (the pages draw it as a mask); LFMP's is built into the pages.
  if (AGENCY_LOGOS[vals.AGENCY]) {
    const { name, ...logo } = AGENCY_LOGOS[vals.AGENCY];
    files.messages = { ...files.messages, agencyLogo: logo };
  }
  return {
    schema: 1,
    code,
    tab: tabName(rec.businessName),
    status: PREVIEW_STATUS,
    template: { id: tpl.template.id || TEMPLATE_ID, version: tpl.template.version, source: tpl.template.source, checkedAgainst: tpl.template.checkedAgainst },
    funnel: tpl.template.funnel || 'consultation',
    variant: null, // reserved: "sign-on-first-call" later
    agency: vals.AGENCY,
    firmName: vals.FIRM_NAME,
    workflows: (tpl.template.workflows || []).map(w => ({ ...w })), // automation id ↔ GHL workflow name (GHL resync)
    templateHashes: templateHashes(files), // what each automation looked like in the template (resync: did the TEMPLATE change it?)
    carryOver: (tpl.template.carryOver || []).map(c => ({ ...c })),
    checklist: (tpl.template.checklist || []).map(text => ({ text, done: false })), // per-client GHL to-dos before go-live
    generatedAt: now.toISOString(),
    generatedBy: by,
    files
  };
}

// ---------- validate (Automation Review handoff, section 8) ----------
// Returns a list of plain-language problems; empty = valid.
export function validatePackage(pkg, code = pkg && pkg.code) {
  const errs = [];
  const add = m => errs.push(m);
  if (!isCode(code)) add(`Client code "${code}" doesn't match the pattern (name-xxxxxx: lowercase letters, numbers, hyphens, 6-character ending).`);
  const parsed = {};
  for (const f of ['data', 'messages', 'plan']) {
    const raw = pkg && pkg.files && pkg.files[f];
    if (raw == null) { add(`The ${f} file is missing.`); continue; }
    try { parsed[f] = typeof raw === 'string' ? JSON.parse(raw) : JSON.parse(JSON.stringify(raw)); }
    catch (e) { add(`The ${f} file isn't valid JSON: ${e.message}`); continue; }
    const text = typeof raw === 'string' ? raw : JSON.stringify(raw);
    if (text.includes('{{')) add(`The ${f} file still has a "{{" placeholder: ${text.slice(text.indexOf('{{'), text.indexOf('{{') + 30)}`);
  }
  const D = parsed.data, M = parsed.messages, P = parsed.plan;
  const steps = {};
  if (D) {
    if (!D.client || D.client.key !== code) add(`client.key is "${D.client && D.client.key}", not the client code "${code}".`);
    if (!D.client || !norm(D.client.name)) add('client.name is empty.');
    if (!Array.isArray(D.automations) || !D.automations.length) add('The data file has no automations.');
    const aIds = new Set();
    (D.automations || []).forEach((a, ai) => {
      const where = `Automation ${a.id || '#' + (ai + 1)}`;
      if (!a.id) add(`${where} has no id.`);
      else if (aIds.has(a.id)) add(`Automation id "${a.id}" is used twice.`);
      aIds.add(a.id);
      if (!norm(a.name)) add(`${where} has no name.`);
      if (!norm(a.version)) add(`${where} has no version.`);
      if (!Array.isArray(a.steps) || !a.steps.length) { add(`${where} has no steps.`); return; }
      const sIds = new Set();
      a.steps.forEach((s, si) => {
        const sw = `${where}, step ${s.id || '#' + (si + 1)}`;
        if (!s.id) add(`${sw} has no id.`);
        else if (sIds.has(s.id)) add(`${where}: step id "${s.id}" is used twice.`);
        sIds.add(s.id);
        if (!STEP_TYPES.includes(s.type)) add(`${sw}: type "${s.type}" isn't one of ${STEP_TYPES.join(', ')}.`);
        if (s.who != null && !STEP_WHO.includes(s.who)) add(`${sw}: who "${s.who}" isn't patient or team.`);
        if (['sms', 'email', 'call', 'vm', 'team', 'chat'].includes(s.type) && !s.who) add(`${sw}: who is missing.`);
        if (s.type === 'sms' && !norm(s.sms)) add(`${sw}: the text is empty.`);
        if (s.type === 'email' && (!s.email || !norm(s.email.subject) || !norm(s.email.body))) add(`${sw}: the email needs a subject and a body.`);
        if (a.id && s.id) steps[`${a.id}.${s.id}`] = s;
      });
      (a.questions || []).forEach((q, qi) => {
        if (!q.id || !norm(q.text)) add(`${where}: question ${qi + 1} needs an id and a question.`);
        if (!Array.isArray(q.options) || !q.options.length) add(`${where}: question "${q.id || qi + 1}" has no options.`);
      });
    });
  }
  if (M) {
    if (!norm(M.reviewer)) add('The messages file has no reviewer name.');
    if (M.agency != null && !AGENCIES[M.agency]) add(`agency is "${M.agency}", expected LFMP or WPP.`);
    if (M.agency === 'WPP' && !(M.agencyLogo && /^data:image\/png;base64,/.test(M.agencyLogo.logoMask || ''))) add('A WPP package needs agencyLogo (the WPP logo mask).');
    if (M.blanks != null && (!Array.isArray(M.blanks) || M.blanks.some(b => typeof b !== 'string' || !norm(b) || /[[\]]/.test(b)))) add('blanks must be a list of names without brackets, e.g. ["Zoom link"].');
    if (M.planUrl !== `plan.html?c=${code}`) add(`planUrl is "${M.planUrl}", expected "plan.html?c=${code}".`);
    if (!Array.isArray(M.sections) || !M.sections.length) add('The messages file has no sections.');
    const seen = new Set();
    (M.sections || []).forEach(sec => (sec.msgs || []).forEach(m => {
      if (seen.has(m.id)) add(`Message "${m.id}" is listed twice.`);
      seen.add(m.id);
      if (!MSG_KINDS.includes(m.kind)) add(`Message "${m.id}": kind "${m.kind}" isn't Text, Email or Alert.`);
      const s = steps[m.id];
      if (!s) { add(`Message "${m.id}" doesn't match any automation step in the data file.`); return; }
      if (m.kind === 'Text' && s.sms !== m.text) add(`Message "${m.id}": the text differs from the data file.`);
      if (m.kind === 'Email' && (!s.email || s.email.body !== m.text || s.email.subject !== m.subject)) add(`Message "${m.id}": the email differs from the data file.`);
    }));
    const qIds = new Set();
    (M.questions || []).forEach((q, i) => {
      if (!q.id || !norm(q.q)) add(`Open item ${i + 1} needs an id and a question.`);
      if (qIds.has(q.id)) add(`Open item id "${q.id}" is used twice.`);
      qIds.add(q.id);
      if (!Array.isArray(q.opts)) add(`Open item "${q.id}" has no options list (use [] for a typed answer).`);
    });
  }
  if (P) {
    const types = (P.sections || []).map(s => s.type);
    if (types.some(t => !['html', 'messages', 'questions'].includes(t))) add('The plan file has a section of an unknown type.');
    if (!types.includes('messages')) add('The plan file has no "messages" section.');
    if (!types.includes('questions')) add('The plan file has no "questions" section.');
    if (!norm(P.title)) add('The plan file has no title.');
  }
  return errs;
}

// Files exactly as they are committed to automation-review/data/ (1-space indent, like the existing files).
export function packageFiles(pkg) {
  const n = fileNames(pkg.code);
  return Object.fromEntries(['data', 'messages', 'plan'].map(f => [n[f], JSON.stringify(pkg.files[f], null, 1) + '\n']));
}

// ---------- helpers shared by the card, resync and publish ----------
export const PUBLISHED_STATUS = 'Published — ready for Andy';
export const PREVIEW_PATH = id => `records/${id}/review-package/package.json`;
const clone = x => JSON.parse(JSON.stringify(x));
const splitId = id => { const i = id.lastIndexOf('.'); return [id.slice(0, i), id.slice(i + 1)]; };
export const allMessages = pkg => (pkg.files.messages.sections || []).flatMap(s => s.msgs || []);
export const stepOf = (pkg, id) => { const [a, s] = splitId(id); return ((pkg.files.data.automations || []).find(x => x.id === a)?.steps || []).find(x => x.id === s) || null; };
// "1.0" -> "1.1", "1.9" -> "1.10", "2" -> "2.1"
export function nextVersion(v) { const p = String(v || '1.0').split('.'); if (p.length < 2) p.push('0'); p[p.length - 1] = String(Number(p[p.length - 1] || 0) + 1); return p.join('.'); }
// Short, stable fingerprint of a text (FNV-1a, 32-bit, hex): used to spot remote edits without crypto APIs.
export function fingerprint(text) { let h = 0x811c9dc5; for (const c of String(text)) { h ^= c.codePointAt(0); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(16).padStart(8, '0'); }
export const fileFingerprints = pkg => Object.fromEntries(Object.entries(packageFiles(pkg)).map(([n, t]) => [n, fingerprint(t)]));

// The record's Review state for chips and the card.
export function reviewState(rec, latestTemplate) {
  const v = rec.review || {};
  if (v.status === 'linked') return { key: 'linked', label: 'Linked (existing package)', tone: 'good' };
  if (v.status === 'publishing') return { key: 'publishing', label: 'Publishing…', tone: 'info' };
  if (v.status === 'publish_failed') return { key: 'failed', label: 'Publish failed', tone: 'bad' };
  const update = latestTemplate && v.templateVersion && semverNewer(latestTemplate, v.templateVersion);
  if (v.status === 'published') return v.dirty ? { key: 'published', label: 'Published · changes to publish', tone: 'warn' } : update ? { key: 'update', label: 'Template update available', tone: 'warn' } : { key: 'published', label: 'Published', tone: 'good' };
  if (v.status === 'preview') return update ? { key: 'update', label: 'Template update available', tone: 'warn' } : { key: 'preview', label: 'Preview', tone: 'info' };
  return rec.reviewRequested ? { key: 'requested', label: 'Requested', tone: 'info' } : { key: 'none', label: 'Not requested', tone: '' };
}
export function semverNewer(a, b) { const x = String(a).split('.').map(Number), y = String(b).split('.').map(Number); for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); } return false; }

// A client that already has a package in automation-review (Mahdavi, Emery…): matched by firm name.
const nameKey = s => norm(s).toLowerCase().replace(/^the\s+/, '').replace(/[^a-z0-9]+/g, ' ').replace(/\b(llc|pllc|plc|llp|pc|p c|pa|inc|esq)\b/g, '').trim();
export function findExisting(firmName, dataFiles) {
  // dataFiles: [{code, name}] read from automation-review/data/<code>.json (not .messages/.plan)
  const k = nameKey(firmName);
  return (dataFiles || []).find(f => k && nameKey(f.name) === k) || null;
}

// ---------- tailoring (kickoff edits) ----------
// Changes one message's wording in BOTH the data file and the messages file, so they never drift.
// A template automation that is edited becomes "customised": template resyncs then leave it alone.
export function editMessage(pkg, id, { subject, text }) {
  const out = clone(pkg), st = stepOf(out, id), m = allMessages(out).find(x => x.id === id);
  if (!st || !m) throw new Error(`Message ${id} isn't in this package`);
  if (m.kind === 'Text') { st.sms = text; m.text = text; }
  else if (m.kind === 'Email') { if (subject != null) { st.email.subject = subject; m.subject = subject; } st.email.body = text; m.text = text; }
  else { st.body = `Everyone on your team gets this text:\n\n${text}`; m.text = st.body; }
  const a = out.files.data.automations.find(x => x.id === splitId(id)[0]);
  if (a.source === 'template') a.source = 'customised';
  // Already published: changed wording = a new review round for THIS automation (once per publish), so the
  // client re-checks it; other automations keep their version and their approvals.
  const pubV = out.published?.versions?.[a.id];
  if (pubV != null && String(a.version) === String(pubV)) a.version = nextVersion(a.version);
  return out;
}

// ---------- P5a: template resync ----------
// Compares the package with a freshly generated one from the (newer) template. Only automations whose source
// is still "template" are updated; "customised"/"custom" ones are listed, never changed. Ids never change.
// When the package was published, every changed automation gets a new version (= a new review round);
// unchanged ones keep their version, so their approvals stand.
const AUTO_IGNORE = ['version', 'sent', 'templateVersion', 'source'];
const autoBody = a => JSON.stringify(Object.fromEntries(Object.entries(a).filter(([k]) => !AUTO_IGNORE.includes(k))));
// One fingerprint per automation: its data-file content + its messages, as the template generated them.
export function templateHashes(files) {
  const msgs = (files.messages.sections || []).flatMap(s => s.msgs || []);
  return Object.fromEntries((files.data.automations || []).map(a => [a.id, fingerprint(autoBody(a) + JSON.stringify(msgs.filter(m => m.id.startsWith(`${a.id}.`))))]));
}
export function templateResync(pkg, tpl, rec, { now = new Date() } = {}) {
  const fresh = generatePackage(tpl, rec, { code: pkg.code, now });
  const published = !!pkg.published;
  const changed = [], customised = [], unchanged = [];
  const freshMsgs = allMessages(fresh);
  const freshHashes = templateHashes(fresh.files);
  const out = clone(pkg);
  for (const a of out.files.data.automations) {
    const f = fresh.files.data.automations.find(x => x.id === a.id);
    if (!f) continue;
    const msgIds = freshMsgs.filter(m => m.id.startsWith(`${a.id}.`)).map(m => m.id);
    const curMsgs = JSON.stringify(allMessages(pkg).filter(m => m.id.startsWith(`${a.id}.`)));
    const same = autoBody(a) === autoBody(f) && curMsgs === JSON.stringify(freshMsgs.filter(m => m.id.startsWith(`${a.id}.`)));
    if (same) { unchanged.push(a.id); continue; }
    if (a.source !== 'template') {
      // tailored for this client: never changed. Listed only when the TEMPLATE changed it (when the package knows what it started from).
      const known = pkg.templateHashes?.[a.id];
      if (!known || known !== freshHashes[a.id]) customised.push({ id: a.id, name: a.name, source: a.source || 'custom' });
      continue;
    }
    const before = allMessages(pkg).filter(m => m.id.startsWith(`${a.id}.`));
    const nMsg = msgIds.filter(id => JSON.stringify(before.find(m => m.id === id)) !== JSON.stringify(freshMsgs.find(m => m.id === id))).length
      + before.filter(m => !msgIds.includes(m.id)).length;
    // bump once per publish: only while the version is still the published one (an edit since may have bumped it already)
    const pv = pkg.published?.versions?.[a.id], to = published && pv != null && String(a.version) === String(pv) ? nextVersion(a.version) : a.version;
    changed.push({ id: a.id, name: a.name, messages: nMsg, from: a.version, to });
    Object.keys(a).forEach(k => delete a[k]);
    Object.assign(a, clone(f), { version: to });
    // the messages file: replace this automation's messages with the fresh ones, in the fresh sections
    for (const sec of out.files.messages.sections) sec.msgs = sec.msgs.filter(m => !m.id.startsWith(`${a.id}.`));
    for (const fs of fresh.files.messages.sections) {
      const add = fs.msgs.filter(m => m.id.startsWith(`${a.id}.`)); if (!add.length) continue;
      let sec = out.files.messages.sections.find(s => s.title === fs.title);
      if (!sec) { sec = { ...clone(fs), msgs: [] }; out.files.messages.sections.push(sec); }
      sec.msgs.push(...clone(add));
      sec.msgs.sort((x, y) => fs.msgs.findIndex(m => m.id === x.id) - fs.msgs.findIndex(m => m.id === y.id));
    }
  }
  out.files.messages.sections = out.files.messages.sections.filter(s => s.msgs.length);
  // New open items from the template are added; existing ones are kept as they are (answers line up by id).
  for (const q of fresh.files.messages.questions) if (!out.files.messages.questions.some(x => x.id === q.id)) out.files.messages.questions.push(clone(q));
  out.template = { ...out.template, version: tpl.template.version };
  // what the template now says, for the next resync (customised automations keep theirs only if the template didn't change them)
  out.templateHashes = { ...(pkg.templateHashes || {}), ...Object.fromEntries(Object.entries(freshHashes).filter(([id]) => !customised.some(c => c.id === id))) };
  out.checklist = (tpl.template.checklist || []).map(text => (pkg.checklist || []).find(c => c.text === text) || { text, done: false });
  return { pkg: out, changed, customised, unchanged, messages: changed.reduce((n, c) => n + c.messages, 0) };
}

// ---------- P5b: GHL resync (pasted from the "Copy workflows" script) ----------
// GHL merge fields -> the [chips] the review pages show. {{location.name}} -> the firm name.
export const GHL_CHIPS = {
  'contact.first_name': '[First name]', 'contact.name': '[Contact name]', 'contact.email': '[Contact email]', 'contact.phone': '[Contact phone]',
  'location.phone': '[Office phone]', 'location.website': '[Firm website]', 'user.name': '[Team member\'s name]', 'user.email': '[Team member\'s email]',
  'appointment.only_start_date': '[Appointment date]', 'appointment.only_start_time': '[Appointment time]', 'appointment.timezone': '[Time zone]', 'message.body': '[Message]'
};
export function ghlToChips(text, firmName) {
  return String(text ?? '').replace(/https?:\/\/(?:www\.)?zoom\.us\/j\/xyz\b/gi, '[Zoom link]')
    .replace(/\{\{\s*location\.name\s*\}\}/g, firmName)
    .replace(/\{\{\s*([\w.]+)\s*\}\}/g, (m, k) => GHL_CHIPS[k] || `[${k}]`)
    .replace(/[’]/g, "'").replace(/ /g, ' ');
}
const words = s => String(s ?? '').replace(/[’]/g, "'").replace(/[“”]/g, '"').split(/\s+/).filter(Boolean);
// Known differences that are on the per-client checklist, not changes to bring in.
function knownGhl(text, firmName, field) {
  let t = text.replace(new RegExp(`${firmName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\.`, 'g'), `${firmName}.`);
  if (field === 'subject') t = t.replace(/\[Insert Name Of Law Firm\]/g, firmName);
  return t;
}
// Word-level patch: keeps the preview's own line breaks and only swaps the words that changed.
export function patchWords(base, target) {
  const A = words(base), B = words(target), n = A.length, m = B.length;
  const L = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = A[i] === B[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const ops = []; let i = 0, j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && A[i] === B[j]) { ops.push(['=', A[i]]); i++; j++; }
    else if (j < m && (i === n || L[i][j + 1] >= L[i + 1][j])) { ops.push(['+', B[j], j]); j++; }
    else { ops.push(['-', A[i]]); i++; }
  }
  // Rebuild from the base text's own units (each word + the whitespace after it). A run of changed words is
  // replaced as a block that keeps the whitespace after its last removed word (so a paragraph break survives).
  // Words that are only ADDED take the spacing that follows them in the target (GHL) text, so a new line or
  // paragraph stays one (S4: "test2" added on its own line after a signature).
  const tt = String(target ?? '').match(/\S+|\s+/g) || [];
  if (tt[0] && /^\s/.test(tt[0])) tt.shift();
  const tws = []; for (let q = 0; q < tt.length; q += 2) tws.push(tt[q + 1] || '');
  const toks = String(base ?? '').match(/\S+|\s+/g) || [];
  const lead = toks[0] && /^\s/.test(toks[0]) ? toks.shift() : '';
  const units = []; for (let k = 0; k < toks.length; k += 2) units.push({ w: toks[k], ws: toks[k + 1] || '' });
  let out = lead, u = 0, k = 0;
  while (k < ops.length) {
    if (ops[k][0] === '=') { out += units[u].w + units[u].ws; u++; k++; continue; }
    const del = [], ins = [];
    while (k < ops.length && ops[k][0] !== '=') { if (ops[k][0] === '-') del.push(units[u++]); else ins.push(ops[k]); k++; }
    if (!ins.length) continue;
    const lead2 = out && !/\s$/.test(out) ? ' ' : '';
    if (del.length) out += lead2 + ins.map(x => x[1]).join(' ') + del[del.length - 1].ws;
    else out += lead2 + ins.map((x, q) => x[1] + (q < ins.length - 1 ? (tws[x[2]] || ' ') : (u < units.length ? (tws[x[2]] || ' ') : ''))).join('');
  }
  return /\s$/.test(String(base ?? '')) ? out : out.replace(/\s+$/, '');
}
// Plain diff of two texts for the screen: [{op:'='|'+'|'-', text}]
export function wordDiff(a, b) {
  const A = words(a), B = words(b), n = A.length, m = B.length;
  const L = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = A[i] === B[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const out = []; let i = 0, j = 0;
  const push = (op, w) => { const last = out[out.length - 1]; if (last && last.op === op) last.text += ` ${w}`; else out.push({ op, text: w }); };
  while (i < n || j < m) {
    if (i < n && j < m && A[i] === B[j]) { push('=', A[i]); i++; j++; }
    else if (i < n && (j === m || L[i + 1][j] >= L[i][j + 1])) { push('-', A[i]); i++; }   // removals first, then additions
    else { push('+', B[j]); j++; }
  }
  return out;
}

export function parseGhlPaste(text) {
  let j; try { j = JSON.parse(String(text || '').trim()); } catch { throw new Error('That isn\'t the "Copy workflows" output. Run the script on the client\'s GHL tab again, then paste.'); }
  if (!j || j.kind !== 'lfmp-ghl-workflows' || !Array.isArray(j.workflows)) throw new Error('That isn\'t the "Copy workflows" output (it should start with {"kind":"lfmp-ghl-workflows"…).');
  if (/access-token|bearer\s+ey|"token"\s*:/i.test(JSON.stringify(j))) throw new Error('The pasted text contains a token. It was not used. Copy the workflows again with the builder\'s script.');
  // A paste from the first version of "Copy workflows" lists folder workflows twice: keep one per id (the copy with the folder name).
  const byId = new Map();
  for (const w of j.workflows) { const k = w.id || w.name, old = byId.get(k); if (!old || (!old.folder && w.folder)) byId.set(k, w); }
  j.workflows = [...byId.values()];
  return j;
}
// Maps GHL nodes to the package's message ids (same order the template was built in) and lists differences.
export function ghlDiff(pkg, paste, rec = {}) {
  const P = parseGhlPaste(typeof paste === 'string' ? paste : JSON.stringify(paste));
  const firm = pkg.firmName || pkg.files.data.client.name;
  const warnings = [], diffs = [], matched = [];
  if (rec.locationId && P.locationId && P.locationId !== rec.locationId) warnings.push(`These workflows were copied from location ${P.locationId}, not this client's (${rec.locationId}). Nothing was compared.`);
  if (warnings.length) return { warnings, diffs, matched };
  const msgs = allMessages(pkg);
  for (const w of pkg.workflows || []) {
    const g = P.workflows.find(x => norm(x.name) === norm(w.ghl));
    if (!g) { warnings.push(`GHL workflow "${w.ghl}" wasn't in the paste.`); continue; }
    const mine = msgs.filter(m => m.id.startsWith(`${w.automation}.`));
    let nodes = (g.steps || []).filter(s => s.type === 'email' || s.type === 'sms');
    if (mine.every(m => m.kind === 'Alert')) nodes = (g.steps || []).filter(s => s.type === 'internal_notification');
    // Web lead + phone lead branches send the same emails: compare the first set, check the second matches it.
    if (nodes.length === mine.length * 2) {
      const a = nodes.slice(0, mine.length), b = nodes.slice(mine.length);
      if (a.some((n, i) => words(n.text).join(' ') !== words(b[i].text).join(' ') || (n.subject || '') !== (b[i].subject || ''))) warnings.push(`In "${w.ghl}" the phone-lead emails no longer match the web-lead ones. Compared the web-lead branch only.`);
      nodes = a;
    }
    if (nodes.length !== mine.length) warnings.push(`"${w.ghl}" has ${nodes.length} messages in GHL; the package has ${mine.length}. Compared them in order.`);
    mine.forEach((m, i) => {
      const n = nodes[i]; if (!n) return;
      const ghlText = knownGhl(ghlToChips(m.kind === 'Alert' ? n.text : n.text, firm), firm, 'text');
      const cur = m.kind === 'Alert' ? m.text.replace(/^Everyone on your team gets this text:\s*/, '') : m.text;
      const fields = [];
      if (words(cur).join(' ') !== words(ghlText).join(' ')) fields.push({ field: 'text', preview: cur, ghl: ghlText, diff: wordDiff(cur, ghlText) });
      if (m.kind === 'Email') {
        const gs = knownGhl(ghlToChips(n.subject, firm), firm, 'subject');
        if (words(m.subject).join(' ') !== words(gs).join(' ')) fields.push({ field: 'subject', preview: m.subject, ghl: gs, diff: wordDiff(m.subject, gs) });
      }
      if (fields.length) diffs.push({ id: m.id, kind: m.kind, when: m.when, ghlStep: n.name, fields }); else matched.push(m.id);
    });
  }
  return { warnings, diffs, matched };
}
// Brings the GHL wording into the preview (word by word, keeping the preview's line breaks).
export function applyGhl(pkg, diffs) {
  let out = pkg;
  for (const d of diffs) {
    const m = allMessages(out).find(x => x.id === d.id);
    const f = Object.fromEntries(d.fields.map(x => [x.field, x]));
    const cur = m.kind === 'Alert' ? m.text.replace(/^Everyone on your team gets this text:\s*/, '') : m.text;
    out = editMessage(out, d.id, { subject: f.subject ? patchWords(m.subject, f.subject.ghl) : undefined, text: f.text ? patchWords(cur, f.text.ghl) : cur });
  }
  return out;
}

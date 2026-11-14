// GHL resync (Phase 4): compare a "Copy workflows" paste with the review package, and bring changes in.
// Shared by the page and the tests. No DOM, no Node APIs, no network: the UI does the one backend read
// (responses check before a remove) and passes the rows in.
//
// Compare gives four things:
//   changed messages · new / removed messages inside a matched workflow · NEW IN GHL workflows (build folders first)
//   · REMOVED / RENAMED package workflows (Match to… or Remove).
// Messages are matched by GHL step id, then step name, then order with a text-similarity check (never by position alone).
// The GHL ids/names live in the package details (pkg.ghlLinks, pkg.workflows[].ghlWorkflowId), not in the published files.
import {
  parseGhlPaste, ghlToChips, knownGhl, wordDiff, patchWords, words, editMessage, allMessages, stepOf, validatePackage,
  nextVersion, GHL_CHIPS, dateTexts, baseText
} from './review.js';

export const DEFAULT_BUILD_FOLDER = 'GHL Build (Andrew Cass)';
export const SUMMARY_PLACEHOLDER = '— fill in';
const KIND = { email: 'Email', sms: 'Text', live_chat_response: 'Text', internal_notification: 'Alert' };
const STEP_TYPE = { email: 'email', sms: 'sms', live_chat_response: 'chat', internal_notification: 'team' };
const clone = x => JSON.parse(JSON.stringify(x));
const norm = s => String(s ?? '').trim().replace(/\s+/g, ' ');
const lc = s => norm(s).toLowerCase();
const TEAM_PREFIX = /^Everyone on your team gets this text:\s*/;
const msgText = m => (m.kind === 'Alert' ? m.text.replace(TEAM_PREFIX, '') : m.text);
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

// ---------- message nodes of a GHL workflow ----------
// Web-lead / phone-lead style branches that send the SAME messages count once (the first branch); a warning says
// so when they no longer match. Branches with different messages are all kept.
function branchPlan(g) {
  const steps = g.steps || [];
  const msgs = steps.filter(s => KIND[s.type]);
  const branches = [...new Set(msgs.map(s => s.branch || ''))];
  const sig = list => list.map(s => `${s.type}|${words(s.subject).join(' ')}|${words(s.text).join(' ')}`).join('\n');
  if (branches.length < 2 || branches.every(b => !b)) {
    // older pastes (no branch info): two identical halves = two branches
    if (!msgs.some(s => 'branch' in s) && msgs.length % 2 === 0 && msgs.length) {
      const h = msgs.length / 2, a = msgs.slice(0, h), b = msgs.slice(h);
      if (a.every((n, i) => n.type === b[i].type && n.name === b[i].name)) return { skip: new Set(b), drift: sig(a) !== sig(b), first: 'first', other: 'second' };
    }
    return { skip: new Set(), drift: false };
  }
  const by = Object.fromEntries(branches.map(b => [b, msgs.filter(s => (s.branch || '') === b)]));
  const named = branches.filter(Boolean);
  const [first, ...rest] = named;
  const same = rest.filter(b => by[b].length === by[first].length && by[b].every((n, i) => n.type === by[first][i].type && n.name === by[first][i].name));
  const skip = new Set(same.flatMap(b => by[b]));
  const drift = same.some(b => sig(by[b]) !== sig(by[first]));
  return { skip, drift, first, other: same.join(', ') };
}
export function messageNodes(g) {
  const plan = branchPlan(g);
  return { nodes: (g.steps || []).filter(s => KIND[s.type] && !plan.skip.has(s)), plan };
}

// ---------- timing wording from the waits (same rules as the template) ----------
const unitWord = (n, u) => { const k = String(u || '').replace(/s$/, ''); const w = { day: 'day', hour: 'hour', minute: 'minute', week: 'week', month: 'month' }[k] || k; return `${n} ${w}${n === 1 ? '' : 's'}`; };
export function timeline(g) {
  const plan = branchPlan(g);
  let day = 0, mode = 'time', pending = null, lastAppt = '', n = 0;
  const out = new Map();
  for (const s of g.steps || []) {
    if (plan.skip.has(s)) continue;
    if (s.type === 'wait' && s.wait) {
      const amt = Number(s.wait.amount) || 0;
      if (s.wait.kind === 'appointment') { mode = 'appt'; pending = `${unitWord(amt, s.wait.unit)} before`; lastAppt = pending; }
      else {
        mode = 'time';
        const u = String(s.wait.unit || '').replace(/s$/, '');
        if (u === 'day') day += amt; else if (u === 'week') day += 7 * amt; else if (u === 'month') day += 30 * amt;
        pending = `${unitWord(amt, s.wait.unit)} later`;
      }
      continue;
    }
    if (!KIND[s.type]) continue;
    const first = n === 0;
    const label = mode === 'appt'
      ? { day: 'Before the appointment', when: pending ? cap(pending) : 'At the same time', gap: pending ? cap(pending) : 'At the same time', list: pending || `${lastAppt} · same time` }
      : { day: `Day ${day}`, when: pending ? cap(pending) : first ? 'Right away' : 'At the same time', gap: pending ? cap(pending) : first ? 'Right away' : 'At the same time', list: pending ? `Day ${day}` : first ? `Day ${day} · right away` : `Day ${day} · same time` };
    out.set(s, label); pending = null; n++;
  }
  return out;
}
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

// ---------- text helpers ----------
export function unknownFields(text) {
  return [...new Set([...String(text ?? '').matchAll(/\{\{\s*([\w.]+)\s*\}\}/g)].map(m => m[1]).filter(k => k !== 'location.name' && !GHL_CHIPS[k]))];
}
const ghlKind = n => KIND[n.type];
function ghlTexts(n, firm) {
  return { text: knownGhl(ghlToChips(n.text, firm), firm, 'text'), subject: n.type === 'email' ? knownGhl(ghlToChips(n.subject, firm), firm, 'subject') : undefined };
}
function similarity(m, n, firm) {
  const a = new Set(words(`${m.subject || ''} ${msgText(m)}`).map(w => w.toLowerCase()));
  const t = ghlTexts(n, firm), b = new Set(words(`${t.subject || ''} ${t.text}`).map(w => w.toLowerCase()));
  if (!a.size && !b.size) return 1;
  let inter = 0; for (const w of a) if (b.has(w)) inter++;
  return inter / (a.size + b.size - inter);
}

// Package messages ↔ GHL message nodes of ONE workflow: id → name → order with similarity.
export function matchMessages(pkg, mine, nodes, firm) {
  const links = pkg.ghlLinks || {};
  const pairs = [], usedM = new Set(), usedN = new Set();
  for (const m of mine) { const l = links[m.id]; const n = l && nodes.find(x => x.id && x.id === l.stepId && !usedN.has(x)); if (n && ghlKind(n) === m.kind) { pairs.push([m, n, 'id']); usedM.add(m); usedN.add(n); } }
  for (const m of mine) {
    if (usedM.has(m)) continue;
    const l = links[m.id]; if (!l?.name) continue;
    const c = nodes.filter(x => !usedN.has(x) && x.name === l.name && ghlKind(x) === m.kind);
    if (c.length === 1) { pairs.push([m, c[0], 'name']); usedM.add(m); usedN.add(c[0]); }
  }
  // order + similarity (an alignment: a message added or removed in the middle doesn't shift the rest)
  const A = mine.filter(m => !usedM.has(m)), B = nodes.filter(n => !usedN.has(n));
  const sim = A.map(m => B.map(n => (ghlKind(n) === m.kind ? similarity(m, n, firm) : 0)));
  const T = 0.3;
  const F = Array.from({ length: A.length + 1 }, () => new Float64Array(B.length + 1));
  for (let i = A.length - 1; i >= 0; i--) for (let j = B.length - 1; j >= 0; j--) F[i][j] = Math.max(F[i + 1][j], F[i][j + 1], sim[i][j] >= T ? sim[i][j] + F[i + 1][j + 1] : 0);
  for (let i = 0, j = 0; i < A.length && j < B.length;) {
    if (sim[i][j] >= T && Math.abs(F[i][j] - (sim[i][j] + F[i + 1][j + 1])) < 1e-9) { pairs.push([A[i], B[j], 'order']); usedM.add(A[i]); usedN.add(B[j]); i++; j++; }
    else if (F[i + 1][j] >= F[i][j + 1]) i++; else j++;
  }
  pairs.sort((x, y) => mine.indexOf(x[0]) - mine.indexOf(y[0]));
  return { pairs, newNodes: nodes.filter(n => !usedN.has(n)), removed: mine.filter(m => !usedM.has(m)) };
}

// ---------- who changed a message ----------
const same = (a, b) => words(a).join(' ') === words(b).join(' ');
// The GHL wording the builder last knew (pkg.ghlBase). For a package made before ghlBase existed, the record's History:
// if GHL still has the wording a builder edit replaced, the change came from the builder.
export function direction(pkg, rec, m, t) {
  const base = pkg.ghlBase?.[m.id];
  if (base) {
    const ghlChanged = !same(t.text, base.text) || (m.kind === 'Email' && base.subject != null && !same(t.subject, base.subject));
    const builderChanged = !same(msgText(m), base.text) || (m.kind === 'Email' && base.subject != null && !same(m.subject, base.subject));
    return ghlChanged && builderChanged ? 'both' : builderChanged ? 'builder' : 'ghl';
  }
  const ghlOld = `${t.subject ? `${t.subject} · ` : ''}${m.kind === 'Alert' ? `Everyone on your team gets this text: ${t.text}` : t.text}`;
  const edits = [...(rec?.review?.history || [])].filter(h => (h.reasons || []).includes('kickoff edit'));
  const flat = t => words(t).join(' ').slice(0, 250);   // History keeps up to 400 characters of each wording
  for (const h of edits) for (const x of h.messages || []) if (x.id === m.id && x.change === 'changed' && flat(x.old) === flat(ghlOld)) return 'builder';
  return 'ghl';
}
// Messages whose preview wording isn't in GHL yet (builder edits, template resyncs): the "Update GHL" lines.
export function ghlTodos(pkg) {
  const out = [];
  for (const sec of pkg.files?.messages?.sections || []) for (const m of sec.msgs || []) {
    const b = pkg.ghlBase?.[m.id]; if (!b) continue;
    if (!same(msgText(m), b.text) || (m.kind === 'Email' && b.subject != null && !same(m.subject, b.subject))) out.push({ id: m.id, text: `Update GHL: "${sec.title}" · ${m.kind} · ${m.when}: the wording was changed in the builder` });
  }
  return out;
}

// ---------- compare ----------
export function ghlDiff(pkg, paste, rec = {}) {
  const P = parseGhlPaste(typeof paste === 'string' ? paste : JSON.stringify(paste));
  const firm = pkg.firmName || pkg.files.data.client.name;
  const res = { warnings: [], diffs: [], tailored: [], conflicts: [], matched: [], newMessages: [], removedMessages: [], newWorkflows: { build: [], other: [] }, missing: [], links: [], paste: P, buildFolders: [] };
  if (rec.locationId && P.locationId && P.locationId !== rec.locationId) { res.warnings.push(`These workflows were copied from location ${P.locationId}, not this client's (${rec.locationId}). Nothing was compared.`); return res; }
  const msgs = allMessages(pkg), usedWf = new Set();
  for (const w of pkg.workflows || []) {
    const g = P.workflows.find(x => w.ghlWorkflowId && x.id === w.ghlWorkflowId) || P.workflows.find(x => lc(x.name) === lc(w.ghl));
    const name = pkg.files.data.automations.find(a => a.id === w.automation)?.name || w.automation;
    if (!g) { res.missing.push({ automation: w.automation, ghl: w.ghl, name }); continue; }
    usedWf.add(g);
    if (g.folder) res.buildFolders.push(g.folder);
    const mine = msgs.filter(m => m.id.startsWith(`${w.automation}.`));
    const { nodes, plan } = messageNodes(g);
    if (plan.drift) res.warnings.push(`In "${g.name}" the ${plan.other} branch no longer matches the ${plan.first} branch. Compared the ${plan.first} branch only.`);
    const tl = timeline(g);
    const { pairs, newNodes, removed } = matchMessages(pkg, mine, nodes, firm);
    for (const [m, n] of pairs) {
      const t = ghlTexts(n, firm), cur = msgText(m), fields = [];
      res.links.push({ id: m.id, stepId: n.id || null, name: n.name, workflowId: g.id || null, ghl: { text: t.text, ...(t.subject != null ? { subject: t.subject } : {}) } });
      if (!same(cur, t.text)) fields.push({ field: 'text', preview: cur, ghl: t.text, diff: wordDiff(cur, t.text) });
      if (m.kind === 'Email' && !same(m.subject, t.subject)) fields.push({ field: 'subject', preview: m.subject, ghl: t.subject, diff: wordDiff(m.subject, t.subject) });
      if (!fields.length) { res.matched.push(m.id); continue; }
      // Who changed it? GHL (→ Apply), the builder (→ update GHL, no Apply) or both (→ choose).
      const who = direction(pkg, rec, m, t);
      const d = { id: m.id, kind: m.kind, when: m.when, ghlStep: n.name, fields, who };
      (who === 'builder' ? res.tailored : who === 'both' ? res.conflicts : res.diffs).push(d);
    }
    for (const n of newNodes) {
      const t = ghlTexts(n, firm);
      res.newMessages.push({ automation: w.automation, automationName: name, workflowId: g.id || null, workflowName: g.name, stepId: n.id || null, ghlStep: n.name, kind: ghlKind(n), when: tl.get(n)?.list || '', subject: t.subject, text: t.text, after: precedingLinked(nodes, n, pairs) });
    }
    for (const m of removed) res.removedMessages.push({ id: m.id, automation: w.automation, automationName: name, kind: m.kind, when: m.when, subject: m.subject, text: msgText(m) });
  }
  if (!res.buildFolders.length) res.buildFolders.push(DEFAULT_BUILD_FOLDER);
  res.buildFolders = [...new Set(res.buildFolders)];
  for (const g of P.workflows) {
    if (usedWf.has(g)) continue;
    const s = summarizeWorkflow(g, firm);
    (res.buildFolders.some(f => lc(f) === lc(g.folder)) || res.buildFolders.some(f => lc(g.folder).startsWith(`${lc(f)} / `)) ? res.newWorkflows.build : res.newWorkflows.other).push(s);
  }
  // removed/renamed: candidates = GHL workflows nobody matched (build folders first)
  const cands = [...res.newWorkflows.build, ...res.newWorkflows.other].map(x => ({ id: x.id, name: x.name, folder: x.folder }));
  res.missing.forEach(x => { x.candidates = cands; });
  return res;
}
function precedingLinked(nodes, n, pairs) {
  for (let i = nodes.indexOf(n) - 1; i >= 0; i--) { const p = pairs.find(x => x[1] === nodes[i]); if (p) return p[0].id; }
  return null;
}
export function summarizeWorkflow(g, firm) {
  const { nodes } = messageNodes(g);
  const tl = timeline(g);
  const c = { Text: 0, Email: 0, Alert: 0 };
  nodes.forEach(n => { c[ghlKind(n)]++; });
  const counts = [c.Text && plural(c.Text, 'text'), c.Email && plural(c.Email, 'email'), c.Alert && plural(c.Alert, 'alert')].filter(Boolean).join(' · ') || 'no messages';
  return {
    id: g.id || null, name: g.name, folder: g.folder || '', status: lc(g.status) === 'published' ? 'Published' : 'Draft',
    triggers: (g.triggers || []).map(t => t.name || t.type).filter(Boolean), counts,
    msgs: nodes.map(n => ({ stepId: n.id || null, ghlStep: n.name, kind: ghlKind(n), when: tl.get(n)?.list || '', ...ghlTexts(n, firm) })),
    unknown: [...new Set(nodes.flatMap(n => unknownFields(`${n.subject || ''} ${n.text || ''}`)))]
  };
}

// ---------- apply ----------
// Brings the GHL wording into the preview (word by word, keeping the preview's line breaks) and remembers which
// GHL step each message is (pkg.ghlLinks) so the next compare matches by id.
export function applyGhl(pkg, diffs, links = []) {
  let out = pkg;
  for (const d of diffs) {
    const m = allMessages(out).find(x => x.id === d.id);
    const f = Object.fromEntries(d.fields.map(x => [x.field, x]));
    const cur = msgText(m);
    out = editMessage(out, d.id, { subject: f.subject ? patchWords(m.subject, f.subject.ghl) : undefined, text: f.text ? patchWords(cur, f.text.ghl) : cur });
  }
  return saveLinks(out, links);
}
export function saveLinks(pkg, links = []) {
  if (!links.length) return pkg;
  const out = clone(pkg);
  out.ghlLinks = { ...(out.ghlLinks || {}) };
  for (const l of links) out.ghlLinks[l.id] = { stepId: l.stepId, name: l.name };
  out.ghlBase = { ...(out.ghlBase || {}) };
  for (const l of links) if (l.ghl) out.ghlBase[l.id] = { ...l.ghl };   // what GHL says now
  for (const l of links) { const w = out.workflows?.find(x => l.id.startsWith(`${x.automation}.`)); if (w && l.workflowId && !w.ghlWorkflowId) w.ghlWorkflowId = l.workflowId; }
  return out;
}
export function logChange(pkg, entry) {
  return { ...pkg, changeLog: [...(pkg.changeLog || []), { at: new Date().toISOString(), ...entry }] };
}

// ---------- new workflow → new automation ----------
export function automationSlug(name, taken) {
  const base = String(name || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/&/g, ' ').replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/, '') || 'automation';
  let s = base; for (let i = 2; taken.has(s); i++) s = `${base}-${i}`;
  return s;
}
export function addWorkflow(pkg, g, { now = new Date(), by = '' } = {}) {
  if ((pkg.workflows || []).some(w => (g.id && w.ghlWorkflowId === g.id) || lc(w.ghl) === lc(g.name))) throw new Error(`"${g.name}" is already in the review package.`);
  const out = clone(pkg), firm = out.firmName || out.files.data.client.name;
  const taken = new Set([...out.files.data.automations.map(a => a.id), ...(out.retiredIds || [])]);
  const id = automationSlug(g.name, taken);
  const { nodes } = messageNodes(g);
  if (!nodes.length) throw new Error(`"${g.name}" has no texts, emails or team alerts to review.`);
  const tl = timeline(g);
  const sum = summarizeWorkflow(g, firm);
  const trig = sum.triggers.length ? sum.triggers.join(' or ') : 'the workflow is triggered in GHL';
  const steps = [{ id: 's1', day: 'Day 0', type: 'start', when: 'Start', title: `Starts when: ${trig}`, body: `This automation starts when: ${trig}.`, ...(sum.status === 'Draft' ? { note: 'Still in Draft in GHL, so nothing is being sent yet. It goes live once you approve.' } : {}) }];
  const msgsOut = [], counter = { Text: 0, Email: 0, Alert: 0 }, links = {}, bases = {}, blanks = new Set(out.files.messages.blanks || []);
  nodes.forEach((n, i) => {
    const k = ghlKind(n), t = ghlTexts(n, firm), when = tl.get(n), sid = `s${i + 2}`;
    counter[k]++;
    const unk = unknownFields(`${n.subject || ''} ${n.text || ''}`);
    unk.forEach(u => blanks.add(u));
    const note = unk.length ? `${unk.map(u => `[${u}]`).join(', ')} isn't a standard field: tell us what it should say, or we'll fill it in with you.` : undefined;
    const base = { id: sid, day: when.day, when: when.when, gap: when.gap, ...(note ? { note } : {}) };
    if (k === 'Alert') {
      steps.push({ ...base, type: 'team', who: 'team', title: counter.Alert > 1 ? `Alert ${counter.Alert} to your team` : 'Your team gets an alert', body: `Everyone on your team gets this text:\n\n${t.text}` });
      msgsOut.push({ id: `${id}.${sid}`, kind: 'Alert', to: 'To your team', when: when.list, text: `Everyone on your team gets this text:\n\n${t.text}` });
    } else if (k === 'Email') {
      steps.push({ ...base, type: 'email', who: 'patient', title: `Email ${counter.Email}`, email: { subject: t.subject, body: t.text } });
      msgsOut.push({ id: `${id}.${sid}`, kind: 'Email', when: when.list, subject: t.subject, text: t.text });
    } else {
      steps.push({ ...base, type: STEP_TYPE[n.type], who: 'patient', title: `Text ${counter.Text}`, sms: t.text });
      msgsOut.push({ id: `${id}.${sid}`, kind: 'Text', when: when.list, text: t.text });
    }
    if (n.id || n.name) links[`${id}.${sid}`] = { stepId: n.id || null, name: n.name };
    bases[`${id}.${sid}`] = { text: t.text, ...(k === 'Email' ? { subject: t.subject } : {}) };
  });
  steps.push({ id: `s${nodes.length + 2}`, day: steps[steps.length - 1].day, type: 'end', when: 'End', gap: 'Then', title: 'The automation ends', body: 'Nothing more is sent from this automation.' });
  const lead = [counter.Text && plural(counter.Text, 'text'), counter.Email && plural(counter.Email, 'email')].filter(Boolean).join(', ') || 'Nothing';
  out.files.data.automations.push({
    id, name: g.name, version: '1.0', sent: dateTexts(now).sent, source: 'custom', ghlName: g.name,
    summary: `${g.name}: what it does ${SUMMARY_PLACEHOLDER}`,
    glance: [['Starts when', cap(trig)], ['Lead receives', lead], ['Your team receives', counter.Alert ? plural(counter.Alert, 'alert') : 'Nothing'], ['Ends', 'After the last message']],
    steps, questions: []
  });
  out.files.messages.sections.push({ title: g.name, sub: `${sum.counts}.`, msgs: msgsOut });
  if (blanks.size) out.files.messages.blanks = [...blanks];
  out.workflows = [...(out.workflows || []), { automation: id, ghl: g.name, ghlWorkflowId: g.id || null, lead: lead }];
  out.ghlLinks = { ...(out.ghlLinks || {}), ...links };
  out.ghlBase = { ...(out.ghlBase || {}), ...bases };
  if (sum.status === 'Draft') out.checklist = [...(out.checklist || []), { text: `Switch on "${g.name}" in GHL after approval (it's still Draft)`, done: false }];
  return { pkg: logChange(out, { by, reason: 'new workflow', automation: id }), id };
}

// Renamed in GHL: point the package automation at that GHL workflow (ids and responses stay).
export function matchWorkflow(pkg, automation, g) {
  const out = clone(pkg);
  const w = out.workflows.find(x => x.automation === automation);
  if (!w) throw new Error(`${automation} isn't in this package.`);
  if (out.workflows.some(x => x !== w && ((g.id && x.ghlWorkflowId === g.id) || lc(x.ghl) === lc(g.name)))) throw new Error(`"${g.name}" is already matched to another automation.`);
  Object.assign(w, { ghl: g.name, ghlWorkflowId: g.id || null });
  return out;
}

// Responses on an automation (or one of its messages) in the Sheet: rows + content edits from the backend's
// public GET ?client=<code>. Removing is refused while there are any.
export function responsesFor(rowsAndContent, automation, step) {
  const rows = (rowsAndContent?.rows || []).filter(r => r.automation === automation && (!step || r.step === step));
  const content = (rowsAndContent?.content || []).filter(c => c.automation === automation && (!step || String(c.field || '').startsWith(`step:${step}:`)));
  return { count: rows.length + content.length, rows: rows.length, content: content.length,
    kinds: [...new Set(rows.map(r => ({ approve: 'Looks good', change: 'change request', copy: 'new wording', answer: 'answer', approve_all: 'approval', undo: 'undo' }[r.action] || r.action)).concat(content.length ? ['content edit'] : []))] };
}
export function removeAutomation(pkg, automation, responses, { by = '' } = {}) {
  if (responses && responses.count) throw new Error(`Not removed: the Sheet has ${responses.count} response${responses.count === 1 ? '' : 's'} on this automation (${responses.kinds.join(', ')}). Responses are never deleted; keep it, or Match it to the renamed GHL workflow.`);
  const out = clone(pkg);
  const a = out.files.data.automations.find(x => x.id === automation); if (!a) throw new Error(`${automation} isn't in this package.`);
  out.files.data.automations = out.files.data.automations.filter(x => x.id !== automation);
  out.files.messages.sections = out.files.messages.sections.map(s => ({ ...s, msgs: s.msgs.filter(m => !m.id.startsWith(`${automation}.`)) })).filter(s => s.msgs.length);
  out.workflows = (out.workflows || []).filter(w => w.automation !== automation);
  out.retiredIds = [...new Set([...(out.retiredIds || []), automation])];
  if (out.ghlLinks) for (const k of Object.keys(out.ghlLinks)) if (k.startsWith(`${automation}.`)) delete out.ghlLinks[k];
  return logChange(out, { by, reason: 'removed workflow', automation, name: a.name });
}

// A message added in GHL inside a matched workflow → a new step + message right after its GHL predecessor.
export function addMessage(pkg, nm, { by = '' } = {}) {
  const out = clone(pkg);
  const a = out.files.data.automations.find(x => x.id === nm.automation); if (!a) throw new Error(`${nm.automation} isn't in this package.`);
  if (nm.stepId && Object.values(out.ghlLinks || {}).some(l => l.stepId === nm.stepId)) throw new Error('That GHL message is already in the package.');
  const num = Math.max(0, ...a.steps.map(s => Number(String(s.id).replace(/^s/, '')) || 0)) + 1, sid = `s${num}`, id = `${a.id}.${sid}`;
  const prev = nm.after ? stepOf(out, nm.after) : null;
  const day = prev ? prev.day : a.steps[0].day;
  const when = nm.when || 'Added in GHL';
  const step = nm.kind === 'Alert' ? { id: sid, day, type: 'team', who: 'team', when, gap: when, title: 'Your team gets an alert', body: `Everyone on your team gets this text:\n\n${nm.text}` }
    : nm.kind === 'Email' ? { id: sid, day, type: 'email', who: 'patient', when, gap: when, title: 'New email', email: { subject: nm.subject, body: nm.text } }
    : { id: sid, day, type: 'sms', who: 'patient', when, gap: when, title: 'New text', sms: nm.text };
  const at = prev ? a.steps.indexOf(prev) + 1 : a.steps.length - (a.steps[a.steps.length - 1].type === 'end' ? 1 : 0);
  a.steps.splice(at, 0, step);
  const msg = nm.kind === 'Alert' ? { id, kind: 'Alert', to: 'To your team', when, text: step.body } : nm.kind === 'Email' ? { id, kind: 'Email', when, subject: nm.subject, text: nm.text } : { id, kind: 'Text', when, text: nm.text };
  let sec = nm.after && out.files.messages.sections.find(s => s.msgs.some(m => m.id === nm.after));
  if (!sec) sec = out.files.messages.sections.find(s => s.msgs.some(m => m.id.startsWith(`${a.id}.`)));
  if (!sec) { sec = { title: a.name, sub: '', msgs: [] }; out.files.messages.sections.push(sec); }
  const k = nm.after ? sec.msgs.findIndex(m => m.id === nm.after) + 1 : sec.msgs.length;
  sec.msgs.splice(k || sec.msgs.length, 0, msg);
  unknownFields(`${nm.subject || ''} ${nm.text || ''}`); // (chips already converted)
  touch(out, a);
  if (nm.stepId || nm.ghlStep) out.ghlLinks = { ...(out.ghlLinks || {}), [id]: { stepId: nm.stepId || null, name: nm.ghlStep || null } };
  out.ghlBase = { ...(out.ghlBase || {}), [id]: { text: nm.text, ...(nm.kind === 'Email' ? { subject: nm.subject } : {}) } };
  return logChange(out, { by, reason: 'GHL resync', message: id, change: 'added' });
}
export function removeMessage(pkg, msgId, responses, { by = '' } = {}) {
  if (responses && responses.count) throw new Error(`Not removed: the Sheet has ${responses.count} response${responses.count === 1 ? '' : 's'} on this message (${responses.kinds.join(', ')}).`);
  const out = clone(pkg);
  const i = msgId.lastIndexOf('.'), aId = msgId.slice(0, i), sid = msgId.slice(i + 1);
  const a = out.files.data.automations.find(x => x.id === aId); if (!a) throw new Error(`${msgId} isn't in this package.`);
  a.steps = a.steps.filter(s => s.id !== sid);
  out.files.messages.sections = out.files.messages.sections.map(s => ({ ...s, msgs: s.msgs.filter(m => m.id !== msgId) })).filter(s => s.msgs.length);
  if (out.ghlLinks) delete out.ghlLinks[msgId];
  touch(out, a);
  return logChange(out, { by, reason: 'GHL resync', message: msgId, change: 'removed' });
}
// Same rule as editMessage: a changed template automation becomes "customised"; after a publish its version goes up once.
function touch(out, a) {
  if (a.source === 'template') a.source = 'customised';
  const pv = out.published?.versions?.[a.id];
  if (pv != null && String(a.version) === String(pv)) a.version = nextVersion(a.version);
}

// ---------- tailoring new automations ----------
export function setSummary(pkg, automation, text) {
  const out = clone(pkg), a = out.files.data.automations.find(x => x.id === automation);
  if (!a) throw new Error(`${automation} isn't in this package.`);
  if (!norm(text) || norm(text).endsWith(SUMMARY_PLACEHOLDER)) throw new Error('Write what this automation does (one or two sentences).');
  a.summary = norm(text);
  return out;
}
export function addQuestion(pkg, automation, { q, why = '', opts = [] }) {
  const out = clone(pkg), a = out.files.data.automations.find(x => x.id === automation);
  if (!a) throw new Error(`${automation} isn't in this package.`);
  if (!norm(q)) throw new Error('Type the question.');
  const options = opts.map(norm).filter(Boolean);
  const taken = new Set(out.files.messages.questions.map(x => x.id));
  let n = 1, id; do { id = `${automation}-q${n++}`; } while (taken.has(id));
  out.files.messages.questions.push({ id, q: norm(q), why: norm(why), opts: options });
  if (options.length) a.questions = [...(a.questions || []), { id: `q${(a.questions || []).length + 1}`, text: norm(q), why: norm(why), options }];
  return out;
}
// What stops Publish (besides validatePackage): a new automation whose summary is still the placeholder.
export function publishBlockers(pkg) {
  return (pkg.files?.data?.automations || []).filter(a => String(a.summary || '').endsWith(SUMMARY_PLACEHOLDER))
    .map(a => `"${a.name}" still has the placeholder summary. Write what it does under Tailor the wording, then Publish.`);
}

// ---------- history (one entry per Publish) ----------
// old/new = the published files before and after (parsed). Per message: changed (old → new), added, removed.
export function historyEntry(oldFiles, newFiles, { at, by, changeLog = [] }) {
  const list = f => (f?.messages?.sections || []).flatMap(s => s.msgs || []);
  const O = Object.fromEntries(list(oldFiles).map(m => [m.id, m])), N = Object.fromEntries(list(newFiles).map(m => [m.id, m]));
  const short = m => (m ? `${m.subject ? `${m.subject} · ` : ''}${m.text}`.slice(0, 400) : '');
  const messages = [];
  for (const id of Object.keys(N)) {
    if (!O[id]) messages.push({ id, change: 'added', new: short(N[id]) });
    else if (O[id].text !== N[id].text || (O[id].subject || '') !== (N[id].subject || '')) messages.push({ id, change: 'changed', old: short(O[id]), new: short(N[id]) });
  }
  for (const id of Object.keys(O)) if (!N[id]) messages.push({ id, change: 'removed', old: short(O[id]) });
  const reasons = [...new Set(changeLog.map(c => c.reason).filter(Boolean))];
  if (!oldFiles) reasons.unshift('first publish');
  const versions = Object.fromEntries((newFiles?.data?.automations || []).map(a => [a.id, a.version]));
  // a first publish: just the count (every message is new; listing them all is noise)
  if (!oldFiles) return { at, by, reasons, messages: [], total: list(newFiles).length, versions };
  return { at, by, reasons: reasons.length ? reasons : ['re-publish'], messages, versions };
}

// Webforms add-on + per-client links. Shared by the page (browser) and scripts/desk-ticket.mjs (Node),
// so the ticket preview and the ticket that is sent are built by the same code. No DOM, no Node APIs.
//
// Reference ticket: Desk #3640383 (Emery Law Office, 10 Nov 2026).

export const DESK_SITE = 'wpplfmp.teamwork.com';
export const deskTicketUrl = id => `https://${DESK_SITE}/desk/tickets/${id}`;
export const BRANDS = ['LFMP', 'WPP'];
export const KPI_PREFIX = 'https://peejayedz.github.io/leadpro-kpi/';
export const REVIEW_PREFIX = 'https://peejayedz.github.io/automation-review/';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const norm = s => String(s ?? '').trim();

// ---------- domain ----------
export const isDomain = d => /^(?=.{4,253}$)([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/.test(String(d || ''));
// "https://www.EmeryLawOffice.com/contact" -> "emerylawoffice.com"
export function domainOf(website) {
  const t = norm(website);
  if (!t) return '';
  try {
    const u = new URL(/^https?:\/\//i.test(t) ? t : `https://${t}`);
    return u.hostname.toLowerCase().replace(/\.$/, '').replace(/^www\./, '');
  } catch { return ''; }
}

// ---------- CSM ----------
// Desk tag "CSM-Nico" -> "Nico"
export const csmName = tagName => String(tagName || '').replace(/^CSM\s*-\s*/i, '').trim();
export const isCsmTag = tagName => /^CSM\s*-\s*\S/i.test(String(tagName || ''));

// ---------- links ----------
// key, short label (list button), long label (details), what's missing (tooltip), rule
const startsWith = (prefix, what) => v => (v.startsWith(prefix) ? '' : `${what} must start with ${prefix}`);
const host = (hosts, what) => v => {
  let u; try { u = new URL(v); } catch { return `${what}: paste the full link, starting with https://`; }
  return u.protocol === 'https:' && hosts.includes(u.hostname.toLowerCase()) ? '' : `${what} must be a link on ${hosts.join(' or ')}`;
};
export const LINKS = [
  { key: 'ghl', short: 'GHL', label: 'GHL sub-account', missing: 'No GHL link', check: host(['app.lawfirmmarketingpros.com', 'app.gohighlevel.com'], 'GHL link') },
  { key: 'zap', short: 'Zap', label: 'Zap (Zapier)', missing: 'No Zap yet', check: startsWith('https://zapier.com/', 'Zap link') },
  { key: 'webhook', short: 'Webhook', label: 'Webhook URL', missing: 'No webhook yet', check: startsWith('https://hooks.zapier.com/hooks/catch/', 'Webhook URL'), noButton: true },
  { key: 'ticket', short: 'Ticket', label: 'Desk ticket', missing: 'No ticket yet', check: v => host([DESK_SITE], 'Ticket link')(v) || (ticketIdFromUrl(v) ? '' : 'Ticket link must include the ticket number, e.g. …/desk/tickets/3640383') },
  { key: 'kpi', short: 'KPI', label: 'KPI dashboard', missing: 'No KPI dashboard yet', check: startsWith(KPI_PREFIX, 'KPI link') },
  { key: 'sheet', short: 'Sheet', label: 'Mastersheet', missing: 'No Mastersheet yet', check: startsWith('https://docs.google.com/spreadsheets/', 'Mastersheet link') },
  // Automation review (Phase 4): A = plan page (the default link, the list's "Review" button), B = messages page (re-reviews).
  { key: 'review', short: 'Review', label: 'Review page A (plan)', missing: 'No review page yet', check: startsWith(REVIEW_PREFIX, 'Review link') },
  { key: 'reviewMessages', short: 'Msgs', label: 'Review page B (messages)', missing: 'No review page yet', check: startsWith(REVIEW_PREFIX, 'Review link'), noButton: true },
];
export const LINK = Object.fromEntries(LINKS.map(l => [l.key, l]));
// '' when fine (empty is fine: links are optional), else a plain message.
export function checkLink(key, value) {
  const v = norm(value);
  if (!v) return '';
  if (/\s/.test(v)) return 'A link has no spaces. Paste just the link.';
  return LINK[key]?.check ? LINK[key].check(v) : '';
}
export function ticketIdFromUrl(url) {
  const m = String(url || '').match(/(?:\/tickets\/|#tickets\/)(\d{3,})/);
  return m ? Number(m[1]) : null;
}
export const ghlLinkFor = (locationId, base = 'https://app.lawfirmmarketingpros.com') => `${base.replace(/\/$/, '')}/v2/location/${locationId}/dashboard`;

// All links of a record, filling GHL in automatically when it's missing.
export function recordLinks(rec) {
  const l = { ...(rec?.links || {}) };
  if (!norm(l.ghl) && rec?.locationId) l.ghl = ghlLinkFor(rec.locationId);
  const out = {};
  for (const { key } of LINKS) out[key] = norm(l[key]);
  return out;
}

// ---------- ticket ----------
export const ticketSubject = (businessName, domain) => `Connect Webforms to GHL - ${norm(businessName)} - ${norm(domain)}`;

// Same wording, order and links as #3640383. Desk adds the agent signature itself.
export function ticketBodyHtml({ webhook, zap, sheet }) {
  const a = (href, text) => `<a target="_blank" href="${esc(href)}" rel="nofollow noreferrer noopener">${esc(text)}</a>`;
  return [
    '<div><div>Hi Team,<br/></div><div><br/></div>',
    '<div>Requesting your assistance in connecting all the web forms to the webhook below.<br/></div><div><br/></div>',
    `<div><div>Webhook: ${a(webhook, webhook)}<br/></div><div><br/></div>`,
    `<div>Zapier: <br/></div>${a(zap, zap)}</div><div><br/></div>`,
    `<div>${a(sheet, 'Mastersheet')}<br/></div><div><br/></div>`,
    '<div>Please let me know once this is live so I can proceed with testing.<br/></div><div><br/></div>',
    '<div>Thank you!<br/></div></div>',
  ].join('');
}
// Plain-text version of the body for the preview.
export function ticketBodyText({ webhook, zap, sheet }) {
  return ['Hi Team,', '', 'Requesting your assistance in connecting all the web forms to the webhook below.', '', `Webhook: ${webhook}`, '', 'Zapier:', zap, '', `Mastersheet (link: ${sheet})`, '', 'Please let me know once this is live so I can proceed with testing.', '', 'Thank you!'].join('\n');
}

// Everything the ticket needs, from the record + Desk settings. `problems` lists what blocks sending.
// rec.webforms: { domain, project: {id, name} | {none: true} | null, ticket, send, lastAttempt }
export function ticketPlan(rec, settings = {}) {
  const wf = rec?.webforms || {};
  const links = recordLinks(rec);
  const domain = norm(wf.domain) || domainOf(rec?.submitted?.website);
  const brand = rec?.brand || 'LFMP';
  const csm = rec?.csm || null;
  const tagIds = settings.tags || {};
  const problems = [];
  if (!rec?.webformsRequested) problems.push('The webforms ticket is not requested for this client.');
  if (!isDomain(domain)) problems.push(domain ? `"${domain}" doesn't look like a website domain.` : 'Add the client\'s website domain (e.g. emerylawoffice.com).');
  for (const k of ['webhook', 'zap', 'sheet']) {
    if (!links[k]) problems.push(`Add the ${LINK[k].label}.`);
    else { const m = checkLink(k, links[k]); if (m) problems.push(m); }
  }
  if (!csm?.id) problems.push('Choose the CSM.');
  if (!BRANDS.includes(brand)) problems.push('Choose the brand (LFMP or WPP).');
  else if (!tagIds[brand]) problems.push(`The "${brand}" tag isn't in the Desk settings yet. Press Refresh Desk data.`);
  if (!tagIds.websiteMaintenance) problems.push('The "Website Maintenance" tag isn\'t in the Desk settings yet. Press Refresh Desk data.');
  for (const k of ['inboxId', 'customerId', 'agentId', 'typeId', 'priorityId']) if (!settings[k]) problems.push(`Desk setting ${k} is missing. Press Refresh Desk data.`);
  if (!wf.project) problems.push('Choose the Teamwork project, or "No project".');
  const ticket = ticketOf(rec);
  if (ticket) problems.push(`Already sent: ticket #${ticket.id}.`);
  const warnings = [];
  if (wf.project?.none) warnings.push('No Teamwork project: the ticket will not be linked to a project.');
  const subject = ticketSubject(rec?.businessName, domain);
  const tags = [
    { id: tagIds.websiteMaintenance, name: 'Website Maintenance' },
    { id: tagIds[brand], name: brand },
    { id: csm?.id, name: csm?.tag || (csm?.name ? `CSM-${csm.name}` : '') },
    { id: null, name: domain, domainTag: true },
  ];
  return {
    ok: problems.length === 0, problems, warnings, subject, domain, brand, csm, tags,
    project: wf.project?.id ? wf.project : null,
    bodyHtml: ticketBodyHtml(links), bodyText: ticketBodyText(links),
    inbox: { id: settings.inboxId, name: settings.inboxName || 'WEBTEAM' },
    customer: { id: settings.customerId, name: settings.customerName || '' },
    agent: { id: settings.agentId, name: settings.agentName || 'WEBTEAM Support' },
    type: { id: settings.typeId, name: settings.typeName || 'Request' },
    priority: { id: settings.priorityId, name: settings.priorityName || 'High' },
    source: settings.sourceId ? { id: settings.sourceId, name: settings.sourceName || 'Email (Manual)' } : null,
    notifyCustomer: false,
  };
}

// The exact body sent to Desk's "create ticket" call (flat, per Desk's create.Message schema).
export function deskTicketBody(plan, domainTagId) {
  const b = {
    subject: plan.subject, message: plan.bodyHtml, editMethod: 'html',
    inbox: { id: plan.inbox.id }, customer: { id: plan.customer.id }, agent: { id: plan.agent.id },
    type: { id: plan.type.id }, priority: { id: plan.priority.id },
    tags: [...plan.tags.filter(t => !t.domainTag).map(t => ({ id: t.id })), { id: domainTagId }],
    notifyCustomer: false,
  };
  if (plan.source?.id) b.source = { id: plan.source.id };
  if (plan.project?.id) b.project = { id: plan.project.id };
  return b;
}

// ---------- Teamwork project matching ----------
const words = s => String(s || '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(w => w && !['the', 'law', 'pllc', 'llc', 'pc', 'p', 'c', 'cmp', 'and', 'of', 'group', 'firm', 'office'].includes(w));
// Projects whose name has every meaningful word of the query as a whole word (e.g. "Emery Law Office" -> "emery").
// Only when nothing matches whole words do partial words count (so typing "emer" still finds Emery).
export function matchProjects(query, projects, limit = 8) {
  const q = words(query);
  if (!q.length) return [];
  const by = test => (projects || []).filter(p => { const w = words(p.name); return q.every(x => w.some(y => test(y, x))); });
  let hits = by((y, x) => y === x);
  if (!hits.length) hits = by((y, x) => y.startsWith(x));
  return hits
    .sort((a, b) => (/ - CMP\b/.test(b.name) - / - CMP\b/.test(a.name)) || a.name.localeCompare(b.name) || a.id - b.id)
    .slice(0, limit);
}
// Names that appear more than once in a list of projects.
export const sharedNames = list => { const c = {}; for (const p of list) c[p.name] = (c[p.name] || 0) + 1; return new Set(Object.keys(c).filter(k => c[k] > 1)); };

// ---------- status ----------
export function ticketOf(rec) {
  const t = rec?.webforms?.ticket;
  if (t?.id) return { id: t.id, url: t.url || deskTicketUrl(t.id) };
  const id = ticketIdFromUrl(rec?.links?.ticket);
  return id ? { id, url: rec.links.ticket } : null;
}
const SENDING_LIMIT_MS = 15 * 60e3;
export function webformsStatus(rec, now = Date.now()) {
  const t = ticketOf(rec);
  if (t) return { key: 'sent', label: `Ticket sent #${t.id}`, tone: 'good', ticket: t };
  if (!rec?.webformsRequested) return { key: 'off', label: 'Not requested', tone: '' };
  const wf = rec.webforms || {}, la = wf.lastAttempt, send = wf.send;
  if (send?.requestId && la?.requestId !== send.requestId) {
    if (now - Date.parse(send.at || 0) < SENDING_LIMIT_MS) return { key: 'sending', label: 'Sending…', tone: 'info' };
    return { key: 'failed', label: 'Failed', tone: 'bad', reason: "GitHub didn't finish sending the ticket. Its Actions minutes or billing may need attention. Nothing was sent; try again." };
  }
  if (la && !la.ok) return { key: 'failed', label: 'Failed', tone: 'bad', reason: la.message, existingId: la.existingId || null };
  const l = recordLinks(rec);
  if (!l.webhook || !l.zap) return { key: 'zap', label: 'Waiting for Zap', tone: 'warn' };
  // Zap is there; anything else missing (sheet, CSM, domain, project) still blocks sending.
  const domain = norm(wf.domain) || domainOf(rec?.submitted?.website);
  if (!l.sheet || !rec.csm?.id || !isDomain(domain) || !wf.project) return { key: 'details', label: 'Waiting for details', tone: 'warn' };
  return { key: 'ready', label: 'Ready to send', tone: 'info' };
}

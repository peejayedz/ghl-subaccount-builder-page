// Shared rules for the Sub-account Builder.
// Used by the page (browser) AND by scripts/create.mjs (Node), so validation and duplicate
// matching are identical in both places. No DOM, no Node APIs.

import { ALL_TIMEZONE_IDS } from './timezones.js';
import { BRANDS, checkLink } from './webforms.js';

export const VERSION = '1.1.0';

// ---------- option lists ----------
export const PRACTICE = ['Personal Injury', 'Family Law', 'Criminal Defense', 'Immigration', 'Estate Planning', 'Employment', 'Bankruptcy', 'Business/Corporate', 'Other'];

export const US_STATES = [
  ['AL', 'Alabama'], ['AK', 'Alaska'], ['AZ', 'Arizona'], ['AR', 'Arkansas'], ['CA', 'California'], ['CO', 'Colorado'],
  ['CT', 'Connecticut'], ['DE', 'Delaware'], ['DC', 'District of Columbia'], ['FL', 'Florida'], ['GA', 'Georgia'], ['HI', 'Hawaii'],
  ['ID', 'Idaho'], ['IL', 'Illinois'], ['IN', 'Indiana'], ['IA', 'Iowa'], ['KS', 'Kansas'], ['KY', 'Kentucky'], ['LA', 'Louisiana'],
  ['ME', 'Maine'], ['MD', 'Maryland'], ['MA', 'Massachusetts'], ['MI', 'Michigan'], ['MN', 'Minnesota'], ['MS', 'Mississippi'],
  ['MO', 'Missouri'], ['MT', 'Montana'], ['NE', 'Nebraska'], ['NV', 'Nevada'], ['NH', 'New Hampshire'], ['NJ', 'New Jersey'],
  ['NM', 'New Mexico'], ['NY', 'New York'], ['NC', 'North Carolina'], ['ND', 'North Dakota'], ['OH', 'Ohio'], ['OK', 'Oklahoma'],
  ['OR', 'Oregon'], ['PA', 'Pennsylvania'], ['RI', 'Rhode Island'], ['SC', 'South Carolina'], ['SD', 'South Dakota'],
  ['TN', 'Tennessee'], ['TX', 'Texas'], ['UT', 'Utah'], ['VT', 'Vermont'], ['VA', 'Virginia'], ['WA', 'Washington'],
  ['WV', 'West Virginia'], ['WI', 'Wisconsin'], ['WY', 'Wyoming'], ['PR', 'Puerto Rico'],
];

export const COUNTRIES = [
  ['US', 'United States'], ['CA', 'Canada'], ['GB', 'United Kingdom'], ['AU', 'Australia'], ['NZ', 'New Zealand'],
  ['IE', 'Ireland'], ['PH', 'Philippines'], ['MX', 'Mexico'], ['PR', 'Puerto Rico'], ['ZA', 'South Africa'],
  ['IN', 'India'], ['AE', 'United Arab Emirates'], ['DE', 'Germany'], ['FR', 'France'], ['ES', 'Spain'], ['IT', 'Italy'], ['NL', 'Netherlands'],
];

// ---------- time zones ----------
// Values are IANA names (e.g. America/New_York). GHL is expected to use the same form; the token check
// (check.yml) prints [AGCY]'s own value to confirm it. If GHL turns out to want something else, change
// toGhlTimezone() only: the record always keeps the IANA name so the KPI dashboard can use it.
export const COMMON_TIMEZONES = [
  ['America/New_York', 'Eastern Time (New York)'],
  ['America/Chicago', 'Central Time (Chicago)'],
  ['America/Denver', 'Mountain Time (Denver)'],
  ['America/Phoenix', 'Mountain Time \u2013 Arizona (Phoenix)'],
  ['America/Los_Angeles', 'Pacific Time (Los Angeles)'],
  ['America/Anchorage', 'Alaska'],
  ['Pacific/Honolulu', 'Hawaii'],
];
const COMMON_IDS = new Set(COMMON_TIMEZONES.map(([z]) => z));
// "America/Argentina/Buenos_Aires" -> "America / Argentina / Buenos Aires"
const plainTz = id => id.replace(/_/g, ' ').split('/').join(' / ');
export const OTHER_TIMEZONES = ALL_TIMEZONE_IDS.filter(z => !COMMON_IDS.has(z)).map(z => [z, plainTz(z)]);
export const TIMEZONES = [...COMMON_TIMEZONES, ...OTHER_TIMEZONES];
export const tzLabel = id => (id ? (COMMON_TIMEZONES.find(([z]) => z === id)?.[1] || plainTz(id)) : '');
// What GHL receives. Identity until the token check confirms GHL's format.
export const toGhlTimezone = id => id;

// Suggestion from the US state: always one of the plain-named zones above (Puerto Rico excepted).
const TZ_BY_STATE = {
  AL: 'America/Chicago', AK: 'America/Anchorage', AZ: 'America/Phoenix', AR: 'America/Chicago', CA: 'America/Los_Angeles',
  CO: 'America/Denver', CT: 'America/New_York', DE: 'America/New_York', DC: 'America/New_York', FL: 'America/New_York',
  GA: 'America/New_York', HI: 'Pacific/Honolulu', ID: 'America/Denver', IL: 'America/Chicago', IN: 'America/New_York',
  IA: 'America/Chicago', KS: 'America/Chicago', KY: 'America/New_York', LA: 'America/Chicago', ME: 'America/New_York',
  MD: 'America/New_York', MA: 'America/New_York', MI: 'America/New_York', MN: 'America/Chicago', MS: 'America/Chicago',
  MO: 'America/Chicago', MT: 'America/Denver', NE: 'America/Chicago', NV: 'America/Los_Angeles', NH: 'America/New_York',
  NJ: 'America/New_York', NM: 'America/Denver', NY: 'America/New_York', NC: 'America/New_York', ND: 'America/Chicago',
  OH: 'America/New_York', OK: 'America/Chicago', OR: 'America/Los_Angeles', PA: 'America/New_York', RI: 'America/New_York',
  SC: 'America/New_York', SD: 'America/Chicago', TN: 'America/Chicago', TX: 'America/Chicago', UT: 'America/Denver',
  VT: 'America/New_York', VA: 'America/New_York', WA: 'America/Los_Angeles', WV: 'America/New_York', WI: 'America/Chicago',
  WY: 'America/Denver', PR: 'America/Puerto_Rico',
};
// Some states span two zones (e.g. western Florida panhandle, Indiana, Texas); the suggestion is the zone most of the state uses.
export const suggestTimezone = state => TZ_BY_STATE[String(state || '').toUpperCase()] || '';

// GHL social keys -> labels. Only non-empty ones are sent.
export const SOCIAL = [
  ['facebookUrl', 'Facebook', 'url'], ['instagram', 'Instagram', 'url'], ['linkedIn', 'LinkedIn', 'url'],
  ['youtube', 'YouTube', 'url'], ['twitter', 'X / Twitter', 'url'], ['yelp', 'Yelp', 'url'], ['googlePlacesId', 'Google Places ID', 'text'],
];
// GHL location settings keys. Only sent when changed from "leave as GHL default".
export const SETTINGS = [
  ['allowDuplicateContact', 'Allow duplicate contacts'],
  ['allowDuplicateOpportunity', 'Allow duplicate opportunities'],
  ['allowFacebookNameMerge', 'Facebook name merge'],
  ['disableContactTimezone', 'Disable contact timezone'],
];

// ---------- formatting ----------
export const digits = s => String(s ?? '').replace(/\D/g, '');

// "+15615550123" from whatever was typed. Returns '' for empty.
// Typed without "+": treated as a US/Canada number (+1 added unless it already starts with 1).
const withCountry = (t, d) => (!t.startsWith('+') && d && d[0] !== '1' ? `1${d}` : d);
export function toE164(s) {
  const t = String(s ?? '').trim();
  if (!t) return '';
  const d = withCountry(t, digits(t));
  return d ? `+${d}` : '';
}
// Pretty display while typing: "+1 (561) 555-0123" for +1, else "+44 20 7946 0958"-ish grouping.
export function formatPhone(s) {
  const t = String(s ?? '');
  if (!t.trim()) return '';
  const d = withCountry(t.trim(), digits(t));
  if (!d) return '+';
  if (d[0] === '1') {
    const a = d.slice(1, 4), b = d.slice(4, 7), c = d.slice(7, 11);
    return `+1${a ? ` (${a}${a.length === 3 ? ')' : ''}` : ''}${b ? ` ${b}` : ''}${c ? `-${c}` : ''}${d.length > 11 ? d.slice(11) : ''}`;
  }
  const cc = d.slice(0, 2), rest = d.slice(2);
  return `+${cc}${rest ? ' ' + rest.replace(/(\d{3})(?=\d)/g, '$1 ') : ''}`;
}
export function normalizeUrl(s) {
  const t = String(s ?? '').trim();
  if (!t) return '';
  return /^https?:\/\//i.test(t) ? t : `https://${t}`;
}
export const isUrl = s => { try { const u = new URL(normalizeUrl(s)); return /^https?:$/.test(u.protocol) && /\.[a-z]{2,}$/i.test(u.hostname); } catch { return false; } };
export const isEmail = s => /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(String(s ?? '').trim());
export const isE164 = s => /^\+[1-9]\d{7,14}$/.test(s);

// ---------- validation ----------
// Returns { field: 'message' } for every problem. Empty object = valid.
// `p` is the payload shape the page sends and create.mjs receives (see buildPayload).
export function validate(p, { snapshotIds } = {}) {
  const e = {};
  const req = (k, label) => { if (!String(p[k] ?? '').trim()) e[k] = `${label} is required.`; };
  if (!p.snapshotId) e.snapshotId = 'Choose a snapshot.';
  else if (snapshotIds && !snapshotIds.includes(p.snapshotId)) e.snapshotId = "That snapshot isn't in the list any more. Refresh snapshots and choose again.";
  req('businessName', 'Business name');
  if (!e.businessName && p.businessName.trim().length < 2) e.businessName = 'Business name is too short.';
  if (!e.businessName && p.businessName.trim().length > 100) e.businessName = 'Business name is too long (100 characters max).';
  if (p.phone && !isE164(toE164(p.phone))) e.phone = 'Use the full number with country code, e.g. +1 561 555 0123.';
  if (p.phone && !e.phone && toE164(p.phone).startsWith('+1') && toE164(p.phone).length !== 12) e.phone = 'A US/Canada number has 10 digits after +1.';
  if (p.website && !isUrl(p.website)) e.website = 'Enter a web address like lawfirm.com.';
  if (!/^[A-Z]{2}$/.test(p.country || '')) e.country = 'Choose a country.';
  if (p.country === 'US' && p.postalCode && !/^\d{5}(-\d{4})?$/.test(p.postalCode.trim())) e.postalCode = 'US ZIP codes look like 33401 or 33401-1234.';
  if (p.country === 'US' && p.state && !US_STATES.some(([c]) => c === p.state)) e.state = 'Choose a state from the list.';
  req('timezone', 'Time zone');
  if (p.timezone && !TIMEZONES.some(([z]) => z === p.timezone)) e.timezone = 'Choose a time zone from the list.';
  req('firstName', 'First name');
  req('lastName', 'Last name');
  req('email', 'Email');
  if (!e.email && !isEmail(p.email)) e.email = "That email address doesn't look right.";
  if (p.kpi?.requested && !String(p.kpi.practiceArea ?? '').trim()) e.practiceArea = 'Choose a practice area.';
  if (p.review?.requested && !String(p.review.audience ?? '').trim()) e.audience = 'Enter the audience word (e.g. Lead).';
  for (const [k, label, kind] of SOCIAL) {
    const v = p.social?.[k];
    if (v && kind === 'url' && !isUrl(v)) e[`social.${k}`] = `${label}: enter a full link.`;
  }
  for (const [k] of SETTINGS) {
    const v = p.settings?.[k];
    if (v !== undefined && typeof v !== 'boolean') e[`settings.${k}`] = 'Must be yes or no.';
  }
  // Webforms add-on (brand + CSM are saved on the record; the ticket is sent later from the record).
  if (p.brand !== undefined && !BRANDS.includes(p.brand)) e.brand = 'Choose LFMP or WPP.';
  if (p.csm && !(Number.isInteger(p.csm.id) && p.csm.id > 0 && String(p.csm.name || '').trim())) e.csm = 'Choose a CSM from the list.';
  if (p.mastersheet) { const m = checkLink('sheet', p.mastersheet); if (m) e.mastersheet = m; }
  if (p.webformsRequested !== undefined && typeof p.webformsRequested !== 'boolean') e.webformsRequested = 'Must be yes or no.';
  req('createdBy', 'Created by');
  if (p.notes && p.notes.length > 2000) e.notes = 'Notes are too long (2000 characters max).';
  if (p.requestId !== undefined && !/^[0-9]{8}-[0-9]{6}-[a-z0-9]{4}$/.test(p.requestId)) e.requestId = 'Bad request id.';
  return e;
}

// The exact body sent to GHL POST /locations/. Only non-empty optional fields are included.
export function ghlBody(p, companyId) {
  const b = { name: p.businessName.trim(), companyId, country: p.country, timezone: toGhlTimezone(p.timezone), snapshotId: p.snapshotId,
    prospectInfo: { firstName: p.firstName.trim(), lastName: p.lastName.trim(), email: p.email.trim() } };
  const opt = { phone: toE164(p.phone), address: p.address, city: p.city, state: p.state, postalCode: p.postalCode, website: p.website ? normalizeUrl(p.website) : '' };
  for (const [k, v] of Object.entries(opt)) if (String(v ?? '').trim()) b[k] = String(v).trim();
  const social = {};
  for (const [k] of SOCIAL) if (String(p.social?.[k] ?? '').trim()) social[k] = String(p.social[k]).trim();
  if (Object.keys(social).length) b.social = social;
  const settings = {};
  for (const [k] of SETTINGS) if (typeof p.settings?.[k] === 'boolean') settings[k] = p.settings[k];
  if (Object.keys(settings).length) b.settings = settings;
  return b;
}

// ---------- duplicate matching ----------
const DROP = /\b(the|law\s*firm|pllc|llc)\b/g;
export function normName(s) {
  return String(s ?? '').toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\s]+/g, ' ')        // punctuation (P.L.L.C. -> p l l c, handled below)
    .replace(/\bp\s+l\s+l\s+c\b/g, 'pllc').replace(/\bl\s+l\s+c\b/g, 'llc')
    .replace(DROP, ' ')
    .replace(/\s+/g, ' ').trim();
}
function lev(a, b) {
  if (Math.abs(a.length - b.length) > 2) return 3;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0]; prev[0] = i;
    for (let j = 1; j <= b.length; j++) { const t = prev[j]; prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1)); diag = t; }
  }
  return prev[b.length];
}
// Close match: same normalised name, a near-typo (1-2 letters different on longer names),
// or one name contained in the other as whole words (e.g. "Smith Injury" vs "Smith Injury Lawyers").
export function isCloseMatch(a, b) {
  const x = normName(a), y = normName(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const short = x.length <= y.length ? x : y, long = short === x ? y : x;
  if (short.length >= 8 && lev(x, y) <= 2) return true;
  if (short.length >= 6 && short.includes(' ') && ` ${long} `.includes(` ${short} `)) return true;
  return false;
}
export const findDuplicates = (name, list) => (list || []).filter(l => isCloseMatch(name, l.name)).slice(0, 10);

// ---------- ids ----------
export function slugify(s) {
  return String(s ?? '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/, '') || 'sub-account';
}
export function newRequestId(now = new Date(), rand = Math.random) {
  const p = n => String(n).padStart(2, '0');
  const d = `${now.getUTCFullYear()}${p(now.getUTCMonth() + 1)}${p(now.getUTCDate())}-${p(now.getUTCHours())}${p(now.getUTCMinutes())}${p(now.getUTCSeconds())}`;
  const r = Array.from({ length: 4 }, () => 'abcdefghjkmnpqrstuvwxyz23456789'[Math.floor(rand() * 31)]).join('');
  return `${d}-${r}`;
}

// ---------- run/record states (shared vocabulary) ----------
// Run stages in order. The page draws one step per stage plus "Sent" and "Waiting".
export const STAGES = ['checking', 'creating', 'loading_snapshot', 'saving', 'done'];
export const FINAL_RUN = ['done', 'snapshot_still_loading', 'failed', 'duplicate'];
export const RECORD_STATUS = {
  ready: { label: 'Ready', tone: 'good' },
  snapshot_loading: { label: 'Snapshot loading', tone: 'warn' },
  failed: { label: 'Failed', tone: 'bad' },
};

// ---------- snapshot status (GHL response shape is undocumented: be forgiving) ----------
const LOADING = ['processing', 'pending', 'in_progress', 'in-progress', 'queued', 'started', 'running', 'loading'];
const COMPLETE = ['completed', 'complete', 'success', 'succeeded', 'finished', 'done', 'loaded'];
const FAILED = /fail|error|cancel/;
const names = v => {
  if (!v) return [];
  if (Array.isArray(v)) return v.map(x => (typeof x === 'string' ? x : x?.name || x?.title || x?.type || x?.assetType || x?.id || JSON.stringify(x))).map(String);
  if (typeof v === 'object') return Object.entries(v).flatMap(([k, x]) => (Array.isArray(x) ? x.map(y => `${k}: ${typeof y === 'string' ? y : y?.name || y?.id || ''}`) : [k]));
  return [String(v)];
};
export function parseSnapshotStatus(resp) {
  let o = resp?.data ?? resp?.snapshotStatus ?? resp?.status_data ?? resp;
  if (Array.isArray(o)) o = o[o.length - 1] || {};
  if (o && typeof o.data === 'object' && !Array.isArray(o.data) && !o.status) o = o.data;
  const status = String(o?.status ?? '').trim().toLowerCase();
  const completed = names(o?.completed ?? o?.completedAssets);
  const pending = names(o?.pending ?? o?.pendingAssets);
  return { status, completed, pending };
}
// -> 'loading' | 'complete' | 'failed'
export function classifySnapshot({ status, completed, pending }) {
  if (FAILED.test(status)) return 'failed';
  if (COMPLETE.includes(status)) return 'complete';
  if (LOADING.includes(status) || !status) return pending.length === 0 && completed.length > 0 ? 'complete' : 'loading';
  // Unknown status value: done once nothing is pending (and something finished).
  return pending.length === 0 && completed.length > 0 ? 'complete' : 'loading';
}
export const snapshotPercent = ({ completed, pending }) => {
  const total = completed.length + pending.length;
  return total ? Math.round((completed.length / total) * 100) : 0;
};

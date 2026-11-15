// "Find client in GHL": which contact fields may be read, and how a contact fills the New sub-account form.
// Pure (no DOM, no Node APIs). scripts/find-client.mjs uses it to read; page/find-client.js uses it to fill.
//
// READ RULE: only the standard fields in STANDARD_FIELDS and at most one custom field per use in CUSTOM_USES.
// A custom field whose name or key looks like a login, password or other credential is NEVER picked, even if
// it matches a use (NEVER). Everything else GHL returns is dropped the moment the reply arrives.

import { US_STATES, COUNTRIES, toE164, formatPhone, suggestTimezone } from './shared.js';

// LFMP's own sub-account, where the client contacts live ([AGCY] Law Firm Marketing Pros).
export const LFMP_LOCATION_ID = 'sQ2VSMkR7cLHb46Wdemi';
export const crmLink = id => `https://app.lawfirmmarketingpros.com/v2/location/${LFMP_LOCATION_ID}/contacts/detail/${encodeURIComponent(id)}`;
export const isContactId = s => /^[A-Za-z0-9]{8,40}$/.test(String(s ?? ''));
export const MAX_RESULTS = 10;

// Standard contact fields read (GHL's search reply uses address1 or address for the street).
export const STANDARD_FIELDS = ['id', 'firstName', 'lastName', 'email', 'phone', 'companyName', 'website', 'address1', 'city', 'state', 'postalCode', 'country', 'tags'];
// Custom fields read: [use, plain name, pattern on the field's name (or its key without "contact." and with spaces)].
export const CUSTOM_USES = [
  ['officePhone', 'Main / office phone', /^(main|office|main\s*(\/|&|and)?\s*office|business|firm|company)\s+(office\s+)?phone(\s+number)?$/i],
  ['company', 'Company name', /^(company|business|firm|law\s+firm)(\s+legal)?\s+name$/i],
  ['website', 'Company website', /^(company|business|firm)\s+website(\s+(url|address))?$/i],
];
export const NEVER = /pass|pwd|log-?in|user\s*name|credential|secret|token|\bpin\b|\bapi\b|2fa|otp|security|ssn|card|cvv|routing|account\s*(number|no\b|#)|bank/i;
// Tags that set the brand. Only these tags are kept from a contact.
export const BRAND_TAGS = [['lfmp client', 'LFMP'], ['wpp client', 'WPP']];

const keyName = k => String(k ?? '').replace(/^contact\./i, '').replace(/[_.]+/g, ' ').trim();

// From GHL's custom-field definitions (id, name, fieldKey) → the fields this feature may read, one per use.
export function pickCustomFields(defs) {
  const out = [];
  for (const [use, label, re] of CUSTOM_USES) {
    const hit = (defs || []).find(d => d && d.id && !NEVER.test(`${d.name} ${d.fieldKey}`) && (re.test(String(d.name ?? '').trim()) || re.test(keyName(d.fieldKey))));
    if (hit) out.push({ use, label, id: String(hit.id), name: String(hit.name ?? ''), fieldKey: String(hit.fieldKey ?? '') });
  }
  return out;
}

const str = v => (typeof v === 'string' || typeof v === 'number' ? String(v).trim().slice(0, 300) : '');
// One GHL contact → only the allowed fields. `used` = pickCustomFields() result.
export function pickContact(c, used = []) {
  const x = { id: str(c?.id) };
  for (const k of STANDARD_FIELDS) if (k !== 'id' && k !== 'tags' && k !== 'address1') x[k] = str(c?.[k]);
  x.address1 = str(c?.address1) || str(c?.address);
  const tags = Array.isArray(c?.tags) ? c.tags.map(t => String(t).toLowerCase().trim()) : [];
  x.brandTags = BRAND_TAGS.filter(([t]) => tags.includes(t)).map(([t]) => t);
  x.custom = {};
  const vals = Array.isArray(c?.customFields) ? c.customFields : [];
  for (const u of used) {
    const f = vals.find(v => String(v?.id) === u.id);
    const v = str(f?.value ?? f?.fieldValue);
    if (v) x.custom[u.use] = v;
  }
  return x;
}

const stateCode = s => {
  const t = String(s ?? '').trim(); if (!t) return '';
  const hit = US_STATES.find(([c, n]) => c.toLowerCase() === t.toLowerCase() || n.toLowerCase() === t.toLowerCase());
  return hit ? hit[0] : '';
};
const countryCode = s => {
  const t = String(s ?? '').trim().toLowerCase(); if (!t) return '';
  if (['usa', 'u.s.', 'u.s.a.', 'united states of america', 'america'].includes(t)) return 'US';
  const hit = COUNTRIES.find(([c, n]) => c.toLowerCase() === t || n.toLowerCase() === t);
  return hit ? hit[0] : '';
};
export function brandOf(x) {
  const b = [...new Set((x.brandTags || []).map(t => BRAND_TAGS.find(([n]) => n === t)?.[1]).filter(Boolean))];
  return b.length === 1 ? b[0] : '';   // both tags (or neither): left for you to choose
}

// A picked contact → form values. Only non-empty values are returned; the form keeps anything not listed.
export function contactToForm(x) {
  const cc = countryCode(x.country);
  const us = !x.country || cc === 'US';   // no country on the contact: read the state as a US state
  const phone = x.custom?.officePhone || x.phone;
  const out = {
    businessName: x.companyName || x.custom?.company || '',
    phone: phone ? formatPhone(toE164(phone)) : '',
    website: x.website || x.custom?.website || '',
    address: x.address1 || '', city: x.city || '', postalCode: x.postalCode || '',
    country: cc,
    firstName: x.firstName || '', lastName: x.lastName || '', email: x.email || '',
    brand: brandOf(x),
  };
  out.state = us ? stateCode(x.state) : String(x.state ?? '').trim();
  out.timezone = us ? suggestTimezone(out.state) : '';
  for (const k of Object.keys(out)) if (!out[k]) delete out[k];
  return out;
}

// One result row's plain summary (what the results list shows).
export function resultSummary(x) {
  const name = [x.firstName, x.lastName].filter(Boolean).join(' ');
  const firm = x.companyName || x.custom?.company || '';
  const place = [x.city, x.state].filter(Boolean).join(', ');
  return { name, firm, email: x.email || '', place, brand: brandOf(x), brandTags: x.brandTags || [] };
}

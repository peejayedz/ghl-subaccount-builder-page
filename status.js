// One status tag per client + the Setup squares (KPI · Review · Forms) on the Clients list.
// Pure: built only from the record and the existing state helpers (kpi.js, review.js, webforms.js). No DOM.
//
// Each part gets one state:
//   'none'    not requested (empty square)
//   'waiting' requested, waiting for us to start or finish something by hand (gold)
//   'running' GitHub is working on it right now (blue)
//   'done'    finished (green)
//   'failed'  failed and needs a look (red)
//
// Mapping from the record (see the report / HANDOFF):
//   Sub-account   status 'failed' → failed · 'snapshot_loading' → running · 'ready' → done
//   KPI           kpiState: none → none · requested → waiting · setting_up → running · ready / existing (also "review mapping") → done · failed → failed
//   Review        reviewState: none → none · requested / preview / update / published with changes → waiting · publishing → running ·
//                 published / linked → done · failed (publish failed) → failed
//   Forms         webformsStatus: off → none · zap / details / ready → waiting · sending → running · sent → done · failed → failed
//
// One tag, in this order: any failed → Needs attention (red) · anything running → Setting up (blue) ·
// anything waiting → Waiting to start (gold) · otherwise → All set (green).
// "Setting up" wins over "Waiting to start" so a client whose KPI is running and whose Zap isn't made yet reads Setting up (as in the mockup).

export const PART_STATE = {
  kpi: { none: 'none', requested: 'waiting', setting_up: 'running', ready: 'done', existing: 'done', failed: 'failed' },
  review: { none: 'none', requested: 'waiting', preview: 'waiting', update: 'waiting', publishing: 'running', published: 'done', linked: 'done', failed: 'failed' },
  forms: { off: 'none', zap: 'waiting', details: 'waiting', ready: 'waiting', sending: 'running', sent: 'done', failed: 'failed' },
};
export const SUB_STATE = { failed: 'failed', snapshot_loading: 'running', ready: 'done' };

export const OVERALL = {
  attention: { key: 'attention', label: 'Needs attention', short: 'Attention', tone: 'red' },
  running: { key: 'running', label: 'Setting up', short: 'Setting up', tone: 'blue' },
  waiting: { key: 'waiting', label: 'Waiting to start', short: 'Waiting', tone: 'gold' },
  done: { key: 'done', label: 'All set', short: 'All set', tone: 'green' },
};

// parts: { kpi: kpiState(rec), review: reviewState(rec), forms: webformsStatus(rec) } (each has .key)
export function setupParts(rec, parts) {
  const one = (name, st) => {
    let s = PART_STATE[name][st?.key] || 'none';
    if (name === 'review' && st?.key === 'published' && /changes/i.test(st.label || '')) s = 'waiting';   // published, with changes to publish
    return { name, state: s, label: st?.label || '' };
  };
  return [one('kpi', parts.kpi), one('review', parts.review), one('forms', parts.forms)];
}

export function overallStatus(rec, parts) {
  const states = [SUB_STATE[rec?.status] || 'done', ...setupParts(rec, parts).map(p => p.state)];
  if (states.includes('failed')) return OVERALL.attention;
  if (states.includes('running')) return OVERALL.running;
  if (states.includes('waiting')) return OVERALL.waiting;
  return OVERALL.done;
}

// List tabs: All · Needs attention · In progress (setting up or waiting) · Done.
export const TABS = [['all', 'All', 'All'], ['attention', 'Needs attention', 'Attention'], ['progress', 'In progress', 'Active'], ['done', 'Done', 'Done']];
export const inTab = (tab, overall) => tab === 'all' || (tab === 'attention' && overall.key === 'attention') || (tab === 'progress' && (overall.key === 'running' || overall.key === 'waiting')) || (tab === 'done' && overall.key === 'done');

// Top line: N sub-accounts / N setting up / N need attention.
export function stats(rows) {
  return {
    total: rows.length,
    settingUp: rows.filter(r => r.overall.key === 'running').length,
    attention: rows.filter(r => r.overall.key === 'attention').length,
  };
}

// The one problem a client row links to ("KPI sync failed →"), or null. Sub-account first, then KPI · Review · Forms.
export function problem(rec, parts) {
  if (rec?.status === 'failed') return { part: 'sub', text: 'Sub-account failed' };
  const f = setupParts(rec, parts).find(p => p.state === 'failed');
  if (!f) return null;
  if (f.name === 'kpi') return { part: 'kpi', text: rec?.kpi?.error?.step === 'sync' ? 'KPI sync failed' : 'KPI setup failed' };
  if (f.name === 'review') return { part: 'review', text: 'Review publish failed' };
  return { part: 'forms', text: 'Forms ticket not sent' };
}

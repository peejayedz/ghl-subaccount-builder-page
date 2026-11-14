// "Copy workflows" (Phase 4, GHL resync). A small READ-ONLY script that runs on a GHL tab signed in to the client's
// location (as a bookmarklet, or pasted in the browser console). It follows the Automation Review handoff, section 9:
// GET-only calls to backend.leadconnectorhq.com with the tab's own sign-in, then copies a JSON summary
// (workflow names, step types, waits, SMS text, email subject + plain text) to the clipboard.
// The sign-in token is used inside the tab only: it is never put in the output, never stored, never sent anywhere else.
//
// copyWorkflows() must stay self-contained (it is turned into text with .toString()).

export function copyWorkflows() {
  const API = 'https://backend.leadconnectorhq.com';
  const loc = (location.pathname.match(/\/location\/([A-Za-z0-9]+)/) || [])[1];
  const show = (msg, text) => {
    const old = document.getElementById('lfmp-copy-box'); if (old) old.remove();
    const box = document.createElement('div');
    box.id = 'lfmp-copy-box';
    box.setAttribute('style', 'position:fixed;z-index:2147483647;right:16px;bottom:16px;max-width:420px;background:#fff;color:#18212f;border:1px solid #dce1e8;border-radius:10px;padding:14px 16px;font:14px/1.45 system-ui,sans-serif;box-shadow:0 8px 30px rgba(0,0,0,.18)');
    const p = document.createElement('p'); p.style.margin = '0 0 8px'; p.textContent = msg; box.appendChild(p);
    if (text) {
      const ta = document.createElement('textarea'); ta.readOnly = true; ta.value = text; ta.setAttribute('style', 'width:100%;height:90px;font:12px monospace'); box.appendChild(ta);
      ta.addEventListener('focus', () => ta.select());
    }
    const b = document.createElement('button'); b.textContent = 'Close'; b.setAttribute('style', 'margin-top:8px'); b.onclick = () => box.remove(); box.appendChild(b);
    document.body.appendChild(box);
  };
  if (!loc) { show('Open the client\'s sub-account in GHL first (the address must contain /location/…), then run this again.'); return Promise.resolve(null); }
  const cookie = (document.cookie.match(/(?:^|; )access-token-v2=([^;]+)/) || [])[1];
  if (!cookie) { show('You don\'t seem to be signed in to GHL on this tab. Sign in, open the sub-account, then run this again.'); return Promise.resolve(null); }
  const auth = 'Bearer ' + decodeURIComponent(cookie);
  // GET only. Nothing in GHL is changed.
  const get = url => fetch(url, { method: 'GET', headers: { Authorization: auth, channel: 'APP', source: 'WEB_USER', version: '2021-07-28' } })
    .then(r => { if (!r.ok) throw new Error('GHL said ' + r.status + ' for ' + url.replace(API, '')); return r.json(); });
  const plain = html => {
    const d = new DOMParser().parseFromString(String(html || ''), 'text/html');
    d.querySelectorAll('style,script,head').forEach(e => e.remove());
    d.querySelectorAll('br').forEach(e => e.replaceWith('\n'));
    d.querySelectorAll('p,div,li,h1,h2,h3,h4,tr,table').forEach(e => { e.prepend('\n'); e.append('\n'); });
    return (d.body ? d.body.textContent : '').replace(/ /g, ' ').replace(/[ \t]+\n/g, '\n').replace(/\n[ \t]+/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  };
  return (async () => {
    // GHL's top-level list (parentId empty) ALSO returns the workflows that sit inside folders, so the same workflow
    // shows up twice: once with no folder, once from its folder. Keep one per id, preferring the copy with the folder name.
    const byId = new Map();
    const keep = w => { const old = byId.get(w.id); if (!old || (!old.folder && w.folder)) byId.set(w.id, w); };
    const walk = async (parentId, folder, depth) => {
      const r = await get(API + '/workflow/' + loc + '/list?parentId=' + encodeURIComponent(parentId || ''));
      for (const row of r.rows || []) {
        const id = row.id || row._id;
        if (row.type === 'directory') { if (depth < 3) await walk(id, (folder ? folder + ' / ' : '') + row.name, depth + 1); }
        else keep({ id, name: row.name, status: row.status, folder });
      }
    };
    await walk('', '', 0);
    const all = [...byId.values()];
    let templates = null;
    const templateById = async id => {
      if (!templates) { const t = await get(API + '/locations/' + loc + '/templates?type=email'); templates = {}; (t.templates || t.data || []).forEach(x => { templates[x.id || x._id] = x; }); }
      return templates[id] || null;
    };
    const out = [];
    for (const w of all) {
      const d = await get(API + '/workflow/' + loc + '/' + w.id);
      const steps = [];
      for (const n of (d.workflowData && d.workflowData.templates) || []) {
        const a = n.attributes || {}, s = { type: n.type, name: n.name };
        if (n.type === 'wait') s.wait = { type: a.type, startAfter: a.startAfter || null };
        if (n.type === 'sms') s.text = a.body || '';
        if (n.type === 'internal_notification') { s.channel = a.type; s.text = (a.sms && a.sms.body) || (a.email && a.email.body) || ''; }
        if (n.type === 'email') {
          s.subject = a.subject || '';
          let html = a.html || '';
          if (!html && a.template_id) { const t = await templateById(a.template_id); if (t) { html = (t.template && t.template.html) || t.html || ''; if (!s.subject) s.subject = t.subject || ''; } }
          if (!html && a.previewUrl) { try { html = await (await fetch(a.previewUrl)).text(); } catch (e) { s.note = 'email text could not be read'; } }
          s.text = plain(html);
        }
        steps.push(s);
      }
      out.push({ id: w.id, name: w.name, status: w.status, folder: w.folder, steps });
    }
    const result = { kind: 'lfmp-ghl-workflows', version: 1, locationId: loc, copiedAt: new Date().toISOString(), workflows: out };
    const text = JSON.stringify(result);
    let copied = false;
    try { await navigator.clipboard.writeText(text); copied = true; } catch (e) { copied = false; }
    show(copied ? 'Copied ' + out.length + ' workflows (read-only; nothing in GHL was changed). Paste them into the builder: record → Review → Paste from GHL.'
      : 'Copied ' + out.length + ' workflows into the box below (the clipboard was blocked). Click the box, press Cmd+C, then paste into the builder.', copied ? '' : text);
    return result;
  })().catch(e => { show('Couldn\'t copy the workflows: ' + e.message + '. Nothing in GHL was changed.'); return null; });
}

export const consoleScript = () => `(${copyWorkflows.toString()})();`;
export const bookmarklet = () => `javascript:${encodeURIComponent(`(${copyWorkflows.toString()})();void 0`)}`;

/* WFA names file helper (08.10.26)
 *
 * Screens show pupils as INITIALS ("IM"). When something needs a real name on paper (a certificate,
 * a label, a sheet), the teacher supplies a "names file" kept on their OWN computer. The file is read
 * in the browser, held in page memory only and used for that printout. It is never uploaded by this
 * code, never written to localStorage / sessionStorage / cookies, and is forgotten when the page closes.
 *
 * The file is a CSV with the columns:  pupil_id, initials, full_name, class
 *
 *   WFANames.initialsLabels([[first,last], ...])   -> labels, same order. Rule: first letter of the first
 *        name + first letter of the surname ("IM"); pupils who clash within the list get 2, then 3...
 *        letters of each part ("InMc"); genuinely identical names get " 2", " 3".
 *   WFANames.buildCsv([{pupil_id, first, last, cls}, ...]) -> CSV text (clashes resolved per class)
 *   WFANames.parseCsv(text) -> NamesFile
 *   WFANames.pick({purpose}) -> Promise<NamesFile|null>   (shows a small dialog; null = print without names)
 *
 * NamesFile: { get(pupilId) -> {initials, name, cls}|null, size, clear() }
 */
(function (root) {
  'use strict';

  function parts(name) {
    var toks = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!toks.length) return ['', ''];
    var first = toks[0].replace(/[^A-Za-zÀ-ɏ]/g, '');
    var last = toks.length > 1 ? toks[toks.length - 1].replace(/[^A-Za-zÀ-ɏ]/g, '') : '';
    return [first, last];
  }

  function initialsLabels(pairs) {
    var P = pairs.map(function (p) {
      var f = String(p[0] || '').trim().split(/\s+/)[0] || '';
      var lw = String(p[1] || '').trim().split(/\s+/).filter(Boolean);
      var l = lw.length ? lw[lw.length - 1] : '';
      f = f.replace(/[^A-Za-zÀ-ɏ]/g, '');
      l = l.replace(/[^A-Za-zÀ-ɏ]/g, '');
      return [f, l];
    });
    function lab(i, n) {
      var f = P[i][0], l = P[i][1];
      if (!l) return f ? f.charAt(0).toUpperCase() + f.slice(1, 2).toLowerCase() : '';
      if (n === 1) return (f.charAt(0) + l.charAt(0)).toUpperCase();
      var fp = f.slice(0, n), lp = l.slice(0, n);
      return fp.charAt(0).toUpperCase() + fp.slice(1) + lp.charAt(0).toUpperCase() + lp.slice(1);
    }
    var lv = P.map(function () { return 1; });
    var labels;
    for (var guard = 0; guard < 40; guard++) {
      labels = P.map(function (_, i) { return lab(i, lv[i]); });
      var groups = {};
      labels.forEach(function (t, i) { (groups[t.toLowerCase()] = groups[t.toLowerCase()] || []).push(i); });
      var changed = false;
      Object.keys(groups).forEach(function (k) {
        var idxs = groups[k];
        if (idxs.length < 2) return;
        var distinct = {};
        idxs.forEach(function (i) { distinct[(P[i][0] + '|' + P[i][1]).toLowerCase()] = 1; });
        if (Object.keys(distinct).length < 2) return;
        idxs.forEach(function (i) {
          if (P[i][1] && lv[i] < Math.max(P[i][0].length, P[i][1].length)) { lv[i]++; changed = true; }
        });
      });
      if (!changed) break;
    }
    var seen = {};
    return labels.map(function (t) {
      var k = t.toLowerCase();
      seen[k] = (seen[k] || 0) + 1;
      return seen[k] === 1 ? t : t + ' ' + seen[k];
    });
  }

  function csvCell(v) {
    v = String(v == null ? '' : v);
    return /[",\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
  }

  function buildCsv(rows) {
    var byClass = {};
    rows.forEach(function (r) { (byClass[r.cls || ''] = byClass[r.cls || ''] || []).push(r); });
    var out = [];
    Object.keys(byClass).sort().forEach(function (c) {
      var list = byClass[c];
      var labels = initialsLabels(list.map(function (r) { return [r.first, r.last]; }));
      list.forEach(function (r, i) {
        out.push([r.pupil_id, labels[i], (String(r.first || '').trim() + ' ' + String(r.last || '').trim()).trim(), c]);
      });
    });
    out.sort(function (a, b) { return (a[3] + a[2]).localeCompare(b[3] + b[2]); });
    return '﻿pupil_id,initials,full_name,class\r\n' + out.map(function (r) { return r.map(csvCell).join(','); }).join('\r\n') + '\r\n';
  }

  function parseCsvRows(text) {
    var rows = [], row = [], cell = '', q = false;
    text = String(text || '').replace(/^﻿/, '');
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      if (q) {
        if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
        else cell += ch;
      } else if (ch === '"') q = true;
      else if (ch === ',') { row.push(cell); cell = ''; }
      else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && text[i + 1] === '\n') i++;
        row.push(cell); cell = '';
        if (row.length > 1 || row[0] !== '') rows.push(row);
        row = [];
      } else cell += ch;
    }
    row.push(cell);
    if (row.length > 1 || row[0] !== '') rows.push(row);
    return rows;
  }

  function parseCsv(text) {
    var rows = parseCsvRows(text);
    var head = (rows.shift() || []).map(function (h) { return h.trim().toLowerCase(); });
    var iId = head.indexOf('pupil_id'), iIni = head.indexOf('initials'), iName = head.indexOf('full_name'), iCls = head.indexOf('class');
    if (iId < 0 || iName < 0) throw new Error('This does not look like a names file (it needs pupil_id and full_name columns).');
    var map = {};
    rows.forEach(function (r) {
      var id = (r[iId] || '').trim();
      if (id) map[id] = { initials: iIni >= 0 ? (r[iIni] || '').trim() : '', name: (r[iName] || '').trim(), cls: iCls >= 0 ? (r[iCls] || '').trim() : '' };
    });
    return {
      get: function (id) { return map[id] || null; },
      get size() { return Object.keys(map).length; },
      clear: function () { map = {}; }
    };
  }

  function pick(opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      var doc = root.document;
      var wrap = doc.createElement('div');
      wrap.setAttribute('role', 'dialog');
      wrap.style.cssText = 'position:fixed;inset:0;background:rgba(10,1,1,.55);z-index:99999;display:flex;align-items:center;justify-content:center;padding:16px;font-family:system-ui,-apple-system,sans-serif';
      var box = doc.createElement('div');
      box.style.cssText = 'background:#fff;border-radius:14px;max-width:440px;width:100%;padding:20px;box-shadow:0 10px 40px rgba(0,0,0,.3);color:#0a0101';
      box.innerHTML = '<h3 style="margin:0 0 8px;font-size:1.1rem">Choose your names file</h3>' +
        '<p style="margin:0 0 12px;font-size:.92rem;color:#445">' + (opts.purpose ? String(opts.purpose).replace(/</g, '&lt;') + ' ' : '') +
        'The file stays on your computer. It is read here only to put names on this printout, and is not saved or uploaded.</p>' +
        '<input type="file" accept=".csv,text/csv" style="display:block;width:100%;margin-bottom:12px">' +
        '<div id="wfa-nf-msg" style="min-height:1.2em;font-size:.88rem;color:#c0392b;margin-bottom:10px"></div>' +
        '<div style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap">' +
        '<button type="button" data-a="skip" style="padding:8px 14px;border-radius:8px;border:1px solid #c8d3df;background:#fff;font:inherit;cursor:pointer">Print without names</button></div>';
      wrap.appendChild(box);
      doc.body.appendChild(wrap);
      function done(v) { if (wrap.parentNode) wrap.parentNode.removeChild(wrap); resolve(v); }
      box.querySelector('[data-a=skip]').onclick = function () { done(null); };
      box.querySelector('input').onchange = function (e) {
        var f = e.target.files && e.target.files[0];
        if (!f) return;
        var fr = new root.FileReader();
        fr.onload = function () {
          try { done(parseCsv(String(fr.result || ''))); }
          catch (err) { box.querySelector('#wfa-nf-msg').textContent = err.message; }
        };
        fr.onerror = function () { box.querySelector('#wfa-nf-msg').textContent = 'Could not read that file.'; };
        fr.readAsText(f);
      };
    });
  }

  root.WFANames = { initialsLabels: initialsLabels, buildCsv: buildCsv, parseCsv: parseCsv, pick: pick };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.WFANames;
})(typeof window !== 'undefined' ? window : globalThis);

/* WFA names file helper (v2, 08.10.26)
 *
 * Screens show pupils as INITIALS ("IM"). When a real name is needed (a certificate, a label, a printed
 * sheet, or "show names on my screen"), the teacher supplies a "names file" kept on their OWN computer.
 * The file is read in the browser, held in page memory only, and used for that job. This code NEVER
 * uploads it, never writes it to localStorage / sessionStorage / IndexedDB / cookies / caches, and the
 * on-screen names are removed (and the memory cleared) when the page is hidden or closed, after 10
 * minutes without activity, or when the teacher clicks Hide.
 *
 * Names file = CSV with columns:
 *   pupil_id, initials, first_name, last_name, full_name, class, year_group
 * (older files with only pupil_id, initials, full_name, class still load.)
 *
 *   WFANames.initialsLabels([[first,last], ...])   labels, same order (IM; InMc if clashing; ...)
 *   WFANames.buildCsv([{pupil_id, first, last, cls, year}, ...])  -> CSV text
 *   WFANames.parseCsv(text)  -> NamesFile
 *   WFANames.pick({purpose}) -> Promise<NamesFile|null>   (dialog; accepts several files; null = skip)
 *   WFANames.screen.init()   adds a "Show names" button; elements marked  data-pupil-id="<pupil_id>"
 *                            (containing only the label text) are swapped for the full name while on.
 *   WFANames.screen.show(file) / hide() / active
 *
 * NamesFile: get(id) -> {initials, first, last, name, cls, year}|null;  size;  ids();
 *            toMap(ids?) -> {id: {first, last}}  (for sending with one print request);  clear()
 */
(function (root) {
  'use strict';

  var LETTERS = /[^A-Za-zÀ-ɏ]/g;

  function initialsLabels(pairs) {
    var P = pairs.map(function (p) {
      var f = String(p[0] || '').trim().split(/\s+/)[0] || '';
      var lw = String(p[1] || '').trim().split(/\s+/).filter(Boolean);
      var l = lw.length ? lw[lw.length - 1] : '';
      return [f.replace(LETTERS, ''), l.replace(LETTERS, '')];
    });
    function lab(i, n) {
      var f = P[i][0], l = P[i][1];
      if (!l) return f ? f.charAt(0).toUpperCase() + f.slice(1, 2).toLowerCase() : '';
      if (n === 1) return (f.charAt(0) + l.charAt(0)).toUpperCase();
      var fp = f.slice(0, n), lp = l.slice(0, n);
      return fp.charAt(0).toUpperCase() + fp.slice(1) + lp.charAt(0).toUpperCase() + lp.slice(1);
    }
    var lv = P.map(function () { return 1; });
    var labels = [];
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
        var first = String(r.first || '').trim(), last = String(r.last || '').trim();
        out.push([r.pupil_id, labels[i], first, last, (first + ' ' + last).trim(), c, r.year || '']);
      });
    });
    out.sort(function (a, b) { return (a[5] + a[4]).localeCompare(b[5] + b[4]); });
    return '﻿pupil_id,initials,first_name,last_name,full_name,class,year_group\r\n' +
      out.map(function (r) { return r.map(csvCell).join(','); }).join('\r\n') + '\r\n';
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

  function makeNamesFile(map) {
    return {
      get: function (id) { return map[id] || null; },
      get size() { return Object.keys(map).length; },
      ids: function () { return Object.keys(map); },
      toMap: function (ids) {
        var out = {};
        (ids || Object.keys(map)).forEach(function (id) { if (map[id]) out[id] = { first: map[id].first, last: map[id].last }; });
        return out;
      },
      merge: function (other) { other.ids().forEach(function (id) { map[id] = other.get(id); }); return this; },
      clear: function () { Object.keys(map).forEach(function (k) { delete map[k]; }); }
    };
  }

  function parseCsv(text) {
    var rows = parseCsvRows(text);
    var head = (rows.shift() || []).map(function (h) { return h.trim().toLowerCase(); });
    var ix = function (n) { return head.indexOf(n); };
    var iId = ix('pupil_id'), iIni = ix('initials'), iF = ix('first_name'), iL = ix('last_name'),
        iName = ix('full_name'), iCls = ix('class'), iYr = ix('year_group');
    if (iId < 0 || (iName < 0 && iF < 0)) throw new Error('This does not look like a names file (it needs pupil_id and name columns).');
    var map = {};
    rows.forEach(function (r) {
      var id = (r[iId] || '').trim();
      if (!id) return;
      var first = iF >= 0 ? (r[iF] || '').trim() : '';
      var last = iL >= 0 ? (r[iL] || '').trim() : '';
      var name = iName >= 0 ? (r[iName] || '').trim() : (first + ' ' + last).trim();
      if (!first && !last && name) {   // older file: only a full name; split at the first space
        var sp = name.indexOf(' ');
        first = sp < 0 ? name : name.slice(0, sp); last = sp < 0 ? '' : name.slice(sp + 1);
      }
      map[id] = { initials: iIni >= 0 ? (r[iIni] || '').trim() : '', first: first, last: last, name: name || (first + ' ' + last).trim(),
                  cls: iCls >= 0 ? (r[iCls] || '').trim() : '', year: iYr >= 0 ? (r[iYr] || '').trim() : '' };
    });
    return makeNamesFile(map);
  }

  function readFiles(fileList) {
    var files = Array.prototype.slice.call(fileList || []);
    return Promise.all(files.map(function (f) {
      return new Promise(function (resolve, reject) {
        var fr = new root.FileReader();
        fr.onload = function () { try { resolve(parseCsv(String(fr.result || ''))); } catch (e) { reject(e); } };
        fr.onerror = function () { reject(new Error('Could not read that file.')); };
        fr.readAsText(f);
      });
    })).then(function (parsed) {
      var all = makeNamesFile({});
      parsed.forEach(function (p) { all.merge(p); });
      return all;
    });
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
        'The file stays on your computer. It is read here only for this job and is not saved or uploaded. You can choose more than one file (for example one per class).</p>' +
        '<input type="file" multiple accept=".csv,text/csv" style="display:block;width:100%;margin-bottom:12px">' +
        '<div id="wfa-nf-msg" style="min-height:1.2em;font-size:.88rem;color:#c0392b;margin-bottom:10px"></div>' +
        '<div style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap">' +
        '<button type="button" data-a="skip" style="padding:8px 14px;border-radius:8px;border:1px solid #c8d3df;background:#fff;font:inherit;cursor:pointer">' +
        (opts.skipLabel || 'Print without names') + '</button></div>';
      wrap.appendChild(box);
      doc.body.appendChild(wrap);
      function done(v) { if (wrap.parentNode) wrap.parentNode.removeChild(wrap); resolve(v); }
      box.querySelector('[data-a=skip]').onclick = function () { done(null); };
      box.querySelector('input').onchange = function (e) {
        readFiles(e.target.files).then(done, function (err) { box.querySelector('#wfa-nf-msg').textContent = err.message; });
      };
    });
  }

  /* ── Show names on this screen (memory only; hides itself) ─────────────────────────────── */
  var screen = {
    active: false, file: null, _orig: null, _obs: null, _timer: null, _btn: null, _bar: null,
    _swap: function (el) {
      var id = el.getAttribute('data-pupil-id');
      var rec = id && screen.file && screen.file.get(id);
      if (!rec || !rec.name) return;
      if (!screen._orig.has(el)) screen._orig.set(el, el.textContent);
      if (el.textContent !== rec.name) el.textContent = rec.name;
    },
    _swapAll: function (rootEl) {
      if (rootEl.nodeType === 1 && rootEl.hasAttribute && rootEl.hasAttribute('data-pupil-id')) screen._swap(rootEl);
      if (rootEl.querySelectorAll) Array.prototype.forEach.call(rootEl.querySelectorAll('[data-pupil-id]'), screen._swap);
    },
    _bump: function () {
      root.clearTimeout(screen._timer);
      screen._timer = root.setTimeout(screen.hide, 10 * 60 * 1000);
    },
    show: function (file) {
      if (!file) return;
      screen.hide();
      screen.file = file;
      screen.active = true;
      screen._orig = new root.Map();
      screen._swapAll(root.document.body);
      screen._obs = new root.MutationObserver(function (muts) {
        muts.forEach(function (m) { Array.prototype.forEach.call(m.addedNodes, function (n) { if (n.nodeType === 1) screen._swapAll(n); }); });
      });
      screen._obs.observe(root.document.body, { childList: true, subtree: true });
      screen._bump();
      ['pointerdown', 'keydown'].forEach(function (ev) { root.document.addEventListener(ev, screen._bump, true); });
      screen._ui();
    },
    hide: function () {
      root.clearTimeout(screen._timer);
      if (screen._obs) { screen._obs.disconnect(); screen._obs = null; }
      if (screen._orig) { screen._orig.forEach(function (text, el) { el.textContent = text; }); screen._orig = null; }
      if (screen.file) { screen.file.clear(); screen.file = null; }
      ['pointerdown', 'keydown'].forEach(function (ev) { root.document.removeEventListener(ev, screen._bump, true); });
      screen.active = false;
      screen._ui();
    },
    _ui: function () {
      var doc = root.document;
      if (!screen._btn) return;
      screen._btn.style.display = screen.active ? 'none' : '';
      if (screen.active && !screen._bar) {
        var bar = doc.createElement('div');
        bar.style.cssText = 'position:fixed;left:50%;bottom:14px;transform:translateX(-50%);z-index:99998;background:#0a0101;color:#fff;border-radius:999px;padding:8px 16px;font:600 13px system-ui,sans-serif;display:flex;gap:12px;align-items:center;box-shadow:0 4px 16px rgba(0,0,0,.35)';
        bar.innerHTML = '<span>Names showing from your file</span><button type="button" style="border:0;border-radius:999px;padding:5px 12px;font:inherit;cursor:pointer;background:#fff;color:#0a0101">Hide</button>';
        bar.querySelector('button').onclick = screen.hide;
        doc.body.appendChild(bar);
        screen._bar = bar;
      } else if (!screen.active && screen._bar) {
        screen._bar.parentNode.removeChild(screen._bar); screen._bar = null;
      }
    },
    init: function () {
      var doc = root.document;
      if (screen._btn) return;
      var b = doc.createElement('button');
      b.type = 'button';
      b.textContent = '👁 Show names';
      b.title = 'Show full names on this screen from your own names file. Nothing is saved, and they hide again after 10 minutes or when you leave the page.';
      b.style.cssText = 'position:fixed;right:14px;bottom:14px;z-index:99997;border:1px solid #c8d3df;background:#fff;color:#0a0101;border-radius:999px;padding:8px 14px;font:600 13px system-ui,sans-serif;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.2)';
      b.onclick = function () { pick({ purpose: 'Names will show on this screen only.', skipLabel: 'Cancel' }).then(function (f) { if (f) screen.show(f); }); };
      doc.body.appendChild(b);
      screen._btn = b;
      // leaving or hiding the page forgets everything
      root.addEventListener('pagehide', screen.hide);
      doc.addEventListener('visibilitychange', function () { if (doc.hidden) screen.hide(); });
    }
  };

  root.WFANames = { initialsLabels: initialsLabels, buildCsv: buildCsv, parseCsv: parseCsv, pick: pick, screen: screen };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.WFANames;
})(typeof window !== 'undefined' ? window : globalThis);

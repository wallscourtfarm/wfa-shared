// wfa-shared/web/morning.js
//
// Shared plumbing for the WFA morning classroom display boards (year1-beech
// ... year6-elm, eyfs-oak — staff.wallscourt-farm-academy.co.uk/morning/*).
//
// Added 20.09.26. A diff of the 7 boards found they'd forked into
// independent ~2,000-5,000 line files that just happen to look similar —
// about half of each file (menu/lunch-bar plumbing, the override and setup
// overlays, image handling, puzzle-freshness tracking) turned out to be the
// same code copy-pasted and re-prefixed per year group, not shared. A fix
// to any of that had to be found and reapplied six times over, the same
// problem reliability.js exists to solve for the other staff-tools family.
//
// This file is that fix for the morning boards specifically. It does NOT
// touch puzzle content or puzzle rendering (BOGGLE banks, renderCombined,
// etc.) — that's genuinely bespoke per year group and stays in each board's
// own file. See [[project_morning_display_architecture]] in Claude's
// memory for the full picture, and feedback_parallel_build_never_touch_
// live_tools for why this file being added has zero effect on any board
// until that board is deliberately migrated onto it.
//
// Usage — add this one line before a board's own <script>:
//   <script src="https://cdn.jsdelivr.net/gh/wallscourtfarm/wfa-shared@main/web/morning.js"></script>
// Then, near the top of the board's own script:
//   const board = wfaMorning.createBoard({
//     prefix: 'y5',              // this board's localStorage key prefix
//     yearNum: 5,                // for two-truths yr-based prev/curr split; null/undefined to skip that split
//     AUTO_MSGS: {...},          // this board's default weekday messages
//   });
// See a migrated board's index.html for the full call-site pattern.
//
// Everything below attaches to `window.wfaMorning`.

(function (global) {
  'use strict';

  // ── Date helpers ─────────────────────────────────────────────────────────
  // Identical one-liners duplicated verbatim in all 7 boards.
  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const DAYNAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  function todayStr() {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
  }
  function getMon(ds) {
    const dt = new Date(ds + 'T12:00:00');
    const d = dt.getDay();
    dt.setDate(dt.getDate() - (d === 0 ? 6 : d - 1));
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
  }
  function getDK(ds) {
    return DAYS[new Date(ds + 'T12:00:00').getDay()];
  }
  function shuffle(a) {
    const b = [...a];
    for (let i = b.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [b[i], b[j]] = [b[j], b[i]];
    }
    return b;
  }

  // ── School-year phase weighting ─────────────────────────────────────────
  // Drives how much a board favours "current year" content over "prior
  // year" content as the year progresses — identical logic and constants
  // in every board, just recomputed once per page load in each copy.
  function getSchoolPhase() {
    const now = new Date();
    const yr = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
    const wks = Math.max(0, Math.floor((now - new Date(yr, 8, 1)) / 6048e5));
    if (wks < 8) return 1;
    if (wks < 14) return 2;
    if (wks < 21) return 3;
    if (wks < 28) return 4;
    return 5;
  }
  const PHASE_LABELS = ['', 'Aut1', 'Aut2', 'Spr1', 'Spr2', 'Sum'];
  const SCHOOL_PHASE = getSchoolPhase();
  const CURR_WT = [0, 0.15, 0.35, 0.55, 0.75, 0.95][SCHOOL_PHASE];
  function pickPhased(prev, curr) {
    const useCurr = curr.length && Math.random() < CURR_WT;
    const bank = (useCurr && curr.length) ? curr : (prev.length ? prev : curr);
    return bank[Math.floor(Math.random() * bank.length)];
  }

  // ── Recently-seen avoidance ──────────────────────────────────────────────
  // Tracks the last `seenWindow` picks from a bank in localStorage so the
  // same item won't repeat until that many other items have shown first —
  // makes even a small bank feel bigger. Purely client-side, no API calls.
  function pickFresh(prefix, bank, key, seenWindow) {
    const w = seenWindow || 15;
    const k = prefix + '_' + key;
    let seen;
    try { seen = JSON.parse(localStorage.getItem(k) || '[]'); } catch (e) { seen = []; }
    const avail = bank.map((_, i) => i).filter(i => !seen.includes(i));
    const pool = avail.length ? avail : bank.map((_, i) => i);
    const idx = pool[Math.floor(Math.random() * pool.length)];
    const ns = [...seen.filter(i => i !== idx), idx].slice(-w);
    try { localStorage.setItem(k, JSON.stringify(ns)); } catch (e) { /* storage full/blocked — not worth failing the pick over */ }
    return bank[idx];
  }

  const LUNCH_MENU_URL = 'https://staff.wallscourt-farm-academy.co.uk/menu.json';
  // CUT OVER 22.09.26 to the Postgres-backed store (wfa-data) — real live
  // state (empty at migration time) backfilled and verified first. Old
  // Apps Script backend deliberately left running, untouched, as an
  // instant one-line rollback if ever needed:
  //   'https://script.google.com/macros/s/AKfycbz0yYbvPGa7csQYwJAQg7NTRYrbNjt-wgz4XYjdSEJ1GxuV2rQornoKicohiKDoBbhC/exec'
  const LUNCH_OVERRIDE_URL = 'https://api.wallscourt-farm-academy.co.uk/planning/lunchoverrides-db';

  function createBoard(config) {
    const prefix = config.prefix;
    const yearNum = config.yearNum;
    const AUTO_MSGS = config.AUTO_MSGS || {};

    let menuByWeek = {};
    let centralOverrides = {};
    let centralSwaps = {};
    let menuLastUpdated = null;
    let overridesLastUpdated = null;
    let pendingTTBank = [];

    // ── Shared menu (base + central overrides) ──────────────────────────
    // 20.09.26: no per-board local menu overrides any more (see the
    // 19.09.26 lunch-menu fix) — this is now the ONLY source a board's
    // lunch bar reads from besides its own in-file fallback data.
    async function fetchSharedMenu(fallbackMenuByWeek) {
      menuByWeek = Object.assign({}, fallbackMenuByWeek || {});
      try {
        const res = await fetch(LUNCH_MENU_URL, { cache: 'no-cache' });
        if (!res.ok) throw new Error('fetch failed');
        const data = await res.json();
        if (data && data.weeks && typeof data.weeks === 'object') {
          menuByWeek = data.weeks;
          console.log('[wfaMorning] Loaded', Object.keys(menuByWeek).length, 'weeks for', prefix);
        }
        menuLastUpdated = (data && data._lastUpdated) || null;
      } catch (e) {
        console.log('[wfaMorning] menu.json using in-file fallback for', prefix, ':', e.message);
      }
      try {
        const or = await fetch(LUNCH_OVERRIDE_URL, { cache: 'no-cache' });
        if (!or.ok) throw new Error('fetch failed');
        const od = await or.json();
        centralOverrides = od.overrides || {};
        centralSwaps = od.swaps || {};
        overridesLastUpdated = od.updatedAt || null;
      } catch (e) {
        console.log('[wfaMorning] lunch overrides unavailable for', prefix, ':', e.message);
      }
    }

    // A board's own pasta-of-the-week lookup (the 3rd element some weeks'
    // day arrays carry) reads the live shared menu data directly, not just
    // through getMenu()'s central-override resolution — this exposes it.
    function getMenuByWeek() { return menuByWeek; }

    function getMenu() {
      const ts = todayStr(), dk = getDK(ts);
      if (!['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].includes(dk)) return ['No school today', ''];
      if (centralOverrides[ts]) return centralOverrides[ts];
      const lookupDate = centralSwaps[ts] || ts, lookupDk = getDK(lookupDate);
      const mon = getMon(lookupDate);
      if (menuByWeek[mon]) return menuByWeek[mon][lookupDk] || ['Menu not set', ''];
      return ['Menu not yet set', ''];
    }

    // Writes the "Menu updated <date>" caption into #menu-updated, if the
    // board's markup has that element. No-ops harmlessly if not (a board
    // not yet carrying the stamp element from the 19.09.26 fix).
    function renderMenuStamp() {
      const el = document.getElementById('menu-updated');
      if (!el) return;
      const stamps = [menuLastUpdated, overridesLastUpdated].filter(Boolean).sort();
      const latest = stamps[stamps.length - 1];
      el.textContent = latest ? ('Menu updated ' + new Date(latest).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })) : '';
    }

    // ── Per-day override store (message + two-truths-and-a-lie only —
    // the lunch menu itself was removed from here on 19.09.26) ──────────
    function ovKey(ts) { return prefix + '_ov_' + ts; }
    function getOverride(ts) {
      try { return JSON.parse(localStorage.getItem(ovKey(ts)) || '{}'); } catch (e) { return {}; }
    }
    function setOverride(ts, ov) { localStorage.setItem(ovKey(ts), JSON.stringify(ov)); }

    function getDefaultMsgs() {
      const raw = localStorage.getItem(prefix + '_default_msgs');
      if (raw === null) return { ...AUTO_MSGS };
      try { return JSON.parse(raw); } catch (e) { return { ...AUTO_MSGS }; }
    }
    function getMsg() {
      const ts = todayStr(), dk = getDK(ts);
      const ov = getOverride(ts);
      if (ov.hasOwnProperty('msg')) return ov.msg;
      return getDefaultMsgs()[dk] || '';
    }

    function getTTSet(DEFAULT_TT) {
      const ts = todayStr();
      const ov = getOverride(ts);
      if (ov.tt && ov.tt.topic) return ov.tt;
      const userBank = JSON.parse(localStorage.getItem(prefix + '_tt_bank') || '[]');
      const all = [...DEFAULT_TT, ...userBank];
      if (yearNum === undefined || yearNum === null) return pickPhased([], all.length ? all : []) || all[Math.floor(Math.random() * all.length)];
      const ttPrev = all.filter(x => x.yr !== yearNum);
      const ttCurr = all.filter(x => x.yr === yearNum);
      return pickPhased(ttPrev, ttCurr);
    }

    // ── Override modal (message + two-truths-and-a-lie) ─────────────────
    // Expects the standard markup/ids: ov-msg, ov-tt-topic, ov-tt-1..3,
    // ov-tt-lie, ov-auto-preview, ov-overlay, override-dot.
    function openOverride() {
      const ts = todayStr(), dk = getDK(ts);
      const ov = getOverride(ts);
      document.getElementById('ov-msg').value = ov.hasOwnProperty('msg') ? ov.msg : '';
      const tt = ov.tt || {};
      document.getElementById('ov-tt-topic').value = tt.topic || '';
      document.getElementById('ov-tt-1').value = tt.stmts ? tt.stmts[0] : '';
      document.getElementById('ov-tt-2').value = tt.stmts ? tt.stmts[1] : '';
      document.getElementById('ov-tt-3').value = tt.stmts ? tt.stmts[2] : '';
      document.getElementById('ov-tt-lie').value = tt.lie || 1;
      const auto = getDefaultMsgs()[dk];
      const preview = document.getElementById('ov-auto-preview');
      if (preview) preview.textContent = auto ? `Auto for ${DAYNAMES[new Date(ts + 'T12:00:00').getDay()]}: "${auto}"` : 'No automatic message today.';
      document.getElementById('ov-overlay').classList.add('on');
    }
    function closeOverride() { document.getElementById('ov-overlay').classList.remove('on'); }
    function saveOverride(afterSave) {
      const ts = todayStr();
      const ov = getOverride(ts);
      ov.msg = document.getElementById('ov-msg').value;
      const topic = document.getElementById('ov-tt-topic').value.trim();
      if (topic) {
        ov.tt = {
          topic,
          stmts: [document.getElementById('ov-tt-1').value, document.getElementById('ov-tt-2').value, document.getElementById('ov-tt-3').value],
          lie: parseInt(document.getElementById('ov-tt-lie').value),
        };
      } else {
        delete ov.tt;
      }
      setOverride(ts, ov);
      closeOverride();
      if (afterSave) afterSave();
      updateDot();
    }
    function clearOverride(afterClear) {
      localStorage.removeItem(ovKey(todayStr()));
      closeOverride();
      if (afterClear) afterClear();
      updateDot();
    }
    function updateDot() {
      const ts = todayStr();
      const ov = getOverride(ts);
      const central = centralOverrides[ts] || centralSwaps[ts];
      const dot = document.getElementById('override-dot');
      if (dot) dot.style.display = (Object.keys(ov).length || central) ? 'inline-block' : 'none';
    }

    // ── Two-truths bank (Setup panel) ────────────────────────────────────
    // Setup's own board-specific sections (phonics picker, MTC tables,
    // etc.) stay in each board's own openSetup/saveSetup — call these at
    // the start/end of those functions for the shared TT-bank + default-
    // message part every board has.
    const ttBank = {
      load() {
        pendingTTBank = JSON.parse(JSON.stringify(JSON.parse(localStorage.getItem(prefix + '_tt_bank') || '[]')));
      },
      render(listElementId) {
        const el = document.getElementById(listElementId || 'tt-bank-list');
        if (!el) return;
        if (pendingTTBank.length === 0) {
          el.innerHTML = `<p style="font-size:0.82rem;color:#AAA;margin-bottom:8px">No custom sets yet.</p>`;
          return;
        }
        el.innerHTML = pendingTTBank.map((s, i) => `
          <div class="tt-bank-item">
            <button class="tt-bank-del" onclick="wfaMorning.ttDelete('${prefix}',${i})">✕</button>
            <div class="tt-bank-topic">${s.topic}</div>
            <div class="tt-bank-stmts">
              ${s.stmts.map((st, j) => `<span class="${j + 1 === s.lie ? 'tt-bank-lie' : ''}">• ${st}</span>`).join('<br>')}
              <br><span style="font-size:0.78rem;color:#AAA">Lie: statement ${s.lie}</span>
            </div>
          </div>`).join('');
      },
      add(topic, stmts, lie) {
        pendingTTBank.push({ topic, stmts, lie });
      },
      // Reads the standard "add a new set" form fields (tt-new-topic,
      // tt-new-1/2/3, tt-new-lie), validates, adds, clears the form and
      // re-renders — the whole addTTSet() every board duplicated verbatim.
      addFromForm(listElementId) {
        const topic = document.getElementById('tt-new-topic').value.trim();
        const s1 = document.getElementById('tt-new-1').value.trim();
        const s2 = document.getElementById('tt-new-2').value.trim();
        const s3 = document.getElementById('tt-new-3').value.trim();
        const lie = parseInt(document.getElementById('tt-new-lie').value);
        if (!topic || !s1 || !s2 || !s3) { alert('Please fill in all fields.'); return; }
        this.add(topic, [s1, s2, s3], lie);
        ['topic', '1', '2', '3'].forEach(k => { document.getElementById('tt-new-' + k).value = ''; });
        this.render(listElementId);
      },
      delete(i) {
        pendingTTBank.splice(i, 1);
      },
      save() {
        localStorage.setItem(prefix + '_tt_bank', JSON.stringify(pendingTTBank));
      },
      get() { return pendingTTBank; },
    };
    // addTTSet/deleteTT are wired to onclick="" attributes in each board's
    // markup, which need a real global to call — registered once below via
    // the small _tt* dispatch table keyed by prefix so multiple boards
    // (never true in production, but harmless) don't collide.
    global.wfaMorning = global.wfaMorning || {};
    global.wfaMorning._ttBoards = global.wfaMorning._ttBoards || {};
    global.wfaMorning._ttBoards[prefix] = ttBank;

    // ── Default weekday messages (Setup panel) ───────────────────────────
    function loadDefaultMsgsIntoForm() {
      const dm = getDefaultMsgs();
      ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].forEach(d => {
        const el = document.getElementById('dm-' + d);
        if (el) el.value = dm[d] || '';
      });
    }
    function saveDefaultMsgsFromForm() {
      const dm = {};
      ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].forEach(d => {
        const el = document.getElementById('dm-' + d);
        dm[d] = el ? el.value : '';
      });
      localStorage.setItem(prefix + '_default_msgs', JSON.stringify(dm));
    }

    // ── Image overlay (Add image) ────────────────────────────────────────
    function openImgOverlay() {
      document.getElementById('img-overlay').classList.add('on');
      document.getElementById('img-url-input').value = '';
    }
    function closeImgOverlay() { document.getElementById('img-overlay').classList.remove('on'); }
    function handleImgFile(e) {
      const f = e.target.files[0];
      if (!f) return;
      const r = new FileReader();
      r.onload = ev => showImg(ev.target.result);
      r.readAsDataURL(f);
      e.target.value = '';
    }
    function handleImgUrl() {
      const url = document.getElementById('img-url-input').value.trim();
      if (!url) return;
      fetch(url).then(r => r.blob()).then(blob => {
        const r = new FileReader();
        r.onload = ev => { showImg(ev.target.result); closeImgOverlay(); };
        r.readAsDataURL(blob);
      }).catch(() => { showImg(url); closeImgOverlay(); });
    }
    function showImg(src) {
      document.getElementById('img-el').src = src;
      document.getElementById('img-pane').classList.add('visible');
      try { sessionStorage.setItem(prefix + '_img', src); } catch (e) { /* private browsing etc — image just won't survive a reload */ }
    }
    function removeImg() {
      document.getElementById('img-el').src = '';
      document.getElementById('img-pane').classList.remove('visible');
      try { sessionStorage.removeItem(prefix + '_img'); } catch (e) { /* see showImg */ }
    }
    function loadImg() {
      try { const s = sessionStorage.getItem(prefix + '_img'); if (s) showImg(s); } catch (e) { /* see showImg */ }
    }

    return {
      // date/util
      todayStr, getMon, getDK, shuffle, DAYS, DAYNAMES, MONTHS,
      // phase weighting
      getSchoolPhase, pickPhased, SCHOOL_PHASE, PHASE_LABELS, CURR_WT,
      pickFresh: (bank, key, seenWindow) => pickFresh(prefix, bank, key, seenWindow),
      // menu
      fetchSharedMenu, getMenu, getMenuByWeek, renderMenuStamp,
      // messages
      getDefaultMsgs, getMsg, getTTSet,
      // override modal
      getOverride, setOverride, openOverride, closeOverride, saveOverride, clearOverride, updateDot,
      // setup: tt bank + default messages
      ttBank, loadDefaultMsgsIntoForm, saveDefaultMsgsFromForm,
      // image overlay
      openImgOverlay, closeImgOverlay, handleImgFile, handleImgUrl, showImg, removeImg, loadImg,
    };
  }

  global.wfaMorning = global.wfaMorning || {};
  Object.assign(global.wfaMorning, {
    createBoard,
    todayStr, getMon, getDK, shuffle, DAYS, DAYNAMES, MONTHS,
    getSchoolPhase, pickPhased,
    // Bound by createBoard so each board's markup can call
    // onclick="wfaMorning.ttDelete('y5', i)" / ttAdd('y5') without every
    // board needing its own top-level deleteTT/addTTSet wrapper.
    ttDelete(prefix, i) {
      const b = global.wfaMorning._ttBoards[prefix];
      if (b) { b.delete(i); b.render(); }
    },
    ttAdd(prefix) {
      const b = global.wfaMorning._ttBoards[prefix];
      if (b) b.addFromForm();
    },
  });
})(window);

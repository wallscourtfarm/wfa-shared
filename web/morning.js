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


  // ── Talk timer ───────────────────────────────────────────────────────────
  // Added 07.10.26. A teacher-started 2-minute "talk to the people around you"
  // timer; at zero the board switches to a "No Voice (0)" state in the year theme colour, silently. Self-contained: injects
  // its own CSS and a strip into #right-panel just above #ctrl. Opt-in per
  // board with one call: wfaMorning.installTalkTimer({seconds: 120}).
  // Default picture shown at zero (the "0 No Talk" voice-level graphic), same on every board. Override with opts.doneImage.
  const TALK_DONE_IMAGE = 'data:image/png;base64,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';
  function installTalkTimer(opts) {
    opts = opts || {};
    if (!opts.doneImage) opts.doneImage = TALK_DONE_IMAGE;
    const TOTAL = (opts.seconds || 120) | 0;
    const panel = document.getElementById('right-panel');
    const ctrl = document.getElementById('ctrl');
    if (!panel || !ctrl || document.getElementById('talk-timer')) return;

    const css = document.createElement('style');
    css.textContent =
      '#talk-timer{flex-shrink:0;margin-top:0.8vh;border-radius:8px;border:2.5px solid #1798d3;background:#EAF6FC;color:#0b5f87;font-family:"Nunito",sans-serif;text-align:center;cursor:pointer;user-select:none;padding:0.6vh 0.6vw;transition:background .3s,border-color .3s}' +
      '#talk-timer .tt-lbl{font-size:clamp(0.8rem,1.8vh,1.2rem);font-weight:800;line-height:1.2}' +
      '#talk-timer .tt-time{font-size:clamp(1.4rem,3.6vh,2.4rem);font-weight:900;line-height:1.1;font-variant-numeric:tabular-nums}' +
      '#talk-timer .tt-hint{font-size:clamp(0.65rem,1.3vh,0.85rem);font-weight:700;opacity:.65}' +
      '#talk-timer.run{background:#E3F6E5;border-color:#27AE60;color:#14602a;padding:1.4vh 0.6vw}' +
      '#talk-timer.run .tt-lbl{font-size:clamp(1.1rem,2.6vh,1.8rem)}' +
      '#talk-timer.run .tt-time{font-size:clamp(3rem,10vh,6.5rem)}' +
      '#talk-timer.run.low{background:#FFF4D6;border-color:#E6A100;color:#7a5200}' +
      '#talk-timer.done{background:var(--tt-theme,#1798d3);border-color:var(--tt-theme,#1798d3);color:#fff;padding:1.8vh 0.6vw;animation:tt-pulse 1.6s ease-in-out infinite}' +
      '#talk-timer.done .tt-lbl{font-size:clamp(1.4rem,3.8vh,2.6rem);font-weight:900;line-height:1.25}' +
      '#talk-timer.done .tt-time{display:none}' +
      '#talk-timer .tt-img{display:none;height:clamp(4.5rem,15vh,10rem);max-width:90%;object-fit:contain;margin:0 auto 1vh;background:#fff;border-radius:12px;padding:0.8vh 1.2vh}' +
      '#talk-timer.done .tt-img{display:block}' +
      '@keyframes tt-pulse{0%,100%{box-shadow:0 0 0 0 rgba(0,0,0,.35)}50%{box-shadow:0 0 0 0.9vh rgba(0,0,0,0)}}';
    document.head.appendChild(css);

    const el = document.createElement('div');
    el.id = 'talk-timer';
    // match the year group's theme colour (same as the Morning Messages header)
    const hdr = document.querySelector('.msg-hdr');
    if (hdr) el.style.setProperty('--tt-theme', getComputedStyle(hdr).backgroundColor);
    el.innerHTML = '<div class="tt-lbl"></div><div class="tt-time"></div><div class="tt-hint"></div>';
    // optional picture shown at zero in place of the 🤫 emoji: wfaMorning.installTalkTimer({doneImage: 'data:image/png;base64,...'})
    if (opts.doneImage) {
      const img = document.createElement('img');
      img.className = 'tt-img'; img.alt = '0 No Talk'; img.src = opts.doneImage;
      el.insertBefore(img, el.firstChild);
    }
    panel.insertBefore(el, ctrl);
    const lbl = el.querySelector('.tt-lbl'), time = el.querySelector('.tt-time'), hint = el.querySelector('.tt-hint');

    let state = 'idle', endAt = 0, tick = null;
    const fmt = n => Math.floor(n / 60) + ':' + String(n % 60).padStart(2, '0');

    function render() {
      el.className = state === 'idle' ? '' : state === 'run' ? 'run' : 'done';
      if (state === 'idle') {
        lbl.textContent = 'Talk time';
        time.textContent = fmt(TOTAL);
        hint.textContent = 'Tap to start';
      } else if (state === 'run') {
        const left = Math.max(0, Math.ceil((endAt - Date.now()) / 1000));
        el.classList.toggle('low', left <= 10);
        lbl.textContent = 'Low voice discussions with learners around you';
        time.textContent = fmt(left);
        hint.textContent = 'Tap to stop';
      } else {
        lbl.textContent = opts.doneImage ? 'Eyes and minds on your learning' : '🤫 No Voice (0) - Eyes and minds on your learning';
        hint.textContent = 'Tap to reset';
      }
    }
    function stop() { clearInterval(tick); tick = null; }
    function start() {
      state = 'run'; endAt = Date.now() + TOTAL * 1000;
      stop(); tick = setInterval(() => {
        if (Date.now() >= endAt) { stop(); state = 'done'; }
        render();
      }, 250);
      render();
    }
    el.addEventListener('click', () => {
      if (state === 'idle') start();
      else { stop(); state = 'idle'; render(); }
    });
    render();
  }

  global.wfaMorning = global.wfaMorning || {};
  Object.assign(global.wfaMorning, {
    createBoard, installTalkTimer,
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

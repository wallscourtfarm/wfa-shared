// wfa-shared/web/reliability.js
//
// Shared reliability helpers for the WFA staff-tools family (cover-plan,
// teaching-schedule, fab-rota, lunch-cover, lunch-leaders, slt-schedule,
// booking, and any future tool in that family).
//
// Added 19.09.26 after a same-day reliability sweep found the identical
// "silent failure" bug — a fetch or save that fails with zero visible
// indication — independently reimplemented, and independently broken, in
// six different files. Each copy had to be found and fixed on its own.
// This file exists so that stops happening: load it once, use these
// functions, and a future fix here reaches every tool that loads it,
// instead of needing to be rediscovered and reapplied file by file.
//
// Usage — add this one line before your tool's own <script>:
//   <script src="https://cdn.jsdelivr.net/gh/wallscourtfarm/wfa-shared@main/web/reliability.js"></script>
// Everything below attaches to `window.wfaReliability`.
//
// This file is a pure addition — it defines nothing a page doesn't
// explicitly call, and adopting it in one tool has zero effect on any
// other tool, live or not. See feedback_parallel_build_never_touch_live_tools
// in Claude's memory for why that matters here.

(function (global) {
  'use strict';

  // ── Overlay/read-path failure tracking ─────────────────────────────────
  // A "overlay" is any secondary read a page does after its main content is
  // showing — another tool's release-schedule tags, a shared duty rota, etc.
  // These used to fail with `.catch(() => null)` and nothing on screen to
  // say so, which is exactly how a real PPA entry went missing with no
  // explanation on 19.09.26. Tracked per named key so a repeated read (e.g.
  // on every week-change) correctly clears its own entry once it succeeds
  // again, rather than a stale warning sticking around forever.
  const _activeIssues = new Set();

  function setOverlayIssue(key, hasIssue, statusElementId) {
    if (hasIssue) _activeIssues.add(key);
    else _activeIssues.delete(key);
    renderOverlayStatus(statusElementId);
  }

  function renderOverlayStatus(statusElementId) {
    const el = document.getElementById(statusElementId || 'overlayStatus');
    if (!el) return;
    if (!_activeIssues.size) {
      el.style.display = 'none';
      return;
    }
    el.textContent = '⚠ Could not load: ' + [..._activeIssues].join(', ') + ' — reload to retry';
    el.title = 'These come from other WFA tools and failed to load just now. Nothing on this page was lost or overwritten — retry by reloading.';
    el.style.display = '';
  }

  // Wraps a fetch so a failure (network error, non-2xx, or a body the
  // backend itself flagged as an error) is caught, recorded against `key`
  // via setOverlayIssue, and logged — instead of silently returning null
  // the way every one of today's six bugs did.
  //
  //   label            — short name shown in the on-screen warning
  //   url              — request URL
  //   opts             — fetch() options (or undefined)
  //   extract          — function(Response) -> value or Promise<value>,
  //                       e.g. r => r.json() or r => r.text()
  //   emptyFallback    — value to resolve with on failure
  //   statusElementId  — id of the element the warning renders into
  //                       (defaults to 'overlayStatus')
  function fetchOverlay(label, url, opts, extract, emptyFallback, statusElementId) {
    if (!url) return Promise.resolve(emptyFallback);
    return fetch(url, opts)
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return extract(r);
      })
      .then(function (value) {
        setOverlayIssue(label, false, statusElementId);
        return value;
      })
      .catch(function (err) {
        setOverlayIssue(label, true, statusElementId);
        console.error('Overlay load failed:', label, err);
        return emptyFallback;
      });
  }

  // ── Save-path verification ─────────────────────────────────────────────
  // A resolved fetch() is not the same as a successful save — the backend
  // can reject one with a normal 200 and an error-shaped body (a
  // write-verification failure, a lock timeout, a bad token). This was the
  // exact bug behind the 18.09.26 cover-plan-state data-loss incident, and
  // was found completely unfixed in fab-rota on 19.09.26 despite an earlier
  // commit claiming otherwise. Checks every error shape used across these
  // backends: {status:'error'}, {success:false}, and a top-level {error}.
  //
  // Returns a Promise that resolves on genuine success and rejects with a
  // real Error otherwise — callers decide what "failed" means to their UI
  // (a banner, a retry queue, a status badge).
  function saveWithVerification(url, opts) {
    return fetch(url, opts).then(function (res) {
      return res.text().then(function (text) {
        let json = null;
        try { json = text ? JSON.parse(text) : null; } catch (e) { /* non-JSON body, fall through to the ok-check below */ }
        const failed = !res.ok || (json && (json.status === 'error' || json.success === false || json.error));
        if (failed) {
          const message = (json && (json.message || json.error)) || ('save rejected (HTTP ' + res.status + ')');
          throw new Error(message);
        }
        return json;
      });
    });
  }

  // ── Staff ID resolution ─────────────────────────────────────────────────
  // The same slugify formula, reimplemented with small variations across
  // at least six files (cover-plan, teaching-schedule, fab-rota, lunch-
  // cover, lunch-leaders, slt-schedule) — verified identical in practice
  // today, but a one-character drift here would silently break ID matching
  // between tools (exactly the shape of bug this file exists to prevent).
  function staffId(name) {
    return (name || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '');
  }

  global.wfaReliability = {
    fetchOverlay: fetchOverlay,
    setOverlayIssue: setOverlayIssue,
    renderOverlayStatus: renderOverlayStatus,
    saveWithVerification: saveWithVerification,
    staffId: staffId,
  };
})(window);

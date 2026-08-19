// Hotjar — behaviour analytics for the prototype.
//
// Hotjar's own instructions say to paste their snippet into the <head> of every page.
// Sixteen pasted copies would be sixteen places holding the same site id, and the next
// person to change it would find fifteen. So the snippet lives here once and each page
// carries one <script src="/analytics.js"> line in its <head> instead — the same shape
// as titan-sidebar.js. The snippet itself is Hotjar's, unmodified.
//
// The one thing added around it is the local-development guard below.
(function () {
  var HOTJAR_ID = 6764423;
  var HOTJAR_SV = 6;
  var OPT_OUT_KEY = 'titan-no-analytics';

  // Sessions from `node dev-server.js` would otherwise land in the same recordings as
  // real ones, and a developer reloading a page fifty times is not user behaviour.
  // Delete this block if you ever want to watch someone use a local build.
  var host = location.hostname;
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1' ||
      host === '' || /\.local$/.test(host)) {
    return;
  }

  // ── Team opt-out ───────────────────────────────────────────────────────────
  // The gate is here, in our own loader, rather than a flag we hope Hotjar reads.
  // The `_hjOptOut` localStorage key that circulates in blog posts does NOT work:
  // tested against this site on 2026-08-19 with the flag set, and Hotjar still
  // loaded, bootstrapped and opened a session. Only not-injecting the script is
  // reliable, and that is something we control.
  //
  // `_hjOptOut` is honoured here anyway, so anyone who already ran that snippet
  // from the internet is actually covered rather than merely believing they are.
  //
  // On CLAUDE.md's "there is no localStorage": this is a device-level preference
  // for a third-party tracker, not CRM state being cached client-side, and it has
  // to outlive the tab or the team would opt out again every morning. It is the
  // one occurrence, and /no-tracking is the only thing that writes it.
  try {
    if (localStorage.getItem(OPT_OUT_KEY) === 'true' ||
        localStorage.getItem('_hjOptOut') === 'true') {
      return;
    }
  } catch (e) {
    // localStorage throws in some private modes. Tracking a session we cannot let
    // someone opt out of is the worse failure, so treat it as opted out.
    return;
  }

  (function (h, o, t, j, a, r) {
    h.hj = h.hj || function () { (h.hj.q = h.hj.q || []).push(arguments); };
    h._hjSettings = { hjid: HOTJAR_ID, hjsv: HOTJAR_SV };
    a = o.getElementsByTagName('head')[0];
    r = o.createElement('script'); r.async = 1;
    r.src = t + h._hjSettings.hjid + j + h._hjSettings.hjsv;
    a.appendChild(r);
  })(window, document, 'https://static.hotjar.com/c/hotjar-', '.js?sv=');
})();

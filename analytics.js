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

  // Sessions from `node dev-server.js` would otherwise land in the same recordings as
  // real ones, and a developer reloading a page fifty times is not user behaviour.
  // Delete this block if you ever want to watch someone use a local build.
  var host = location.hostname;
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1' ||
      host === '' || /\.local$/.test(host)) {
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

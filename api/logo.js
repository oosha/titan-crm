// GET /api/logo?domain=<domain> — a company's favicon, proxied.
//
// Why proxy instead of pointing <img> straight at an icon service:
//   1. Unknown domains must fail as a real 404 so the frontend's onerror fallback
//      (company initial) actually fires. Icon services are inconsistent here —
//      DuckDuckGo 404s but still returns a valid placeholder image body, and Google
//      returns its generic globe with a 200. Either way a browser can end up
//      rendering a meaningless grey glyph instead of falling back.
//   2. The placeholder is byte-identical every time, so we can recognise and reject
//      it outright rather than guessing from image dimensions.
//   3. The viewer's browser never talks to a third-party icon service; only this
//      server does.
const crypto = require('crypto');

// DuckDuckGo's "no icon for this domain" placeholder (the grey chevron).
const PLACEHOLDER_MD5 = 'ab1fb25b83d4b333ea661a84bd298b2e';

function isValidDomain(d) {
  return typeof d === 'string' && /^[a-z0-9.-]{1,253}$/i.test(d) && d.indexOf('.') !== -1;
}

module.exports = async function handler(req, res) {
  const domain = String((req.query && req.query.domain) || '').trim().toLowerCase();
  if (!isValidDomain(domain)) { res.status(400).json({ error: 'Bad domain' }); return; }

  try {
    const upstream = await fetch('https://icons.duckduckgo.com/ip3/' + encodeURIComponent(domain) + '.ico', {
      headers: { 'User-Agent': 'titan-crm-prototype' },
    });
    if (!upstream.ok) { res.status(404).end(); return; }

    const buf = Buffer.from(await upstream.arrayBuffer());
    if (!buf.length) { res.status(404).end(); return; }
    if (crypto.createHash('md5').update(buf).digest('hex') === PLACEHOLDER_MD5) { res.status(404).end(); return; }

    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'image/x-icon');
    // Long cache: a company's favicon rarely changes, and this keeps repeat board
    // renders from re-fetching every card's icon.
    res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=604800');
    res.status(200).send(buf);
  } catch (err) {
    res.status(404).end();
  }
};

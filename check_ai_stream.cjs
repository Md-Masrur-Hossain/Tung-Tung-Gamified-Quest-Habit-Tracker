// Diagnostic: inspect the live app page for any AI/gateway/stream activity.
const { BrowserSession, getWsUrl } = require('./audit_runner.cjs');

(async () => {
  const s = new BrowserSession(await getWsUrl());
  await s.connect();

  const r = await s.evaluate(`
    (() => {
      const res = performance.getEntriesByType('resource').map(e => e.name);
      return JSON.stringify({
        suspicious: res.filter(n => /ai|vercel|gemini|stream|chat|gateway|inference/i.test(n)),
        total: res.length,
        lsKeys: Object.keys(localStorage),
        ssKeys: Object.keys(sessionStorage),
        href: location.href,
        iframes: Array.from(document.querySelectorAll('iframe')).map(f => f.src),
        bodyHasStreamError: document.body.innerText.includes('Failed to create stream')
      }, null, 2);
    })()
  `);
  console.log(r);
  await s.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

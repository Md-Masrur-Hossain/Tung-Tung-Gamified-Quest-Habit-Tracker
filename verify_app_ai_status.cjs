// D:\3rd project\verify_app_ai_status.cjs
// Real-browser verification for the "AI stream bug" task.
//
// Proves: app boots, register/login works, whether ANY AI/chat UI exists,
// whether ANY AI/gateway network request happens, and console/network errors
// across register -> dashboard -> refresh -> logout -> login -> dashboard.
const { BrowserSession, getWsUrl, sleep } = require('./audit_runner.cjs');

async function main() {
  const wsUrl = await getWsUrl();
  const s = new BrowserSession(wsUrl);
  await s.connect();

  const summary = {
    steps: [],
    aiUiFound: false,
    aiUiDetails: [],
    aiNetworkRequests: [],
    streamErrorOnPage: false,
    chatMessagesSent: 0,
  };

  const inspectPage = async (label) => {
    const info = await s.evaluate(`(() => {
      const text = document.body.innerText;
      const chatSelectors = [
        'textarea',
        'input[placeholder*="message" i]',
        'input[placeholder*="chat" i]',
        '[aria-label*="chat" i]',
        '[data-testid*="chat" i]',
        'form[action*="chat" i]',
      ];
      const found = [];
      for (const sel of chatSelectors) {
        document.querySelectorAll(sel).forEach((el) => {
          found.push(sel + ' -> ' + (el.getAttribute('placeholder') || el.getAttribute('aria-label') || el.tagName));
        });
      }
      const sendButtons = Array.from(document.querySelectorAll('button'))
        .map((b) => b.innerText.trim())
        .filter((t) => /^(send|submit message|chat)$/i.test(t));
      const aiResources = performance.getEntriesByType('resource')
        .map((e) => e.name)
        .filter((n) => /gemini|vercel|gateway|inference|openai|anthropic|generativelanguage/i.test(n));
      return JSON.stringify({
        href: location.href,
        hasStreamError: text.includes('Failed to create stream') || text.includes('invalid argument'),
        mentionsGemini: /gemini/i.test(text),
        chatUi: found,
        sendButtons,
        aiResources,
        hasLogout: /Logout/.test(text),
        snippet: text.slice(0, 120).replace(/\\n/g, ' ')
      });
    })()`);
    const parsed = JSON.parse(info);
    summary.steps.push({ label, ...parsed });
    if (parsed.chatUi.length || parsed.sendButtons.length) summary.aiUiFound = true;
    summary.aiUiDetails.push(...parsed.chatUi, ...parsed.sendButtons);
    summary.aiNetworkRequests.push(...parsed.aiResources);
    summary.streamErrorOnPage = summary.streamErrorOnPage || parsed.hasStreamError;
    return parsed;
  };

  // ---- 1. Fresh registration (login path) --------------------------------
  const u = 'hero_' + Date.now();
  const e = u + '@example.com';
  const p = 'Password123!';

  await s.navigate('http://localhost:5173/register');
  await s.evaluate(`localStorage.clear()`);
  await s.navigate('http://localhost:5173/register');
  await s.evaluate(`
    (function() {
      const inputs = document.querySelectorAll('input');
      const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      const vals = ['${u}', '${e}', '${p}'];
      inputs.forEach((inp, i) => {
        set.call(inp, vals[i]);
        inp.dispatchEvent(new Event('input', { bubbles: true }));
        inp.dispatchEvent(new Event('change', { bubbles: true }));
      });
      return inputs.length;
    })()
  `);
  await sleep(300);
  await s.evaluate(`document.querySelector('button[type="submit"]').click()`);
  await sleep(2500);
  const afterRegister = await inspectPage('after register -> dashboard');
  summary.registerOk = /\/dashboard/.test(afterRegister.href) && afterRegister.hasLogout;

  // ---- 2. Attempt "open AI/chat UI + send hello" --------------------------
  summary.chatFlowNote = summary.aiUiFound
    ? 'chat UI present (unexpected for this codebase)'
    : 'NO AI/chat UI exists in the application — there is no model call to trace or send "hello" to';

  // ---- 3. Refresh and re-check (repeat stream failure check) -------------
  await s.navigate('http://localhost:5173/dashboard');
  await sleep(1500);
  await inspectPage('after refresh');

  // ---- 4. Logout then login again (second session) -----------------------
  await s.evaluate(`Array.from(document.querySelectorAll('button,a')).find(el => /logout/i.test(el.innerText))?.click()`);
  await sleep(1500);
  await s.navigate('http://localhost:5173/login');
  await s.evaluate(`
    (function() {
      const inputs = document.querySelectorAll('input');
      const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      const vals = ['${e}', '${p}'];
      inputs.forEach((inp, i) => {
        set.call(inp, vals[i]);
        inp.dispatchEvent(new Event('input', { bubbles: true }));
        inp.dispatchEvent(new Event('change', { bubbles: true }));
      });
      return inputs.length;
    })()
  `);
  await sleep(300);
  await s.evaluate(`document.querySelector('button[type="submit"]').click()`);
  await sleep(2500);
  const afterLogin = await inspectPage('after logout -> login -> dashboard');
  summary.loginOk = /\/dashboard/.test(afterLogin.href) && afterLogin.hasLogout;

  // ---- 5. Error tallies ---------------------------------------------------
  summary.consoleErrors = s.consoleLogs.filter((l) => l.type === 'error').map((l) => l.text);
  summary.consoleErrorCount = summary.consoleErrors.length;
  summary.networkErrors = s.networkErrors;
  summary.networkErrorCount = s.networkErrors.length;
  summary.networkErrorStatuses = [...new Set(s.networkErrors.map((n) => n.status))];
  summary.aiUiFound = summary.aiUiFound || summary.aiUiDetails.length > 0;
  summary.aiNetworkRequests = [...new Set(summary.aiNetworkRequests)];
  summary.streamErrorOnPage =
    summary.streamErrorOnPage ||
    summary.consoleErrors.some((t) => /stream|gemini|invalid argument/i.test(t)) ||
    summary.networkErrors.some((n) => /gemini|vercel|gateway|inference/i.test(n.url));

  console.log(JSON.stringify(summary, null, 2));
  s.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

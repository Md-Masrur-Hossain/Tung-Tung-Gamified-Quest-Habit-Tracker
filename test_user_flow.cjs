// D:\3rd project\test_user_flow.cjs
const { BrowserSession, getWsUrl, sleep } = require('./audit_runner.cjs');

async function main() {
  const wsUrl = await getWsUrl();
  const session = new BrowserSession(wsUrl);
  await session.connect();
  console.log('Connected to Edge session!');

  // Clear localStorage
  await session.navigate('http://localhost:5173/login');
  await session.evaluate(`localStorage.clear()`);
  await session.navigate('http://localhost:5173/login');

  console.log('--- 1. Testing /login UI ---');
  let bodyText = await session.evaluate(`document.body.innerText`);
  console.log('Login page rendered text snippet:', bodyText.slice(0, 150).replace(/\n/g, ' '));

  console.log('--- 2. Register Navigation via Link ---');
  await session.evaluate(`
    const link = document.querySelector('a[href="/register"]');
    if (link) link.click();
  `);
  await sleep(1500);
  let currentUrl = await session.evaluate(`window.location.href`);
  console.log('Navigated to after clicking Sign up link:', currentUrl);

  const testUser = 'user_' + Date.now();
  const testEmail = `${testUser}@example.com`;
  const testPass = 'Password123!';

  console.log(`--- 3. Submitting Registration for ${testUser} ---`);
  const regSuccess = await session.evaluate(`
    (function() {
      const inputs = document.querySelectorAll('input');
      if (inputs.length < 3) return { ok: false, reason: 'Inputs count is ' + inputs.length };
      inputs[0].value = '${testUser}';
      inputs[0].dispatchEvent(new Event('input', { bubbles: true }));
      inputs[1].value = '${testEmail}';
      inputs[1].dispatchEvent(new Event('input', { bubbles: true }));
      inputs[2].value = '${testPass}';
      inputs[2].dispatchEvent(new Event('input', { bubbles: true }));

      const submitBtn = document.querySelector('button[type="submit"]');
      if (!submitBtn) return { ok: false, reason: 'Submit button not found' };
      submitBtn.click();
      return { ok: true };
    })()
  `);
  console.log('Registration submitted:', regSuccess);
  await sleep(2500);

  currentUrl = await session.evaluate(`window.location.href`);
  console.log('Current URL after registration:', currentUrl);

  let token = await session.evaluate(`localStorage.getItem('token')`);
  console.log('Token stored in localStorage:', token ? token.slice(0, 20) + '...' : null);

  let dashboardText = await session.evaluate(`document.body.innerText`);
  console.log('Dashboard initial text snippet:', dashboardText.slice(0, 300).replace(/\n/g, ' '));

  // Inspect the sections
  const sections = await session.evaluate(`
    (function() {
      const text = document.body.innerText;
      return {
        hasStreakBadge: !!document.querySelector('.streak-badge, [class*="streak"]'),
        hasTodaysAdventure: !!document.getElementById('todays-adventure'),
        hasActiveBoss: text.includes('ACTIVE BOSS'),
        hasQuickQuests: !!document.getElementById('quick-quests'),
        hasLifeWorlds: text.includes('YOUR LIFE WORLDS'),
        hasNextAction: text.includes('What Should I Do Now') || text.includes('RECOMMENDED NEXT ACTION'),
        hasSmartTips: text.includes('Smart Tips'),
        hasRestMode: text.includes('Rest Mode'),
        tabs: Array.from(document.querySelectorAll('button')).filter(b => b.innerText.includes('Adventure') || b.innerText.includes('Shop') || b.innerText.includes('Achievements')).map(b => b.innerText.trim())
      };
    })()
  `);
  console.log('Dashboard sections detected:', sections);

  console.log('Network errors logged so far:', session.networkErrors);
  console.log('Console logs count:', session.consoleLogs.length);

  session.close();
}

main().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});


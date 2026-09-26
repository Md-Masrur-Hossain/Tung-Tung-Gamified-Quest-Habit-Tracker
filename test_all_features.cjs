// D:\3rd project\test_all_features.cjs
const { BrowserSession, getWsUrl, sleep } = require('./audit_runner.cjs');
const http = require('http');

function apiCall(token, path, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request(`http://localhost:5000${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
      },
    }, (res) => {
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(d) }); }
        catch { resolve({ status: res.statusCode, data: d }); }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function run() {
  const wsUrl = await getWsUrl();
  const session = new BrowserSession(wsUrl);
  await session.connect();

  console.log('--- 1. Login / Auth Token retrieval ---');
  await session.navigate('http://localhost:5173/dashboard');
  let token = await session.evaluate(`localStorage.getItem('token')`);
  console.log('Active user token exists:', !!token);

  console.log('--- 2. Seed Quests, Quick Quests, Bosses ---');
  await apiCall(token, '/api/quests', 'POST', {
    title: 'UI Daily Mission',
    type: 'daily',
    category: 'Work',
    difficulty: 'medium',
    description: 'Complete project documentation',
  });

  await apiCall(token, '/api/quick-quests', 'POST', {
    title: 'UI Quick Stretch',
    category: 'Fitness',
    difficulty: 'easy',
  });

  await apiCall(token, '/api/bosses', 'POST', {
    title: 'UI Boss Dragon',
    description: 'Sloth Monster of procrastination',
    category: 'WORK',
    maxHp: 100,
    actions: [
      { title: 'Dragon Strike', damage: 30, xpReward: 50 },
      { title: 'Mega Blast', damage: 70, xpReward: 100 },
    ],
  });

  await session.evaluate(`window.location.reload()`);
  await sleep(2500);

  console.log('--- 3. Verifying Dashboard UI rendering ---');
  const uiItems = await session.evaluate(`
    (function() {
      return {
        dailyQuests: Array.from(document.querySelectorAll('#todays-adventure .shadow-glow')).map(el => el.innerText.split('\\n')[0]),
        quickQuests: Array.from(document.querySelectorAll('#quick-quests .shadow-glow')).map(el => el.innerText.split('\\n')[0]),
        bosses: Array.from(document.querySelectorAll('.boss-card')).map(el => el.querySelector('h3')?.innerText || 'unknown')
      };
    })()
  `);
  console.log('Rendered UI items:', uiItems);

  console.log('--- 4. Completing Daily Quest from UI ---');
  await session.evaluate(`
    (function() {
      const card = document.querySelector('#todays-adventure .shadow-glow');
      const btn = Array.from(card.querySelectorAll('button')).find(b => b.innerText === 'Complete');
      if (btn) btn.click();
    })()
  `);
  await sleep(2000);

  const questStatusAfter = await session.evaluate(`
    (function() {
      const card = document.querySelector('#todays-adventure .shadow-glow');
      return { text: card?.innerText.replace(/\\n/g, ' '), isCompleted: card?.innerText.includes('Completed') };
    })()
  `);
  console.log('Daily quest UI state after complete:', questStatusAfter);

  console.log('--- 5. Completing Quick Quest from UI ---');
  await session.evaluate(`
    (function() {
      const card = document.querySelector('#quick-quests .shadow-glow');
      const btn = Array.from(card.querySelectorAll('button')).find(b => b.innerText === 'Complete');
      if (btn) btn.click();
    })()
  `);
  await sleep(2000);

  const quickStatusAfter = await session.evaluate(`
    (function() {
      const card = document.querySelector('#quick-quests .shadow-glow');
      return { text: card?.innerText.replace(/\\n/g, ' '), isCompleted: card?.innerText.includes('Completed') };
    })()
  `);
  console.log('Quick quest UI state after complete:', quickStatusAfter);

  console.log('--- 6. Boss Battle Strike from UI ---');
  const bossHpBefore = await session.evaluate(`document.querySelector('.boss-card .hp-bar span')?.innerText`);
  console.log('Boss HP before:', bossHpBefore);

  await session.evaluate(`
    (function() {
      const btn = Array.from(document.querySelectorAll('.boss-action-btn')).find(b => b.innerText.includes('Dragon Strike') || b.innerText.includes('Strike'));
      if (btn) btn.click();
    })()
  `);
  await sleep(2000);

  const bossHpAfter = await session.evaluate(`document.querySelector('.boss-card .hp-bar span')?.innerText`);
  console.log('Boss HP after strike 1:', bossHpAfter);

  await session.evaluate(`
    (function() {
      const btn = Array.from(document.querySelectorAll('.boss-action-btn')).find(b => b.innerText.includes('Mega Blast'));
      if (btn) btn.click();
    })()
  `);
  await sleep(2000);

  const bossDefeatedOverlay = await session.evaluate(`
    (function() {
      const card = document.querySelector('.boss-card');
      return {
        hp: card?.querySelector('.hp-bar span')?.innerText,
        overlay: card?.querySelector('.defeat-overlay')?.innerText,
        isDefeatedClass: card?.classList.contains('defeated')
      };
    })()
  `);
  console.log('Boss state after defeat action:', bossDefeatedOverlay);

  console.log('--- 7. Inspecting Progression ---');
  const prog = await session.evaluate(`
    (function() {
      return {
        coinsText: Array.from(document.querySelectorAll('div, p, span')).find(el => el.innerText.includes('COINS BALANCE'))?.innerText.replace(/\\n/g, ' '),
        levelText: Array.from(document.querySelectorAll('h2')).find(h => h.innerText.includes('Progression'))?.innerText
      };
    })()
  `);
  console.log('Progression values:', prog);

  session.close();
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});

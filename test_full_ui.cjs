// D:\3rd project\test_full_ui.cjs
const { BrowserSession, getWsUrl, sleep } = require('./audit_runner.cjs');

async function run() {
  const wsUrl = await getWsUrl();
  const session = new BrowserSession(wsUrl);
  await session.connect();

  console.log('=== TEST 1: Inspect fresh registered dashboard ===');
  const dashInfo = await session.evaluate(`
    (function() {
      const text = document.body.innerText;
      return {
        url: window.location.href,
        hasHeader: text.includes('Tung-Tung') && text.includes('Real life'),
        streakText: document.querySelector('.streak-badge, [class*="streak"]')?.innerText || 'none',
        hasLiveEvent: text.includes("TODAY'S EVENT") && text.includes('LIVE'),
        hasPlayerProfile: text.includes('COINS BALANCE') && text.includes('Total XP'),
        tabs: Array.from(document.querySelectorAll('button')).map(b => b.innerText.trim()).filter(t => t.includes('Adventure') || t.includes('Shop') || t.includes('Achievements')),
        hasTodaysAdventure: !!document.getElementById('todays-adventure'),
        adventureQuestsCount: document.querySelectorAll('#todays-adventure .shadow-glow').length,
        hasBossSection: text.includes('ACTIVE BOSS'),
        bossesCount: document.querySelectorAll('.boss-card').length,
        hasQuickQuests: !!document.getElementById('quick-quests'),
        quickQuestsCount: document.querySelectorAll('#quick-quests .shadow-glow').length,
        hasLifeWorlds: text.includes('YOUR LIFE WORLDS'),
        hasAnalytics: text.includes('PLAYER STATS') || text.includes('recent adventure performance'),
        hasSocial: text.includes('Alliance Hall') || text.includes('Friends (')
      };
    })()
  `);
  console.log('Fresh Dashboard Info:', JSON.stringify(dashInfo, null, 2));

  console.log('=== TEST 2: Tab Switching (Shop, Achievements, Adventure) ===');
  // Click Shop tab
  await session.evaluate(`
    (function() {
      const b = Array.from(document.querySelectorAll('button')).find(x => x.innerText.includes('Reward Shop') || x.innerText.includes('Shop'));
      if (b) b.click();
    })()
  `);
  await sleep(600);
  const shopVisible = await session.evaluate(`document.body.innerText.includes('REWARD SHOP') || document.body.innerText.includes('Shop') || document.body.innerText.includes('Buy')`);
  const shopText = await session.evaluate(`document.body.innerText.slice(0, 500).replace(/\\n/g, ' ')`);
  console.log('Shop tab opened:', shopVisible, 'Snippet:', shopText.slice(0, 150));

  // Click Achievements tab
  await session.evaluate(`
    (function() {
      const b = Array.from(document.querySelectorAll('button')).find(x => x.innerText.includes('Achievements'));
      if (b) b.click();
    })()
  `);
  await sleep(600);
  const achVisible = await session.evaluate(`document.body.innerText.includes('Achievements') || document.body.innerText.includes('Unlocked')`);
  console.log('Achievements tab opened:', achVisible);

  // Click back to Adventure tab
  await session.evaluate(`
    (function() {
      const b = Array.from(document.querySelectorAll('button')).find(x => x.innerText.includes('Adventure & Bosses') || x.innerText.includes('Adventure'));
      if (b) b.click();
    })()
  `);
  await sleep(600);
  const advVisible = await session.evaluate(`!!document.getElementById('todays-adventure')`);
  console.log('Adventure tab restored:', advVisible);

  console.log('=== TEST 3: Rest Mode Toggle ===');
  const restModeBefore = await session.evaluate(`document.body.innerText.includes('REST MODE') || document.body.innerText.includes('Rest Mode')`);
  console.log('Rest mode section visible:', restModeBefore);
  // Toggle Rest mode
  const toggleResult = await session.evaluate(`
    (function() {
      const toggleBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Turn ON') || b.innerText.includes('Turn OFF'));
      if (toggleBtn) {
        toggleBtn.click();
        return { clicked: true, text: toggleBtn.innerText };
      }
      return { clicked: false };
    })()
  `);
  console.log('Rest mode toggle clicked:', toggleResult);
  await sleep(1500);
  const restModeAfter = await session.evaluate(`
    Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Turn ON') || b.innerText.includes('Turn OFF'))?.innerText
  `);
  console.log('Rest mode toggle button text after click:', restModeAfter);

  console.log('=== TEST 4: Social Alliance Hall Inspection ===');
  const socialDetails = await session.evaluate(`
    (function() {
      const text = document.body.innerText;
      return {
        allianceHeading: text.includes('Alliance Hall'),
        friendsSection: text.includes('Friends ('),
        partiesSection: text.includes('Party') || text.includes('New party'),
        challengesSection: text.includes('CHALLENGES') || text.includes('Challenge')
      };
    })()
  `);
  console.log('Social section details:', socialDetails);

  console.log('Console errors so far:', session.consoleLogs.filter(c => c.type === 'error'));
  console.log('Network errors so far:', session.networkErrors);

  session.close();
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});

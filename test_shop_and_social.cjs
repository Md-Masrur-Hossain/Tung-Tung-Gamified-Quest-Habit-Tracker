// D:\3rd project\test_shop_and_social.cjs
const { BrowserSession, getWsUrl, sleep } = require('./audit_runner.cjs');

async function run() {
  const wsUrl = await getWsUrl();
  const session = new BrowserSession(wsUrl);
  await session.connect();

  console.log('--- TEST: SHOP & COSMETICS ---');
  // Navigate to Dashboard
  await session.navigate('http://localhost:5173/dashboard');

  // Switch to Shop tab
  await session.evaluate(`
    (function() {
      const b = Array.from(document.querySelectorAll('button')).find(x => x.innerText.includes('Reward Shop') || x.innerText.includes('Shop'));
      if (b) b.click();
    })()
  `);
  await sleep(800);

  // Inspect shop items and user coin balance
  const shopData = await session.evaluate(`
    (function() {
      const cards = Array.from(document.querySelectorAll('.grid > div.p-4'));
      return {
        cardCount: cards.length,
        items: cards.slice(0, 3).map(c => ({
          title: c.querySelector('h3')?.innerText,
          priceText: c.querySelector('button')?.innerText
        }))
      };
    })()
  `);
  console.log('Shop rendered data:', shopData);

  // Try to buy an affordable item
  const buyTest = await session.evaluate(`
    (function() {
      const buyBtns = Array.from(document.querySelectorAll('button')).filter(b => b.innerText.includes('Coins') && !b.disabled);
      if (buyBtns.length > 0) {
        buyBtns[0].click();
        return { clicked: true, text: buyBtns[0].innerText };
      }
      return { clicked: false, reason: 'No affordable item' };
    })()
  `);
  console.log('Buy button test:', buyTest);
  await sleep(2000);

  // Check if item now shows Equip or Equipped
  const shopAfterBuy = await session.evaluate(`
    (function() {
      return {
        hasEquipBtn: Array.from(document.querySelectorAll('button')).some(b => b.innerText.includes('Equip Item')),
        hasEquippedBtn: Array.from(document.querySelectorAll('button')).some(b => b.innerText.includes('Equipped'))
      };
    })()
  `);
  console.log('Shop state after purchase:', shopAfterBuy);

  // Switch back to Adventure tab to test Social & Life Worlds
  await session.evaluate(`
    (function() {
      const b = Array.from(document.querySelectorAll('button')).find(x => x.innerText.includes('Adventure & Bosses') || x.innerText.includes('Adventure'));
      if (b) b.click();
    })()
  `);
  await sleep(800);

  console.log('--- TEST: SOCIAL FRIENDS & PARTIES ---');
  // Test search user in Friends panel
  await session.evaluate(`
    (function() {
      const input = document.querySelector('input[placeholder*="Search heroes"]');
      if (input) {
        const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        nativeSetter.call(input, 'user');
        input.dispatchEvent(new Event('input', { bubbles: true }));
        const searchBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText === 'Search');
        if (searchBtn) searchBtn.click();
      }
    })()
  `);
  await sleep(1500);

  const searchRes = await session.evaluate(`
    (function() {
      const resElements = Array.from(document.querySelectorAll('.flex.justify-between.items-center'));
      return {
        resCount: resElements.length,
        firstFew: resElements.slice(0, 3).map(el => el.innerText.replace(/\\n/g, ' '))
      };
    })()
  `);
  console.log('Friends search results in UI:', searchRes);

  console.log('--- TEST: CREATE PARTY FROM UI ---');
  const partyCreate = await session.evaluate(`
    (function() {
      const input = document.querySelector('input[placeholder*="New party name"]');
      if (!input) return { foundInput: false };
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      nativeSetter.call(input, 'Dragon Slayers');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      const createBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText === 'Create');
      if (createBtn) {
        createBtn.click();
        return { clicked: true };
      }
      return { foundBtn: false };
    })()
  `);
  console.log('Party creation in UI:', partyCreate);
  await sleep(2000);

  const partiesAfter = await session.evaluate(`
    (function() {
      const text = document.body.innerText;
      return {
        hasPartyName: text.includes('Dragon Slayers'),
        hasLeaveBtn: Array.from(document.querySelectorAll('button')).some(b => b.innerText === 'Leave')
      };
    })()
  `);
  console.log('Parties list after creation in UI:', partiesAfter);

  session.close();
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});

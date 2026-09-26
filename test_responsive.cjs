// D:\3rd project\test_responsive.cjs
const { BrowserSession, getWsUrl, sleep } = require('./audit_runner.cjs');

async function testViewport(session, width, height, name) {
  console.log(`\n=== Testing Viewport: ${name} (${width}x${height}) ===`);
  await session.setViewport(width, height);
  await sleep(1000);

  const check = await session.evaluate(`
    (function() {
      const scrollWidth = document.documentElement.scrollWidth;
      const clientWidth = document.documentElement.clientWidth;
      const hasHorizontalOverflow = scrollWidth > clientWidth;

      // Find any overflowing elements
      const allElements = Array.from(document.querySelectorAll('*'));
      const overflowing = [];
      for (const el of allElements) {
        const rect = el.getBoundingClientRect();
        if (rect.right > clientWidth + 2) {
          overflowing.push({
            tag: el.tagName,
            id: el.id,
            className: el.className?.toString().substring(0, 50),
            right: Math.round(rect.right),
            clientWidth: clientWidth
          });
        }
      }

      // Check key elements visibility
      const header = document.querySelector('header');
      const logoutBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText === 'Logout');
      const tabs = Array.from(document.querySelectorAll('button')).filter(b => 
        b.innerText.includes('Adventure') || b.innerText.includes('Reward Shop') || b.innerText.includes('Achievements')
      ).map(b => ({ text: b.innerText.trim(), visible: b.getBoundingClientRect().width > 0 }));

      return {
        clientWidth,
        scrollWidth,
        hasHorizontalOverflow,
        overflowingCount: overflowing.length,
        topOverflowSample: overflowing.slice(0, 3),
        headerVisible: !!header && header.getBoundingClientRect().height > 0,
        logoutBtnVisible: !!logoutBtn && logoutBtn.getBoundingClientRect().width > 0,
        tabs
      };
    })()
  `);

  console.log(`Results for ${name}:`, JSON.stringify(check, null, 2));
  return check;
}

async function run() {
  const wsUrl = await getWsUrl();
  const session = new BrowserSession(wsUrl);
  await session.connect();

  await session.navigate('http://localhost:5173/dashboard');
  await sleep(1500);

  // 1. Mobile
  await testViewport(session, 375, 812, 'Mobile iPhone');

  // 2. Tablet
  await testViewport(session, 768, 1024, 'Tablet iPad');

  // 3. Desktop
  await testViewport(session, 1280, 720, 'Desktop HD');

  session.close();
}

run().catch(console.error);

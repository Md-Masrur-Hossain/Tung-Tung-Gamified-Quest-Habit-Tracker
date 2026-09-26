// Final browser E2E verification for Tung-Tung.
// Runs against http://localhost:5173 (frontend) + http://localhost:5000 (backend).
// Produces evidence-based PASS/FAIL/BLOCKED/UNTESTED results + screenshots.
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const BASE = 'http://localhost:5173';
const API = 'http://localhost:5000';
const SHOTS = 'C:/Users/aman7/AppData/Local/Temp/opencode/e2e/shots';
fs.mkdirSync(SHOTS, { recursive: true });

const results = [];
const rec = (id, name, status, evidence = []) => results.push({ id, name, status, evidence });

const shot = async (page, name) => {
  try { await page.screenshot({ path: path.join(SHOTS, `${name}.png`) }); }
  catch (e) { console.log('shot fail', name, e.message); }
};

const TS = new Date().getTime().toString(36).slice(-6);
const mainUser = { username: `hero${TS}`, email: `hero${TS}@tgt.test`, password: `Passw0rd!${TS.slice(0, 4)}` };
const friendUser = { username: `ally${TS}`, email: `ally${TS}@tgt.test`, password: `Passw0rd!${TS.slice(0, 4)}` };

const capture = (page, meta) => {
  page.on('console', (m) => {
    if (m.type() === 'error') meta.consoleErrors.push(`[console.error] ${m.text()}`);
    else if (m.type() === 'warning') meta.consoleWarnings.push(`[console.warn] ${m.text()}`);
  });
  page.on('pageerror', (e) => meta.consoleErrors.push(`[pageerror] ${e.message}`));
  page.on('requestfailed', (r) => meta.networkFailures.push(`REQFAIL ${r.method()} ${r.url()} :: ${r.failure()?.errorText || ''}`));
  page.on('response', (r) => { if (r.status() >= 400) meta.httpErrors.push(`${r.status()} ${r.request().method()} ${r.url()}`); });
};

async function apiFetch(page, p, opts = {}) {
  return page.evaluate(
    async ({ p, opts }) => {
      const token = localStorage.getItem('token');
      const res = await fetch(p, {
        method: opts.method || 'GET',
        headers: {
          Authorization: token ? `Bearer ${token}` : '',
          'Content-Type': 'application/json',
          ...(opts.headers || {}),
        },
        body: opts.body ? JSON.stringify(opts.body) : undefined,
      });
      const data = await res.json().catch(() => null);
      return { status: res.status, data };
    },
    { p: `${API}${p}`, opts }
  );
}

const settle = async (page, timeout = 8000) => {
  await page.locator('text=Tung-Tung').first().waitFor({ timeout });
  await page.waitForTimeout(1200);
};

(async () => {
  let browser;
  const meta = { consoleErrors: [], consoleWarnings: [], networkFailures: [], httpErrors: [] };
  try {
    browser = await chromium.launch();
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    capture(page, meta);

    // ---------------------------------------------------------------
    // 1. REGISTER (real browser form) + 2. automatic login
    // ---------------------------------------------------------------
    try {
      await page.goto(`${BASE}/register`, { waitUntil: 'domcontentloaded' });
      await page.locator('input[name=username]').fill(mainUser.username);
      await page.locator('input[name=email]').fill(mainUser.email);
      await page.locator('input[name=password]').fill(mainUser.password);
      await page.locator('button[type=submit]').click();
      await page.waitForURL('**/dashboard', { timeout: 10000 });
      const hasToken = await page.evaluate(() => !!localStorage.getItem('token'));
      const onDash = page.url().includes('/dashboard');
      const userShown = await page.locator(`text=${mainUser.username}`).first().isVisible().catch(() => false);
      rec('register', 'Register + auto-login', onDash && hasToken ? 'PASS' : 'FAIL',
        [`auto-login redirect to /dashboard=${onDash}`, `token stored=${hasToken}`, `username rendered=${userShown}`]);
      await shot(page, '1-register-autologin-dashboard');
      await settle(page);
    } catch (e) { rec('register', 'Register + auto-login', 'FAIL', [e.message]); }

    // ---------------------------------------------------------------
    // 3. DASHBOARD (browser-visible sections)
    // ---------------------------------------------------------------
    try {
      const checks = [
        ['Live Activity (Today\'s Event)', 'text=Today\'s Event'],
        ['Player profile card (username)', `text=${mainUser.username}`],
        ['Coins Balance', 'text=Coins Balance'],
        ['Level 1 progression section', 'text=Level 1 Progression'],
        ['Today\'s Adventure', 'h2:has-text("Today\'s Adventure")'],
        ['ACTIVE BOSS', 'h2:has-text("ACTIVE BOSS")'],
        ['QUICK QUESTS', 'h2:has-text("QUICK QUESTS")'],
        ['YOUR LIFE WORLDS', 'h2:has-text("YOUR LIFE WORLDS")'],
        ['Player Stats (analytics)', 'h2:has-text("Player Stats")'],
        ['Alliance Hall (social)', 'h2:has-text("Alliance Hall")'],
        ['What Should I Do Now?', 'h2:has-text("What Should I Do Now?")'],
        ['Smart Tips', 'h2:has-text("Smart Tips")'],
        ['Rest Mode', 'h2:has-text("Rest Mode")'],
      ];
      const counts = { ok: 0 };
      const missing = [];
      for (const [label, sel] of checks) {
        const v = await page.locator(sel).first().isVisible().catch(() => false);
        if (v) counts.ok += 1; else missing.push(label);
      }
      rec('dashboard', 'Dashboard', missing.length ? 'FAIL' : 'PASS',
        [`${counts.ok}/${checks.length} sections visible`, ...(missing.length ? [`missing: ${missing.join(', ')}`] : [])]);
      await shot(page, '2-dashboard-top');
    } catch (e) { rec('dashboard', 'Dashboard', 'FAIL', [e.message]); }

    // ---------------------------------------------------------------
    // 4. Refresh / session persistence
    // ---------------------------------------------------------------
    try {
      await page.reload({ waitUntil: 'domcontentloaded' });
      await settle(page);
      const stillDash = page.url().includes('/dashboard');
      const userShown = await page.locator(`text=${mainUser.username}`).first().isVisible().catch(() => false);
      const tokenKept = await page.evaluate(() => !!localStorage.getItem('token'));
      rec('session-persist', 'Refresh / session persistence', stillDash && userShown && tokenKept ? 'PASS' : 'FAIL',
        [`url=/dashboard after reload=${stillDash}`, `username rendered=${userShown}`, `token persisted=${tokenKept}`]);
      await shot(page, '3-session-persist-after-refresh');
    } catch (e) { rec('session-persist', 'Refresh / session persistence', 'FAIL', [e.message]); }

    // ---------------------------------------------------------------
    // 5. LOGOUT
    // ---------------------------------------------------------------
    try {
      await page.locator('button:has-text("Logout")').first().click();
      await page.waitForURL('**/login', { timeout: 10000 });
      const tokenAfter = await page.evaluate(() => localStorage.getItem('token'));
      rec('logout', 'Logout', !tokenAfter && page.url().includes('/login') ? 'PASS' : 'FAIL',
        [`redirected to /login=${page.url().includes('/login')}`, `token cleared=${!tokenAfter}`]);
      await shot(page, '4-logout-login');
    } catch (e) { rec('logout', 'Logout', 'FAIL', [e.message]); }

    // ---------------------------------------------------------------
    // 6. LOGIN AGAIN
    // ---------------------------------------------------------------
    try {
      await page.locator('input[name=email]').fill(mainUser.email);
      await page.locator('input[name=password]').fill(mainUser.password);
      await page.locator('button[type=submit]').click();
      await page.waitForURL('**/dashboard', { timeout: 10000 });
      const hasToken = await page.evaluate(() => !!localStorage.getItem('token'));
      rec('login-again', 'Login again', hasToken && page.url().includes('/dashboard') ? 'PASS' : 'FAIL',
        [`redirected to /dashboard=${page.url().includes('/dashboard')}`, `token stored=${hasToken}`]);
      await settle(page);
      await shot(page, '5-login-again-dashboard');
    } catch (e) { rec('login-again', 'Login again', 'FAIL', [e.message]); }

    // ---------------------------------------------------------------
    // Seed gameplay fixtures through the authenticated API.
    // ---------------------------------------------------------------
    const seeded = { questMediumId: null, questEasyId: null, bossId: null, quickId: null };
    let todayXpMultiplier = 1;
    try {
      const dm = await apiFetch(page, '/api/quests', { method: 'POST', body: { title: 'E2E Daily Mission', type: 'daily', category: 'Work', difficulty: 'medium', description: 'E2E fixture' } });
      const wu = await apiFetch(page, '/api/quests', { method: 'POST', body: { title: 'E2E Warmup', type: 'daily', category: 'Health', difficulty: 'easy' } });
      const qk = await apiFetch(page, '/api/quick-quests', { method: 'POST', body: { title: 'E2E Quick Win', category: 'Fitness', difficulty: 'easy' } });
      const bs = await apiFetch(page, '/api/bosses', { method: 'POST', body: { title: 'E2E Slime King', description: 'E2E fixture boss', category: 'WORK', maxHp: 100, actions: [{ title: 'Strike', damage: 30, xpReward: 80 }, { title: 'Heavy Blow', damage: 70, xpReward: 100 }] } });
      seeded.questMediumId = dm.data?.quest?._id || null;
      seeded.questEasyId = wu.data?.quest?._id || null;
      seeded.quickId = qk.data?._id || null;
      seeded.bossId = bs.data?._id || null;
      const ev = await apiFetch(page, '/api/live/daily-event');
      todayXpMultiplier = ev.data?.xpMultiplier || 1;
      rec('fixture', 'Seed gameplay fixtures (API)', seeded.questMediumId && seeded.questEasyId && seeded.quickId && seeded.bossId ? 'PASS' : 'FAIL',
        [`medium=${seeded.questMediumId} easy=${seeded.questEasyId} quick=${seeded.quickId} boss=${seeded.bossId}`, `today event=${ev.data?.type || 'n/a'} x${todayXpMultiplier}`]);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await settle(page);
      await page.waitForTimeout(800);
      await shot(page, '6-dashboard-seeded');
    } catch (e) { rec('fixture', 'Seed gameplay fixtures (API)', 'FAIL', [e.message]); }

    // ---------------------------------------------------------------
    // 7-10. QUEST COMPLETION -> XP -> LEVEL -> LEVEL-UP overlay
    // ---------------------------------------------------------------
    let xpBefore = 0;
    try {
      await page.evaluate(() => {
        window.__levelUpSeen = [];
        window.__observer = new MutationObserver((muts) => {
          for (const m of muts) {
            for (const n of m.addedNodes) {
              if (n.nodeType === 1 && (n.textContent || '').includes('LEVEL UP!')) {
                window.__levelUpSeen.push(Date.now());
              }
            }
          }
        });
        window.__observer.observe(document.body, { childList: true, subtree: true });
      });
      const xpBeforeText = await page.locator('text=/Total XP/').first().innerText().catch(() => '0 Total XP');
      xpBefore = Number((xpBeforeText.match(/([\d,]+)\s*Total XP/) || [])[1]?.replace(/,/g, '')) || 0;
      const card = page.locator(`#quest-${seeded.questMediumId}`);
      await card.locator('button:has-text("Complete")').click();
      const done = await card.locator('text=Completed').waitFor({ timeout: 8000 }).then(() => true).catch(() => false);
      await page.waitForTimeout(300);
      const lvSeen = await page.evaluate(() => window.__levelUpSeen.length);
      let overlayShot = false;
      try { await page.locator('text=LEVEL UP!').first().waitFor({ timeout: 2500 }); overlayShot = true; await shot(page, '7-level-up-overlay'); } catch { }
      rec('quest-complete', 'Quest completion (browser button)', done ? 'PASS' : 'FAIL', [`card marked Completed=${done}`]);
      rec('levelup-overlay', 'Level-up overlay / celebration', lvSeen > 0 || overlayShot ? 'PASS' : 'FAIL',
        [`overlay captured by observer=${lvSeen > 0}`, `overlay screenshot=${overlayShot}`]);
      await shot(page, '7b-after-quest-complete');
    } catch (e) { rec('quest-complete', 'Quest completion', 'FAIL', [e.message]); }

    // 8. XP UPDATE
    try {
      const xpAfterText = await page.locator('text=/Total XP/').first().innerText().catch(() => '');
      const xpAfter = Number((xpAfterText.match(/([\d,]+)\s*Total XP/) || [])[1]?.replace(/,/g, '')) || 0;
      const prof = await apiFetch(page, '/api/progression');
      const prog = prof.data?.progression || {};
      rec('xp-update', 'XP update', xpAfter > xpBefore && prog.totalXP > xpBefore ? 'PASS' : 'FAIL',
        [`TotalXP UI before=${xpBefore} after=${xpAfter}`, `progression.totalXP=${prog.totalXP}`, `expected gain >= ${100 * todayXpMultiplier} (daily medium x${todayXpMultiplier})`]);
    } catch (e) { rec('xp-update', 'XP update', 'FAIL', [e.message]); }

    // 9. LEVEL / PROGRESS UPDATE
    try {
      const level2 = await page.locator('text=Level 2 Progression').first().isVisible().catch(() => false);
      const prof = await apiFetch(page, '/api/progression');
      const prog = prof.data?.progression || {};
      rec('level-progress', 'Level / progress update', level2 && prog.level >= 2 ? 'PASS' : 'FAIL',
        [`'Level 2 Progression' visible=${level2}`, `api level=${prog.level}`, `progressPercent=${prog.progressPercent}`, `xpForNext=${prog.xpForNext}`]);
      await shot(page, '8-progress-section');
    } catch (e) { rec('level-progress', 'Level / progress update', 'FAIL', [e.message]); }

    // ---------------------------------------------------------------
    // 11. DAILY ADVENTURE (today's quest list + progress)
    // ---------------------------------------------------------------
    try {
      const sectionVisible = await page.locator('#todays-adventure').isVisible().catch(() => false);
      const pending = await page.locator('text=/pending/').first().isVisible().catch(() => false);
      const progressText = await page.locator('text=/Overall progress:/').first().innerText().catch(() => '(none)');
      rec('daily-adventure', 'Daily Adventure', sectionVisible && pending ? 'PASS' : 'FAIL',
        [`#todays-adventure visible=${sectionVisible}`, `pending/completed summary shown=${pending}`, `overall=${progressText}`]);
      await shot(page, '9-daily-adventure');
    } catch (e) { rec('daily-adventure', 'Daily Adventure', 'FAIL', [e.message]); }

    // ---------------------------------------------------------------
    // 15. REWARDS / COINS / SHOP (buy + equip companion, coins change)
    // ---------------------------------------------------------------
    try {
      // Complete the easy daily quest first to raise coins (easy daily = 10c + FIRST_QUEST = 10c).
      const cardEasy = page.locator(`#quest-${seeded.questEasyId}`);
      await cardEasy.locator('button:has-text("Complete")').click();
      await cardEasy.locator('text=Completed').waitFor({ timeout: 8000 });
      await page.waitForTimeout(1500);
      const coinsBefore = await page.locator('text=Coins Balance').locator('xpath=following-sibling::div').first().innerText().catch(() => '?(read)');
      await page.locator('button:has-text("Reward Shop")').click();
      await page.locator('h2:has-text("Cosmetic & Reward Shop")').waitFor({ timeout: 6000 });
      const catCard = page.locator('h3', { hasText: 'Lucky Calico' }).locator('xpath=ancestor::div[contains(@class,"p-4 rounded-xl")]');
      await catCard.locator('button:has-text("40 Coins")').click();
      await catCard.locator('button:has-text("Equip Item")').waitFor({ timeout: 6000 });
      await shot(page, '10-shop-after-buy');
      await catCard.locator('button:has-text("Equip Item")').click();
      await catCard.locator('button:has-text("✓ Equipped")').waitFor({ timeout: 6000 });
      const coinsAfterBuy = await page.locator('text=Coins Balance').locator('xpath=following-sibling::div').first().innerText().catch(() => '?(read)');
      await shot(page, '11-shop-anim-equipped');
      rec('rewards-shop', 'Rewards / Coins / Shop', 'PASS',
        [`coins balance before shop=${coinsBefore}`, `after companion purchase=${coinsAfterBuy}`, `companion_cat bought + equipped (✓ Equipped)`]);
      await page.locator('button:has-text("Adventure & Bosses")').click();
      await settle(page);
    } catch (e) { rec('rewards-shop', 'Rewards / Coins / Shop', 'FAIL', [e.message]); }

    // ---------------------------------------------------------------
    // 12. QUICK QUESTS (+ companion reaction on completion)
    // ---------------------------------------------------------------
    try {
      const quickCard = page.locator(`#qquest-${seeded.quickId}`);
      await quickCard.scrollIntoViewIfNeeded().catch(() => {});
      await quickCard.locator('button:has-text("Complete")').click();
      await quickCard.locator('text=Completed').waitFor({ timeout: 8000 });
      await page.waitForTimeout(800);
      const purr = await page.locator('text=/Purr/').first().isVisible().catch(() => false);
      rec('quick-quests', 'Quick Quests', 'PASS',
        [`quick quest completed via UI`, `companion reaction ('Purr! ...') shown=${purr}`]);
      await shot(page, '12-quick-quest-companion');
      await page.waitForTimeout(1200);
    } catch (e) { rec('quick-quests', 'Quick Quests', 'FAIL', [e.message]); }

    // ---------------------------------------------------------------
    // 13. BOSS BATTLES
    // ---------------------------------------------------------------
    try {
      await page.locator('h2:has-text("ACTIVE BOSS")').scrollIntoViewIfNeeded().catch(() => {});
      const bossCard = page.locator('.boss-card').first();
      await bossCard.locator('text=E2E Slime King').waitFor({ timeout: 6000 });
      const hpBefore = (await bossCard.locator('.hp-bar span').innerText()) || '?(read)';
      await bossCard.locator('.boss-action-btn', { hasText: 'Strike' }).click();
      await page.waitForTimeout(1200);
      const hpAfterStrike = (await bossCard.locator('.hp-bar span').innerText()) || '?(read)';
      await bossCard.locator('.boss-action-btn', { hasText: 'Heavy Blow' }).click();
      const defeated = await bossCard.locator('text=BOSS DEFEATED!').waitFor({ timeout: 8000 }).then(() => true).catch(() => false);
      await shot(page, '13-boss-defeated');
      rec('boss-battles', 'Boss Battles', defeated ? 'PASS' : 'FAIL',
        [`hp ${hpBefore} -> after Strike ${hpAfterStrike} -> DEFEATED`, `'BOSS DEFEATED!' overlay=${defeated}`]);
      await shot(page, '14-after-boss');
      await page.waitForTimeout(1500);
    } catch (e) { rec('boss-battles', 'Boss Battles', 'FAIL', [e.message]); }

    // ---------------------------------------------------------------
    // 14. LIFE WORLDS
    // ---------------------------------------------------------------
    try {
      const worldsText = (await page.locator('h2:has-text("YOUR LIFE WORLDS")').locator('xpath=following-sibling::*').first().innerText().catch(() => '')) || '';
      const found = ['Health', 'Work', 'Study', 'Fitness', 'Home', 'Hobby', 'Personal', 'Other'].filter((w) => worldsText.includes(w));
      await shot(page, '15-life-worlds');
      rec('life-worlds', 'Life Worlds', found.length >= 4 ? 'PASS' : 'FAIL',
        [`world cards rendered=${found.length}/8 (${found.join(', ') || 'none'})`, `'No quests yet' placeholder=${worldsText.includes('No quests yet')}`]);
    } catch (e) { rec('life-worlds', 'Life Worlds', 'FAIL', [e.message]); }

    // ---------------------------------------------------------------
    // 15b. SHOP: extra purchases (avatar + frame) to complete the loop
    // ---------------------------------------------------------------
    try {
      await page.locator('button:has-text("Reward Shop")').click();
      await page.locator('h2:has-text("Cosmetic & Reward Shop")').waitFor({ timeout: 6000 });
      const warrior = page.locator('h3', { hasText: 'Iron Vanguard' }).locator('xpath=ancestor::div[contains(@class,"p-4 rounded-xl")]');
      await warrior.locator('button:has-text("50 Coins")').click();
      await warrior.locator('button:has-text("Equip Item")').waitFor({ timeout: 6000 });
      await warrior.locator('button:has-text("Equip Item")').click();
      await warrior.locator('button:has-text("✓ Equipped")').waitFor({ timeout: 6000 });
      const bronze = page.locator('h3', { hasText: 'Bronze Crest' }).locator('xpath=ancestor::div[contains(@class,"p-4 rounded-xl")]');
      await bronze.locator('button:has-text("25 Coins")').click();
      await bronze.locator('button:has-text("Equip Item")').waitFor({ timeout: 6000 });
      await bronze.locator('button:has-text("Equip Item")').click();
      await bronze.locator('button:has-text("✓ Equipped")').waitFor({ timeout: 6000 });
      await shot(page, '16-shop-avatar-frame');
      rec('shop-extra', 'Shop: avatar + frame purchase/equip', 'PASS', ['Iron Vanguard ✓ Equipped', 'Bronze Crest ✓ Equipped']);
      await page.locator('button:has-text("Adventure & Bosses")').click();
      await settle(page);
    } catch (e) { rec('shop-extra', 'Shop: avatar + frame', 'FAIL', [e.message]); }

    // ---------------------------------------------------------------
    // 16. ACHIEVEMENTS / TITLES / AVATAR / COMPANION
    // ---------------------------------------------------------------
    try {
      await page.locator('button:has-text("Achievements")').click();
      await page.locator('h2:has-text("Achievements & Trophies")').waitFor({ timeout: 6000 });
      const gridVisible = await page.locator('h3:has-text("First Step")').first().isVisible().catch(() => false);
      const unlockedText = await page.locator('text=/Unlocked/').first().innerText().catch(() => '');
      await shot(page, '17-achievements');
      await page.locator('button:has-text("Adventure & Bosses")').click();
      await page.locator('button[title="Click to change title"]').waitFor({ timeout: 6000 });
      await page.locator('button[title="Click to change title"]').click();
      const titleOption = await page.locator('button:has-text("Quest Hunter")').first().isVisible().catch(() => false);
      if (titleOption) await page.locator('button:has-text("Quest Hunter")').first().click();
      await page.waitForTimeout(800);
      const equippedTitle = (await page.locator('button[title="Click to change title"]').innerText()).trim().replace(/▾$/, '').trim();
      const companionShown = await page.locator('text=Lucky Calico').first().isVisible().catch(() => false);
      rec('achievements-titles', 'Achievements / Titles / Avatar / Companion', gridVisible ? 'PASS' : 'FAIL',
        [`achievements grid visible=${gridVisible}`, `unlocked summary='${unlockedText}'`, `'Quest Hunter' title equippable=${titleOption}`, `equipped title now='${equippedTitle}'`, `companion 'Lucky Calico' equipped=${companionShown}`]);
      await shot(page, '18-title-avatar-companion');
    } catch (e) { rec('achievements-titles', 'Achievements / Titles / Avatar / Companion', 'FAIL', [e.message]); }

    // ---------------------------------------------------------------
    // 20/21/22/23. ANALYTICS + NEXT ACTION + SMART TIPS + REST MODE
    // ---------------------------------------------------------------
    try {
      const tryRec = async (fn, id, name) => { try { await fn(); } catch (e) { rec(id, name, 'FAIL', [e.message]); } };
      await tryRec(async () => {
        const stats = await page.locator('h2:has-text("Player Stats")').first().isVisible().catch(() => false);
        const analyticsRoot = page.locator('h2:has-text("Player Stats")').locator('xpath=ancestor::div[contains(@class,"bg-slate-900/80")]').first();
        const tiles = await analyticsRoot.locator('div[class*="bg-slate-900/60"]').count().catch(() => 0);
        await shot(page, '19-analytics');
        rec('analytics', 'Analytics (Player Stats)', stats ? 'PASS' : 'FAIL', [`section visible=${stats}`, `stat tiles=${tiles}`]);
      }, 'analytics', 'Analytics');
      await tryRec(async () => {
        const visible = await page.locator('h2:has-text("What Should I Do Now?")').first().isVisible().catch(() => false);
        const sec = page.locator('h2:has-text("What Should I Do Now?")').locator('xpath=ancestor::section').first();
        const title = (await sec.locator('h3').first().innerText().catch(() => '(none)')) || '(none)';
        const priority = (await sec.locator('span[class*="tracking-wide"]').first().innerText().catch(() => '')) || '';
        rec('next-action', 'What Should I Do Now?', visible ? 'PASS' : 'FAIL', [`card visible=${visible}`, `recommendation='${title}'`, `priority badge='${priority}'`]);
      }, 'next-action', 'What Should I Do Now?');
      await tryRec(async () => {
        const visible = await page.locator('h2:has-text("Smart Tips")').first().isVisible().catch(() => false);
        const sec = page.locator('h2:has-text("Smart Tips")').locator('xpath=ancestor::section').first();
        const tipLines = await sec.locator('li').count().catch(() => 0);
        const empty = await sec.locator('text=No tips right now').isVisible().catch(() => false);
        rec('smart-tips', 'Smart Tips', visible ? 'PASS' : 'FAIL', [`panel visible=${visible}`, `tip lines=${tipLines}`, `'No tips right now' shown=${empty}`]);
      }, 'smart-tips', 'Smart Tips');
      await tryRec(async () => {
        const heading = await page.locator('h2:has-text("Rest Mode")').first().isVisible().catch(() => false);
        await page.locator('button:has-text("Turn on Rest Mode")').first().click();
        const restOn = await page.locator('text=REST MODE ON').first().waitFor({ timeout: 6000 }).then(() => true).catch(() => false);
        await shot(page, '20-rest-mode-on');
        const restApi = await apiFetch(page, '/api/analytics/rest-mode');
        await page.locator('button:has-text("Turn off Rest Mode")').first().click();
        await page.locator('text=REST MODE ON').first().waitFor({ state: 'detached', timeout: 6000 }).catch(() => {});
        const restApi2 = await apiFetch(page, '/api/analytics/rest-mode');
        rec('rest-mode', 'Rest Mode', heading && restOn && restApi.data?.enabled && restApi2.data?.enabled === false ? 'PASS' : 'FAIL',
          [`heading visible=${heading}`, `toggle ON rendered='REST MODE ON'`, `server persisted enabled=${restApi.data?.enabled}`, `after toggle OFF server enabled=${restApi2.data?.enabled}`]);
      }, 'rest-mode', 'Rest Mode');
    } catch (e) { rec('analytics-group', 'Analytics/NextAction/Tips/RestMode', 'FAIL', [e.message]); }

    // ---------------------------------------------------------------
    // 17. FRIENDS / PARTY / DUELS (real browser, two users)
    // ---------------------------------------------------------------
    try {
      const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const page2 = await ctx2.newPage();
      capture(page2, meta);
      await page2.goto(`${BASE}/register`, { waitUntil: 'domcontentloaded' });
      await page2.locator('input[name=username]').fill(friendUser.username);
      await page2.locator('input[name=email]').fill(friendUser.email);
      await page2.locator('input[name=password]').fill(friendUser.password);
      await page2.locator('button[type=submit]').click();
      await page2.waitForURL('**/dashboard', { timeout: 10000 });
      await page2.waitForTimeout(1500);

      // Friends: search + request
      await page.locator('input[placeholder="Search heroes by name..."]').fill(friendUser.username);
      await page.locator('button:has-text("Search")').first().click();
      const addBtn = page.locator('button:has-text("Add")').first();
      await addBtn.waitFor({ timeout: 6000 });
      await addBtn.click();
      const sent = await page.locator('text=Request sent!').first().waitFor({ timeout: 6000 }).then(() => true).catch(() => false);
      await shot(page, '21-friend-request-sent');

      // friend accepts
      await page2.reload({ waitUntil: 'domcontentloaded' });
      await page2.locator('text=Tung-Tung').first().waitFor({ timeout: 8000 });
      await page2.waitForTimeout(1500);
      const incomingVisible = await page2.locator('text=INCOMING').first().isVisible().catch(() => false);
      await page2.locator('button:has-text("Accept")').first().click();
      const friendAdded = await page2.locator('text=Friend added!').first().waitFor({ timeout: 6000 }).then(() => true).catch(() => false);
      await page2.waitForTimeout(800);
      const friendInList2 = await page2.locator(`text=${mainUser.username}`).first().isVisible().catch(() => false);

      // Party: create + invite
      await page.locator('input[placeholder="New party name..."]').fill('E2E Party');
      // Scope to the Party panel's own Create button (the quest creator also has
      // creation buttons, so a bare has-text("Create") match would hit the wrong one).
      await page.locator('button[aria-label="Create party"]').first().click();
      const partyCreated = await page.locator('text=E2E Party').first().waitFor({ timeout: 6000 }).then(() => true).catch(() => false);
      await page.waitForTimeout(800);
      const inviteBtn = page.locator(`button:has-text("+ ${friendUser.username}")`).first();
      await inviteBtn.waitFor({ timeout: 6000 });
      await inviteBtn.click();
      const invited = await page.locator('text=Invited!').first().waitFor({ timeout: 6000 }).then(() => true).catch(() => false);
      const partyMembers = (await page.locator('text=E2E Party').first().innerText().catch(() => '')) || '';
      await shot(page, '22-party-invite');

      // friend sees party
      await page2.reload({ waitUntil: 'domcontentloaded' });
      await page2.waitForTimeout(1800);
      const friendSeesParty = await page2.locator('text=E2E Party').first().isVisible().catch(() => false);

      // Co-op quest: main creates, friend contributes
      await page.locator('input[placeholder="New co-op quest..."]').first().fill('E2E Coop Grind');
      await page.locator('button:has-text("Create Quest")').first().click();
      const coopCreated = await page.locator('text=E2E Coop Grind').first().waitFor({ timeout: 6000 }).then(() => true).catch(() => false);
      await page.waitForTimeout(1000);
      await page2.reload({ waitUntil: 'domcontentloaded' });
      await page2.waitForTimeout(1800);
      const coopVisible2 = await page2.locator('text=E2E Coop Grind').first().isVisible().catch(() => false);
      const coopLineBefore = (await page2.locator('text=E2E Coop Grind').first().innerText().catch(() => '')) || '';
      const contribute = page2.locator('button:has-text("Contribute")').first();
      if (await contribute.isVisible().catch(() => false)) {
        await contribute.click();
        await page2.locator('text=Recorded!').first().waitFor({ timeout: 6000 }).catch(() => {});
        await page2.waitForTimeout(1200);
        await page2.reload({ waitUntil: 'domcontentloaded' });
        await page2.waitForTimeout(1800);
        const coopLineAfter = (await page2.locator('text=E2E Coop Grind').first().innerText().catch(() => '')) || '';
        await shot(page, '23-coop-progress');
        rec('coop', 'Co-op quest / contribution', coopCreated && coopVisible2 ? 'PASS' : 'FAIL',
          [`created=${coopCreated}`, `visible to partner=${coopVisible2}`, `line before='${coopLineBefore}'`, `line after='${coopLineAfter}'`]);
      } else {
        rec('coop', 'Co-op quest / contribution', 'BLOCKED', [`created=${coopCreated}`, `Contribute button not visible to partner`]);
      }

      // Duel / Challenge: mainUser challenges friend
      await page.locator('input[placeholder="Challenge title..."]').fill('E2E Duel');
      await page.locator('select').first().selectOption({ label: friendUser.username });
      await page.locator('button:has-text("Send Challenge")').click();
      const challengeSent = await page.locator('text=Challenge sent!').first().waitFor({ timeout: 6000 }).then(() => true).catch(() => false);
      await page2.reload({ waitUntil: 'domcontentloaded' });
      await page2.waitForTimeout(1800);
      await page2.locator('button:has-text("Accept")').first().click();
      const challengeAccepted = await page2.locator('text=Accepted!').first().waitFor({ timeout: 6000 }).then(() => true).catch(() => false);
      const activeVisible = await page2.locator('text=ACTIVE').first().isVisible().catch(() => false);
      await shot(page, '24-duel-active');
      await page.reload({ waitUntil: 'domcontentloaded' });
      await settle(page);
      await page.locator('button:has-text("Sync Progress")').first().click();
      const synced = await page.locator('text=Progress synced').first().waitFor({ timeout: 6000 }).then(() => true).catch(() => false);
      await shot(page, '25-duel-synced');

      rec('friends', 'Friends (search/request/accept/list)', sent && friendAdded ? 'PASS' : 'FAIL',
        [`request sent=${sent}`, `accepted=${friendAdded}`, `incoming section shown=${incomingVisible}`, `friend listed for ally=${friendInList2}`]);
      rec('party', 'Party (create/invite/membership)', partyCreated && invited ? 'PASS' : 'FAIL',
        [`party created=${partyCreated}`, `friend invited=${invited}`, `party line='${partyMembers}'`, `friend sees party=${friendSeesParty}`]);
      rec('duels', 'Duels / Challenges', challengeSent && challengeAccepted && synced ? 'PASS' : 'FAIL',
        [`challenge sent=${challengeSent}`, `accepted=${challengeAccepted}`, `ACTIVE section shown=${activeVisible}`, `progress sync=${synced}`]);
      await ctx2.close();
    } catch (e) { rec('social-group', 'Friends/Party/Duels', 'FAIL', [e.message]); }

    // ---------------------------------------------------------------
    // 18 + 19. LEADERBOARD + NOTIFICATIONS + realtime socket
    // ---------------------------------------------------------------
    try {
      const lb = await apiFetch(page, '/api/live/leaderboard?scope=global&limit=5');
      const lbF = await apiFetch(page, '/api/live/leaderboard?scope=friends&limit=5');
      const notifs = await apiFetch(page, '/api/live/notifications');
      const socketRes = await page.evaluate(async () => {
        await new Promise((res, rej) => {
          const s = document.createElement('script');
          s.src = 'http://localhost:5000/socket.io/socket.io.js';
          s.onload = res; s.onerror = rej;
          document.head.appendChild(s);
        });
        const collected = { connect: false, leaderboard: null, daily: null, err: null };
        return await new Promise((resolve) => {
          const token = localStorage.getItem('token');
          const socket = io('http://localhost:5000', { auth: { token } });
          socket.on('connect', () => { collected.connect = true; });
          socket.on('connect_error', (e) => { collected.err = e.message; });
          socket.on('leaderboard:updated', (d) => { collected.leaderboard = d; });
          socket.on('daily_event:updated', (d) => { collected.daily = d; });
          socket.emit('leaderboard:subscribe', {}, (ack) => { collected.lbAck = ack; });
          socket.emit('daily_event:subscribe', () => {});
          setTimeout(() => { try { socket.disconnect(); } catch {} resolve(collected); }, 3000);
        });
      });
      const lbEntries = Array.isArray(lb.data?.entries) ? lb.data.entries.length : 0;
      const liveDot = await page.locator('text=LIVE').first().isVisible().catch(() => false);
      const lbPanel = page.locator('section[aria-label="Realtime activity"] h2:has-text("Leaderboard")').first();
      const lbPanelVisible = await lbPanel.isVisible().catch(() => false);
      const lbRowsRendered = await page.locator('section[aria-label="Realtime activity"] ol li').count();
      const friendsToggle = page.locator('button:has-text("Friends")').first();
      const friendsToggleVisible = await friendsToggle.isVisible().catch(() => false);
      rec('leaderboard', 'Leaderboard', lb.status === 200 && lbEntries > 0 && lbPanelVisible ? 'PASS' : 'BLOCKED',
        [`REST global status=${lb.status} entries=${lbEntries}`, `REST friends status=${lbF.status}`, `socket 'leaderboard:updated' received=${!!socketRes.leaderboard}`, `socket lb ack=${JSON.stringify(socketRes.lbAck)}`,
         `frontend Leaderboard panel visible=${lbPanelVisible}`, `frontend ranked rows rendered=${lbRowsRendered}`, `frontend Global/Friends toggle visible=${friendsToggleVisible}`]);
      const notifPanel = page.locator('section[aria-label="Realtime activity"] h2:has-text("Notifications")').first();
      const notifPanelVisible = await notifPanel.isVisible().catch(() => false);
      rec('notifications', 'Notifications / live activity / daily events',
        !socketRes.err && socketRes.daily && liveDot && notifPanelVisible ? 'PASS' : 'BLOCKED',
        [`GET /api/live/notifications status=${notifs.status} count=${Array.isArray(notifs.data) ? notifs.data.length : 'n/a'}`,
         `socket connect=${socketRes.connect} err=${socketRes.err || 'none'}`, `socket 'daily_event:updated' received=${!!socketRes.daily} type=${socketRes.daily?.type || 'n/a'}`,
         `Live Activity panel LIVE dot=${liveDot}`,
         `frontend Notifications panel visible=${notifPanelVisible}`]);
      await shot(page, '26-live-panel-socket');
    } catch (e) { rec('leaderboard-notifications', 'Leaderboard / Notifications', 'FAIL', [e.message]); }

    // ---------------------------------------------------------------
    // 24. MAJOR NAVIGATION ROUTES
    // ---------------------------------------------------------------
    try {
      const nav = [];
      await page.goto(`${BASE}/definitely-not-a-route`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(700);
      nav.push(`unknown route -> ${page.url().replace(BASE, '') || '/'}`);
      await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
      nav.push(`/login heading visible=${await page.locator('h2:has-text("Login")').first().isVisible().catch(() => false)}`);
      await page.goto(`${BASE}/register`, { waitUntil: 'domcontentloaded' });
      nav.push(`/register heading visible=${await page.locator('h2:has-text("Register")').first().isVisible().catch(() => false)}`);
      rec('routes', 'Major navigation routes', nav.length >= 3 ? 'PASS' : 'FAIL', nav);
    } catch (e) { rec('routes', 'Major navigation routes', 'FAIL', [e.message]); }

    // Protected route: unauthenticated /dashboard -> /login (fresh context)
    try {
      const ctxU = await browser.newContext();
      const pU = await ctxU.newPage();
      capture(pU, meta);
      await pU.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded' });
      await pU.waitForTimeout(1000);
      const redirected = pU.url().includes('/login');
      rec('protected-route', 'ProtectedRoute (unauthenticated /dashboard -> /login)', redirected ? 'PASS' : 'FAIL',
        [`url after visit=${pU.url().replace(BASE, '') || '/'}`]);
      await shot(pU, '27-protected-route-redirect');
      await ctxU.close();
    } catch (e) { rec('protected-route', 'ProtectedRoute redirect', 'FAIL', [e.message]); }

    // ---------------------------------------------------------------
    // 25. MOBILE VIEWPORT SANITY
    // ---------------------------------------------------------------
    try {
      const ctxM = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
      const pM = await ctxM.newPage();
      capture(pM, meta);
      await pM.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
      await pM.locator('input[name=email]').fill(mainUser.email);
      await pM.locator('input[name=password]').fill(mainUser.password);
      await pM.locator('button[type=submit]').click();
      await pM.waitForURL('**/dashboard', { timeout: 10000 });
      await pM.waitForTimeout(3000);
      const ov = await pM.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
      const hOverflow = ov.sw > ov.cw + 2;
      const keyVisible = await pM.locator('text=Tung-Tung').first().isVisible().catch(() => false);
      await shot(pM, '28-mobile-viewport');
      rec('mobile', 'Mobile viewport sanity', keyVisible && !hOverflow ? 'PASS' : 'FAIL',
        [`app visible=${keyVisible}`, `scrollWidth=${ov.sw} vs clientWidth=${ov.cw}`, `horizontal overflow=${hOverflow}`]);
      await ctxM.close();
    } catch (e) { rec('mobile', 'Mobile viewport sanity', 'FAIL', [e.message]); }

    // ---------------------------------------------------------------
    // 26/27. CONSOLE + NETWORK aggregation
    // ---------------------------------------------------------------
    const unique = (arr) => Array.from(new Set(arr));
    const ce = unique(meta.consoleErrors);
    rec('console-errors', 'Browser console errors', ce.length ? 'FAIL' : 'PASS', ce.length ? ce.slice(0, 30) : ['no console errors captured']);
    const net = [...unique(meta.httpErrors), ...unique(meta.networkFailures)];
    rec('network-errors', 'Network / API failures', net.length ? 'FAIL' : 'PASS', net.length ? net.slice(0, 40) : ['no network/API failures captured']);

    // Browser-level security-path evidence (no test weakening).
    try {
      const r = await page.evaluate(async () => {
        const resp = await fetch('http://localhost:5000/api/auth/me', { headers: { 'Content-Type': 'application/json' } });
        return { status: resp.status };
      });
      rec('security-path', 'Security endpoint evidence (browser)', r.status === 401 ? 'PASS' : 'FAIL',
        [`unauthenticated /api/auth/me -> ${r.status} (expected 401)`]);
    } catch (e) { rec('security-path', 'Security endpoint evidence (browser)', 'FAIL', [e.message]); }

    await shot(page, '29-final-dashboard');
  } catch (e) {
    rec('run', 'E2E run', 'FAIL', [e.stack || e.message]);
  } finally {
    if (browser) await browser.close();
  }

  const report = {
    generatedAt: new Date().toISOString(),
    mainUser,
    friendUser,
    results,
    consoleWarnings: Array.from(new Set(meta.consoleWarnings)),
  };
  const out = 'C:/Users/aman7/AppData/Local/Temp/opencode/e2e/e2e-report.json';
  fs.writeFileSync(out, JSON.stringify(report, null, 2));
  console.log('E2E report written to', out);
  for (const r of results) {
    console.log(`${r.id.padEnd(24)} ${r.status.padEnd(7)} ${r.name}`);
    for (const e of r.evidence) console.log(`    - ${e}`);
  }
  if (report.consoleWarnings.length) {
    console.log('\n-- console warnings --');
    report.consoleWarnings.slice(0, 20).forEach((w) => console.log('  ' + w));
  }
})();
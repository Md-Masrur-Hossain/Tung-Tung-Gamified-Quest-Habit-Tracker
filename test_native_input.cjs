// D:\3rd project\test_native_input.cjs
const { BrowserSession, getWsUrl, sleep } = require('./audit_runner.cjs');

async function test() {
  const wsUrl = await getWsUrl();
  const session = new BrowserSession(wsUrl);
  await session.connect();

  await session.navigate('http://localhost:5173/register');
  const u = 'hero_' + Date.now();
  const e = u + '@example.com';
  const p = 'Password123!';

  const vals = await session.evaluate(`
    (function() {
      const inputs = document.querySelectorAll('input');
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      
      nativeSetter.call(inputs[0], '${u}');
      inputs[0].dispatchEvent(new Event('input', { bubbles: true }));
      inputs[0].dispatchEvent(new Event('change', { bubbles: true }));

      nativeSetter.call(inputs[1], '${e}');
      inputs[1].dispatchEvent(new Event('input', { bubbles: true }));
      inputs[1].dispatchEvent(new Event('change', { bubbles: true }));

      nativeSetter.call(inputs[2], '${p}');
      inputs[2].dispatchEvent(new Event('input', { bubbles: true }));
      inputs[2].dispatchEvent(new Event('change', { bubbles: true }));

      return {
        u: inputs[0].value,
        e: inputs[1].value,
        p: inputs[2].value
      };
    })()
  `);
  console.log('Input values set:', vals);
  await sleep(500);

  // Click submit
  await session.evaluate(`
    document.querySelector('button[type="submit"]').click();
  `);
  await sleep(2500);

  const url = await session.evaluate('window.location.href');
  console.log('URL after submit:', url);
  const text = await session.evaluate('document.body.innerText');
  console.log('Body snippet:', text.slice(0, 300).replace(/\n/g, ' '));
  console.log('Session network errors:', session.networkErrors);

  session.close();
}
test().catch(err => {
  console.error(err);
  process.exit(1);
});

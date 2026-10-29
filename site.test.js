// End-to-end checks for the SHREE BALAJI ENTERPRISES site (Playwright + Chromium).
// Run: npm install && npx playwright install chromium && npm test
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const WA = '919255408767';
const MAPS = 'https://www.google.com/maps/search/?api=1&query=Shree%20Balaji%20Enterprises%2C%20Bhagat%20Singh%20Chowk%2C%20Near%20Railway%20Station%2C%20Kaithal%2C%20Haryana%2C%20India%20136027';
const SHOTS = process.env.SHOTS_DIR || '';
let pass = 0, fail = 0;
const ok = (c, m) => { if (!c) throw new Error(m); };
async function t(name, fn) {
  try { await fn(); pass++; console.log('PASS  ' + name); }
  catch (e) { fail++; console.log('FAIL  ' + name + '\n      ' + e.message); }
}

(async () => {
  const server = http.createServer((q, r) => {
    r.setHeader('Content-Type', 'text/html; charset=utf-8');
    r.end(fs.readFileSync(path.join(ROOT, 'index.html')));
  }).listen(0);
  const base = 'http://localhost:' + server.address().port + '/';
  const browser = await chromium.launch();

  for (const [label, vp] of [['mobile 390x844', { width: 390, height: 844 }], ['desktop 1366x768', { width: 1366, height: 768 }]]) {
    const ctx = await browser.newContext({ viewport: vp, permissions: ['clipboard-read', 'clipboard-write'], isMobile: vp.width < 500, hasTouch: vp.width < 500 });
    const page = await ctx.newPage();
    const errors = [], failed = [];
    page.on('pageerror', e => errors.push('pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('requestfailed', r => failed.push(new URL(r.url()).host));
    await page.addInitScript(() => { window.__opened = []; window.open = u => { window.__opened.push(u); return null; }; });
    await page.goto(base, { waitUntil: 'load' });
    await page.waitForTimeout(600);
    const T = s => `[${label}] ${s}`;

    await t(T('no page errors or console errors (offline font requests ignored)'), async () => {
      const real = errors.filter(e => !(/Failed to load resource/.test(e) && failed.every(h => /fonts\.(googleapis|gstatic)\.com/.test(h))));
      ok(real.length === 0, real.join(' | '));
    });

    await t(T('nav links point to existing sections'), async () => {
      const hrefs = await page.$$eval('.links a', a => a.map(x => x.getAttribute('href')));
      ok(hrefs.length === 4, 'expected 4 nav links, got ' + hrefs.length);
      for (const h of hrefs) ok(await page.$(h), 'missing target ' + h);
    });

    await t(T('7 collections render (no Playsuits / Unstitched / Lawn Suits)'), async () => {
      ok(await page.$$eval('#chs .ch', e => e.length) === 7, 'chapter count');
      ok(await page.$$eval('.idx li', e => e.length) === 7, 'index count');
      const txt = await page.locator('#collections').innerText();
      ok(/Shirt & Pant/i.test(txt), 'Shirt & Pant missing');
      ok(!/Playsuits|Unstitched|Lawn Suits/i.test(txt), 'removed category still visible');
    });

    await t(T('collection dialog opens with WhatsApp link, then closes'), async () => {
      await page.locator('.ex').first().click();
      ok(await page.$eval('#dlg', d => d.open), 'dialog not open');
      ok((await page.getAttribute('#dw', 'href')).startsWith('https://wa.me/' + WA + '?text='), 'bad dialog wa link');
      await page.click('#dc');
      ok(!(await page.$eval('#dlg', d => d.open)), 'dialog still open');
    });

    if (vp.width < 500) await t(T('mobile menu toggles'), async () => {
      await page.evaluate(() => scrollTo(0, 0));
      await page.click('#menu');
      ok(await page.$eval('#links', l => l.classList.contains('open')), 'menu not open');
      await page.click('#links a[href="#about"]');
      ok(!(await page.$eval('#links', l => l.classList.contains('open'))), 'menu did not close');
    });

    await page.locator('#contact').scrollIntoViewIfNeeded();
    await page.waitForTimeout(1200);

    await t(T('Contact: Call button removed, two Copy buttons present'), async () => {
      ok(await page.$$eval('#contact a[href^="tel:"]', e => e.length) === 0, 'tel: link still in Contact');
      ok(!/\bCall\b/.test(await page.locator('#contact .cg').first().innerText()), 'word "Call" still shown');
      ok(await page.$$eval('#contact .cp', e => e.length) === 2, 'copy buttons');
    });

    await t(T('Copy puts each number on the clipboard and shows "Phone number copied!"'), async () => {
      const btns = await page.$$('#contact .cp');
      for (const [i, num] of [[0, '+919255408767'], [1, '+917988254105']]) {
        await btns[i].click();
        await page.waitForTimeout(250);
        ok((await page.evaluate(() => navigator.clipboard.readText())) === num, 'clipboard != ' + num);
        ok((await page.textContent('#cpm')).trim() === 'Phone number copied!', 'no success message');
      }
    });

    await t(T('Contact layout: numbers and buttons fit the viewport'), async () => {
      const bad = await page.$$eval('#contact .ph > *', (els, w) => els.filter(e => e.getBoundingClientRect().right > w + 0.5).length, vp.width);
      ok(bad === 0, bad + ' element(s) overflow the viewport');
      ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'page scrolls horizontally');
    });

    await t(T('Address text and Get Directions link are correct and separate from WhatsApp'), async () => {
      const c = (await page.locator('#contact').innerText()).replace(/\s+/g, ' ');
      ok(c.includes('Bhagat Singh Chowk, Near Railway Station, Kaithal, Haryana, India – 136027'), 'contact address: ' + c.slice(0, 300));
      const f = (await page.locator('footer').innerText()).replace(/\s+/g, ' ');
      ok(f.includes('Bhagat Singh Chowk, Near Railway Station, Kaithal, Haryana, India – 136027'), 'footer address');
      const dir = await page.$$eval('#contact a', a => a.filter(x => /Get Directions/.test(x.textContent)).map(x => x.getAttribute('href')));
      ok(dir.length === 1 && dir[0] === MAPS, 'directions href: ' + dir);
      const wa = await page.$$eval('#contact a', a => a.filter(x => /^WhatsApp$/.test(x.textContent.trim())).map(x => x.getAttribute('href')));
      ok(wa.length === 1 && wa[0] === 'https://wa.me/' + WA, 'whatsapp href: ' + wa);
      ok(!/Near Railway Station, Kaithal, Haryana –/.test(await page.content()), 'old address still in page');
    });

    const submit = async (n, p, m) => {
      await page.evaluate(() => { window.__opened.length = 0; });
      await page.fill('#n', n); await page.fill('#t', p); await page.fill('#m', m);
      await page.click('#f button[type=submit]');
      await page.waitForTimeout(150);
      return page.evaluate(() => window.__opened.slice());
    };

    await t(T('Form rejects empty / invalid input and does not open WhatsApp'), async () => {
      let o = await submit('', '', '');
      ok(o.length === 0 && (await page.getAttribute('#n', 'aria-invalid')) === 'true', 'empty name accepted');
      o = await submit('Rahul Sharma', '12345', 'Need a saree');
      ok(o.length === 0 && (await page.getAttribute('#t', 'aria-invalid')) === 'true', 'bad phone accepted');
      o = await submit('Rahul Sharma', '5876543210', 'Need a saree');
      ok(o.length === 0, 'number starting with 5 accepted');
      o = await submit('Rahul Sharma', '9876543210', ' ');
      ok(o.length === 0 && (await page.getAttribute('#m', 'aria-invalid')) === 'true', 'empty message accepted');
      o = await submit('1234', '9876543210', 'Need a saree');
      ok(o.length === 0, 'numeric-only name accepted');
    });

    await t(T('Valid form opens the correct wa.me URL with the exact prefilled message'), async () => {
      const expected = 'Hello Shree Balaji Enterprises,\n\nName: Rahul Sharma\nPhone: +91 98765 43210\nInquiry: Need a red saree & matching blouse?\n\nI would like to know more about your products. Please contact me.';
      for (const phone of ['9876543210', '+91 98765 43210', '09876543210', '+919876543210']) {
        const o = await submit('Rahul  Sharma', phone, 'Need a red saree & matching blouse?');
        ok(o.length === 1, 'window.open called ' + o.length + ' times for ' + phone);
        const u = o[0], pre = 'https://wa.me/' + WA + '?text=';
        ok(u.startsWith(pre), 'url prefix: ' + u.slice(0, 60));
        ok(u === pre + encodeURIComponent(expected), 'encoded message differs for ' + phone + '\n' + decodeURIComponent(u.slice(pre.length)));
        ok(!/[+\s]/.test(u.slice(0, pre.length - 6).replace('https://', '')), 'number has + or spaces');
      }
    });

    await t(T('Form shows fallback links (WhatsApp / WhatsApp Web) and never claims "sent"'), async () => {
      await submit('Rahul Sharma', '9876543210', 'Need a suit');
      const links = await page.$$eval('#fb a', a => a.map(x => x.getAttribute('href')));
      ok(links.length === 2 && links[0].startsWith('https://wa.me/' + WA + '?text=') && links[1].startsWith('https://web.whatsapp.com/send?phone=' + WA + '&text='), 'fallback links: ' + links.join(' , '));
      ok(links[1].includes(encodeURIComponent('Name: Rahul Sharma')), 'web link missing form details');
      ok(!/sent|भेज दिया|भेजा गया/i.test(await page.textContent('#fb')), 'status claims message was sent');
    });

    if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.locator('#contact').screenshot({ path: path.join(SHOTS, 'contact-' + vp.width + '.png') }); }
    await ctx.close();
  }

  await browser.close(); server.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();

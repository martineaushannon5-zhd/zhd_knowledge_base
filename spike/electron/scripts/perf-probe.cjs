// Measure login-page frame rate and login->workspace jump latency on this machine.
// Run: node scripts/perf-probe.cjs
const { _electron } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');

(async () => {
  const userData = fs.mkdtempSync(path.resolve('.perf-中文-'));
  const env = { ...process.env, ZHD_TEST_USER_DATA: userData };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await _electron.launch({ args: ['--no-sandbox', '--disable-gpu', '--in-process-gpu', path.resolve('tests/desktop-entry.cjs')], env });
  try {
    const page = await app.firstWindow();
    page.setDefaultTimeout(15000);
    await page.waitForSelector('.login-page.has-entered');
    await page.waitForTimeout(600);
    const fps = await page.evaluate(() => new Promise(res => {
      let n = 0; const t0 = performance.now();
      const tick = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(tick); else res(Math.round(n / 2)); };
      requestAnimationFrame(tick);
    }));
    const t0 = Date.now();
    await page.getByRole('button', { name: '登录', exact: true }).click();
    await page.waitForSelector('dialog.login-card');
    const tCard = Date.now();
    await page.getByRole('button', { name: '以访客身份体验' }).click();
    const tGuest = Date.now();
    await page.waitForSelector('h1:has-text("让想法，慢慢生长")');
    const jumpMs = Date.now() - t0;
    const cardOpenWait = tCard - t0, guestToHeading = Date.now() - tGuest;
    // Warm jump: back to login (intro skipped) then enter again (no seeding).
    await page.evaluate(() => { location.hash = '/login'; });
    await page.waitForSelector('.login-page');
    await page.waitForTimeout(300);
    const t1 = Date.now();
    await page.getByRole('button', { name: '登录', exact: true }).click();
    await page.getByRole('button', { name: '以访客身份体验' }).click();
    await page.waitForSelector('h1:has-text("让想法，慢慢生长")');
    const warmJumpMs = Date.now() - t1;
    console.log(JSON.stringify({ loginFps: fps, firstJumpMs: jumpMs, cardOpenWait, guestToHeading, warmJumpMs, particleCount: await page.evaluate(() => document.querySelector('.login-helix-canvas')?.dataset.particleCount ?? 'n/a') }));
  } finally {
    await app.evaluate(({ BrowserWindow }) => { for (const w of BrowserWindow.getAllWindows()) w.destroy(); }).catch(() => {});
    await app.close().catch(() => {});
    fs.rmSync(userData, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
})().catch(e => { console.error(e.message); process.exit(1); });

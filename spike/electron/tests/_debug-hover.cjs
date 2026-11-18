const { _electron } = require('@playwright/test');
const fs = require('node:fs/promises'); const os = require('node:os'); const path = require('node:path');
(async () => {
  const userData = await fs.mkdtemp(path.join(os.tmpdir(), 'zhd-dbg-'));
  const env = { ...process.env, ZHD_TEST_USER_DATA: userData }; delete env.ELECTRON_RUN_AS_NODE; delete env.VITE_DEV_SERVER_URL;
  const app = await _electron.launch({ args: [path.resolve('tests/desktop-entry.cjs')], env });
  try {
    const page = await app.firstWindow(); await page.setViewportSize({ width: 1500, height: 960 });
    await page.evaluate(() => { window.__ev = []; for (const t of ['blur','focus','resize']) window.addEventListener(t, () => window.__ev.push(t)); document.documentElement.addEventListener('pointerleave', () => window.__ev.push('pointerleave')); new MutationObserver(() => window.__ev.push('cap:' + document.querySelector('.login-helix-canvas')?.dataset.captured)).observe(document.querySelector('.login-helix-canvas'), { attributes: true, attributeFilter: ['data-captured'] }); });
    await page.waitForSelector('.login-page.has-entered'); await page.waitForTimeout(2600);
    const { width, height } = page.viewportSize(); const r = Math.min(Math.max(width,height)*.11, Math.min(width,height)*.3);
    const len = Math.hypot(width*.98, height*.92), nx = height*.92/len, ny = width*.98/len;
    let found = null;
    outer: for (let t=.52;t<=.9;t+=.035) for (let o=-r;o<=r;o+=9) { const x=width*(.04+t*.98)+nx*o, y=height*(1.02-t*.92)+ny*o; if (x<20||y<90||x>width-20||y>height-90) continue; await page.mouse.move(x,y); if (await page.locator('.helix-note.is-visible').count()) { found={x,y}; break outer; } }
    const title = () => page.evaluate(() => document.querySelector('.helix-note.is-visible h3')?.textContent || '-');
    console.log('captured', await title(), await page.evaluate(() => window.__ev.splice(0)));
    await page.mouse.move(found.x + 3, found.y + 2); console.log('after +3', await title(), await page.evaluate(() => window.__ev.splice(0)));
    await page.screenshot({ path: path.join(os.tmpdir(), 'dbg.png') }); console.log('after shot', await title(), await page.evaluate(() => window.__ev.splice(0)));
    await page.waitForTimeout(800); console.log('after 800ms', await title(), await page.evaluate(() => window.__ev.splice(0)));
  } finally { await app.close().catch(()=>{}); await fs.rm(userData,{recursive:true,force:true}).catch(()=>{}); }
})();

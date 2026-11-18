const { _electron, expect } = require('@playwright/test');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');

const seedTitles = ['设计一个让人愿意停留的知识空间', '本地优先，不只是一个技术选择', '从一个可用的桌面开始', '笔记的价值，发生在第二次阅读', '让不同 Agent 用同一种方式协作', '每周，整理一次自己的好奇心', '一个随手记下的小想法'];

async function hoverUntilCard(page) {
  const { width, height } = page.viewportSize();
  const radius = Math.min(Math.max(width, height) * 0.11, Math.min(width, height) * 0.3);
  const length = Math.hypot(width * 0.98, height * 0.92);
  const nx = height * 0.92 / length;
  const ny = width * 0.98 / length;
  for (let t = 0.52; t <= 0.9; t += 0.035) {
    for (let offset = -radius; offset <= radius; offset += 9) {
      const x = width * (0.04 + t * 0.98) + nx * offset;
      const y = height * (1.02 - t * 0.92) + ny * offset;
      if (x < 20 || y < 90 || x > width - 20 || y > height - 90) continue;
      await page.mouse.move(x, y);
      if (await page.locator('.helix-note.is-visible').count()) return { x, y };
    }
  }
  throw new Error('No particle captured along the helix');
}

(async () => {
  const userData = await fs.mkdtemp(path.resolve('.logintest-中文 空格-'));
  const output = path.resolve('test-results');
  await fs.mkdir(output, { recursive: true });
  const env = { ...process.env, ZHD_TEST_USER_DATA: userData };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.VITE_DEV_SERVER_URL;
  const app = await _electron.launch({ args: ['--no-sandbox', '--disable-gpu', '--in-process-gpu', path.resolve('tests/desktop-entry.cjs')], env });
  const errors = [];
  try {
    const page = await app.firstWindow();
    page.setDefaultTimeout(10000);
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.setViewportSize({ width: 1500, height: 960 });
    await expect(page.getByRole('heading', { name: /让每个想法/ })).toBeVisible();
    await expect(page.locator('#login-email')).toHaveCount(0);
    await expect(page.locator('dialog')).toHaveCount(0);
    await expect(page.getByRole('button', { name: '进入知识空间' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '先体验工作台' })).toHaveCount(0);
    await expect(page.locator('.login-page')).toHaveClass(/has-entered/);
    await page.waitForFunction(() => document.getAnimations().filter(a => a.effect?.getTiming().iterations !== Infinity).every(a => a.playState === 'finished'));
    const canvas = page.locator('.login-helix-canvas');
    const box = await canvas.boundingBox();
    assert(box.x === 0 && box.y === 0 && box.width === 1500 && box.height === 960, `canvas must cover the viewport, got ${JSON.stringify(box)}`);
    await expect(canvas).toHaveAttribute('data-animating', 'true');
    const firstFrame = await canvas.evaluate(c => c.toDataURL());
    await expect.poll(() => canvas.evaluate(c => c.toDataURL())).not.toBe(firstFrame);
    console.log('PASS full-viewport dark scene, hidden login card, moving particle canvas');

    const point = await hoverUntilCard(page);
    const note = page.locator('.helix-note.is-visible');
    const title = await note.locator('h3').innerText();
    assert(seedTitles.includes(title), `unexpected note ${title}`);
    await expect(canvas).toHaveAttribute('data-captured', 'true');
    const card = await note.boundingBox();
    assert(card.x >= 0 && card.y >= 84 && card.x + card.width <= 1500 && card.y + card.height <= 960 - 84, 'note card must stay between header and footer controls');
    await page.mouse.move(card.x + card.width / 2, card.y + card.height / 2, { steps: 12 });
    await page.waitForTimeout(700);
    await expect(note).toHaveCount(1);
    assert.equal(await page.locator('.helix-note.is-visible h3').innerText(), title, 'moving toward the card must keep the same note');
    await page.mouse.move(point.x + 2, point.y + 1, { steps: 8 });
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(output, 'login-hover-card.png') });
    let fadeCard = card;
    if (!(await page.locator('.helix-note.is-visible').count())) {
      await hoverUntilCard(page);
      fadeCard = await page.locator('.helix-note.is-visible').boundingBox();
    }
    await page.mouse.move(fadeCard.x + fadeCard.width / 2, fadeCard.y + fadeCard.height / 2, { steps: 10 });
    await expect(page.locator('.helix-note.is-visible')).toHaveCount(1);
    await expect(page.locator('.helix-note.is-visible')).toHaveCount(0, { timeout: 7500 });
    await expect(canvas).toHaveAttribute('data-captured', 'false');
    console.log('PASS resting on the card fades it out automatically without a click');
    await page.mouse.move(750, 30);
    await expect(page.locator('.helix-note.is-visible')).toHaveCount(0, { timeout: 3000 });
    await expect(canvas).toHaveAttribute('data-captured', 'false');
    console.log(`PASS hover captures a particle, links a random sample card (${title}), card is hoverable and dismisses`);

    await page.getByRole('button', { name: '随机连接一个想法' }).click();
    await expect(page.locator('.helix-note.is-visible')).toHaveCount(1);
    await page.keyboard.press('Escape');
    await expect(page.locator('.helix-note.is-visible')).toHaveCount(0);
    console.log('PASS keyboard alternative and Escape release');

    await page.getByRole('button', { name: '暂停背景动画' }).click();
    await expect(canvas).toHaveAttribute('data-animating', 'false');
    for (let round = 0; round < 8; round += 1) {
      await page.getByRole('button', { name: '随机连接一个想法' }).click();
      await expect(page.locator('.helix-note.is-visible')).toHaveCount(1);
      await page.waitForTimeout(500);
      const random = await page.locator('.helix-note.is-visible').boundingBox();
      assert(random.y >= 84 && random.y + random.height <= 960 - 84, `random card overlaps controls in round ${round}`);
      if (round === 7) await page.screenshot({ path: path.join(output, 'login-desktop.png') });
      await page.getByRole('button', { name: '收起这张卡片' }).click();
      await expect(page.locator('.helix-note.is-visible')).toHaveCount(0);
    }
    await page.getByRole('button', { name: '播放背景动画' }).click();
    await expect(canvas).toHaveAttribute('data-animating', 'true');
    console.log('PASS pause/resume and capture in still frame');

    const signin = page.getByRole('button', { name: '登录', exact: true });
    await signin.click();
    const dialog = page.getByRole('dialog', { name: '欢迎，回到自己的世界。' });
    await expect(dialog).toBeVisible();
    await expect(page.locator('#login-email')).toBeFocused();
    await page.waitForTimeout(700);
    await page.screenshot({ path: path.join(output, 'login-card.png') });
    await dialog.getByRole('button', { name: '登录知识空间', exact: true }).click();
    await expect(page.getByText('请输入邮箱地址', { exact: true })).toBeVisible();
    await page.locator('#login-email').fill('invalid');
    await dialog.getByRole('button', { name: '登录知识空间', exact: true }).click();
    await expect(page.getByText('请输入有效的邮箱地址', { exact: true })).toBeVisible();
    await page.locator('#login-email').fill('demo@example.invalid');
    await page.locator('#login-password').fill('not-a-real-secret');
    await page.getByRole('button', { name: '显示密码', exact: true }).click();
    await expect(page.locator('#login-password')).toHaveAttribute('type', 'text');
    await page.getByRole('button', { name: '隐藏密码', exact: true }).click();
    const requests = [];
    const record = request => requests.push(request.url());
    page.on('request', record);
    await dialog.getByRole('button', { name: '登录知识空间', exact: true }).click();
    await expect(dialog.getByRole('status')).toContainText('未验证身份');
    await expect(page.locator('#login-password')).toHaveValue('');
    assert.equal(requests.length, 0, 'credentials must not generate any network request');
    assert.equal(await page.evaluate(() => `${JSON.stringify(localStorage)}${JSON.stringify(sessionStorage)}`.includes('not-a-real-secret')), false);
    page.off('request', record);
    await page.getByRole('button', { name: '需要登录帮助？' }).click();
    await expect(page.getByRole('dialog', { name: '一个入口，还不是一道锁。' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: '一个入口，还不是一道锁。' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '需要登录帮助？' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.locator('dialog')).toHaveCount(0);
    await expect(signin).toBeFocused();
    await signin.click();
    await expect(page.locator('#login-email')).toHaveValue('');
    await page.getByRole('button', { name: '关闭登录卡片' }).click();
    await expect(page.locator('dialog')).toHaveCount(0);
    console.log('PASS login card opens on demand, validation, no credential network/persistence, help focus, close/reset');

    await page.getByRole('button', { name: '登录', exact: true }).click();
    await page.getByRole('button', { name: '以访客身份体验' }).click();
    await expect(page).toHaveURL(/#\/workspace$/);
    await expect(page.getByRole('heading', { name: '让想法，慢慢生长' })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { name: '让想法，慢慢生长' })).toBeVisible();
    await page.getByRole('button', { name: '返回登录页' }).click();
    await expect(page).toHaveURL(/#\/login$/);
    await page.evaluate(() => { location.hash = '/unknown'; });
    await expect(page.getByRole('heading', { name: /让每个想法/ })).toBeVisible();
    console.log('PASS workspace route, reload, return to login and unknown route fallback');

    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect(canvas).toHaveAttribute('data-reduced-motion', 'true');
    await expect(canvas).toHaveAttribute('data-animating', 'false');
    await expect(page.getByRole('button', { name: '已按系统设置减少动态效果' })).toBeDisabled();
    await page.getByRole('button', { name: '随机连接一个想法' }).click();
    await expect(page.locator('.helix-note.is-visible')).toHaveCount(1);
    await page.keyboard.press('Escape');
    for (const width of [1920, 1440, 1280, 1024, 768, 700, 390, 360]) {
      await page.setViewportSize({ width, height: width < 700 ? 780 : 900 });
      const dimensions = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
      assert(dimensions.scroll <= dimensions.client, `horizontal overflow at ${width}`);
      await expect(page.getByRole('button', { name: '登录', exact: true })).toBeVisible();
      await page.getByRole('button', { name: '登录', exact: true }).click();
      const login = await page.locator('dialog.login-card').boundingBox();
      assert(login.x >= 0 && login.x + login.width <= width + 1, `login card overflow at ${width}`);
      await page.getByRole('button', { name: '关闭登录卡片' }).click();
      await expect(page.locator('dialog')).toHaveCount(0);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(canvas).toHaveAttribute('data-particle-count', '200');
    await page.getByRole('button', { name: '随机连接一个想法' }).click();
    const mobileCard = await page.locator('.helix-note.is-visible').boundingBox();
    assert(mobileCard.x >= 0 && mobileCard.x + mobileCard.width <= 390, 'mobile note card must fit');
    await page.screenshot({ path: path.join(output, 'login-mobile.png') });
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: '登录', exact: true }).click();
    await page.screenshot({ path: path.join(output, 'login-mobile-card.png') });
    assert.equal(errors.length, 0, errors.join('\n'));
    console.log('PASS reduced motion, 360–1920 widths, card fit, mobile particle budget, zero console/renderer errors');
    console.log(`Screenshots: ${output}`);
  } catch (error) {
    const page = app.windows()[0];
    if (page) await page.screenshot({ path: path.join(output, 'login-failure.png') }).catch(() => {});
    throw error;
  } finally {
    await app.evaluate(({ BrowserWindow }) => { for (const window of BrowserWindow.getAllWindows()) window.destroy(); }).catch(() => {});
    await app.close().catch(() => {});
    await fs.rm(userData, { recursive: true, force: true, maxRetries: 8, retryDelay: 150 }).catch(error => console.warn('Test directory retained:', error.code));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });

const { _electron, expect } = require('@playwright/test');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');

(async () => {
  const userData = await fs.mkdtemp(path.join(os.tmpdir(), 'zhd-ui-中文 空格-'));
  const output = path.resolve('test-results');
  await fs.mkdir(output, { recursive: true });
  const env = { ...process.env, ZHD_TEST_USER_DATA: userData };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.VITE_DEV_SERVER_URL;
  const app = await _electron.launch({ args: [path.resolve('tests/desktop-entry.cjs')], env });
  const errors = [];
  try {
    const page = await app.firstWindow();
    page.setDefaultTimeout(10000);
    page.on('pageerror', error => errors.push(error.message));
    await expect(page.getByRole('heading', { name: '让想法，慢慢生长' })).toBeVisible();
    await page.setViewportSize({ width: 1500, height: 1040 });
    await expect(page.locator('.note-card')).toHaveCount(6);
    await page.screenshot({ animations: 'disabled', path: path.join(output, 'desktop-home.png'), fullPage: true });
    await page.locator('.note-open').filter({ hasText: '设计一个让人愿意停留的知识空间' }).click();
    await page.screenshot({ animations: 'disabled', path: path.join(output, 'desktop-reading.png') });
    await page.getByRole('button', { name: '关闭笔记', exact: true }).click();
    const file = await page.evaluate(() => window.desktopNotes.info());
    assert(file.path.startsWith(userData));
    console.log('PASS desktop renderer, isolated Chinese-path storage and initial layout');

    await page.getByRole('button', { name: '搜索笔记', exact: true }).click();
    await page.getByRole('textbox', { name: '搜索关键词' }).fill('Local-first');
    await expect(page.locator('.search-results > button')).toHaveCount(1);
    await page.getByRole('textbox', { name: '搜索关键词' }).fill('无匹配测试 xyz123');
    await expect(page.getByRole('heading', { name: '还没有找到这条线索' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('dialog')).toHaveCount(0);
    console.log('PASS search, no-result and escape');

    await page.getByRole('button', { name: '新建笔记', exact: true }).click();
    await page.getByRole('button', { name: '保存笔记', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('先写下标题');
    await page.getByRole('textbox', { name: '笔记标题' }).fill('验证：中文路径中的一个想法');
    await page.locator('.cm-content').fill('# 桌面验证\n\n这是一个可以保存和重新找回的想法。');
    await page.getByRole('button', { name: '保存笔记', exact: true }).click();
    await expect(page.locator('dialog')).toHaveCount(0);
    await expect(page.getByRole('status')).toContainText('已保存到本地原型目录');
    await page.reload();
    await expect(page.getByRole('heading', { name: '验证：中文路径中的一个想法' })).toBeVisible();
    const stored = JSON.parse(await fs.readFile(file.path, 'utf8'));
    assert(stored.some(n => n.title === '验证：中文路径中的一个想法'));
    console.log('PASS blank validation, CodeMirror editing, IPC save and reload persistence');

    const star = page.getByRole('button', { name: '收藏：验证：中文路径中的一个想法', exact: true });
    await star.click();
    await expect(page.getByRole('button', { name: '取消收藏：验证：中文路径中的一个想法', exact: true })).toBeVisible();
    await page.locator('.nav-item').filter({ hasText: '我的收藏' }).click();
    await expect(page.locator('.note-card')).toHaveCount(4);
    await page.getByRole('button', { name: '列表视图' }).click();
    await expect(page.locator('.notes-grid')).toHaveClass(/list-layout/);
    await page.locator('.note-open').filter({ hasText: '验证：中文路径中的一个想法' }).click();
    await page.getByRole('button', { name: '编辑', exact: true }).click();
    await page.locator('.cm-content').fill('# 安全的 Markdown\n\n<script>window.injected=true</script>\n\n![remote](https://example.invalid/test.png)');
    await page.getByRole('dialog').getByRole('button', { name: '阅读', exact: true }).click();
    assert.equal(await page.locator('.prose img,.prose script').count(), 0);
    assert.equal(await page.evaluate(() => window.injected), undefined);
    await page.screenshot({ animations: 'disabled', path: path.join(output, 'desktop-editor.png') });
    await page.getByRole('button', { name: '保存笔记', exact: true }).click();
    await expect(page.locator('dialog')).toHaveCount(0);
    console.log('PASS favorite, list layout and sanitized Markdown preview');

    await page.getByRole('button', { name: 'ZHD 知识空间首页' }).click();
    for (const width of [1440, 1280, 1024, 768, 375]) {
      await page.setViewportSize({ width, height: 960 });
      const dimensions = await page.evaluate(() => ({ client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
      assert(dimensions.scroll <= dimensions.client, `horizontal overflow at ${width}`);
    }
    await page.getByRole('button', { name: '打开导航' }).click();
    await page.locator('.nav-item').filter({ hasText: '全部笔记' }).click();
    await expect(page.locator('.sidebar')).not.toHaveClass(/is-open/);
    await page.screenshot({ animations: 'disabled', path: path.join(output, 'mobile-library.png'), fullPage: true });
    console.log('PASS responsive widths and mobile navigation');

    await page.setViewportSize({ width: 1500, height: 1040 });
    const exportPath = path.join(userData, 'export-test.json');
    await app.evaluate(({ dialog }, filePath) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath }); }, exportPath);
    await page.getByRole('button', { name: '偏好与数据' }).click();
    await page.getByRole('button', { name: '导出当前笔记 JSON' }).click();
    await expect(page.getByRole('status')).toContainText('已导出');
    assert.equal(JSON.parse(await fs.readFile(exportPath, 'utf8')).notes.length, 8);
    await page.getByRole('button', { name: '关闭设置' }).click();
    console.log('PASS desktop export IPC and JSON file');
    await page.getByRole('button', { name: '新建笔记', exact: true }).click();
    await page.getByRole('textbox', { name: '笔记标题' }).fill('取消关闭后仍然可以保存');
    await app.evaluate(({ app, dialog }) => {
      dialog.showMessageBoxSync = () => { global.__closeCanceled = true; return 0; };
      app.quit();
    });
    await expect.poll(() => app.evaluate(() => global.__closeCanceled)).toBe(true);
    await page.getByRole('button', { name: '保存笔记', exact: true }).click();
    await expect(page.locator('dialog')).toHaveCount(0);
    await expect(page.getByRole('status')).toContainText('已保存');
    console.log('PASS cancel desktop close, preserve draft and continue saving');
    await app.evaluate(({ ipcMain }) => {
      ipcMain.removeHandler('desktop-notes:save');
      ipcMain.handle('desktop-notes:save', () => { throw new Error('Simulated disk error'); });
    });
    await page.getByRole('button', { name: '新建笔记', exact: true }).click();
    await page.getByRole('textbox', { name: '笔记标题' }).fill('保存失败不得丢失');
    await page.getByRole('button', { name: '保存笔记', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('保存失败');
    await expect(page.getByRole('textbox', { name: '笔记标题' })).toHaveValue('保存失败不得丢失');
    page.once('dialog', dialog => dialog.accept());
    await page.getByRole('button', { name: '关闭笔记', exact: true }).click();
    assert.equal(errors.length, 0, errors.join('\n'));
    console.log('PASS save failure retention and zero uncaught renderer errors');
    console.log(`Screenshots: ${output}`);
  } catch (error) {
    console.error('UI test failed:', error);
    const page = app.windows()[0];
    if (page) await page.screenshot({ animations: 'disabled', path: path.join(output, 'failure.png') }).catch(() => {});
    throw error;
  } finally {
    await app.evaluate(({ BrowserWindow }) => { for (const window of BrowserWindow.getAllWindows()) window.destroy(); }).catch(() => {});
    await app.close().catch(() => {});
    await fs.rm(userData, { recursive: true, force: true, maxRetries: 8, retryDelay: 150 }).catch(error => console.warn('Test directory retained:', error.code, userData));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });

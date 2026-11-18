const { _electron, expect } = require('@playwright/test');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');

(async () => {
  const userData = await fs.mkdtemp(path.resolve('.uitest-中文 空格-'));
  const output = path.resolve('test-results');
  await fs.mkdir(output, { recursive: true });
  const env = { ...process.env, ZHD_TEST_USER_DATA: userData };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.VITE_DEV_SERVER_URL;
  const app = await _electron.launch({ args: ['--no-sandbox', '--disable-gpu', '--in-process-gpu', path.resolve('tests/desktop-entry.cjs')], env });
  const errors = [];
  const vaultRoot = path.join(userData, 'zhd-vault');
  const notesDir = path.join(vaultRoot, 'notes');
  async function findNoteFile(title) {
    const files = await fs.readdir(notesDir);
    for (const f of files) {
      if (!f.endsWith('.md')) continue;
      const text = await fs.readFile(path.join(notesDir, f), 'utf8');
      if (text.includes(title)) return { file: f, text };
    }
    return null;
  }
  try {
    const page = await app.firstWindow();
    page.setDefaultTimeout(12000);
    page.on('pageerror', error => errors.push(error.message));
    await expect(page.getByRole('heading', { name: /让每个想法/ })).toBeVisible();
    await page.getByRole('button', { name: '登录', exact: true }).click();
    await page.getByRole('button', { name: '以访客身份体验' }).click();
    await expect(page.getByRole('heading', { name: '让想法，慢慢生长' })).toBeVisible();
    await page.setViewportSize({ width: 1500, height: 1040 });
    await expect(page.locator('.note-card')).toHaveCount(6);
    const info = await page.evaluate(() => window.kbStore.info());
    assert.equal(info.mode, 'vault');
    assert(info.path.startsWith(userData));
    // Seeded examples must exist as Markdown truth-source files with frontmatter.
    const seedFile = await findNoteFile('设计一个让人愿意停留的知识空间');
    assert(seedFile && seedFile.text.startsWith('---') && /revision:/.test(seedFile.text), 'seed note must be a Markdown file with frontmatter');
    await page.screenshot({ animations: 'disabled', path: path.join(output, 'desktop-home.png'), fullPage: true });
    console.log('PASS desktop renderer, vault Markdown truth source, isolated Chinese-path userData');

    // Chinese full-text search via SQLite FTS5 (bigram segmentation).
    await page.getByRole('button', { name: '搜索笔记', exact: true }).click();
    await page.getByRole('textbox', { name: '搜索关键词' }).fill('本地优先');
    await expect(page.locator('.search-results > button').first()).toBeVisible();
    await expect(page.locator('.search-results')).toContainText('本地优先，不只是一个技术选择');
    await page.getByRole('textbox', { name: '搜索关键词' }).fill('知识');
    await expect(page.locator('.search-results > button').first()).toBeVisible();
    await page.getByRole('textbox', { name: '搜索关键词' }).fill('zzzqqqxxx999');
    await expect(page.getByRole('heading', { name: '还没有找到这条线索' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('dialog')).toHaveCount(0);
    console.log('PASS Chinese FTS5 search (2-char query), multi-char, no-result and escape');

    // Ask the knowledge base: offline extractive answer with valid citations + no-basis refusal.
    await page.getByRole('button', { name: '问知识库', exact: true }).click();
    await page.getByRole('textbox', { name: '向知识库提问' }).fill('本地优先是什么意思');
    await page.getByRole('dialog', { name: '问知识库' }).getByRole('button', { name: '提问' }).click();
    await expect(page.locator('.ask-answer')).toContainText('离线检索摘要');
    await expect(page.locator('.ask-cite').first()).toBeVisible();
    await expect(page.locator('.ask-meta')).toContainText('不发送内容到云端');
    await page.locator('.ask-cite').first().click(); // citation opens the note
    await expect(page.locator('dialog.note-dialog')).toBeVisible();
    await page.getByRole('button', { name: '关闭笔记', exact: true }).click();
    await page.getByRole('button', { name: '问知识库', exact: true }).click();
    await page.getByRole('textbox', { name: '向知识库提问' }).fill('zzzqqqxxx999');
    await page.getByRole('dialog', { name: '问知识库' }).getByRole('button', { name: '提问' }).click();
    await expect(page.locator('.ask-refused')).toContainText('没有找到相关依据');
    await page.keyboard.press('Escape');
    console.log('PASS ask: offline cited answer, citation opens note, no-basis refusal, no cloud egress');

    // New note: blank validation, autosave, Markdown file persisted.
    await page.getByRole('button', { name: '新建笔记', exact: true }).click();
    await page.getByRole('button', { name: '保存', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('先写下标题');
    await page.getByRole('textbox', { name: '笔记标题' }).fill('验证：中文路径中的一个想法');
    await page.locator('.cm-content').fill('# 桌面验证\n\n这是一个可以保存和重新找回的想法。');
    await expect(page.locator('.save-state')).toContainText('已保存', { timeout: 6000 }); // autosave without clicking
    const created = await findNoteFile('验证：中文路径中的一个想法');
    assert(created && /revision: \d+/.test(created.text), 'autosaved note must be a revisioned Markdown file');
    await page.getByRole('button', { name: '完成', exact: true }).click();
    await expect(page.locator('dialog')).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole('heading', { name: '让想法，慢慢生长' })).toBeVisible();
    assert(await findNoteFile('验证：中文路径中的一个想法'), 'note must survive reload');
    console.log('PASS blank validation, debounced autosave, Markdown persistence and reload');

    // Favorite + list layout + sanitized Markdown preview.
    await page.getByRole('button', { name: '收藏：验证：中文路径中的一个想法', exact: true }).click();
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
    await page.getByRole('button', { name: '完成', exact: true }).click();
    await expect(page.locator('dialog')).toHaveCount(0);
    console.log('PASS favorite, list layout and sanitized Markdown preview');

    // Recycle bin: trash -> restore -> trash -> purge.
    await page.locator('.nav-item').filter({ hasText: '全部笔记' }).click();
    await page.locator('.note-open').filter({ hasText: '验证：中文路径中的一个想法' }).click();
    await page.getByRole('button', { name: '移到回收站' }).click();
    await expect(page.locator('dialog')).toHaveCount(0);
    await expect(page.getByRole('status')).toContainText('已移到回收站');
    await page.locator('.nav-item').filter({ hasText: '回收站' }).click();
    await expect(page.locator('.trash-card')).toHaveCount(1);
    await page.getByRole('button', { name: '恢复', exact: true }).click();
    await expect(page.locator('.trash-card')).toHaveCount(0);
    await expect(page.getByRole('status')).toContainText('已恢复笔记');
    await page.locator('.nav-item').filter({ hasText: '全部笔记' }).click();
    await page.locator('.note-open').filter({ hasText: '验证：中文路径中的一个想法' }).click();
    await page.getByRole('button', { name: '移到回收站' }).click();
    await page.locator('.nav-item').filter({ hasText: '回收站' }).click();
    page.once('dialog', d => d.accept());
    await page.getByRole('button', { name: '彻底删除', exact: true }).click();
    await expect(page.locator('.trash-card')).toHaveCount(0);
    assert.equal(await findNoteFile('验证：中文路径中的一个想法'), null, 'purged note file must be removed');
    console.log('PASS recycle bin trash/restore/purge with file-level removal');

    // Responsive widths + mobile navigation.
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

    // Export via vault IPC.
    await page.setViewportSize({ width: 1500, height: 1040 });
    const exportPath = path.join(userData, 'export-test.json');
    await app.evaluate(({ dialog }, filePath) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath }); }, exportPath);
    await page.getByRole('button', { name: '偏好与数据' }).click();
    await page.getByRole('button', { name: '导出当前笔记 JSON' }).click();
    await expect(page.getByRole('status')).toContainText('已导出');
    assert.equal(JSON.parse(await fs.readFile(exportPath, 'utf8')).notes.length, 7); // 7 seeds (created note purged)
    await page.getByRole('button', { name: '关闭设置' }).click();
    console.log('PASS vault export IPC and JSON file');

    // Cancel desktop close keeps the draft; manual save still works.
    await page.getByRole('button', { name: '新建笔记', exact: true }).click();
    await page.getByRole('textbox', { name: '笔记标题' }).fill('取消关闭后仍然可以保存');
    await app.evaluate(({ app, dialog }) => { dialog.showMessageBoxSync = () => { global.__closeCanceled = true; return 0; }; app.quit(); });
    await expect.poll(() => app.evaluate(() => global.__closeCanceled)).toBe(true);
    await page.getByRole('button', { name: '保存', exact: true }).click();
    await expect(page.locator('.save-state')).toContainText('已保存');
    await page.getByRole('button', { name: '完成', exact: true }).click();
    await expect(page.locator('dialog')).toHaveCount(0);
    console.log('PASS cancel desktop close, preserve draft and continue saving');

    // Save failure must retain content (override vault save handler).
    await app.evaluate(({ ipcMain }) => { ipcMain.removeHandler('kb:save'); ipcMain.handle('kb:save', () => { throw new Error('Simulated disk error'); }); });
    await page.getByRole('button', { name: '新建笔记', exact: true }).click();
    await page.getByRole('textbox', { name: '笔记标题' }).fill('保存失败不得丢失');
    await page.getByRole('button', { name: '保存', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('保存失败');
    await expect(page.getByRole('textbox', { name: '笔记标题' })).toHaveValue('保存失败不得丢失');
    page.once('dialog', d => d.accept());
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

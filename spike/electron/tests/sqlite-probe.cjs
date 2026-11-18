const { app } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

app.disableHardwareAcceleration();
const out = path.join(os.tmpdir(), `zhd-sqlite-probe-${process.pid}.json`);
const result = { electron: process.versions.electron, node: process.versions.node, modules: process.versions.modules };
try {
  const Database = require('better-sqlite3');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zhd-sqlite-中文 空格-'));
  const file = path.join(dir, 'probe.db');
  const db = new Database(file);
  result.sqlite = db.prepare('select sqlite_version() v').get().v;
  db.exec('CREATE VIRTUAL TABLE notes USING fts5(title, body, tags)');
  const ins = db.prepare('INSERT INTO notes(title, body, tags) VALUES (?, ?, ?)');
  ins.run('本地优先', '数据应该先属于自己，断开网络也能记录。', '架构');
  ins.run('知识管理', '笔记的价值发生在第二次阅读。', '阅读');
  result.ftsChinese = db.prepare("SELECT title FROM notes WHERE notes MATCH '知识'").all();
  result.ftsTag = db.prepare("SELECT title FROM notes WHERE notes MATCH 'tags:架构'").all();
  db.close();
  result.fileBytes = fs.statSync(file).size;
  result.ok = true;
  fs.rmSync(dir, { recursive: true, force: true });
} catch (error) {
  result.ok = false;
  result.error = String(error && error.message || error);
}
fs.writeFileSync(out, JSON.stringify(result, null, 2));
console.log('PROBE_FILE=' + out);
console.log(JSON.stringify(result));
app.exit(result.ok ? 0 : 1);

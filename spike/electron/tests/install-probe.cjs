// Install the built NSIS package into a throwaway directory, then run the
// installed binary in SQLite-probe mode to prove the native module works from
// the packaged app. Does not touch the user's real installation or data.
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const release = ['release-final', 'release-build', 'release'].map(d => path.resolve(d)).find(d => fs.existsSync(d) && fs.readdirSync(d).some(f => /setup.*\.exe$/i.test(f)));
if (!release) { console.error('No NSIS installer found in release-final/release-build/release'); process.exit(1); }
const installer = fs.readdirSync(release).find(f => /setup.*\.exe$/i.test(f));
if (!installer) { console.error('No NSIS installer found in release/:', fs.readdirSync(release)); process.exit(1); }
const installerPath = path.join(release, installer);
const installDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zhd-install-'));
const probeOut = path.join(os.tmpdir(), `zhd-packaged-probe-${process.pid}.json`);
const exeName = 'Zhd Notes.exe';

function run(file, args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, { env: { ...process.env, ...env }, stdio: 'inherit', windowsHide: true });
    const timer = setTimeout(() => { child.kill(); reject(new Error('timeout: ' + file)); }, 120000);
    child.on('error', e => { clearTimeout(timer); reject(e); });
    child.on('exit', code => { clearTimeout(timer); resolve(code); });
  });
}
const wait = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  console.log('Installer:', installerPath);
  console.log('Install dir:', installDir);
  // NSIS silent install; /D= must be the LAST argument and unquoted.
  const code = await run(installerPath, ['/S', `/D=${installDir}`], {});
  console.log('installer exit', code);
  const exe = path.join(installDir, exeName);
  for (let i = 0; i < 40 && !fs.existsSync(exe); i += 1) await wait(500);
  if (!fs.existsSync(exe)) { console.error('Installed exe not found:', exe, fs.existsSync(installDir) ? fs.readdirSync(installDir) : 'no dir'); process.exit(1); }
  console.log('Installed exe:', exe, fs.statSync(exe).size, 'bytes');
  if (fs.existsSync(probeOut)) fs.unlinkSync(probeOut);
  const env = { ZHD_SQLITE_PROBE: '1', ZHD_SQLITE_PROBE_OUT: probeOut };
  delete env.ELECTRON_RUN_AS_NODE;
  const probeCode = await run(exe, [], env);
  console.log('installed-app probe exit', probeCode);
  if (!fs.existsSync(probeOut)) { console.error('Probe output missing'); process.exit(1); }
  const result = JSON.parse(fs.readFileSync(probeOut, 'utf8'));
  console.log('PACKAGED RESULT:', JSON.stringify(result, null, 2));
  const ok = result.ok && result.packaged === true && Array.isArray(result.ftsTag) && result.ftsTag.length === 1;
  console.log(ok ? 'PASS packaged NSIS app loads SQLite/FTS5' : 'FAIL packaged probe');
  fs.rmSync(installDir, { recursive: true, force: true, maxRetries: 8, retryDelay: 200 });
  fs.rmSync(probeOut, { force: true });
  process.exit(ok ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });

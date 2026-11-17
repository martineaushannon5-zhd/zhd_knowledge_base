'use strict';

const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');
const { spawn } = require('node:child_process');
const { parseDevServerUrl } = require('../electron/security.cjs');

const root = path.resolve(__dirname, '..');
const preview = process.argv.includes('--preview');

function probe(url) {
  return new Promise((resolve) => {
    const request = http.get(`${url}/@vite/client`, { timeout: 1500 }, (response) => {
      response.resume();
      resolve(response.statusCode === 200);
    });
    request.on('timeout', () => request.destroy());
    request.on('error', () => resolve(false));
  });
}

async function waitForVite(url) {
  const deadline = Date.now() + 30000;
  console.log(`Waiting for Vite at ${url} (start it separately with npm run dev)…`);
  while (Date.now() < deadline) {
    if (await probe(url)) return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`No Vite server found at ${url}. Run npm run dev in another terminal.`);
}

async function main() {
  const env = { ...process.env };
  // Some IDE terminals set this for their own helpers; the desktop needs Electron.
  delete env.ELECTRON_RUN_AS_NODE;
  if (preview) {
    delete env.VITE_DEV_SERVER_URL;
    if (!fs.existsSync(path.join(root, 'dist', 'index.html'))) {
      throw new Error('dist/index.html is missing. Run npm run build first.');
    }
  } else {
    env.VITE_DEV_SERVER_URL = parseDevServerUrl(env.VITE_DEV_SERVER_URL || 'http://127.0.0.1:5173');
    await waitForVite(env.VITE_DEV_SERVER_URL);
  }
  const child = spawn(require('electron'), [root], { cwd: root, env, stdio: 'inherit', windowsHide: false });
  child.once('error', (error) => {
    console.error(`Electron could not start: ${error.message}`);
    process.exitCode = 1;
  });
  child.once('exit', (code) => { process.exitCode = code ?? 1; });
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, () => { if (!child.killed) child.kill(); });
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});

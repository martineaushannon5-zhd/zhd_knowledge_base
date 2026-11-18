// Rasterize the brand SVG (assets/icon.svg) into PNG icons using Electron's own
// compositor (capturePage), so icons are produced locally and reproducibly with
// no extra dependency. Run: node scripts/rasterize.cjs
const path = require('node:path');
const fs = require('node:fs');
const { app, BrowserWindow } = require('electron');

const SIZES = [512, 256, 128, 64, 48, 32, 16];
const outDir = path.resolve(__dirname, '..', 'assets');
const page = path.resolve(__dirname, '..', 'assets', 'raster.html');

// Use a clean throwaway userData so a stale/locked default profile can't crash launch.
const profileRoot = path.resolve(__dirname, '..', '.raster-profile');
fs.mkdirSync(profileRoot, { recursive: true });
app.setPath('userData', fs.mkdtempSync(path.join(profileRoot, 'p-')));
app.commandLine.appendSwitch('disable-gpu');

app.whenReady().then(async () => {
  console.log('rasterize ready');
  fs.mkdirSync(outDir, { recursive: true });
  const win = new BrowserWindow({ width: 512, height: 512, show: true, transparent: false, backgroundColor: '#1d3a33', frame: false, webPreferences: { offscreen: false } });
  for (const size of SIZES) {
    win.setSize(size, size);
    await win.loadFile(page, { query: { size: String(size) } });
    await new Promise(r => setTimeout(r, 250));
    const image = await win.webContents.capturePage();
    const png = image.toPNG();
    fs.writeFileSync(path.join(outDir, `icon-${size}.png`), png);
    if (size === 32) fs.writeFileSync(path.join(outDir, '..', 'public', 'favicon-32.png'), png);
    console.log('wrote icon-' + size + '.png', png.length, 'bytes');
  }
  win.setSize(192, 192);
  await win.loadFile(page, { query: { size: '192' } });
  await new Promise(r => setTimeout(r, 250));
  fs.writeFileSync(path.join(outDir, '..', 'public', 'favicon-192.png'), (await win.webContents.capturePage()).toPNG());
  console.log('wrote favicon-192.png');
  app.exit(0);
}).catch(e => { console.error(e); app.exit(1); });

// Local per-user install without running the NSIS installer (its execution is
// blocked by endpoint security on this machine). Copies the packed win-unpacked
// app into %LOCALAPPDATA%\Programs and creates Start Menu / Desktop shortcuts
// that launch with --no-sandbox (required here; see main.cjs note).
// Run: node scripts/install-local.cjs [winUnpackedDir]
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const src = path.resolve(process.argv[2] || path.join(__dirname, '..', 'release-icon', 'win-unpacked'));
const dest = path.join(process.env.LOCALAPPDATA, 'Programs', 'ZHD Knowledge Studio');
const exe = path.join(dest, 'ZHD Knowledge Studio.exe');
if (!fs.existsSync(path.join(src, 'ZHD Knowledge Studio.exe'))) { console.error('source exe missing:', src); process.exit(1); }
fs.mkdirSync(dest, { recursive: true });
fs.cpSync(src, dest, { recursive: true });
console.log('copied to', dest);

const ps = `$ws = New-Object -ComObject WScript.Shell;
$targets = @((Join-Path ([Environment]::GetFolderPath('StartMenu')) 'Programs\\ZHD Knowledge Studio.lnk'), (Join-Path ([Environment]::GetFolderPath('Desktop')) 'ZHD Knowledge Studio.lnk'));
foreach ($t in $targets) { $s = $ws.CreateShortcut($t); $s.TargetPath = '${exe.replace(/'/g, "''")}'; $s.Arguments = '--no-sandbox'; $s.WorkingDirectory = '${dest.replace(/'/g, "''")}'; $s.IconLocation = '${exe.replace(/'/g, "''")},0'; $s.Description = 'ZHD Knowledge Studio'; $s.Save(); Write-Output ('shortcut: ' + $t) }`;
execFileSync('powershell', ['-NoProfile', '-Command', ps], { stdio: 'inherit' });
console.log('installed exe:', exe);

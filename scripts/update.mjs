import { open, unlink, writeFile, rename, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { scoreCheckDecision } from '../lib/update-schedule.mjs';

const root = resolve(import.meta.dirname, '..');
if (process.argv.includes('--scheduled')) {
  const dashboard = JSON.parse(await readFile(resolve(root, 'public/data/dashboard.json'), 'utf8'));
  const decision = scoreCheckDecision(dashboard.teamFixtures);
  if (!decision.due) { console.log(JSON.stringify(decision)); process.exit(0); }
}
const lockPath = resolve(root, 'data/update.lock');
let lock;
try { lock = await open(lockPath, 'wx'); }
catch (error) {
  if (error.code === 'EEXIST') throw new Error('Başka bir güncelleme çalışıyor veya yarım kalmış kilit var. İkinci güncelleme başlatılmadı.');
  throw error;
}
await lock.writeFile(JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }));
const run = (args, environment = {}) => new Promise((accept, reject) => {
  const child = spawn(process.execPath, args, { cwd: root, stdio: 'inherit', windowsHide: true, env: { ...process.env, ...environment } });
  child.once('error', reject);
  child.once('exit', code => code === 0 ? accept() : reject(new Error(`${args[0]} başarısız: ${code}`)));
});
let status;
try {
  if (!process.argv.includes('--offline')) {
    await run(['scripts/sync-tff.mjs', '--current-only', '--refresh']);
    await run(['scripts/sync-referees.mjs']);
    await run(['scripts/sync-squads.mjs']);
    if (process.argv.includes('--squad-weekly')) {
      await run(['scripts/sync-europe.mjs']);
      await run(['scripts/collect-squad-news.mjs']);
    }
  }
  await run(['scripts/build.mjs', '--candidate']);
  await run(['--test'], { PTNEXT_DASHBOARD: 'public/data/dashboard.next.json' });
  await rename(resolve(root, 'public/data/dashboard.next.json'), resolve(root, 'public/data/dashboard.json'));
  status = { ok: true, checkedAt: new Date().toISOString() };
} catch (error) {
  status = { ok: false, checkedAt: new Date().toISOString(), error: error.message };
  process.exitCode = 1;
  console.error(`Güncelleme durdu; son geçerli puan tablosu korunuyor. ${error.message}`);
} finally {
  try {
    const statusPath = resolve(root, 'public/data/update-status.json');
    await writeFile(statusPath + '.tmp', JSON.stringify(status));
    await rename(statusPath + '.tmp', statusPath);
  } finally { await lock.close(); await unlink(lockPath); }
}

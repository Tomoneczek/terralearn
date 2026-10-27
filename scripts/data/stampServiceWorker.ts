import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const DATA_DIR = path.resolve(process.cwd(), 'public/data');
const SW_PATH = path.resolve(process.cwd(), 'public/sw.js');
const VERSION_LINE = /^const CACHE_VERSION = '[^']*';$/m;

/**
 * Short hash of every shipped data file. The service worker serves `/data/` cache-first, so its
 * cache name must change whenever the data changes, or installed PWAs keep stale files (e.g. the
 * old facts.json format after it switched to structured facts).
 */
export function dataVersion(dir = DATA_DIR): string {
  const hash = crypto.createHash('sha256');
  for (const file of fs
    .readdirSync(dir)
    .filter(f => f.endsWith('.json'))
    .sort()) {
    hash.update(file);
    hash.update(fs.readFileSync(path.join(dir, file)));
  }
  return `data-${hash.digest('hex').slice(0, 10)}`;
}

/** Writes the current data version into public/sw.js (no-op when it is up to date). */
export function stampServiceWorker(): string {
  const version = dataVersion();
  const sw = fs.readFileSync(SW_PATH, 'utf-8');
  if (!VERSION_LINE.test(sw)) throw new Error('CACHE_VERSION line not found in public/sw.js');
  const next = sw.replace(VERSION_LINE, `const CACHE_VERSION = '${version}';`);
  if (next !== sw) fs.writeFileSync(SW_PATH, next);
  return version;
}

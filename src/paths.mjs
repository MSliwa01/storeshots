import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const KIT_DIR = join(ROOT, 'kit');

/**
 * Where downloaded data lives (Apple bezels, the reference library): next to the code in a
 * git clone, otherwise (an npm install, often read-only) in the user's cache.
 * STORESHOTS_HOME overrides both.
 */
export const DATA_DIR = process.env.STORESHOTS_HOME
  ?? (existsSync(join(ROOT, '.git')) ? ROOT : join(process.env.XDG_CACHE_HOME ?? join(homedir(), '.cache'), 'storeshots'));

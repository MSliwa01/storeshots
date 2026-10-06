// `storeshots skill`: where the agent skill lives, and linking it into an agent's skills
// folder (Claude Code reads ~/.claude/skills, Codex and others ~/.agents/skills).
import { existsSync, lstatSync, mkdirSync, readlinkSync, symlinkSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { usage } from './errors.mjs';
import { ROOT } from './paths.mjs';

export const SKILL_DIR = join(ROOT, 'skills', 'store-screenshots');

export function skill({ install } = {}) {
  const targets = { 'Claude Code': join(homedir(), '.claude', 'skills'), 'Codex, Gemini CLI, others': join(homedir(), '.agents', 'skills') };
  if (!install) {
    return { path: SKILL_DIR, install: Object.fromEntries(Object.entries(targets).map(([agent, dir]) => [agent, `storeshots skill --install ${dir}`])) };
  }
  const dir = resolve(install === true ? targets['Claude Code'] : String(install).replace(/^~/, homedir()));
  const link = join(dir, 'store-screenshots');
  mkdirSync(dir, { recursive: true });
  if (existsSync(link) || lstatSync(link, { throwIfNoEntry: false })) {
    const current = lstatSync(link).isSymbolicLink() ? readlinkSync(link) : null;
    if (current && resolve(dir, current) === SKILL_DIR) return { linked: link, to: SKILL_DIR, already: true };
    throw usage(`${link} already exists`, { fix: 'remove it first, or install into another folder' });
  }
  symlinkSync(SKILL_DIR, link, 'dir');
  return { linked: link, to: SKILL_DIR };
}

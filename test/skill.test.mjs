import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const root = fileURLToPath(new URL('..', import.meta.url));
const skillDir = `${root}skills/store-screenshots`;
const help = spawnSync(process.execPath, [`${root}bin/storeshots.mjs`, 'help'], { encoding: 'utf8' }).stdout;

test('every storeshots command and flag the skill mentions exists in the CLI help', () => {
  const text = [readFileSync(`${skillDir}/SKILL.md`, 'utf8'), ...readdirSync(`${skillDir}/references`).map(f => readFileSync(`${skillDir}/references/${f}`, 'utf8'))].join('\n');
  const commands = new Set([...text.matchAll(/storeshots ([a-z]+)/g)].map(m => m[1]));
  for (const c of commands) assert.match(help, new RegExp(`\\n  ${c}\\b`), `skill mentions "storeshots ${c}", missing from help`);
  const flags = new Set([...text.matchAll(/storeshots [a-z]+[^`\n]*?(--[a-z]+)/g)].map(m => m[1]));
  for (const f of flags) assert.ok(help.includes(f), `skill uses ${f}, missing from help`);
});

test('the skill references only files that exist', () => {
  const skill = readFileSync(`${skillDir}/SKILL.md`, 'utf8');
  for (const [, ref] of skill.matchAll(/`(references\/[\w.-]+)`/g)) assert.ok(existsSync(`${skillDir}/${ref}`), ref);
});

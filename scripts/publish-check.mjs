#!/usr/bin/env node
// Checks a tree before it is published (default: the `public` branch): no local-only folders
// (rating rounds, reference screenshots, Apple bezels and fonts, private notes) and none of
// the words in ~/.storeshots/private-patterns.txt (one per line, case-insensitive; # comments)
// anywhere in a path or a file. A line "allow: <text>" lets through hits that contain <text>
// (something published on purpose). Exits 1 and lists every hit when anything is found.
//
//   node scripts/publish-check.mjs [ref]
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const ref = process.argv[2] ?? 'public';
const git = (...args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 1 << 28 });

// Folders and files that stay on this machine whatever their content.
const LOCAL_ONLY = [
  [/^evals\//, 'rating rounds'],
  [/^references\//, 'other apps\' screenshots'],
  [/^frames\//, 'Apple bezels'],
  [/^fonts\//, 'local fonts (Apple licence)'],
  [/(^|\/)SF-(Pro|Compact|Mono)[^/]*\.(otf|ttf)$/i, 'Apple font'],
  [/^docs\/private\//, 'private notes'],
  [/^docs\/inspiration\//, 'collected screenshots'],
  [/^examples\/(?!(bloomling|truesky)\/|README\.md$)/, 'example other than Bloomling and TrueSky'],
  [/^examples\/[^/]+\/store\/output\//, 'generated files'],
  [/(^|\/)\.env$/, 'secrets'],
];

const problems = [];
const paths = git('ls-tree', '-r', '--name-only', ref).split('\n').filter(Boolean);
for (const path of paths) for (const [rule, why] of LOCAL_ONLY) if (rule.test(path)) problems.push(`${path}: ${why}`);

const patternsFile = join(homedir(), '.storeshots', 'private-patterns.txt');
if (!existsSync(patternsFile)) problems.push(`no ${patternsFile}: list the private names (apps, people, hosts, paths) to keep out, one per line`);
else {
  const lines = readFileSync(patternsFile, 'utf8').split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
  const allowed = lines.filter(l => l.startsWith('allow:')).map(l => l.slice(6).trim()), words = lines.filter(l => !l.startsWith('allow:'));
  for (const path of paths) for (const w of words) if (path.toLowerCase().includes(w.toLowerCase())) problems.push(`${path}: path contains "${w}"`);
  let hits = '';
  try { hits = git('grep', '-I', '-n', '-i', '-F', ...words.flatMap(w => ['-e', w]), ref, '--'); } catch (e) { if (e.status !== 1) throw e; } // 1 = no match
  for (const line of hits.split('\n').filter(Boolean)) if (!allowed.some(a => line.includes(a))) problems.push(line.replace(`${ref}:`, '').slice(0, 200));
}

if (problems.length) {
  console.error(`${ref}: ${problems.length} problem(s), do not publish\n${problems.map(p => `  ${p}`).join('\n')}`);
  process.exit(1);
}
console.error(`${ref}: ${paths.length} files, nothing private`);

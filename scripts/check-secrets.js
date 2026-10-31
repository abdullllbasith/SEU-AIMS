#!/usr/bin/env node
/**
 * Lightweight secret leak scan. Not a substitute for gitleaks in CI history.
 *
 * It scans every file git could commit: tracked files plus untracked files that are not ignored.
 * A developer's own gitignored .env (real local credentials) cannot be committed, so it is not a leak
 * and is not scanned. A real .env file that is TRACKED by git fails the check outright, whatever it
 * contains. Outside a git checkout it falls back to scanning the whole working tree.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const skipDir = new Set([
  'node_modules',
  '.git',
  'dist',
  'coverage',
  '.local-storage',
  'playwright-report',
  'test-results',
]);

const patterns = [
  { name: 'private-key', re: /-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
  { name: 'aws-access-key', re: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: 'generic-pem-assignment', re: /WHATSAPP_CLOUD_API_ACCESS_TOKEN=\S+/ },
  { name: 'mongo-password-uri', re: /mongodb(\+srv)?:\/\/[^/\s:]+:[^/\s@]+@/ },
];

const allowFile = (file) =>
  file.endsWith('.env.example') ||
  file.includes(`${path.sep}docs${path.sep}`) ||
  file.endsWith('check-secrets.js') ||
  file.endsWith('check-frontend-bundle.js');

const NUL = String.fromCharCode(0);

function git(args) {
  return execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
    maxBuffer: 64 * 1024 * 1024,
  })
    .split(NUL)
    .filter(Boolean);
}

/** Absolute paths git would commit, or null when this is not a git checkout. */
function committableFiles() {
  try {
    return git(['ls-files', '--cached', '--others', '--exclude-standard', '-z']).map((rel) => path.join(root, rel));
  } catch {
    return null;
  }
}

/** Real environment files (.env or .env.<name>, except .env.example) must never be tracked by git. */
function trackedEnvFiles() {
  try {
    return git(['ls-files', '-z']).filter(
      (rel) => /(^|\/)\.env(\..+)?$/.test(rel) && !rel.endsWith('.env.example'),
    );
  } catch {
    return [];
  }
}

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (skipDir.has(entry.name)) {
      continue;
    }
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, files);
    } else if (entry.isFile()) {
      files.push(full);
    }
  }
  return files;
}

const inSkippedDir = (file) =>
  path
    .relative(root, file)
    .split(path.sep)
    .some((part) => skipDir.has(part));

const hits = trackedEnvFiles().map((rel) => `${rel}: env-file-tracked-by-git`);
const committable = committableFiles();
const files = committable ? committable.filter((file) => !inSkippedDir(file) && fs.existsSync(file)) : walk(root);

for (const file of files) {
  const rel = path.relative(root, file);
  if (allowFile(rel)) {
    continue;
  }
  if (!/\.(js|jsx|mjs|cjs|json|yml|yaml|md|env|conf|html|txt)$/i.test(file) && !file.endsWith('Dockerfile.api')) {
    continue;
  }
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    continue;
  }
  for (const pattern of patterns) {
    if (pattern.re.test(text)) {
      hits.push(`${rel}: ${pattern.name}`);
    }
  }
}

if (hits.length) {
  process.stderr.write(`Secret scan failed:\n${hits.join('\n')}\n`);
  process.exit(1);
}

process.stdout.write('Secret scan passed (every committable file checked; no real .env file is tracked).\n');

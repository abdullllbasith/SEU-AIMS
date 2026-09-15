#!/usr/bin/env node
/**
 * Lightweight secret leak scan of the working tree. Not a substitute for gitleaks in CI history.
 */
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

const hits = [];
for (const file of walk(root)) {
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

process.stdout.write('Secret scan passed (pattern check of working tree).\n');

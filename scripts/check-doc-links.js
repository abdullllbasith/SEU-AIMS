#!/usr/bin/env node
/**
 * Checks relative Markdown links under SEU-AIMS (not http/https/mailto/anchors).
 */
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const skipDir = new Set(['node_modules', '.git', 'dist', 'coverage', '.local-storage']);
const linkRe = /\[[^\]]*\]\(([^)]+)\)/g;

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (skipDir.has(entry.name)) {
      continue;
    }
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, files);
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      files.push(full);
    }
  }
  return files;
}

const missing = [];
for (const file of walk(root)) {
  const text = fs.readFileSync(file, 'utf8');
  let match;
  const relFile = path.relative(root, file);
  while ((match = linkRe.exec(text))) {
    let target = match[1].trim();
    if (!target || target.startsWith('http') || target.startsWith('mailto:') || target.startsWith('#')) {
      continue;
    }
    target = target.split('#')[0];
    if (!target) {
      continue;
    }
    const resolved = path.resolve(path.dirname(file), target);
    if (!fs.existsSync(resolved)) {
      missing.push(`${relFile} → ${target}`);
    }
  }
}

if (missing.length) {
  process.stderr.write(`Broken Markdown links:\n${missing.join('\n')}\n`);
  process.exit(1);
}

process.stdout.write('Documentation relative links resolved.\n');

#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const dist = path.resolve(process.cwd(), 'frontend/dist');
if (!fs.existsSync(dist)) {
  process.stderr.write('frontend/dist is missing; run npm run build first\n');
  process.exit(1);
}

const forbidden = ['AUTH_JWT_SECRET=', 'correcthorse', 'mongodb+srv://', 'BEGIN PRIVATE KEY'];
const files = fs.readdirSync(dist, { recursive: true }).filter((name) => /\.(js|html|css|map)$/i.test(name));
const hits = [];
for (const file of files) {
  const full = path.join(dist, file);
  if (!fs.statSync(full).isFile()) {
    continue;
  }
  const text = fs.readFileSync(full, 'utf8');
  for (const needle of forbidden) {
    if (text.includes(needle)) {
      hits.push(`${file}: ${needle}`);
    }
  }
}

const index = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
if (index.includes('AUTH_JWT_SECRET')) {
  hits.push('index.html contains AUTH_JWT_SECRET');
}

if (hits.length) {
  process.stderr.write(`Bundle leak check failed:\n${hits.join('\n')}\n`);
  process.exit(1);
}

const js = files.find((name) => name.endsWith('.js') && name.includes('assets'));
process.stdout.write(`Bundle leak check passed (${files.length} files). Primary JS: ${js || 'n/a'}\n`);

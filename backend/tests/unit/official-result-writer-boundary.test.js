import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
  OFFICIAL_RESULT_CHANGE_KINDS,
  applyOfficialResultChange,
} from '../../src/modules/results/services/official-result-writer.js';

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const srcRoot = path.join(backendRoot, 'src');
const WRITER = path.join('modules', 'results', 'services', 'official-result-writer.js');
/** Writes only period and offering fields. Checked separately below. */
const PERIOD_REALIGN = path.join('modules', 'results', 'services', 'realign-result-periods.js');

const WRITE_PATTERNS = [
  /AcademicResult\.(create|insertMany|updateOne|updateMany|bulkWrite|findOneAndUpdate|findByIdAndUpdate|findOneAndReplace|replaceOne|deleteOne|deleteMany|findOneAndDelete|findByIdAndDelete)\b/,
  /new\s+AcademicResult\s*\(/,
  /\.resultCode\s*=(?!=)/,
];

function sourceFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...sourceFiles(full));
    } else if (full.endsWith('.js')) {
      out.push(full);
    }
  }
  return out;
}

test('no code outside the official result writer changes an official grade', () => {
  const offenders = [];
  for (const file of sourceFiles(srcRoot)) {
    const relative = path.relative(srcRoot, file);
    if (relative === WRITER || relative === PERIOD_REALIGN) {
      continue;
    }
    const text = readFileSync(file, 'utf8');
    for (const pattern of WRITE_PATTERNS) {
      if (pattern.test(text)) {
        offenders.push(`${relative} matches ${pattern}`);
      }
    }
  }
  assert.deepEqual(offenders, [], 'Grade writes must go through applyOfficialResultChange');
});

test('period realignment never touches the grade fields', () => {
  const text = readFileSync(path.join(srcRoot, PERIOD_REALIGN), 'utf8');
  assert.equal(/resultCode|rawResultCode|previousResultCode|gradeCap|isEca/.test(text), false);
});

test('writer refuses unknown kinds, missing actor and non-writable fields', async () => {
  const base = { principal: { userId: 'u1' }, existing: null, identity: {}, fields: {} };
  await assert.rejects(() => applyOfficialResultChange({ ...base, kind: 'ANYTHING' }), /Unknown official result change kind/);
  await assert.rejects(
    () => applyOfficialResultChange({ ...base, kind: OFFICIAL_RESULT_CHANGE_KINDS.IMPORT_COMMIT, principal: {} }),
    /acting user/,
  );
  await assert.rejects(
    () =>
      applyOfficialResultChange({
        ...base,
        kind: OFFICIAL_RESULT_CHANGE_KINDS.IMPORT_COMMIT,
        fields: { version: 99 },
      }),
    /not writable/,
  );
});

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const catalogPath = join(dirname(fileURLToPath(import.meta.url)), 'dict-seusl-catalog.json');

/** Local snapshot of the DICT SEUSL GPA calculator curriculum. Import never calls GitHub. */
export const DICT_SEUSL_CATALOG = JSON.parse(readFileSync(catalogPath, 'utf8'));

import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const { B1_TOPICS, isValidB1Topic, normalizeB1Topic } = require(path.join(ROOT, 'js', 'data', 'b1Topics.js'));

export { B1_TOPICS, isValidB1Topic, normalizeB1Topic };

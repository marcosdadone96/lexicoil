import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const file = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'js', 'appFeatures.js');
let s = fs.readFileSync(file, 'utf8');

const reps = [
  [/setLoaderStep\('Checking exam library[^']*', 'Looking for a matching practice exam[^']*'\)/,
    "setLoaderStep('Checking exam library\\u2026', 'Looking for a matching practice exam\\u2026')"],
  [/setLoaderStep\('Loading from exam library[^']*', 'Serving a shared practice exam[^']*'\)/,
    "setLoaderStep('Loading from exam library\\u2026', 'Serving a shared practice exam \\u2014 no quota used.')"],
  [/setLoaderStep\('Generating with AI[^']*', 'Creating all modules to official standards[^']*'\)/,
    "setLoaderStep('Generating with AI\\u2026', 'Creating all modules to official standards\\u2026')"],
  [/setLoaderStep\('Processing[^']*', 'Almost ready[^']*'\)/,
    "setLoaderStep('Processing\\u2026', 'Almost ready\\u2026')"],
  [/confirm\('This is taking longer than usual[^']*'\)/,
    "confirm('This is taking longer than usual. Keep waiting?')"],
  [/callAI\(examPromptFor\(topic\), 7000, \{ consumeQuota: true \}\)/,
    'callAI(examPromptFor(topic), 7000, { consumeQuota: true, timeoutMs: 120000 })'],
];

for (const [re, rep] of reps) {
  s = s.replace(re, rep);
}

fs.writeFileSync(file, s, 'utf8');
console.log('fixed appFeatures.js');

/**
 * Repo root resolution for terminal ESM and Netlify bundled functions (import.meta may be empty).
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

export function findPackageRoot() {
  const candidates = [];
  if (import.meta.url) {
    candidates.push(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..'));
  }
  candidates.push(process.cwd());
  const seen = new Set();
  for (let root of candidates) {
    root = path.resolve(root);
    if (seen.has(root)) continue;
    seen.add(root);
    if (fs.existsSync(path.join(root, 'js', 'engine', 'validation', 'ExamValidator.js'))) {
      return root;
    }
  }
  return process.cwd();
}

export function packageRoot() {
  return findPackageRoot();
}

export function createRootRequire() {
  return createRequire(pathToFileURL(path.join(findPackageRoot(), 'package.json')));
}

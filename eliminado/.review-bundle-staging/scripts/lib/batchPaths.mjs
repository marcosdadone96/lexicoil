import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './loadEnv.mjs';

export const MERGED_DIR = path.join(ROOT, 'batches', 'merged');
export const REJECTED_DIR = path.join(ROOT, 'batches', 'rejected');
export const LOG_DIR = path.join(ROOT, 'batches', 'logs');
export const GENERATED_DIR = path.join(ROOT, 'batches', 'generated');
export const READY_DIR = path.join(ROOT, 'batches', 'ready');
export const READY_LESEN_DIR = path.join(READY_DIR, 'lesen');
export const POOL_FILE = path.join(ROOT, 'library', 'reusable-seed', 'de_B1.json');

export function rejectBatchFile(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  fs.mkdirSync(REJECTED_DIR, { recursive: true });
  const base = path.basename(filePath);
  let dest = path.join(REJECTED_DIR, base);
  if (fs.existsSync(dest)) {
    dest = path.join(REJECTED_DIR, `${Date.now()}-${base}`);
  }
  fs.renameSync(filePath, dest);
  return path.relative(ROOT, dest).replace(/\\/g, '/');
}

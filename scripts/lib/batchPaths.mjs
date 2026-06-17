import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './loadEnv.mjs';

export const MERGED_DIR = path.join(ROOT, 'batches', 'merged');
export const REJECTED_DIR = path.join(ROOT, 'batches', 'rejected');
export const LOG_DIR = path.join(ROOT, 'batches', 'logs');

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

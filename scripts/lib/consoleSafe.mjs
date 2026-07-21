/**
 * ASCII-safe console helpers for Windows terminals (cp437 / legacy code pages).
 */
import { spawnSync } from 'node:child_process';

let utf8SetupDone = false;

/** Best-effort UTF-8 code page on Windows; no-op elsewhere. */
export function setupConsoleUtf8() {
  if (utf8SetupDone) return;
  utf8SetupDone = true;
  if (process.platform !== 'win32') return;
  try {
    spawnSync('chcp', ['65001'], { shell: true, stdio: 'ignore' });
  } catch {
    /* non-fatal */
  }
}

export const HR = '='.repeat(60);
export const HR_DOUBLE = '='.repeat(60);

export function hrDouble() {
  return HR_DOUBLE;
}

export function boxTop(title = '') {
  const inner = title ? ` ${title} ` : '';
  return `+${'-'.repeat(Math.max(58, inner.length + 2))}+`;
}

export function boxLine(text = '') {
  return `| ${String(text).padEnd(56)} |`;
}

export function boxBottom() {
  return `+${'-'.repeat(58)}+`;
}

export const MARK_OK = '[OK]';
export const MARK_FAIL = '[FAIL]';

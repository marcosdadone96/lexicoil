#!/usr/bin/env node
/**
 * Lightweight secret guard — run before commit: npm run precommit:secrets
 * 1) Fails if .env or *.zip is staged
 * 2) Scans tracked files for common live-secret patterns
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const SCAN_SKIP = new Set([
  '.env.example',
  'SECURITY.md',
  'docs/audit/01_SECURITY_SECRETS/SECRETS_INVENTORY.md',
  'scripts/precommit-secrets.mjs',
]);

const SECRET_PATTERNS = [
  { name: 'Stripe live secret', re: /sk_live_[0-9a-zA-Z]{10,}/ },
  { name: 'Stripe test secret (long)', re: /sk_test_[0-9a-zA-Z]{10,}/ },
  { name: 'Stripe webhook secret', re: /whsec_[0-9a-zA-Z]{10,}/ },
  { name: 'Anthropic API key', re: /sk-ant-api[0-9A-Za-z_-]{10,}/ },
  { name: 'Supabase JWT (long)', re: /eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.[A-Za-z0-9_-]{20,}/ },
];

function git(args) {
  try {
    return execSync(`git ${args}`, { cwd: ROOT, encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

function fail(msg) {
  console.error(`\nprecommit:secrets FAILED\n${msg}\n`);
  process.exit(1);
}

function checkStaged() {
  const statusLines = git('diff --cached --name-status').split('\n').filter(Boolean);
  const blocked = [];
  for (const line of statusLines) {
    const tab = line.indexOf('\t');
    if (tab < 0) continue;
    const status = line.slice(0, tab).trim();
    const file = line.slice(tab + 1).trim();
    const base = path.basename(file);
    if (base === '.env' || (base.startsWith('.env.') && base !== '.env.example')) {
      blocked.push(file);
      continue;
    }
    if (/\.zip$/i.test(file) || /\.dist\.zip$/i.test(file)) {
      // Allow removing a previously tracked zip from the index (git rm --cached)
      if (status === 'D' || status.startsWith('D')) continue;
      blocked.push(file);
    }
  }
  if (blocked.length) {
    fail(
      'Blocked files staged for commit:\n' +
        blocked.map((f) => `  - ${f}`).join('\n') +
        '\n\nNever commit .env or zip archives. Unstage with: git reset HEAD -- <file>'
    );
  }
}

function listTrackedFiles() {
  return git('ls-files')
    .split('\n')
    .filter(Boolean)
    .filter((f) => !SCAN_SKIP.has(f.replace(/\\/g, '/')));
}

function scanTrackedSecrets() {
  const hits = [];
  for (const rel of listTrackedFiles()) {
    const abs = path.join(ROOT, rel);
    if (!fs.existsSync(abs) || fs.statSync(abs).size > 2_000_000) continue;
    let text;
    try {
      text = fs.readFileSync(abs, 'utf8');
    } catch {
      continue;
    }
    if (text.includes('\0')) continue;
    for (const { name, re } of SECRET_PATTERNS) {
      if (re.test(text)) hits.push({ file: rel, pattern: name });
    }
  }
  if (hits.length) {
    fail(
      'Possible live secrets in tracked files:\n' +
        hits.map((h) => `  - ${h.file} (${h.pattern})`).join('\n') +
        '\n\nReplace with process.env reads and rotate any exposed credentials.'
    );
  }
}

checkStaged();
scanTrackedSecrets();
console.log('OK   precommit:secrets — no staged secrets or suspicious patterns');

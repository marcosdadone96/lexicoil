#!/usr/bin/env node
/**
 * Pool health dashboard — usage audit + sync coverage snapshot.
 *   node scripts/pool-health-dashboard.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { ROOT } from './lib/loadEnv.mjs';

const OUT = path.join(ROOT, 'batches/ready/gate-logs/pool-health-dashboard.json');
const AUDIT_SCRIPT = path.join(ROOT, 'scripts/audit-pool-verified-usage.mjs');

execSync(`node "${AUDIT_SCRIPT}"`, { stdio: 'inherit', cwd: ROOT });

const auditPath = path.join(ROOT, 'batches/ready/gate-logs/pool-verified-usage-audit-2026-07-16.json');
const audit = fs.existsSync(auditPath) ? JSON.parse(fs.readFileSync(auditPath, 'utf8')) : null;

const syncLog = path.join(ROOT, 'batches/ready/gate-logs/auto-sync-personal-pool.jsonl');
let recentSyncs = [];
if (fs.existsSync(syncLog)) {
  recentSyncs = fs
    .readFileSync(syncLog, 'utf8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .slice(-20)
    .map((line) => JSON.parse(line));
}

const dashboard = {
  at: new Date().toISOString(),
  autoSyncEnabled: process.env.AUTO_SYNC_PERSONAL_POOL !== '0',
  autoPublishEnabled: process.env.AUTO_PUBLISH_EXAMS !== '0',
  poolVerified: audit?.totals || null,
  byTeil: audit?.byTeil || null,
  orphanSample: (audit?.rows || []).filter((r) => r.usage === 'orphan').slice(0, 10).map((r) => r.file),
  recentAutoSyncs: recentSyncs,
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, `${JSON.stringify(dashboard, null, 2)}\n`);

console.log('\n── Pool health dashboard ──');
console.log(`  pool-verified total : ${dashboard.poolVerified?.total ?? '?'}`);
console.log(`  used (any vía)      : ${dashboard.poolVerified?.usedAny ?? '?'}`);
console.log(`  orphans             : ${dashboard.poolVerified?.orphan ?? '?'}`);
console.log(`  auto-sync hook      : ${dashboard.autoSyncEnabled ? 'ON' : 'OFF'}`);
console.log(`  auto-publish hook   : ${dashboard.autoPublishEnabled ? 'ON' : 'OFF'}`);
console.log(`  recent sync events  : ${recentSyncs.length}`);
console.log(`\nDashboard: ${path.relative(ROOT, OUT)}`);

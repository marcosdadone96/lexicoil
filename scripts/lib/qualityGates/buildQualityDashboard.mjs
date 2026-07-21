/**
 * buildQualityDashboard.mjs — aggregate quality reports → QUALITY-DASHBOARD.json
 */
import fs from 'node:fs';
import path from 'node:path';

/**
 * @param {object[]} reports — runQualityGates outputs
 */
export function buildQualityDashboard(reports = []) {
  const counts = { PASS: 0, WARNING: 0, FAIL: 0 };
  const issueFreq = new Map();

  for (const r of reports) {
    const st = String(r.status || 'FAIL').toUpperCase();
    if (counts[st] != null) counts[st]++;
    else counts.FAIL++;
    for (const g of r.gates || []) {
      for (const err of g.errors || []) {
        const key = String(err).split(':')[0];
        issueFreq.set(key, (issueFreq.get(key) || 0) + 1);
      }
    }
  }

  const topIssues = [...issueFreq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([issue, count]) => ({ issue, count }));

  return {
    generatedAt: new Date().toISOString(),
    total: reports.length,
    pass: counts.PASS,
    warning: counts.WARNING,
    fail: counts.FAIL,
    topIssues,
    policyNote: 'Dashboard is measurement-only; promotion blocking depends on qualityGatePolicy.mode',
  };
}

export function writeQualityDashboard(reports, outPath) {
  const dash = buildQualityDashboard(reports);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(dash, null, 2)}\n`, 'utf8');
  return dash;
}

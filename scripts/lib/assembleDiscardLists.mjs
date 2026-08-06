/**
 * assembleDiscardLists.mjs — partIds / basenames blocked from exam assembly.
 *
 * Sources:
 *  - batches/ready/gate-logs/Q2-LENA-CLUSTER-DISCARD.json (and any *DISCARD*.json there)
 *  - batches/ready/PENDING-CONTENT-FIXES.json (manual review backlog)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
const GATE_LOGS = path.join(ROOT, 'batches/ready/gate-logs');
const PENDING_FIXES = path.join(ROOT, 'batches/ready/PENDING-CONTENT-FIXES.json');

function stem(name) {
  return String(name || '')
    .replace(/^.*[/\\]/, '')
    .replace(/\.json$/i, '')
    .trim();
}

function addId(set, raw, sources, sourceLabel) {
  const id = stem(raw);
  if (!id) return;
  set.add(id);
  if (!sources.has(id)) sources.set(id, []);
  sources.get(id).push(sourceLabel);
}

/**
 * @returns {{ blockedIds: Set<string>, sources: Map<string, string[]>, lists: object[] }}
 */
export function loadAssembleDiscardLists(opts = {}) {
  const blockedIds = new Set();
  const sources = new Map();
  const lists = [];

  const gateDir = opts.gateLogsDir || GATE_LOGS;
  if (fs.existsSync(gateDir)) {
    for (const name of fs.readdirSync(gateDir)) {
      if (!/DISCARD/i.test(name) || !name.endsWith('.json')) continue;
      const abs = path.join(gateDir, name);
      let doc;
      try {
        doc = JSON.parse(fs.readFileSync(abs, 'utf8'));
      } catch {
        continue;
      }
      const action = String(doc.action || '').toLowerCase();
      if (action && action !== 'no-promote' && action !== 'discard' && action !== 'block') {
        continue;
      }
      const files = Array.isArray(doc.files) ? doc.files : [];
      for (const entry of files) {
        const file = typeof entry === 'string' ? entry : entry?.file || entry?.path || entry?.id;
        addId(blockedIds, file, sources, name);
        if (entry?.itemId) addId(blockedIds, entry.itemId, sources, name);
      }
      lists.push({ file: name, count: files.length, action: doc.action || 'no-promote' });
    }
  }

  const pendingPath = opts.pendingFixesPath || PENDING_FIXES;
  if (fs.existsSync(pendingPath)) {
    let doc;
    try {
      doc = JSON.parse(fs.readFileSync(pendingPath, 'utf8'));
    } catch {
      doc = null;
    }
    if (doc) {
      const entries = Array.isArray(doc.partIds)
        ? doc.partIds
        : Array.isArray(doc.items)
          ? doc.items
          : [];
      for (const entry of entries) {
        const id = typeof entry === 'string' ? entry : entry?.partId || entry?.file || entry?.id;
        const status = String(entry?.status || 'pending').toLowerCase();
        if (status === 'fixed' || status === 'resolved' || status === 'ok') continue;
        addId(blockedIds, id, sources, 'PENDING-CONTENT-FIXES.json');
        // Also block bare bundle name without -t1/-t2/-t3
        const s = stem(id);
        if (/-t[123]$/i.test(s)) addId(blockedIds, s.replace(/-t[123]$/i, ''), sources, 'PENDING-CONTENT-FIXES.json');
      }
      lists.push({
        file: 'PENDING-CONTENT-FIXES.json',
        count: entries.filter((e) => String(e?.status || 'pending').toLowerCase() === 'pending').length,
        action: 'pending-fix',
      });
    }
  }

  return { blockedIds, sources, lists };
}

/** True if partId or its file basename is on a discard/pending list. */
export function isAssembleBlocked(partIdOrFile, blockedIds) {
  if (!blockedIds?.size) return false;
  const id = stem(partIdOrFile);
  if (blockedIds.has(id)) return true;
  // schreiben-gemini-003-t1 → also check schreiben-gemini-003
  if (/-t[123]$/i.test(id) && blockedIds.has(id.replace(/-t[123]$/i, ''))) return true;
  return false;
}

export function formatDiscardSummary({ blockedIds, lists }) {
  const lines = [
    `Discard/pending lists: ${lists.length} · blocked ids: ${blockedIds.size}`,
  ];
  for (const l of lists) {
    lines.push(`  · ${l.file} (${l.action}, ${l.count} entries)`);
  }
  return lines.join('\n');
}

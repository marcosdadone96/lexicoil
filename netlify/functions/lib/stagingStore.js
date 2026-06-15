'use strict';

function stagingCandidateKey(lang, level, id) {
  return `staging_candidate:${lang}:${level}:${id}`;
}

function stagingIndexKey(lang, level) {
  return `staging_index:${lang}:${level}`;
}

async function loadStagingIndex(store, lang, level) {
  try {
    const index = await store.get(stagingIndexKey(lang, level), { type: 'json' });
    return Array.isArray(index) ? index : [];
  } catch (_) {
    return [];
  }
}

async function saveStagingIndex(store, lang, level, index) {
  await store.setJSON(stagingIndexKey(lang, level), index.slice(-500));
}

async function loadStagingCandidate(store, lang, level, id) {
  try {
    return await store.get(stagingCandidateKey(lang, level, id), { type: 'json' });
  } catch (_) {
    return null;
  }
}

async function saveStagingCandidate(store, lang, level, candidate) {
  await store.setJSON(stagingCandidateKey(lang, level, candidate.id), candidate);
}

function passagesFromCandidate(candidate) {
  const list = [];
  if (Array.isArray(candidate.passages)) list.push(...candidate.passages);
  else if (candidate.passage?.id && candidate.passage.text) list.push(candidate.passage);
  return list;
}

function mergeCandidateIntoBank(bank, candidate) {
  for (const p of passagesFromCandidate(candidate)) {
    if (!p?.id || !p.text) continue;
    if (!bank.passages.some((row) => row.id === p.id)) {
      bank.passages.push({
        id: p.id,
        module: p.module || candidate.module,
        title: p.title || '',
        text: p.text,
      });
    }
  }
  const qIds = new Set(bank.questions.map((q) => q.id));
  for (const q of candidate.questions || []) {
    if (qIds.has(q.id)) continue;
    bank.questions.push(q);
    qIds.add(q.id);
  }
}

function candidateSummary(candidate) {
  const firstQ = candidate.questions?.[0]?.question || '';
  const passageStart = candidate.passage?.text?.slice(0, 120) || '';
  return {
    id: candidate.id,
    lang: candidate.lang,
    level: candidate.level,
    module: candidate.module,
    teil: candidate.teil,
    status: candidate.status,
    createdAt: candidate.provenance?.createdAt || candidate.createdAt || null,
    questionPreview: firstQ.slice(0, 120),
    passagePreview: passageStart,
    contributor: candidate.contributor || null,
  };
}

async function listStagingByStatus(store, lang, level, status) {
  const index = await loadStagingIndex(store, lang, level);
  const rows = index.filter((row) => row.status === status);
  const out = [];
  for (const row of rows) {
    const candidate = await loadStagingCandidate(store, lang, level, row.id);
    if (candidate && candidate.status === status) out.push(candidate);
  }
  return out;
}

async function updateCandidateStatus(store, lang, level, id, status) {
  const candidate = await loadStagingCandidate(store, lang, level, id);
  if (!candidate) return null;
  candidate.status = status;
  candidate.review = {
    ...(candidate.review || {}),
    reviewedAt: new Date().toISOString(),
  };
  await saveStagingCandidate(store, lang, level, candidate);

  const index = await loadStagingIndex(store, lang, level);
  const row = index.find((r) => r.id === id);
  if (row) {
    row.status = status;
    await saveStagingIndex(store, lang, level, index);
  }
  return candidate;
}

module.exports = {
  stagingCandidateKey,
  stagingIndexKey,
  loadStagingIndex,
  saveStagingIndex,
  loadStagingCandidate,
  saveStagingCandidate,
  passagesFromCandidate,
  mergeCandidateIntoBank,
  candidateSummary,
  listStagingByStatus,
  updateCandidateStatus,
};

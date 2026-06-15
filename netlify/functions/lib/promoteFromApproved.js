'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { randomUUID } = require('crypto');
const { publishPoolExam } = require('./poolIndex.js');
const { validateGeneratedExam } = require('./examQualityGate.js');
const {
  loadStagingIndex,
  saveStagingIndex,
  listStagingByStatus,
  mergeCandidateIntoBank,
  updateCandidateStatus,
  saveStagingCandidate,
} = require('./stagingStore.js');

const MAX_PROMOTIONS_PER_CALL = 5;

let _engine;
function loadEngine() {
  if (_engine) return _engine;
  const ExamBlueprint = require('../../../js/library/ExamBlueprint.js');
  globalThis.ExamBlueprint = ExamBlueprint;
  require('../../../js/library/LibraryLoader.js');
  globalThis.PassageResolver = require('../../../js/library/PassageResolver.js');
  const ExamBuilder = require('../../../js/library/ExamBuilder.js');
  const ExamValidator = require('../../../js/engine/validation/ExamValidator.js');
  globalThis.ExamValidator = ExamValidator;
  _engine = { ExamBlueprint, ExamBuilder, ExamValidator };
  return _engine;
}

function resolveRepoPath(...segments) {
  const candidates = [
    path.join(__dirname, '..', '..', '..', ...segments),
    path.join(__dirname, '..', '..', ...segments),
  ];
  for (const file of candidates) {
    if (fs.existsSync(file)) return file;
  }
  return null;
}

function loadStaticBank(lang, level) {
  const file = resolveRepoPath('library', lang, level, 'questions.json');
  if (!file) {
    return {
      meta: { language: lang, level, version: 1 },
      passages: [],
      questions: [],
    };
  }
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function loadBlueprint(lang, level) {
  const { ExamBlueprint } = loadEngine();
  const id = ExamBlueprint.INDEX[`${lang}_${level}`];
  if (!id) throw new Error(`No blueprint for ${lang}/${level}`);
  const file = resolveRepoPath('library', 'blueprints', `${id}.json`);
  if (!file) throw new Error(`Blueprint file missing: ${id}`);
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function filteredBank(bank, usedIds) {
  return {
    ...bank,
    passages: bank.passages || [],
    questions: (bank.questions || []).filter((q) => !usedIds.has(q.id)),
  };
}

function partMinTarget(blueprint, module, teil) {
  for (const mod of blueprint.modules || []) {
    if (mod.id !== module) continue;
    for (const part of mod.parts || []) {
      if (part.teil === teil) {
        return part.questionsTotal?.min || part.itemsTotal || 1;
      }
    }
  }
  return 1;
}

function buildCombinedBank(staticBank, approvedCandidates, blueprint) {
  const approvedBySlot = new Map();
  for (const c of approvedCandidates) {
    if (c.module == null || c.teil == null) continue;
    approvedBySlot.set(`${c.module}:${c.teil}`, c);
  }

  const staticQuestions = (staticBank.questions || []).filter((q) => {
    const teil = q.teil ?? q.part;
    const slot = `${q.module}:${teil}`;
    const approved = approvedBySlot.get(slot);
    if (!approved) return true;
    const minTarget = blueprint ? partMinTarget(blueprint, q.module, teil) : 1;
    const approvedCount = (approved.questions || []).length;
    return approvedCount < minTarget;
  });

  const bank = {
    meta: { ...(staticBank.meta || {}) },
    passages: [...(staticBank.passages || [])],
    questions: [...staticQuestions],
  };
  for (const candidate of approvedCandidates) {
    mergeCandidateIntoBank(bank, candidate);
  }
  return bank;
}

function approvedModules(candidates) {
  return new Set(candidates.map((c) => c.module).filter(Boolean));
}

function hasRequiredModuleCoverage(candidates, blueprint) {
  const modules = approvedModules(candidates);
  for (const mod of blueprint.modules || []) {
    if (!modules.has(mod.id)) return false;
  }
  return (blueprint.modules || []).length > 0;
}

function candidatesUsingQuestions(candidates, selectedIds) {
  const used = new Set();
  for (const c of candidates) {
    const qIds = (c.questions || []).map((q) => q.id);
    if (qIds.some((id) => selectedIds.has(id))) used.add(c.id);
  }
  return used;
}

function genericPoolTopic(lang, level) {
  const labels = { de: 'Goethe', en: 'Cambridge', es: 'DELE' };
  return `${labels[lang] || lang.toUpperCase()} ${level} practice exam`;
}

function examSignature(selected) {
  return crypto
    .createHash('sha256')
    .update(selected.map((q) => q.id).sort().join(','))
    .digest('hex')
    .slice(0, 12);
}

/**
 * If approved staging parts + static bank can form complete exams, publish to pool.
 * Returns number of exams published this call.
 */
async function maybePromote(store, lang, level, opts = {}) {
  const normalizedLang = String(lang || '').trim().toLowerCase();
  const normalizedLevel = String(level || '').trim().toUpperCase();
  if (!normalizedLang || !normalizedLevel) return 0;

  const { ExamBlueprint, ExamBuilder, ExamValidator } = loadEngine();
  const blueprint = loadBlueprint(normalizedLang, normalizedLevel);
  const staticBank = opts.staticBank || loadStaticBank(normalizedLang, normalizedLevel);

  let published = 0;
  const usedQuestionIds = new Set(opts.usedQuestionIds || []);
  const usedExamSigs = new Set(opts.usedExamSigs || []);

  for (let attempt = 0; attempt < MAX_PROMOTIONS_PER_CALL; attempt++) {
    const approved = await listStagingByStatus(store, normalizedLang, normalizedLevel, 'approved');
    if (!hasRequiredModuleCoverage(approved, blueprint)) break;

    const bank = buildCombinedBank(filteredBank(staticBank, usedQuestionIds), approved, blueprint);
    if (!(bank.questions || []).length) break;

    const assembled = ExamBlueprint.assemble(bank, blueprint);
    const selected = assembled.selected || [];
    if (!selected.length) break;

    const cov = ExamBlueprint.coverageSummary(assembled.coverage);
    if (cov.ratio < 1) break;

    const consumedApproved = candidatesUsingQuestions(approved, new Set(selected.map((q) => q.id)));
    if (!consumedApproved.size) break;

    const exam = ExamBuilder.buildFromBlueprint(normalizedLang, normalizedLevel, bank, blueprint, {
      assembled,
    });
    exam.blueprintComplete = cov.ratio >= 1;
    exam.blueprintCoverage = assembled.coverage;
    exam.libraryBuilt = true;

    const check = new ExamValidator().validate(exam, { strict: false, blueprint });
    const gate = validateGeneratedExam(exam, { strict: false, blueprint });
    if (!check.valid || !gate.valid) break;

    const sig = examSignature(selected);
    if (usedExamSigs.has(sig)) break;

    const id = randomUUID();
    const topic = genericPoolTopic(normalizedLang, normalizedLevel);
    const entry = {
      lang: normalizedLang,
      level: normalizedLevel,
      topic,
      exam,
      servedCount: 0,
      createdAt: Date.now(),
      contributedBy: 'collab-bank',
      source: 'pool',
      coverageRatio: Number(cov.ratio.toFixed(2)),
      itemCount: selected.length,
    };

    await publishPoolExam(store, { lang: normalizedLang, level: normalizedLevel, id, entry });
    published++;

    selected.forEach((q) => usedQuestionIds.add(q.id));
    usedExamSigs.add(sig);

    for (const candidate of approved) {
      if (!consumedApproved.has(candidate.id)) continue;
      candidate.status = 'promoted';
      candidate.review = {
        ...(candidate.review || {}),
        reviewedAt: candidate.review?.reviewedAt || new Date().toISOString(),
        promotedAt: new Date().toISOString(),
        poolExamId: id,
      };
      await saveStagingCandidate(store, normalizedLang, normalizedLevel, candidate);
      const index = await loadStagingIndex(store, normalizedLang, normalizedLevel);
      const row = index.find((r) => r.id === candidate.id);
      if (row) {
        row.status = 'promoted';
        await saveStagingIndex(store, normalizedLang, normalizedLevel, index);
      }
    }
  }

  return published;
}

module.exports = { maybePromote, loadStaticBank, loadBlueprint, buildCombinedBank };

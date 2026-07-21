#!/usr/bin/env node
/**
 * Build review-bundle-2026-07-09.zip for external reviewer (Claude).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const STAGING = path.join(ROOT, '.review-bundle-staging');
const OUT_ZIP = path.join(ROOT, 'review-bundle-2026-07-09.zip');

const FILES = [
  // §1 Prompts / templates Lesen T1–T5
  'scripts/lib/lesenTemplatePrompt.mjs',
  'scripts/generate-lesen-part-gemini.mjs',
  'scripts/build-lesen-prompt.mjs',
  'plantillas-lesen-b1/lesen-teil1.md',
  'plantillas-lesen-b1/lesen-teil2.md',
  'plantillas-lesen-b1/lesen-teil3.md',
  'plantillas-lesen-b1/lesen-teil4.md',
  'plantillas-lesen-b1/lesen-teil5.md',
  'scripts/lib/lesenSubtypeRotation.mjs',
  'scripts/lib/t4DebateSeeds.mjs',
  'scripts/lib/userVocabPrompt.mjs',
  'scripts/lib/resolveGenerationInput.mjs',
  'scripts/lib/topicRotation.mjs',
  'scripts/lib/lexicalCheck.mjs',
  'scripts/blacklist.mjs',
  'scripts/lib/excludedPremises.mjs',
  'data/excluded-premises.json',
  'js/data/b1Topics.js',
  'scripts/lib/b1Topics.mjs',
  'js/engine/partTopicDetect.js',
  'library/vocab/de/B1.json',
  'data/coverage/weak-de_B1.json',
  'scripts/lib/wordMatchRepair.mjs',
  'scripts/lib/l2McqDistinctRepair.mjs',
  'scripts/lib/explanationRepair.mjs',
  'scripts/lib/poolFillSessionExclude.mjs',
  'library/reusable-seed/de_B1.json',
  'scripts/lib/loadEnv.mjs',
  'scripts/lib/batchPaths.mjs',
  // T3 pipeline (deterministic + template)
  'scripts/make-t3.mjs',
  'scripts/lib/t3GroupFingerprint.mjs',
  // §2 germanCapsNormalize stack
  'scripts/lib/germanCapsNormalize.mjs',
  'scripts/lib/capitalizeNouns.mjs',
  'scripts/lib/normalizeMcq.mjs',
  'scripts/lib/GERMAN-CAPS-NORMALIZE.md',
  // §3 Quality gates
  'scripts/lib/qualityGates/passageCoherenceGate.mjs',
  'scripts/lib/qualityGates/duplicateContentGate.mjs',
  'scripts/lib/qualityGates/dedupIndex.mjs',
  'scripts/lib/qualityGates/dedupCorpus.mjs',
  'scripts/lib/qualityGates/dedupNormalize.mjs',
  'scripts/lib/qualityGates/qualityGateCommon.mjs',
  // §4 Schema
  'scripts/lib/qualityGates/schema/lesen-fields.json',
  // Frontend passage rendering (evidence for markdown question)
  'js/ui/exam/examRunner.js',
  'js/ui/exam/examGeneration.js',
  'js/ui/vocabulary/tooltip.js',
];

function globT3Blueprints() {
  const dir = path.join(ROOT, 'scripts', 't3-blueprints');
  return fs.readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => `scripts/t3-blueprints/${f}`);
}

function copyFile(rel) {
  const src = path.join(ROOT, rel);
  const dest = path.join(STAGING, rel);
  if (!fs.existsSync(src)) {
    console.warn(`SKIP missing: ${rel}`);
    return false;
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  return true;
}

const t3bps = globT3Blueprints();
const allFiles = [...FILES, ...t3bps];

fs.rmSync(STAGING, { recursive: true, force: true });
fs.mkdirSync(STAGING, { recursive: true });

const copied = [];
const missing = [];
for (const rel of allFiles) {
  if (copyFile(rel)) copied.push(rel);
  else missing.push(rel);
}

const INDEX = `review-bundle-2026-07-09 — INDEX
Generated: ${new Date().toISOString()}
Purpose: External review of error patterns in Lesen tanda 2026-07-09T09:30:00Z

================================================================================
§1 PROMPTS / TEMPLATES GEMINI — Lesen Teil 1–5
================================================================================
Core prompt builder (all Teile):
  scripts/lib/lesenTemplatePrompt.mjs          buildLesenPrompt, few-shot block, length rules
  scripts/generate-lesen-part-gemini.mjs       buildLesenPromptBundle, topic/mold injection, fix retries
  scripts/build-lesen-prompt.mjs               CLI: dump full prompt per Teil
  scripts/lib/loadEnv.mjs                      ROOT path helper (import dependency)
  scripts/lib/userVocabPrompt.mjs              PALABRAS OBJETIVO / vocab preference block

Per-Teil markdown templates (loaded by lesenTemplatePrompt):
  plantillas-lesen-b1/lesen-teil1.md           T1 richtig/falsch blog
  plantillas-lesen-b1/lesen-teil2.md           T2 dual MCQ press texts
  plantillas-lesen-b1/lesen-teil3.md           T3 matching (Gemini path; factory uses make-t3)
  plantillas-lesen-b1/lesen-teil4.md           T4 forum Ja/Nein — includes [Vorname] pattern (no static name pool)
  plantillas-lesen-b1/lesen-teil5.md           T5 MCQ signs/ordnung

T4/T5 mold & debate injection:
  scripts/lib/lesenSubtypeRotation.mjs           injectT4PromptVariants, injectT5PromptVariants, subtype prefs
  scripts/lib/t4DebateSeeds.mjs                T4_DEBATE_SEEDS per topicTag
  scripts/lib/poolFillSessionExclude.mjs         session-level exclude molds for prompts
  library/reusable-seed/de_B1.json               bank seed records → exclude-molds block in T4/T5 prompts

Topic / word selection:
  js/data/b1Topics.js                            B1_TOPICS closed list (16 topics)
  scripts/lib/b1Topics.mjs                       ESM re-export
  js/engine/partTopicDetect.js                   TOPIC_KEYWORDS, detectTopic
  scripts/lib/topicRotation.mjs                  pickNextTopic, injectTopicIntoPrompt
  scripts/lib/resolveGenerationInput.mjs         resolveGenerationTopic, SAFE_B1_BY_TOPIC
  library/vocab/de/B1.json                       lemma bank for pickTargetWords
  data/coverage/weak-de_B1.json                weak-lemma generation pool
  scripts/lib/lexicalCheck.mjs + scripts/blacklist.mjs   B2/C1 blacklist filter
  scripts/lib/excludedPremises.mjs + data/excluded-premises.json   T1/T2 premise exclusions

Fix-retry prompt builders (secondary, during generation):
  scripts/lib/wordMatchRepair.mjs
  scripts/lib/l2McqDistinctRepair.mjs
  scripts/lib/explanationRepair.mjs

T3 — deterministic generator (0 API calls in factory; NOT Gemini):
  scripts/make-t3.mjs                            buildValidatedT3Part from blueprints
  scripts/t3-blueprints/*.json                   20 ad-template skeletons (${t3bps.length} files)
  scripts/lib/t3GroupFingerprint.mjs             blueprint rotation / ready-pool stats
  scripts/lib/batchPaths.mjs                     READY_LESEN_DIR path constant

NOTE: Few-shot examples are runtime data (from generated JSON), not static files.
NOTE: T4 speaker names are LLM-generated per lesen-teil4.md pattern; NO separate Vorname pool file exists.

================================================================================
§2 germanCapsNormalize — full source stack
================================================================================
  scripts/lib/germanCapsNormalize.mjs            orchestrator (decap → cap nouns → MCQ caps)
  scripts/lib/capitalizeNouns.mjs                decapitalizeMidSentence, capitalizeNounsInText + inline word lists
  scripts/lib/normalizeMcq.mjs                   normalizeBatchMcqOptionCapitalization
  scripts/lib/GERMAN-CAPS-NORMALIZE.md           design doc / version tag

All exception word lists (PURE_ADVERBS, HOMOGRAPH_RISK, NEVER_NOUN_WORDS, etc.) live inline in capitalizeNouns.mjs.
No external dictionary files.

================================================================================
§3 Quality gates (Q3-A, Q1a + dedup support)
================================================================================
  scripts/lib/qualityGates/passageCoherenceGate.mjs   Q3-A markdown / sentence-case lint
  scripts/lib/qualityGates/duplicateContentGate.mjs   Q1a exact + near duplicate
  scripts/lib/qualityGates/dedupIndex.mjs
  scripts/lib/qualityGates/dedupCorpus.mjs
  scripts/lib/qualityGates/dedupNormalize.mjs
  scripts/lib/qualityGates/qualityGateCommon.mjs

================================================================================
§4 Schema + T3 ad templates
================================================================================
  scripts/lib/qualityGates/schema/lesen-fields.json   Q4 metadata schema (lesen-fields)
  scripts/t3-blueprints/*.json                        T3 anuncio skeletons (see §1)

T4 name pools: NOT a separate config — see plantillas-lesen-b1/lesen-teil4.md + lesenSubtypeRotation.mjs

================================================================================
§5 Frontend passage.text rendering (markdown?)
================================================================================
  js/ui/exam/examRunner.js                     renderLesenPart → wrapW(part.text)
  js/ui/exam/examGeneration.js                 sanitizeExamText()
  js/ui/vocabulary/tooltip.js                  wrapW, wrapLineW, formatReadableText
  NOTES.md                                     summary for reviewer

================================================================================
FILES COPIED: ${copied.length}
${copied.map((f) => `  ${f}`).join('\n')}
${missing.length ? `\nMISSING:\n${missing.map((f) => `  ${f}`).join('\n')}` : ''}
`;

const NOTES = `# NOTES.md — Frontend markdown rendering

## passage.text in the exam UI

**Conclusion: markdown is NOT rendered.** Passage text is shown as **plain text** with HTML escaped. Sequences like \`**Öffnungszeiten:**\` appear literally to the user (this matches Q3-A \`markdown_leak\` findings on T5).

### Evidence in this bundle

1. **\`js/ui/exam/examRunner.js\`** (renderLesenPart):
   - Inserts passage via \`wrapW(part.text, ...)\` inside \`<div class="readable-text">\`.
   - No markdown parser (marked, markdown-it, etc.).

2. **\`js/ui/vocabulary/tooltip.js\`** (\`wrapW\`):
   - Calls \`sanitizeExamText(text)\` then \`wrapLineW\` / \`formatReadableText\`.
   - Vocab highlighting wraps words in \`<span class="vocab-word">\`; does not interpret \`**\`.

3. **\`js/ui/exam/examGeneration.js\`** (\`sanitizeExamText\`):
   - Strips HTML tags: \`.replace(/<\\/?[^>]+>/g, '')\`
   - Converts \`<br>\` to newlines.
   - Does **not** strip or convert markdown syntax (\`**\`, \`-\` lists, \`#\` headers).

### Implication for fixes

- T5 \`**Section:**\` headers should be **removed or converted to plain German** at generation/normalization time, not left for the UI to render.
- Newlines in passage text are preserved (dialogue formatting via \`formatReadableText\`).

### Not included

- No standalone product doc previously described this behavior; this NOTES.md is the first explicit write-up.
- Confirm manually in browser if UX changed since this snapshot.
`;

fs.writeFileSync(path.join(STAGING, 'INDEX.txt'), INDEX, 'utf8');
fs.writeFileSync(path.join(STAGING, 'NOTES.md'), NOTES, 'utf8');

if (fs.existsSync(OUT_ZIP)) fs.unlinkSync(OUT_ZIP);

// PowerShell Compress-Archive (Windows)
const stagingEsc = STAGING.replace(/'/g, "''");
const zipEsc = OUT_ZIP.replace(/'/g, "''");
execSync(
  `powershell -NoProfile -Command "Compress-Archive -Path '${stagingEsc}\\*' -DestinationPath '${zipEsc}' -Force"`,
  { stdio: 'inherit', cwd: ROOT },
);

const stat = fs.statSync(OUT_ZIP);
console.log(`\nCreated ${OUT_ZIP} (${(stat.size / 1024 / 1024).toFixed(2)} MiB, ${copied.length} files + INDEX.txt + NOTES.md)`);

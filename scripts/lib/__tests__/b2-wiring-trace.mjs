#!/usr/bin/env node
/** One-off trace for B2 wiring audit (0 API). */
import path from 'node:path';
import { ROOT } from '../loadEnv.mjs';
import { examTemplatePath } from '../examTemplatePrompt.mjs';
import { loadLesenTemplate } from '../lesenTemplatePrompt.mjs';
import { usesB1LesenT3MakeT3, usesB1LesenT4DebateSeeds } from '../a2LesenGeneration.mjs';
import { isHorenCombinedCalidadLexicoTeil } from '../horenCombinedCalidadLexico.mjs';
import { resolveVocabNarrativeThresholds } from '../vocabNarrativeCoherence.mjs';

const L = 'B2';

function lesenPath(t) {
  return `plantillas-lesen-b1/lesen-teil${t}.md (fallback; no plantillas-lesen-b2)`;
}

const rows = [];
for (let t = 1; t <= 5; t++) {
  try {
    loadLesenTemplate(t, L);
    rows.push({
      cell: `lesen-${t}`,
      template: lesenPath(t),
      makeT3: usesB1LesenT3MakeT3(L, t),
      debateT4: usesB1LesenT4DebateSeeds(L, t),
    });
  } catch (e) {
    rows.push({ cell: `lesen-${t}`, error: e.message });
  }
}
for (const [mod, teils] of [
  ['horen', [1, 2, 3, 4]],
  ['schreiben', [1, 2]],
  ['sprechen', [1, 2]],
]) {
  for (const t of teils) {
    try {
      rows.push({
        cell: `${mod}-${t}`,
        template: path.relative(ROOT, examTemplatePath(mod, t, L)).replace(/\\/g, '/'),
        combined: mod === 'horen' ? isHorenCombinedCalidadLexicoTeil(t, L) : undefined,
      });
    } catch (e) {
      rows.push({ cell: `${mod}-${t}`, error: e.message });
    }
  }
}

const narrative = resolveVocabNarrativeThresholds({ level: L, module: 'lesen', teil: 1, questions: [{ level: L, teil: 1 }] });
console.log(JSON.stringify({ rows, vocabNarrativeProfile: narrative.profile }, null, 2));

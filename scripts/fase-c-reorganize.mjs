#!/usr/bin/env node
/**
 * Fase C: reorganize js/ tree + extract inline script from index.html.
 * Run: node scripts/fase-c-reorganize.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const MOVES = [
  ['js/supabaseClient.js', 'js/services/supabaseClient.js'],
  ['js/authClient.js', 'js/services/authClient.js'],
  ['js/claudeClient.js', 'js/services/claudeClient.js'],
  ['js/syncMerge.js', 'js/services/syncMerge.js'],
  ['js/goalStore.js', 'js/data/goalStore.js'],
  ['js/activityTrack.js', 'js/data/activityTrack.js'],
  ['js/examProfile.js', 'js/data/examProfile.js'],
  ['js/examLibrary.js', 'js/data/examLibrary.js'],
  ['js/manualVocab.js', 'js/data/manualVocab.js'],
  ['js/subjectMeta.js', 'js/i18n/subjectMeta.js'],
  ['js/examUiLocale.js', 'js/i18n/examUiLocale.js'],
  ['js/examSpanishNormalize.js', 'js/i18n/examSpanishNormalize.js'],
  ['js/demoExams.js', 'js/content/demoExams.js'],
  ['js/goetheDemoExams.js', 'js/content/goetheDemoExams.js'],
  ['js/uiToast.js', 'js/ui/components/uiToast.js'],
  ['js/dashboardUi.js', 'js/ui/dashboard/dashboardUi.js'],
  ['js/dashboardLayout.js', 'js/ui/dashboard/dashboardLayout.js'],
  ['js/workspaceUi.js', 'js/ui/workspace/workspaceUi.js'],
  ['js/appFeatures.js', 'js/bootstrap/appFeatures.js'],
];

const PATH_REPLACEMENTS = [
  [/js\/supabaseClient\.js/g, 'js/services/supabaseClient.js'],
  [/js\/authClient\.js/g, 'js/services/authClient.js'],
  [/js\/claudeClient\.js/g, 'js/services/claudeClient.js'],
  [/js\/syncMerge\.js/g, 'js/services/syncMerge.js'],
  [/js\/goalStore\.js/g, 'js/data/goalStore.js'],
  [/js\/activityTrack\.js/g, 'js/data/activityTrack.js'],
  [/js\/examProfile\.js/g, 'js/data/examProfile.js'],
  [/js\/examLibrary\.js/g, 'js/data/examLibrary.js'],
  [/js\/manualVocab\.js/g, 'js/data/manualVocab.js'],
  [/js\/subjectMeta\.js/g, 'js/i18n/subjectMeta.js'],
  [/js\/examUiLocale\.js/g, 'js/i18n/examUiLocale.js'],
  [/js\/examSpanishNormalize\.js/g, 'js/i18n/examSpanishNormalize.js'],
  [/js\/demoExams\.js/g, 'js/content/demoExams.js'],
  [/js\/goetheDemoExams\.js/g, 'js/content/goetheDemoExams.js'],
  [/js\/uiToast\.js/g, 'js/ui/components/uiToast.js'],
  [/js\/dashboardUi\.js/g, 'js/ui/dashboard/dashboardUi.js'],
  [/js\/dashboardLayout\.js/g, 'js/ui/dashboard/dashboardLayout.js'],
  [/js\/workspaceUi\.js/g, 'js/ui/workspace/workspaceUi.js'],
  [/js\/appFeatures\.js/g, 'js/bootstrap/appFeatures.js'],
];

/** 1-based inclusive line ranges in the main inline script block */
const EXTRACT_RANGES = [
  ['js/bootstrap/state.js', 1, 331],
  ['js/bootstrap/quota.js', 332, 379],
  ['js/bootstrap/auth.js', 380, 623],
  ['js/bootstrap/theme.js', 624, 652],
  ['js/ui/workspace/vocabHub.js', 653, 1027],
  ['js/ui/exam/examConfig.js', 1028, 1423],
  ['js/ui/exam/mistakeReview.js', 1424, 1442],
  ['js/ui/app/coach.js', 1443, 1557],
  ['js/bootstrap/nav.js', 1558, 1642],
  ['js/ui/exam/examGeneration.js', 1643, 2323],
  ['js/ui/exam/examRunner.js', 2324, 2745],
  ['js/ui/exam/results.js', 2746, 3180],
  ['js/ui/exam/saveExams.js', 3181, 3268],
  ['js/ui/vocabulary/tooltip.js', 3269, 3415],
  ['js/bootstrap/audio.js', 3416, 3421],
  ['js/ui/vocabulary/flashcards.js', 3422, 3807],
  ['js/bootstrap/init.js', 3810, 3925],
];

const EXTRACTED_SCRIPTS = EXTRACT_RANGES.map(([p]) => p);

const SCRIPT_BLOCK_HEADER = `<!-- LexiCoil modules (Fase C) -->
<script src="js/services/supabaseClient.js?v=9"></script>
<script src="js/data/activityTrack.js?v=1"></script>
<script src="js/services/syncMerge.js?v=2"></script>
<script src="js/services/authClient.js?v=9"></script>
<script src="js/services/claudeClient.js?v=11"></script>
<script src="js/engine/domain/lexicoilDomain.js?v=1"></script>
<script src="js/engine/knowledge/KnowledgeLoader.js?v=1"></script>
<script src="js/engine/providers/baseProviderAdapter.js?v=1"></script>
<script src="js/engine/providers/goetheAdapter.js?v=1"></script>
<script src="js/engine/providers/cambridgeAdapter.js?v=1"></script>
<script src="js/engine/providers/deleAdapter.js?v=1"></script>
<script src="js/engine/providers/providerRegistry.js?v=1"></script>
<script src="js/engine/knowledge/KnowledgeEngine.js?v=1"></script>
<script src="js/engine/prompts/promptShell.js?v=1"></script>
<script src="js/engine/prompts/moduleInstructions.js?v=1"></script>
<script src="js/engine/prompts/PromptBuilder.js?v=1"></script>
<script src="js/engine/validation/ExamValidator.js?v=1"></script>
<script src="js/engine/generators/chunkRunner.js?v=1"></script>
<script src="js/engine/generators/ExamGenerator.js?v=1"></script>
<script src="js/engine/generators/ExerciseGenerator.js?v=1"></script>
<script src="js/engine/generators/FlashcardGenerator.js?v=1"></script>
<script src="js/engine/generators/StoryGenerator.js?v=1"></script>
<script src="js/engine/generators/DialogueGenerator.js?v=1"></script>
<script src="js/engine/generators/ContentGenerator.js?v=1"></script>
<script src="js/engine/lexicoilEngine.js?v=1"></script>
<script src="js/i18n/subjectMeta.js?v=1"></script>
<script src="js/i18n/examSpanishNormalize.js?v=1"></script>
<script src="js/i18n/examUiLocale.js?v=1"></script>
<script src="js/ui/components/uiToast.js?v=1"></script>
<script src="js/analytics/types.js?v=1"></script>
<script src="js/core/metadataResolver.js?v=1"></script>
<script src="js/core/schemaValidator.js?v=1"></script>
<script src="js/data/examLibrary.js?v=4"></script>
<script src="js/library/LibraryLoader.js?v=1"></script>
<script src="js/library/ExamBlueprint.js?v=1"></script>
<script src="js/library/ExamBuilder.js?v=1"></script>
<script src="js/library/AnalyticsStore.js?v=1"></script>
<script src="js/library/WeaknessEngine.js?v=1"></script>
<script src="js/library/PracticeDictionary.js?v=1"></script>
<script src="js/data/manualVocab.js?v=2"></script>
<script src="js/data/goalStore.js?v=3"></script>
<script src="js/ui/dashboard/dashboardLayout.js?v=2"></script>
<script src="js/ui/dashboard/dashboardUi.js?v=3"></script>
<script src="js/ui/workspace/workspaceUi.js?v=2"></script>
<script src="js/library/QuestionLibrary.js?v=1"></script>
<script src="js/content/goetheDemoExams.js"></script>
<script src="js/content/demoExams.js"></script>
<script src="js/data/examProfile.js?v=1"></script>
${EXTRACTED_SCRIPTS.map((p) => `<script src="${p}?v=1"></script>`).join('\n')}
<script src="js/bootstrap/appFeatures.js?v=24"></script>`;

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(path.join(ROOT, filePath)), { recursive: true });
}

function moveFiles() {
  for (const [from, to] of MOVES) {
    const src = path.join(ROOT, from);
    const dest = path.join(ROOT, to);
    if (!fs.existsSync(src)) {
      if (fs.existsSync(dest)) continue;
      throw new Error(`Missing source file: ${from}`);
    }
    ensureDir(to);
    try {
      execSync(`git mv "${from.replace(/\\/g, '/')}" "${to.replace(/\\/g, '/')}"`, { cwd: ROOT, stdio: 'pipe' });
    } catch {
      fs.renameSync(src, dest);
    }
    console.log('moved', from, '->', to);
  }
}

function extractInline() {
  const indexPath = path.join(ROOT, 'index.html');
  let html = fs.readFileSync(indexPath, 'utf8');
  const marker = '<script src="js/data/examProfile.js?v=1"></script>';
  const altMarker = '<script src="js/examProfile.js?v=1"></script>';
  const startIdx = html.includes(marker)
    ? html.indexOf(marker) + marker.length
    : html.indexOf(altMarker) + altMarker.length;
  const inlineStart = html.indexOf('<script>', startIdx);
  const inlineEnd = html.indexOf('</script>', inlineStart);
  const appFeatNeedle = '<script src="js/bootstrap/appFeatures.js';
  const appFeatAlt = '<script src="js/appFeatures.js';
  let appFeatIdx = html.indexOf(appFeatNeedle, inlineEnd);
  if (appFeatIdx < 0) appFeatIdx = html.indexOf(appFeatAlt, inlineEnd);

  const inline = html.slice(inlineStart + '<script>'.length, inlineEnd);
  const lines = inline.split(/\r?\n/);

  for (const [outPath, start, end] of EXTRACT_RANGES) {
    const chunk = lines.slice(start - 1, end).join('\n').trim();
    if (!chunk) throw new Error(`Empty extract: ${outPath}`);
    const full = path.join(ROOT, outPath);
    ensureDir(outPath);
    fs.writeFileSync(full, chunk + '\n', 'utf8');
    console.log('extracted', outPath, `(${end - start + 1} lines)`);
  }

  const bootPatch = `
(function(){
  const _origSetFcType=window.setFcTypeFilter;
  if(_origSetFcType)window.setFcTypeFilter=function(type,btn){S.fcSingleIdx=0;S.fcSingleFlipped=false;return _origSetFcType(type,btn);};
})();
if(document.readyState==='loading'){
  document.addEventListener('DOMContentLoaded',()=>window.bootApp());
}else{
  window.bootApp();
}
`.trim();

  const initPath = path.join(ROOT, 'js/bootstrap/init.js');
  let initSrc = fs.readFileSync(initPath, 'utf8').trimEnd();
  if (!initSrc.includes('setFcTypeFilter')) {
    initSrc += '\n\n' + bootPatch + '\n';
    fs.writeFileSync(initPath, initSrc, 'utf8');
  }

  const before = html.slice(0, inlineStart);
  const afterScripts = html.slice(appFeatIdx);
  const afterAppFeat = afterScripts.replace(
    /<script src="js\/(?:bootstrap\/)?appFeatures\.js[^<]*<\/script>[\s\S]*?<script>[\s\S]*?bootApp[\s\S]*?<\/script>/,
    '<script src="js/bootstrap/appFeatures.js?v=24"></script>',
  );

  const oldScriptSection = html.slice(
    html.indexOf('<script src="js/supabaseClient.js'),
    inlineStart,
  );

  const newHtml = before.replace(oldScriptSection, SCRIPT_BLOCK_HEADER + '\n') + afterAppFeat;
  fs.writeFileSync(indexPath, newHtml, 'utf8');
  console.log('updated index.html');
  return lines.length;
}

function patchOtherFiles() {
  for (const file of ['oral.html', 'demo.html']) {
    const p = path.join(ROOT, file);
    if (!fs.existsSync(p)) continue;
    let s = fs.readFileSync(p, 'utf8');
    for (const [re, rep] of PATH_REPLACEMENTS) s = s.replace(re, rep);
    fs.writeFileSync(p, s, 'utf8');
    console.log('patched', file);
  }
}

function verifyLineRanges(totalLines) {
  const max = EXTRACT_RANGES[EXTRACT_RANGES.length - 1][2];
  if (max !== totalLines) {
    console.warn(`WARN: last range ends at ${max} but inline has ${totalLines} lines — adjust ranges`);
  }
}

function main() {
  moveFiles();
  const n = extractInline();
  verifyLineRanges(n);
  patchOtherFiles();
  console.log(`Done. Inline was ${n} lines → ${EXTRACTED_SCRIPTS.length} modules.`);
}

main();

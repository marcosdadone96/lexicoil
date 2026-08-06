'use strict';

const fs = require('fs');
const path = require('path');
const { ROOT, resolveFromRoot } = require('./projectRoot.js');

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Load PDF-related CSS block from app.css (single source with browser print styles). */
function loadPdfCss(projectRoot = ROOT) {
  const cssPath = path.join(projectRoot, 'assets/css/app.css');
  const css = fs.readFileSync(cssPath, 'utf8');
  const pdfCss = css.match(/#pdf-export-container[\s\S]*?@media print[\s\S]*?\}\}/)?.[0] || '';
  return pdfCss.replace(
    /#pdf-export-container\{display:none[^}]+\}/,
    '#pdf-export-container{display:block;position:static;width:210mm;margin:0 auto}',
  );
}

/** Bootstrap globals and return buildPdfHtml from featurePdf.js (Node / serverless). */
function loadBuildPdfHtml(projectRoot = ROOT) {
  const req = (rel) => {
    const p = path.join(projectRoot, rel);
    delete require.cache[require.resolve(p)];
    require(p);
  };
  global.S = global.S || { user: { name: 'Candidate' }, subject: 'de', level: 'B1' };
  global.esc = esc;
  global.isPro = () => true;
  global.window = global;
  req('js/i18n/consentLocale.js');
  req('js/i18n/pdfReportLocale.js');
  req('js/bootstrap/featurePdf.js');
  if (typeof global.buildPdfHtml !== 'function') {
    throw new Error('buildPdfHtml not loaded');
  }
  return global.buildPdfHtml;
}

/**
 * Build standalone HTML document for Chromium PDF render.
 * @param {object} opts
 * @param {string} opts.bodyHtml - inner HTML from buildPdfHtml()
 * @param {string} [opts.projectRoot]
 */
function buildFullPdfHtml({ bodyHtml, projectRoot = ROOT }) {
  const pdfCss = loadPdfCss(projectRoot);
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
body{margin:0;background:#fff}
${pdfCss}
</style></head><body><div id="pdf-export-container">${bodyHtml}</div></body></html>`;
}

/**
 * @param {object} payload - same args as buildPdfHtml(score, mods, d, isDE, correction, speakingParts, coaching, uiLang)
 */
function buildPdfReportHtml(payload, projectRoot = ROOT) {
  const buildPdfHtml = loadBuildPdfHtml(projectRoot);
  const {
    score,
    mods,
    d,
    isDE,
    correction,
    speakingParts,
    grammarCoaching,
    uiLang,
  } = payload;
  const bodyHtml = buildPdfHtml(
    score,
    mods,
    d,
    isDE,
    correction,
    speakingParts,
    grammarCoaching,
    uiLang,
  );
  return buildFullPdfHtml({ bodyHtml, projectRoot });
}

module.exports = {
  esc,
  loadPdfCss,
  loadBuildPdfHtml,
  buildFullPdfHtml,
  buildPdfReportHtml,
  resolveFromRoot,
};

#!/usr/bin/env node
/**
 * Verify every manifest.published grammar combo loads and renders without error.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GRAMMAR_ROOT = path.join(ROOT, 'lexicoil_grammar_content', 'content', 'grammar');

const GrammarLoader = require(path.join(ROOT, 'js/library/grammarLoader.js'));

let fail = false;
function check(label, cond) {
  console.log(`${cond ? 'PASS' : 'FAIL'}: ${label}`);
  if (!cond) fail = true;
}

function esc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderBlock(block) {
  if (block.type === 'paragraph') return `<p>${esc(block.text)}</p>`;
  if (block.type === 'note') return `<aside>${esc(block.text)}</aside>`;
  if (block.type === 'example') return `<div>${esc(block.label || '')}${esc(block.text)}</div>`;
  if (block.type === 'list') {
    return `<ul>${(block.items || []).map((it) => `<li>${esc(it)}</li>`).join('')}</ul>`;
  }
  if (block.type === 'table') {
    const heads = (block.headers || []).map((h) => `<th>${esc(h)}</th>`).join('');
    const rows = (block.rows || [])
      .map((row) => `<tr>${row.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`)
      .join('');
    return `<table>${heads ? `<thead><tr>${heads}</tr></thead>` : ''}<tbody>${rows}</tbody></table>`;
  }
  return '';
}

function renderGrammarDocument(doc) {
  if (!doc?.sections) return '';
  return doc.sections
    .map((sec) => {
      const blocks = (sec.blocks || []).map(renderBlock).join('');
      return `<section class="grammar-section" id="grammar-${esc(sec.id)}"><h2>${esc(sec.title)}</h2>${blocks}</section>`;
    })
    .join('');
}

globalThis.fetch = async (url) => {
  const u = String(url);
  let rel = null;
  if (u.includes('lexicoil_grammar_content/content/grammar/')) {
    rel = u.split('lexicoil_grammar_content/content/grammar/')[1];
  } else if (u.includes('content/grammar/')) {
    rel = u.split('content/grammar/')[1];
  }
  if (!rel) return { ok: false, json: async () => null };
  const file = path.join(GRAMMAR_ROOT, rel.replace(/\//g, path.sep));
  if (!fs.existsSync(file)) return { ok: false, json: async () => null };
  const body = fs.readFileSync(file, 'utf8');
  return { ok: true, json: async () => JSON.parse(body) };
};

const manifest = JSON.parse(fs.readFileSync(path.join(GRAMMAR_ROOT, 'manifest.json'), 'utf8'));
check('manifest.json exists', !!manifest?.published);

GrammarLoader.resetCache();

const published = manifest.published || {};
let combos = 0;

async function runAll() {
  for (const [taught, metaBlock] of Object.entries(published)) {
    for (const [meta, levels] of Object.entries(metaBlock || {})) {
      for (const level of levels || []) {
        combos++;
        const result = await GrammarLoader.getGrammar(taught, level, meta);
        check(`${taught}/${meta}/${level} loads`, result.status === 'ok' && result.doc?.sections?.length > 0);

        const html = renderGrammarDocument(result.doc);
        check(`${taught}/${meta}/${level} renders HTML`, html.includes('grammar-section'));

        for (const sec of result.doc.sections) {
          check(`${taught}/${meta}/${level} section ${sec.id} has title`, !!sec.title);
          for (const block of sec.blocks || []) {
            check(
              `${taught}/${meta}/${level} ${sec.id} block type`,
              ['paragraph', 'table', 'example', 'note', 'list'].includes(block.type),
            );
          }
        }

        const filePath = path.join(GRAMMAR_ROOT, taught, meta, level + '.json');
        check(`${taught}/${meta}/${level} file on disk`, fs.existsSync(filePath));
      }
    }
  }

  const prep = await GrammarLoader.getGrammar('es', 'A1', 'es');
  check('unpublished taught lang es → preparation', prep.status === 'preparation' && !prep.doc);

  console.log(`\nChecked ${combos} published combinations.`);
  if (fail) process.exit(1);
  console.log('All grammar render checks passed.');
}

runAll().catch((e) => {
  console.error(e);
  process.exit(1);
});

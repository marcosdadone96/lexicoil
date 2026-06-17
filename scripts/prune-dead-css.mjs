import fs from 'fs';
import { execSync } from 'child_process';

const htmlPath = 'index.html';
const html = fs.readFileSync(htmlPath, 'utf8');
const styleMatch = html.match(/<style>([\s\S]*?)<\/style>/);
if (!styleMatch) {
  console.error('No <style> block found');
  process.exit(1);
}

const deadOut = execSync('node scripts/detect-dead.mjs css', { encoding: 'utf8' });
const deadLines = deadOut.split('\n').slice(1).filter(Boolean);
const deadSet = new Set(deadLines);

function splitTopRules(css) {
  const rules = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < css.length; i++) {
    if (css[i] === '{') depth++;
    else if (css[i] === '}') {
      depth--;
      if (depth === 0) {
        const chunk = css.slice(start, i + 1).trim();
        if (chunk) rules.push(chunk);
        start = i + 1;
      }
    }
  }
  const tail = css.slice(start).trim();
  if (tail) rules.push(tail);
  return rules;
}

function selectorDead(sel) {
  const classes = [...sel.matchAll(/\.([a-zA-Z][\w-]+)/g)].map((m) => m[1]);
  if (!classes.length) return false;
  return classes.some((c) => deadSet.has(c));
}

function pruneCss(css) {
  const rules = splitTopRules(css);
  const kept = [];
  for (const rule of rules) {
    if (rule.startsWith('@media')) {
      const innerStart = rule.indexOf('{') + 1;
      const innerEnd = rule.lastIndexOf('}');
      const inner = rule.slice(innerStart, innerEnd);
      const prunedInner = pruneCss(inner);
      if (!prunedInner.trim()) continue;
      const header = rule.slice(0, innerStart);
      kept.push(`${header}${prunedInner}}`);
      continue;
    }
    const brace = rule.indexOf('{');
    if (brace < 0) {
      kept.push(rule);
      continue;
    }
    const sel = rule.slice(0, brace);
    if (selectorDead(sel)) continue;
    kept.push(rule);
  }
  return kept.join('\n');
}

const before = styleMatch[1];
const after = pruneCss(before);
const beforeLines = before.split('\n').length;
const afterLines = after.split('\n').length;

const newHtml = html.replace(styleMatch[0], `<style>\n${after}\n</style>`);
fs.writeFileSync(htmlPath, newHtml);
console.log(`Pruned CSS: ${beforeLines} → ${afterLines} lines (${beforeLines - afterLines} removed)`);

const deadAfter = execSync('node scripts/detect-dead.mjs css', { encoding: 'utf8' });
console.log(deadAfter.trim());

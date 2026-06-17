import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const EXAMS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'exams');

function sanitizeExamText(text) {
  if (!text || typeof text !== 'string') return text;
  return text.replace(/<br\s*\/?>/gi, '\n').replace(/\r\n/g, '\n');
}

function splitDialogueInline(text) {
  let s = sanitizeExamText(text);
  s = s.replace(
    /([.!?])\s+(?=(?:Moderator(?:in)?|Interviewer(?:in)?|Gast|Herr|Frau|Dr\.|Prof\.|[A-Z][a-z]*(?:\s+[A-Z][a-z.]+)*)\s*:)/g,
    '$1\n'
  );
  s = s.replace(/([^\n])\s+(?=(?:Moderator(?:in)?|Interviewer(?:in)?|Gast)\s*:)/g, '$1\n');
  s = s.replace(/([^\n])\s+(?=[A-Z]:\s)/g, '$1\n');
  return s;
}

function walkTexts(obj, fn, trail = []) {
  if (!obj || typeof obj !== 'object') return;
  if (Array.isArray(obj)) {
    obj.forEach((v, i) => walkTexts(v, fn, [...trail, i]));
    return;
  }
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === 'string' && /text|transcript|task|signText|instruction|situation/i.test(k)) {
      const fixed = fn(v);
      if (fixed !== v) obj[k] = fixed;
    } else if (v && typeof v === 'object') {
      walkTexts(v, fn, [...trail, k]);
    }
  }
}

const files = fs.readdirSync(EXAMS_DIR).filter((f) => f.endsWith('.json'));
let totalFixed = 0;

for (const file of files) {
  const fp = path.join(EXAMS_DIR, file);
  const raw = fs.readFileSync(fp, 'utf8');
  const data = JSON.parse(raw);
  let changes = 0;

  walkTexts(data, (text) => {
    const next = splitDialogueInline(text);
    if (next !== text) changes++;
    return next;
  });

  if (changes > 0) {
    fs.writeFileSync(fp, JSON.stringify(data, null, 2) + '\n', 'utf8');
    console.log(`${file}: normalized ${changes} text field(s)`);
    totalFixed += changes;
  } else {
    console.log(`${file}: ok`);
  }
}

console.log(`Done. ${totalFixed} field(s) updated across ${files.length} files.`);

#!/usr/bin/env node
/**
 * Sprint 2 — local review workbench API + static UI.
 *
 * Usage: node tools/review/server.mjs [--port 3456] [--lang de] [--level B1]
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import {
  loadIndex,
  loadCandidate,
  saveCandidate,
  countByStatus,
} from '../../scripts/pipeline/lib/stagingStore.mjs';
import { validateCandidate, resolveBlueprint } from '../../scripts/pipeline/lib/validateCandidate.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '../..');
const require = createRequire(import.meta.url);

require(path.join(ROOT, 'js/library/PassageResolver.js'));
globalThis.PassageResolver = require(path.join(ROOT, 'js/library/PassageResolver.js'));
globalThis.ExamValidator = require(path.join(ROOT, 'js/engine/validation/ExamValidator.js'));

function parseArgs(argv) {
  const out = { port: 3456, lang: 'de', level: 'B1' };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--port') out.port = parseInt(argv[++i], 10);
    else if (argv[i] === '--lang') out.lang = argv[++i];
    else if (argv[i] === '--level') out.level = argv[++i];
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const blueprint = resolveBlueprint(args.lang, args.level);

function sendJson(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 2e6) reject(new Error('body too large'));
    });
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

function parseQuery(url) {
  const q = {};
  for (const [k, v] of url.searchParams) q[k] = v;
  return q;
}

function revalidate(candidate) {
  candidate.validation = validateCandidate(candidate, blueprint);
  return candidate;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://127.0.0.1:${args.port}`);
  const q = parseQuery(url);

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, PATCH, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    return res.end();
  }

  try {
    if (req.method === 'GET' && url.pathname === '/api/stats') {
      const lang = q.lang || args.lang;
      const level = q.level || args.level;
      return sendJson(res, 200, {
        lang,
        level,
        counts: countByStatus(lang, level),
        blueprintId: blueprint?.id || null,
      });
    }

    if (req.method === 'GET' && url.pathname === '/api/candidates') {
      const lang = q.lang || args.lang;
      const level = q.level || args.level;
      const index = loadIndex(lang, level);
      let rows = index.candidates || [];
      if (q.status) rows = rows.filter((r) => r.status === q.status);
      if (q.module) rows = rows.filter((r) => r.module === q.module);
      return sendJson(res, 200, { candidates: rows });
    }

    const detailMatch = url.pathname.match(/^\/api\/candidates\/([^/]+)$/);
    if (req.method === 'GET' && detailMatch) {
      const lang = q.lang || args.lang;
      const level = q.level || args.level;
      const candidate = loadCandidate(lang, level, detailMatch[1]);
      if (!candidate) return sendJson(res, 404, { error: 'not found' });
      return sendJson(res, 200, { candidate });
    }

    if (req.method === 'PATCH' && detailMatch) {
      const lang = q.lang || args.lang;
      const level = q.level || args.level;
      const id = detailMatch[1];
      const candidate = loadCandidate(lang, level, id);
      if (!candidate) return sendJson(res, 404, { error: 'not found' });

      const body = await readBody(req);
      if (body.status) candidate.status = body.status;
      if (body.review?.notes != null) candidate.review = { ...candidate.review, notes: body.review.notes };
      if (body.passage) candidate.passage = { ...candidate.passage, ...body.passage };
      if (body.questions) candidate.questions = body.questions;

      if (body.status === 'approved' || body.status === 'rejected') {
        candidate.review = {
          ...candidate.review,
          reviewedAt: new Date().toISOString(),
        };
      }
      if (body.passage || body.questions) {
        candidate.review = { ...candidate.review, editedAt: new Date().toISOString() };
      }

      revalidate(candidate);
      saveCandidate(candidate);
      return sendJson(res, 200, { candidate });
    }

    if (req.method === 'POST' && detailMatch && url.pathname.endsWith('/revalidate')) {
      /* noop path handled above — use POST /api/candidates/:id/revalidate */
    }

    const revalMatch = url.pathname.match(/^\/api\/candidates\/([^/]+)\/revalidate$/);
    if (req.method === 'POST' && revalMatch) {
      const lang = q.lang || args.lang;
      const level = q.level || args.level;
      const candidate = loadCandidate(lang, level, revalMatch[1]);
      if (!candidate) return sendJson(res, 404, { error: 'not found' });
      revalidate(candidate);
      saveCandidate(candidate);
      return sendJson(res, 200, { candidate });
    }

    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
      const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(html);
    }

    if (req.method === 'GET' && url.pathname.startsWith('/assets/')) {
      const rel = url.pathname.replace(/^\/assets\//, '');
      const file = path.join(ROOT, 'assets', rel);
      if (!file.startsWith(path.join(ROOT, 'assets')) || !fs.existsSync(file)) {
        return sendJson(res, 404, { error: 'asset not found' });
      }
      const ext = path.extname(file);
      const types = { '.css': 'text/css', '.js': 'application/javascript', '.svg': 'image/svg+xml' };
      res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream' });
      return fs.createReadStream(file).pipe(res);
    }

    sendJson(res, 404, { error: 'not found' });
  } catch (err) {
    console.error(err);
    sendJson(res, 500, { error: String(err.message || err) });
  }
});

server.listen(args.port, () => {
  console.log(`LexiCoil review workbench — http://127.0.0.1:${args.port}/`);
  console.log(`Default scope: ${args.lang}/${args.level}`);
});

#!/usr/bin/env node
/**
 * netlify dev with NODE_OPTIONS=--use-system-ca so Netlify Functions can reach
 * generativelanguage.googleapis.com on Windows + antivirus TLS interception.
 *
 *   npm run dev
 */
import { spawn } from 'node:child_process';

function ensureSystemCa() {
  const flag = '--use-system-ca';
  const existing = process.env.NODE_OPTIONS || '';
  if (!existing.includes(flag)) {
    process.env.NODE_OPTIONS = [existing, flag].filter(Boolean).join(' ');
  }
}

ensureSystemCa();

const child = spawn(process.platform === 'win32' ? 'netlify.cmd' : 'netlify', ['dev', ...process.argv.slice(2)], {
  stdio: 'inherit',
  shell: true,
  env: process.env,
});

child.on('exit', (code) => {
  process.exit(code ?? 0);
});

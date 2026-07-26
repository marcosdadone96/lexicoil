#!/usr/bin/env node
/**
 * Genera 5 Hören T2 con temas distintos en una sola sesión (aperturas rotadas).
 */
import { loadEnvFile } from './lib/loadEnv.mjs';
import { runExamGenerator } from './lib/generatePartGeminiLib.mjs';

loadEnvFile();

const TOPICS = ['Freizeit', 'Sport', 'Kultur', 'Verkehr', 'Technik'];

async function main() {
  const shared = { _horenT2UsedOpenings: new Set() };
  for (const topic of TOPICS) {
    console.log(`\n========== Hören T2 · ${topic} ==========\n`);
    const { exitCode } = await runExamGenerator([
      '--module',
      'horen',
      '--teil',
      '2',
      '--topic',
      topic,
      '--from-coverage',
      '--fix-retries',
      '1',
    ], shared);
    if (exitCode !== 0) console.error(`Fallo ${topic} exit=${exitCode}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

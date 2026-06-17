#!/usr/bin/env node
/**
 * Iteration 05 — Certification acceptance matrix (dry-run, no LLM).
 * Validates: KnowledgeEngine → Provider Adapter → PromptBuilder → Generator → Renderer
 */
import { ACCEPTANCE_MATRIX, loadEngine, runAcceptanceCase } from './lib/acceptanceLib.mjs';

async function main() {
  const engine = loadEngine();
  let failed = 0;

  for (const row of ACCEPTANCE_MATRIX) {
    const label = `${row.brand} ${row.level}`;
    try {
      await runAcceptanceCase(engine, row);
      console.log(`PASS ${label}`);
    } catch (err) {
      failed++;
      console.error(`FAIL ${label}: ${err.message}`);
      if (process.env.ACCEPTANCE_VERBOSE) console.error(err.stack);
    }
  }

  console.log('');
  if (failed > 0) {
    console.error(`${failed} TEST(S) FAILED`);
    process.exit(1);
  }
  console.log('ALL TESTS PASSED');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

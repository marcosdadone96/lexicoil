#!/usr/bin/env node
/**
 * Alias del generador Lesen (Gemini + make-t3).
 * @see scripts/generate-lesen-part-gemini.mjs
 */
export {
  runLesenGenerator,
  parseArgs,
  resolveLesenModel,
  resolveLesenProvider,
  resolveProviderModel,
  ApiBudgetStopError,
  RateLimitStopError,
} from './generate-lesen-part-gemini.mjs';

import { runLesenGenerator } from './generate-lesen-part-gemini.mjs';
import { DailyQuotaError } from './lib/geminiClient.mjs';

const EXIT_DAILY_QUOTA = 2;

runLesenGenerator(process.argv.slice(2))
  .then(({ exitCode }) => process.exit(exitCode ?? 0))
  .catch((err) => {
    if (err instanceof DailyQuotaError || err?.name === 'DailyQuotaError') {
      console.error(`\n${err.message}`);
      process.exit(EXIT_DAILY_QUOTA);
    }
    console.error(err.message || err);
    process.exit(1);
  });

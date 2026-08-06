/**
 * ESM façade — quality gate policy + promotion guard (PASO 10).
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const lib = require(path.join(ROOT, 'netlify/functions/lib/qualityGatePolicy.js'));

export const loadQualityGatePolicy = lib.loadQualityGatePolicy;
export const buildQualityMetadata = lib.buildQualityMetadata;
export const canPromotePart = lib.canPromotePart;
export const partFromStagingCandidate = lib.partFromStagingCandidate;
export const MODES = lib.MODES;
export const DEFAULT_POLICY = lib.DEFAULT_POLICY;
export default lib;

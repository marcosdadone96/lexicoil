#!/usr/bin/env node
import assert from 'node:assert/strict';
import { resolvePublishFile } from '../resolvePublishFile.mjs';

const sample = 'batches/generated/horen-t2-gemini-025.json';
const resolved = resolvePublishFile(sample);
assert.ok(resolved, 'should resolve pool-verified when generated missing');
assert.equal(resolved.source, 'pool-verified');
assert.match(resolved.relFile, /pool-verified\/horen-t2-gemini-025\.json$/);
console.log('PASS: resolvePublishFile finds pool-verified copy');

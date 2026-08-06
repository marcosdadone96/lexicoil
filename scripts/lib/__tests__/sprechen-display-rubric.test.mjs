#!/usr/bin/env node
import assert from 'node:assert/strict';
import { canonicalSprechenExplanation, SPRECHEN_DISPLAY_RUBRIC } from '../sprechenDisplayRubric.mjs';

assert.ok(canonicalSprechenExplanation(1).includes('gemeinsam zu planen'));
assert.ok(canonicalSprechenExplanation(2).includes('strukturiert zu präsentieren'));
assert.ok(canonicalSprechenExplanation(3).includes('konstruktives Feedback'));
assert.equal(Object.keys(SPRECHEN_DISPLAY_RUBRIC).length, 3);
console.log('sprechen-display-rubric: 4/4 passed');

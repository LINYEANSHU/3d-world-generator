import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as checkpoint from '../js/checkpoint.js';

const params = { seedStr: '雪山 & 2026', size: 128, mountainAmp: 1.5, waterDelta: -2, vegetation: 0.8, villageCount: 3 };
const view = { atmosphere: 'dusk', autoRotate: false, position: [24, 35, 36], target: [8, 20, 18], landmark: 1 };

test('world checkpoint round-trips the exact rendered seed and viewpoint', () => {
  const encoded = checkpoint.encodeCheckpoint(params, view);
  assert.deepEqual(checkpoint.decodeCheckpoint(encoded), { params, view });
});

test('malformed or incompatible checkpoints fail before replacing a world', () => {
  assert.throws(() => checkpoint.decodeCheckpoint('{'));
  const encoded = checkpoint.encodeCheckpoint(params, view);
  const corrupt = JSON.parse(encoded);
  corrupt.view.position = corrupt.view.target;
  assert.throws(() => checkpoint.decodeCheckpoint(JSON.stringify(corrupt)));
  corrupt.version = 99;
  assert.throws(() => checkpoint.decodeCheckpoint(JSON.stringify(corrupt)));
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BloomWriter } from '../BloomWriter.mjs';
import { BloomReader } from '../BloomReader.mjs';

test('BloomWriter basic add and has', () => {
  const writer = BloomWriter.fromCapacity(100, 0.01);
  assert.strictEqual(writer.has('missing'), false);
  writer.add('foo');
  assert.strictEqual(writer.has('foo'), true);
  assert.strictEqual(writer.has('bar'), false);
});

test('BloomWriter JSON roundtrip', () => {
  const writer = BloomWriter.fromCapacity(50, 0.05);
  writer.add('alice').add('bob');
  const json = writer.toJSON();
  const restored = BloomWriter.fromJSON(json);
  assert.strictEqual(restored.has('alice'), true);
  assert.strictEqual(restored.has('bob'), true);
  assert.strictEqual(restored.has('charlie'), false);
});

test('Bloom binary roundtrip via BloomReader', () => {
  const writer = BloomWriter.fromCapacity(20, 0.1);
  writer.add('x').add('y').add('z');
  const bin = writer.toBinary();
  const reader = BloomReader.fromBinary(bin);
  assert.strictEqual(reader.has('x'), true);
  assert.strictEqual(reader.has('y'), true);
  assert.strictEqual(reader.has('z'), true);
  assert.strictEqual(reader.has('w'), false);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stripWords, hashWord, ngramsOf, prefixesOf } from '../helpers.mjs';

test('stripWords removes punctuation, lowercases, and filters stop words', () => {
  const input = 'Hello, world! This is a test of stripWords.';
  const expected = ['hello', 'world', 'test', 'stripword'];
  assert.deepStrictEqual(stripWords(input), expected);
});

test('hashWord sorts unique letters', () => {
  assert.strictEqual(hashWord('banana'), 'abn');
  assert.strictEqual(hashWord(''), '');
  assert.strictEqual(hashWord('aabbcc'), 'abc');
});

test('ngramsOf returns contiguous n-grams', () => {
  const words = ['one', 'two', 'three', 'four'];
  assert.deepStrictEqual(ngramsOf(2, words), ['one two', 'two three', 'three four']);
  assert.deepStrictEqual(ngramsOf(3, words), ['one two three', 'two three four']);
});

test('prefixesOf returns prefixes down to minLength in descending order', () => {
  assert.deepStrictEqual(prefixesOf('hello', 1), ['hello', 'hell', 'hel', 'he', 'h']);
  assert.deepStrictEqual(prefixesOf('hi', 3), ['hi']);
});
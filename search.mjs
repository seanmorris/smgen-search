#!/usr/bin/env node

import fs from 'node:fs';
import { BloomReader } from './Reader.mjs';
import { hashWord, ngramsOf, prefixesOf } from './helpers.mjs';

const search = (corpus, query, minScore = 0) => {

	const words = query
		.toLowerCase()
		.replace(/[-\/]/g, ' ')
		.replace(/[^\w\s]/g, '')
		.split(/\s/)
		.filter(x => x !== '');

	if(!words.length) return [];

	const hashedWords = words.map(hashWord);
	const found = new Map;

	for(const doc of corpus)
	{
		const reader = BloomReader.fromJSON(doc.index);

		if(reader.has(words.join(' ')))
		{
			found.set(doc, 10 + (found.get(doc) ?? 0));
		}

		const frag = 1 / words.length;

		for(let i = 1; i < words.length; i++)
		{
			const ngrams = ngramsOf(i, words);

			for(const ngram of ngrams)
			{
				if(!reader.has(ngram)) continue;

				found.set(doc, ngram.length / words.length + (found.get(doc) ?? 0));
			}
		}

		for(let i = 1; i < 4; i++)
		{
			const ngrams = ngramsOf(i, hashedWords);

			for(const ngram of ngrams)
			{
				if(!reader.has(ngram)) continue;

				found.set(doc, 0.5 * ngram.length / hashedWords.length + (found.get(doc) ?? 0));
			}
		}

		const uniqueWords = [...new Set(words)];
		const prefixes = [...new Set(uniqueWords.map(x => prefixesOf(x, 3)))].flat();

		for(const word of prefixes)
		{
			if(!reader.has(word)) continue;

			found.set(doc, frag * 0.25 + (found.get(doc) ?? 0));
		}

		for(const word of hashedWords)
		{
			if(!reader.has(word)) continue;

			found.set(doc, frag * 0.25 + (found.get(doc) ?? 0));
		}
	}

	const sorted = ([...found.entries()].sort((a, b) => b[1] - a[1]));

	const filtered = sorted.filter(entry => entry[1] > minScore);

	return filtered;
};

const argv = process.argv.slice(2);

const corpusJson = fs.readFileSync('search.json', {encoding: 'utf8'});
const corpus = JSON.parse(corpusJson);

console.time('Search');
const results = search(corpus, argv.join(' '), 1.00);
console.timeEnd('Search');

console.log(results.map(r => [r[0].path, r[1]]));
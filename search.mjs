#!/usr/bin/env node

import fs from 'node:fs';
import { BloomReader } from './Reader.mjs';
import { hashWord, ngramsOf, prefixesOf, skip, stripWords } from './helpers.mjs';

const search = (corpus, query, minScore = 0) => {

	const words = stripWords(query);

	if(!words.length) return [];

	const hashedWords = words.map(hashWord);
	const found = new Map;

	for(const doc of corpus)
	{
		const reader = BloomReader.fromBinary(doc.index);

		if(reader.has(words.join(' ')))
		{
			found.set(doc, 10 * words.length + (found.get(doc) ?? 0));
		}

		const frag = 1 / words.length;

		for(let i = 3; i <= 4; i += 1)
		{
			for(const ngram of ngramsOf(i, words))
			{
				if(!reader.has(ngram)) continue;

				found.set(doc, (ngram.length / words.length)**2 + (found.get(doc) ?? 0));

				break;
			}
		}

		for(const word of words)
		{
			for(const prefix of prefixesOf(word, 4))
			{
				if(!reader.has(prefix)) continue;
	
				found.set(doc, (prefix.length / word.length)**2 * frag * 0.25 + (found.get(doc) ?? 0));

				break;
			}
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

const dec = new TextDecoder();

const parseIndex = bin => {
	const binView = new DataView(bin.buffer);
	
	let cur = 0;
	
	const fileHeader = dec.decode(bin.slice(0, 4));

	if(fileHeader !== 'SRCH')
	{
		throw new Error('Invalid index file, no file header found.');
	}

	cur += 4;

	const entries = [];

	while(cur < bin.length)
	{
		const fileHeader = dec.decode(bin.slice(cur, cur + 4));

		if(fileHeader === 'HCRS')
		{
			break;
		}
		else if(fileHeader !== 'SCHK')
		{
			throw new Error('Invalid index file, no chunk header found.');
		}
	
		cur += 4;
		
		const titleLength = binView.getUint32(cur, true);
		cur += 4;
		
		const title = dec.decode(bin.slice(cur, cur + titleLength));
		cur += titleLength;

		const pathLength = binView.getUint32(cur, true);
		cur += 4;

		const path = dec.decode(bin.slice(cur, cur + pathLength));
		cur += pathLength;

		const indexLength = binView.getUint32(cur, true);
		cur += 4;

		const index = bin.slice(cur, cur + indexLength);
		cur += indexLength;

		entries.push({title, path, index});
	}

	return entries;
};

const argv = process.argv.slice(2);

// const corpusJson = fs.readFileSync('search.json', {encoding: 'utf8'});
const corpusBin = fs.readFileSync('search.bin');

// const corpus = JSON.parse(corpusJson);
const corpus = parseIndex(corpusBin);

console.time('Search');
const results = search(corpus, argv.join(' '), 0.10);
console.timeEnd('Search');
console.log(results.map(r => [r[0].path, r[1]]).slice(0, 10));

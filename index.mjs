#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { BloomWriter } from './Writer.mjs';
import { hashWord, ngramsOf, prefixesOf, stripWords } from './helpers.mjs';

const BLOOM_ERROR_RATE = Number(process.env.BLOOM_ERROR_RATE ?? 0.01);

const MIN_NGRAMS = 3;
const MAX_NGRAMS = 4;
const MIN_PREFIX = 5;

const dec = new TextDecoder();
const enc = new TextEncoder();

const iterateDir = (dir, processDocument = x => x) => {
	const corpus = [];

	for(const entry of fs.readdirSync(dir))
	{
		if(entry[0] === '.') continue;

		const entryPath = path.join(dir, entry);

		if(fs.lstatSync(entryPath).isDirectory())
		{
			corpus.push( ...iterateDir(entryPath, processDocument) );
		}
		else
		{
			corpus.push( processDocument(entryPath) );
		}
	}

	return corpus;
};

const processDocument = entryPath => {
	const contentBuffer = fs.readFileSync(entryPath);
	const content = dec.decode(contentBuffer);

	const docSize = contentBuffer.length;

	const frontmatter = {};
	let body = content;

	if(content.substr(0, 4) === '---\n') try
	{
		const start = 5 + content.indexOf('\n---\n');
		body = content.substr(start);

		const json = execFileSync(
			'yq',
			['--front-matter=extract', '-o=json', entryPath],
			{encoding: 'utf8'},
		);

		Object.assign(frontmatter, JSON.parse(json) ?? {});
	}
	catch(error)
	{
		console.error(error);
	}

	const entry = path.basename(entryPath);

	const title = frontmatter.title ?? (entry.toLowerCase()
		.replace(/.md$/, '')
		.replace(/\b[a-z]/g, letter => letter.toUpperCase())
		.replace(/-/, ' '));

	const strippedWords = stripWords(title + body);

	const uniqueWords = [...new Set(strippedWords)];
	const hashedWords = [...new Set(uniqueWords.map(hashWord))];
	const prefixes    = [...new Set(uniqueWords.map(x => prefixesOf(x, MIN_PREFIX)))].flat();

	const ngrams = [];

	for(let i = MIN_NGRAMS; i <= MAX_NGRAMS; i += 1)
	{
		for(const ngram of ngramsOf(i, strippedWords))
		{
			ngrams.push(ngram);
		}
	}

	const all = new Set([...ngrams, ...hashedWords, ...prefixes]);
	const writer = BloomWriter.fromCapacity(all.size, BLOOM_ERROR_RATE);

	all.forEach( x => writer.add(x) );

	const binTitle = enc.encode(title);
	const binPath  = enc.encode(entryPath.replace(/.md$/, ''));
	const binIndex = writer.toBinary();

	const indexSize = 4 * 4 + binTitle.length + binPath.length + binIndex.length;

	const bytes = new Uint8Array(indexSize);
	const view = new DataView(bytes.buffer);

	bytes.set(enc.encode('SCHK'));

	view.setUint32(4, binTitle.length, true);
	bytes.set(binTitle, 4 + 4 * 1 + 0);

	view.setUint32(4 + 4 * 1 + binTitle.length, binPath.length, true);
	bytes.set(binPath, 4 + 4 * 2 + binTitle.length);

	view.setUint32(4 + 4 * 2 + binTitle.length + binPath.length, binIndex.length, true);
	bytes.set(binIndex, 4 + 4 * 3 + binTitle.length + binPath.length);

	console.error((bytes.length / docSize) + '\t' + title);

	return {
		title,
		path: entryPath,
		index: bytes,
		docSize,
		indexSize,
	};
};

const argv    = process.argv.slice(2);
const corpus  = iterateDir(argv[0] ?? process.env.PAGES_DIR, processDocument);

let indexSize = 0, corpusSize = 0;

for(const doc of corpus)
{
	corpusSize += doc.docSize;
	indexSize += doc.indexSize;
}

const bin = new Uint8Array(8 + indexSize);

bin.set(enc.encode('SRCH'), 0);
bin.set(enc.encode('HCRS'), indexSize + 4);

let cur = 4;

for(const doc of corpus)
{
	bin.set(doc.index, cur);
	cur += doc.indexSize;
}

console.error( 'Index Size:  ' + (Math.round( indexSize  / (1024 ** 2) * 100 ) / 100) + ' MB' );
console.error( 'Corpus Size: ' + (Math.round( corpusSize / (1024 ** 2) * 100 ) / 100) + ' MB' );
console.error( '             ' + (Math.round( indexSize  / corpusSize * 100 ) / 100) + ' Ratio' );

process.stdout.write(bin);

#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { BloomWriter } from './Writer.mjs';
import { hashWord, ngramsOf, prefixesOf, stripWords } from './helpers.mjs';

const processDir = (dir, corpus = [], mapping = x => x) => {
	for(const entry of fs.readdirSync(dir))
	{
		if(entry[0] === '.') continue;

		const entryPath = path.join(dir, entry);

		if(fs.lstatSync(entryPath).isDirectory())
		{
			processDir(entryPath, corpus, mapping);
		}
		else
		{
			corpus.push( mapping(entryPath) );
		}
	}
}

const enc = new TextEncoder();

const mapping = entryPath => {
	const content = fs.readFileSync(entryPath, {encoding: 'utf8'});
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

	console.error(title);

	const strippedWords = stripWords(title + body);

	const uniqueWords = [...new Set(strippedWords)];
	const hashedWords = [...new Set(uniqueWords.map(hashWord))];
	const prefixes    = [...new Set(uniqueWords.map(x => prefixesOf(x, 4)))].flat();

	const ngrams = [];

	for(let i = 3; i <= 4; i += 1)
	{
		for(const ngram of ngramsOf(i, strippedWords))
		{
			ngrams.push(ngram);
		}
	}

	const all = new Set([...ngrams, ...prefixes, ...hashedWords]);
	const writer = BloomWriter.fromCapacity(all.size, 0.02);

	all.forEach(x => writer.add(x));

	const binTitle = enc.encode(title);
	const binPath  = enc.encode(entryPath.replace(/.md$/, ''));
	const binIndex = writer.toBinary();

	const bytes = new Uint8Array(4 * 4 + binTitle.length + binPath.length + binIndex.length);
	const view = new DataView(bytes.buffer);

	bytes.set(enc.encode('SCHK'));
	
	view.setUint32(4, binTitle.length, true);
	bytes.set(binTitle, 4 + 4 * 1 + 0);
	
	view.setUint32(4 + 4 * 1 + binTitle.length, binPath.length, true);
	bytes.set(binPath, 4 + 4 * 2 + binTitle.length);

	view.setUint32(4 + 4 * 2 + binTitle.length + binPath.length, binIndex.length, true);
	bytes.set(binIndex, 4 + 4 * 3 + binTitle.length + binPath.length);

	return bytes;
}

const argv = process.argv.slice(2);

const corpus = [];
processDir(argv[0] ?? process.env.PAGES_DIR, corpus, mapping);

const { length: binLen } = corpus.reduce((p, c) => {
	
	return {length: p.length + c.length};

}, {length: 0});

const bin = new Uint8Array(8 + binLen);

bin.set(enc.encode('SRCH'), 0);
bin.set(enc.encode('HCRS'), binLen + 4);

let cur = 4;

for(const doc of corpus)
{
	bin.set(doc, cur);
	cur += doc.length;
}

console.error( (bin.length / (1024 * 1024)) + ' MB' );

process.stdout.write(bin);

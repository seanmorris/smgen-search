#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { BloomWriter } from './Writer.mjs';
import { hashWord, ngramsOf, prefixesOf } from './helpers.mjs';

const processDir = (dir, corpus = [], mapping = x => x) => {
	for(const entry of fs.readdirSync(dir))
	{
		if(entry === '.fm.yaml') continue;

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

	const strippedWords = body
		.toLowerCase()
		.replace(/[-_\.,;\/]/g, ' ')
		.replace(/[^\w\s@]/g, '')
		.split(/\s/)
		.filter(x => x !== '');

	const uniqueWords = [...new Set(strippedWords)];
	const hashedWords = [...new Set(uniqueWords.map(hashWord))];
	const prefixes    = [...new Set(uniqueWords.map(x => prefixesOf(x, 3)))].flat();

	const ngrams = [];

	for(let i = 2; i < 7; i++)
	{
		ngrams.push(...ngramsOf(i, strippedWords));
	}

	const count = ngrams.length + prefixes.length + hashedWords.length;
	const writer = BloomWriter.fromCapacity(count, 0.01);

	ngrams.map(x => writer.add(x));
	prefixes.map(x => writer.add(x));
	hashedWords.map(x => writer.add(x));

	// const binTitle = new enc.encode(title);
	// const binPath  = enc.encode(path);
	// const binIndex = writer.toBinary();

	return {
		title,
		path: entryPath.replace(/.md$/, ''),
		index: writer.toJSON(),
		// ngrams,
		// uniqueWords,
		// prefixes,
		// hashedWords,
	};
}

const argv = process.argv.slice(2);

const corpus = [];
processDir(argv[0] ?? process.env.PAGES_DIR, corpus, mapping);
console.log(JSON.stringify(corpus));

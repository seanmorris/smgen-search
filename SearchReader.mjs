import { BloomReader } from './Reader.mjs';
import { hashWord, ngramsOf, prefixesOf, stripWords } from './helpers.mjs';

const MIN_NGRAMS = 2;
const MAX_NGRAMS = 3;
const MIN_PREFIX = 3;
const MAX_PREFIX = 8;

const dec = new TextDecoder();

export class SearchReader
{
	constructor(corpusBuffer)
	{
		this.corpus = this.parseCorpus(corpusBuffer);
	}

	parseCorpus(corpusBuffer)
	{
		const binView = new DataView(corpusBuffer);

		let cur = 0;

		const fileHeader = dec.decode(corpusBuffer.slice(cur, 4));

		if(fileHeader !== 'SRCH')
		{
			throw new Error('Invalid index file, no file header found.');
		}

		cur += 4;

		const entries = [];

		while(cur < corpusBuffer.byteLength)
		{
			const chunkHeader = dec.decode(corpusBuffer.slice(cur, cur + 4));

			if(chunkHeader === 'HCRS')
			{
				break;
			}
			else if(chunkHeader !== 'SCHK')
			{
				throw new Error('Invalid index file, no chunk header found.');
			}

			cur += 4;

			const titleLength = binView.getUint32(cur, true);
			cur += 4;

			const title = dec.decode(corpusBuffer.slice(cur, cur + titleLength));
			cur += titleLength;

			const pathLength = binView.getUint32(cur, true);
			cur += 4;

			const path = dec.decode(corpusBuffer.slice(cur, cur + pathLength));
			cur += pathLength;

			const indexLength = binView.getUint32(cur, true);
			cur += 4;

			const index = corpusBuffer.slice(cur, cur + indexLength);
			cur += indexLength;

			entries.push({title, path, index});
		}

		return entries;
	}

	search(query, minScore = 0)
	{
		const words = stripWords(query);

		if(!words.length) return [];

		const hashedWords = words.map(hashWord);
		const found = new Map;

		const ngrams = [];

		for(let i = MIN_NGRAMS; i <= MAX_NGRAMS; i += 1)
		{
			ngrams.push(...ngramsOf(i, words));
		}

		for(const doc of this.corpus)
		{
			const reader = BloomReader.fromBinary(doc.index);

			const frag = 1 / words.length;
			const titleWords = stripWords(doc.title);

			for(const ngram of ngrams)
			{
				if(titleWords.indexOf(ngram) > -1)
				{
					found.set(doc, 4 + (found.get(doc) ?? 0));
				}

				if(!reader.has(ngram)) continue;
				const i = ngram.split(' ').length;

				found.set(doc, 2 * (i / words.length) + (found.get(doc) ?? 0));
			}

			for(const word of words)
			{
				if(titleWords.includes(word))
				{
					found.set(doc, 0.5 + (found.get(doc) ?? 0));
				}

				if(reader.has(word))
				{
					found.set(doc, frag + (found.get(doc) ?? 0));
					continue;
				}

				const prefixes = prefixesOf(word, MIN_PREFIX, MAX_PREFIX);

				for(const prefix of prefixes)
				{
					if(titleWords.indexOf(prefix) > -1)
					{
						found.set(doc, 0.25 + (found.get(doc) ?? 0));
					}

					if(!reader.has(prefix)) continue;

					found.set(doc, (prefix.length / word.length) * frag + (found.get(doc) ?? 0));

					break;
				}
			}

			for(const word of hashedWords)
			{
				if(!reader.has(word)) continue;

				found.set(doc, frag * 0.125 + (found.get(doc) ?? 0));
			}
		}

		const sorted = ([...found.entries()].sort((a, b) => b[1] - a[1]));

		const filtered = sorted.filter(entry => entry[1] > minScore);

		return filtered;
	}
}

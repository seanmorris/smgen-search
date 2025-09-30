import { BloomReader } from './BloomReader.mjs';
import { hashWord, ngramsOf, prefixesOf, stripWords } from './helpers.mjs';

const dec = new TextDecoder();

export class SearchReader
{
	constructor(corpusBuffer)
	{
		this.corpus = this.parseCorpus(corpusBuffer);

		this.minNgrams = 2;
		this.maxNgrams = 3;

		this.minPrefix = 3;
		this.maxPrefix = 5;
	}

	parseCorpus(corpusBuffer)
	{
		const binView = new DataView(corpusBuffer);

		let cur = 0;

		const fileHeader = dec.decode(corpusBuffer.slice(cur, cur + 4));

		if(fileHeader !== 'SRCH')
		{
			throw new Error('Invalid index file, no file header found.');
		}

		cur += 4;

		this.minNgrams = binView.getUint32(1 * 4, true);
		this.maxNgrams = binView.getUint32(2 * 4, true);

		this.minPrefix = binView.getUint32(3 * 4, true);
		this.maxPrefix = binView.getUint32(4 * 4, true);

		cur += 4 * 4;

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

		for(let i = this.minNgrams; i <= this.maxNgrams; i += 1)
		{
			ngrams.push(...ngramsOf(i, words));
		}

		for(const doc of this.corpus)
		{
			const reader = BloomReader.fromBinary(doc.index);

			const frag = 1 / words.length;
			const titleWords = stripWords(doc.title);
			const strippedTitle = titleWords.join(' ');
			const hashedTitleWords = titleWords.map(hashWord);

			for(const ngram of ngrams)
			{
				if(strippedTitle.indexOf(ngram) > -1)
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
					found.set(doc, 1 + (found.get(doc) ?? 0));
				}

				if(reader.has(word))
				{
					found.set(doc, frag + (found.get(doc) ?? 0));
					continue;
				}

				const prefixes = prefixesOf(word, this.minNgrams, this.maxNgrams);

				for(const prefix of prefixes)
				{
					if(strippedTitle.indexOf(prefix) > -1)
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
				if(hashedTitleWords.includes(word))
				{
					found.set(doc, 1.0 + (found.get(doc) ?? 0));
				}

				if(!reader.has(word)) continue;

				found.set(doc, frag * 0.5 + (found.get(doc) ?? 0));
			}
		}

		const sorted = ([...found.entries()].sort((a, b) => b[1] - a[1]));

		const filtered = sorted.filter(entry => entry[1] > minScore);

		return filtered;
	}
}

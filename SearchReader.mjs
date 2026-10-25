import { BloomReader } from './BloomReader.mjs';
import { hashWord, ngramsOf, prefixesOf, stripWords } from './helpers.mjs';

const decoder = new TextDecoder();

/**
 * Return a byte view that preserves the input buffer's boundaries.
 *
 * @param {ArrayBuffer | ArrayBufferView} input
 * @returns {Uint8Array}
 */
function byteView(input) {
	if (input instanceof ArrayBuffer) return new Uint8Array(input);
	if (ArrayBuffer.isView(input)) return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
	throw new TypeError('Search index must be an ArrayBuffer or typed-array view.');
}

/**
 * Read and query an smgen-search binary index.
 */
export class SearchReader {
	/**
	 * Parse a complete search index.
	 *
	 * @param {ArrayBuffer | ArrayBufferView} corpusBuffer
	 */
	constructor(corpusBuffer) {
		const parsed = this.parseCorpus(corpusBuffer);
		this.corpus = parsed.entries;
		this.minNgrams = parsed.minNgrams;
		this.maxNgrams = parsed.maxNgrams;
		this.minPrefix = parsed.minPrefix;
		this.maxPrefix = parsed.maxPrefix;
	}

	/**
	 * Parse and validate index headers, chunks, and trailer boundaries.
	 *
	 * @param {ArrayBuffer | ArrayBufferView} corpusBuffer
	 * @returns {{entries: Array<{title: string, path: string, index: Uint8Array}>, minNgrams: number, maxNgrams: number, minPrefix: number, maxPrefix: number}} Parsed index state.
	 */
	parseCorpus(corpusBuffer) {
		const bytes = byteView(corpusBuffer);
		if (bytes.byteLength < 24) throw new Error('Invalid index file, expected at least 24 bytes.');
		const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
		const text = (start, end) => decoder.decode(bytes.subarray(start, end));
		const requireBytes = (cursor, count, description) => {
			if (cursor + count > bytes.byteLength) throw new Error(`Invalid index file, truncated ${description}.`);
		};

		if (text(0, 4) !== 'SRCH') throw new Error('Invalid index file, no file header found.');
		const minNgrams = view.getUint32(4, true);
		const maxNgrams = view.getUint32(8, true);
		const minPrefix = view.getUint32(12, true);
		const maxPrefix = view.getUint32(16, true);
		if (!minNgrams || minNgrams > maxNgrams || !minPrefix || minPrefix > maxPrefix) {
			throw new Error('Invalid index file, search settings are inconsistent.');
		}

		const entries = [];
		let cursor = 20;
		let foundTrailer = false;
		while (cursor < bytes.byteLength) {
			requireBytes(cursor, 4, 'chunk header');
			const header = text(cursor, cursor + 4);
			cursor += 4;
			if (header === 'HCRS') {
				foundTrailer = true;
				if (cursor !== bytes.byteLength) throw new Error('Invalid index file, data follows the trailer.');
				break;
			}
			if (header !== 'SCHK') throw new Error('Invalid index file, no chunk header found.');

			requireBytes(cursor, 4, 'title length');
			const titleLength = view.getUint32(cursor, true);
			cursor += 4;
			requireBytes(cursor, titleLength, 'title');
			const title = text(cursor, cursor + titleLength);
			cursor += titleLength;

			requireBytes(cursor, 4, 'path length');
			const pathLength = view.getUint32(cursor, true);
			cursor += 4;
			requireBytes(cursor, pathLength, 'path');
			const resultPath = text(cursor, cursor + pathLength);
			cursor += pathLength;

			requireBytes(cursor, 4, 'Bloom filter length');
			const indexLength = view.getUint32(cursor, true);
			cursor += 4;
			requireBytes(cursor, indexLength, 'Bloom filter');
			const index = bytes.slice(cursor, cursor + indexLength);
			cursor += indexLength;
			entries.push({ title, path: resultPath, index });
		}

		if (!foundTrailer) throw new Error('Invalid index file, no trailer found.');
		return { entries, maxNgrams, maxPrefix, minNgrams, minPrefix };
	}

	/**
	 * Rank indexed pages against one query.
	 *
	 * @param {string} query
	 * @param {number} [minScore]
	 * @returns {Array<[{title: string, path: string, index: Uint8Array}, number]>}
	 */
	search(query, minScore = 0) {
		const words = stripWords(query);
		if (!words.length) return [];

		const hashedWords = words.map(hashWord);
		const found = new Map();
		const ngrams = [];
		for (let size = this.minNgrams; size <= this.maxNgrams; size += 1) {
			ngrams.push(...ngramsOf(size, words));
		}

		for (const document of this.corpus) {
			const reader = BloomReader.fromBinary(document.index);
			const fragment = 1 / words.length;
			const titleWords = stripWords(document.title);
			const strippedTitle = titleWords.join(' ');
			const hashedTitleWords = titleWords.map(hashWord);

			for (const ngram of ngrams) {
				if (strippedTitle.includes(ngram)) found.set(document, 4 + (found.get(document) ?? 0));
				if (!reader.has(ngram)) continue;
				const wordCount = ngram.split(' ').length;
				found.set(document, 2 * (wordCount / words.length) + (found.get(document) ?? 0));
			}

			for (const word of words) {
				if (titleWords.includes(word)) found.set(document, 1 + (found.get(document) ?? 0));
				if (reader.has(word)) {
					found.set(document, fragment + (found.get(document) ?? 0));
					continue;
				}

				for (const prefix of prefixesOf(word, this.minPrefix, this.maxPrefix)) {
					if (strippedTitle.includes(prefix)) found.set(document, 0.25 + (found.get(document) ?? 0));
					if (!reader.has(prefix)) continue;
					found.set(document, (prefix.length / word.length) * fragment + (found.get(document) ?? 0));
					break;
				}
			}

			for (const word of hashedWords) {
				if (hashedTitleWords.includes(word)) found.set(document, 1 + (found.get(document) ?? 0));
				if (reader.has(word)) found.set(document, fragment * 0.5 + (found.get(document) ?? 0));
			}
		}

		return [...found.entries()]
			.sort((left, right) => right[1] - left[1])
			.filter(entry => entry[1] > minScore);
	}
}

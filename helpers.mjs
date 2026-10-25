/** Common words omitted from the search feature set. */
export const skip = ['', 'the', 'a', 'it', 'be', 'to', 'of', 'and', 'that', 'this', 'is', 'are', 'what', 'was', 'do', 'for'];

const suffixes = /(s|es|ment|ness|acy|dom|ce|ge|en|er|ship|sion|tion|ity|ic|ical|al|ize|ise)$/u;

/**
 * Normalize prose into searchable word stems.
 *
 * @param {string} body Source prose or Markdown.
 * @returns {string[]} Normalized words in source order.
 */
export function stripWords(body)
{
	return body.toLowerCase()
		.replace(/<[^>]*>/gu, '')
		.replace(/[-_\.,;/]/gu, ' ')
		.replace(/[^\w\s@]/gu, ' ')
		.split(/\s+/u)
		.filter(word => !skip.includes(word))
		.map(word => word.replace(suffixes, ''))
		.filter(Boolean);
}

/**
 * Reduce a word to its sorted set of consonants for fuzzy matching.
 *
 * @param {string} word Word to reduce.
 * @returns {string} Stable consonant signature.
 */
export function hashWord(word)
{
	return [...new Set(word.replace(/[aeiouy]/giu, ''))].sort().join('');
}

/**
 * Produce contiguous word phrases of one size.
 *
 * @param {number} size Number of words in each phrase.
 * @param {string[]} words Normalized words.
 * @returns {string[]} Contiguous phrases.
 */
export function ngramsOf(size, words)
{
	if(!Number.isInteger(size) || size <= 0 || words.length < size)
	{
		return [];
	}

	const ngrams = [];
	for(let index = 0; index <= words.length - size; index++)
	{
		ngrams.push(words.slice(index, index + size).join(' '));
	}

	return ngrams;
}

/**
 * Produce the indexed prefixes of a word, longest first.
 *
 * @param {string} word Word to split.
 * @param {number} [minLength] Shortest indexed prefix.
 * @param {number} [maxLength] Longest indexed prefix.
 * @returns {string[]} Prefixes in descending length order.
 */
export function prefixesOf(word, minLength = 0, maxLength = Infinity)
{
	if(word.length < minLength)
	{
		return [word];
	}

	const upper = Math.min(word.length, maxLength);
	const lower = Math.max(1, minLength);
	const prefixes = [];
	for(let length = upper; length >= lower; length--)
	{
		prefixes.push(word.slice(0, length));
	}

	return prefixes;
}

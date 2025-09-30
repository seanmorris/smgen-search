export const skip = ['', 'the', 'a', 'it', 'be', 'to', 'of', 'and', 'that', 'this', 'is', 'are', 'what', 'was', 'do', 'for'];

export const stripWords = body =>
	body.toLowerCase()
	.replace(/<[^>]*>/g, '')
	.replace(/[-_\.,;\/]/g, ' ')
	.replace(/[^\w\s@]/g, ' ')
	.split(/\s/)
	.map(x => x.replace('/s$/', ''))
	.filter(x => !skip.includes(x));

export const hashWord = word => [...new Set(word.replace(/[aeiouy]/,''))].sort().join('');

export const ngramsOf = (n, grams) => {
	const ngrams = [];

	for(const i in grams)
	{
		const ii = Number(i);
		if(grams.length < n + ii) break;
		ngrams.push( grams.slice(ii, n + ii).join(' ') );
	}

	return ngrams;
};

export const prefixesOf = (word, minLength = 0, maxLength = Infinity) => {
	const prefixes = [];

	if(word.length < minLength)
	{
		return [word];
	}

	for(const i in word)
	{
		if(i > -1 + maxLength) break;
		if(i < -1 + minLength) continue;
		prefixes.push(word.substr(0, 1 + Number(i)));
	}

	prefixes.reverse();

	return prefixes;
};

export const hashWord = word => [...new Set(word)].sort().join('');

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

export const prefixesOf = (word, minLength = 0) => {
	const prefixes = [];

	if(word.length < minLength)
	{
		return word;
	}

	for(const i in word)
	{
		if(i < -1 + minLength) continue;
		prefixes.push(word.substr(0, 1 + Number(i)));
	}

	return prefixes;
};
# smgen-search

smgen-search builds a compact search index from Markdown and queries it in
Node.js or a browser. SMGen uses the command to add static search without a
server-side search service.

The package has no runtime dependencies. Building an index requires Node.js 20
or newer and [yq](https://github.com/mikefarah/yq) 4. Querying an existing index
only requires JavaScript.

## Install

Install the command globally:

```bash
npm install --global smgen-search
```

To pin it inside a site, install it as a development dependency:

```bash
npm install --save-dev smgen-search
npx smgen-search --help
```

## Build an Index

Pass the Markdown directory and output file:

```bash
smgen-search build-index ./pages ./static/search.bin
```

The builder reads `.md` files recursively. It ignores hidden files, symbolic
links, and other file types. YAML frontmatter can set `title` or exclude a page:

```yaml
---
title: Internal Notes
noSearch: true
---
```

A `.fm.yaml` file applies its values to Markdown files below that directory.
Page frontmatter overrides inherited values.

## Query an Index

Set the index path and pass the query after `search`:

```bash
INDEX_FILE=./static/search.bin smgen-search search "menu configuration"
```

Each result contains its score and Markdown path without the `.md` extension:

```text
3.500 configuration
1.833 navigation/menus
```

## Use the Browser Reader

Import `SearchReader` from the package or copy the reader modules into the
site's static assets:

```js
import { SearchReader } from 'smgen-search';

const response = await fetch('/search.bin');
const reader = new SearchReader(await response.arrayBuffer());
const results = reader.search('menu configuration');

for(const [document, score] of results)
{
	console.log(score, document.title, document.path);
}
```

The package also exports `BloomReader`, `BloomWriter`, and the text feature
helpers. Browser code can import the reader directly from
`smgen-search/reader`.

## Configure the Builder

The command accepts these environment variables:

- `PAGES_DIR`: input directory when `build-index` omits it.
- `INDEX_FILE`: output or query path. Default: `./search.bin`.
- `YQ`: yq executable. Default: `yq`.
- `BLOOM_ERROR_RATE`: Bloom filter false-positive rate. Default: `0.08`.
- `MIN_NGRAMS`: shortest indexed phrase in words. Default: `2`.
- `MAX_NGRAMS`: longest indexed phrase in words. Default: `3`.
- `MIN_PREFIX`: shortest indexed prefix in characters. Default: `3`.
- `MAX_PREFIX`: longest indexed prefix in characters. Default: `5`.

The minimum value cannot exceed its matching maximum. Invalid numeric settings
stop the build with a nonzero status.

## Binary Format

An index starts with `SRCH`, followed by four little-endian 32-bit integers:
`MIN_NGRAMS`, `MAX_NGRAMS`, `MIN_PREFIX`, and `MAX_PREFIX`.

Each document chunk contains:

1. `SCHK`
2. the title byte length and UTF-8 title
3. the path byte length and UTF-8 path
4. the Bloom filter byte length and binary filter

The file ends with `HCRS`. SearchReader validates the header, settings, chunk
boundaries, and trailer before it accepts an index.

## Development

Run the regression suite and inspect the npm archive:

```bash
npm test
npm pack --dry-run
```

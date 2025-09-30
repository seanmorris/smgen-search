# smgen-search

Zero-deps Node.js Bloom-filter–based full-text search and indexing for Markdown files.

## Features

- Approximate full-text search using Bloom filters
- Phrase matching, n-grams, prefixes, and fuzzy-word features
- Custom binary index for fast loading
- Zero runtime dependencies in JavaScript

## Requirements

- Node.js (v14 or later)
- [yq](https://github.com/mikefarah/yq) (for building indexes at development-time)

## Installation

```sh
npm i -g smgen-search
```

## Usage

### 1. Build the index

Scan a directory of Markdown files and write the binary index `search.bin`:

```sh
smgen-search build-index PAGES_DIR INDEX_FILE
```

### 2. Search the index

Run a query against the generated index:

```sh
node search.mjs <search terms>
```

### 3. Example usage

```bash
smgen build-index path/to/markdown/files
smgen search "Hello, world!"
```
```plain
5.357 michael-yin.wagtail-whoosh
3.299 springload.wagtailembedder
3.250 treasure-data.pandas-td
2.904 luckydonald.pytgbot
2.904 nathancatania.ryurest
2.857 harrislapiroff.wagtail-foliage
2.799 astronouth7303.gpotato
2.786 xtream1101.cutil
```

### 4. Browser (web) usage

You can also perform searches directly in a web page by serving the generated `search.bin` as a static asset.
Include `SearchReader.mjs` as an ES module (directly or via your bundler), then load and query the index:

```html
<script type="module">
  import { SearchReader } from './SearchReader.mjs';

  async function initSearch() {
    // Fetch the binary index from your static asset server
    const resp = await fetch('/search.bin');
    const buffer = await resp.arrayBuffer();
    const reader = new SearchReader(buffer);

    // Perform a search (threshold parameter is optional)
    const results = reader.search('your search terms here', 0.00);
    // Output top 10 results
    console.log(results.slice(0, 10));
  }

  initSearch().catch(console.error);
</script>
```

## Commands

### `smgen-search build-index`

*alias smgen bi*

Build the search index and store it in a file.

```sh
smgen-search build-index PAGES_DIR INDEX_FILE
```

* `PAGES_DIR` - Directory to scan for pages.
* `INDEX_FILE` - File to store the index.

`PAGES_DIR` & `INDEX_FILE` can be ALSO be provided as environment variables:

### `smgen-search search`

*alias smgen s*

Search the index and return the results.

```sh
smgen-search search "search terms..."
```


`INDEX_FILE` can be ALSO be provided as an environment variable here:

### Environment variables

The following environment variables can be used to configure the program in CLI mode:

- `INDEX_FILE`: path to index file (default search.bin)
- `PAGES_DIR`: directory to scan for pages
- `BLOOM_ERROR_RATE`: desired false-positive rate for Bloom filters (default: 0.08)
- `MIN_NGRAMS`: minimum n-gram word length to index (default: 2)
- `MAX_NGRAMS`: maximum n-gram word length to index (default: 3)
- `MIN_PREFIX`: minimum prefix char length to index (default: 3)
- `MAX_PREFIX`: maximum prefix char length to index (default: 5)

## Binary format

The custom binary index format consists of:

- File header (4 bytes): ASCII `SRCH`
- Four 4-byte little-endian integers, in order:
  - `MIN_NGRAMS`
  - `MAX_NGRAMS`
  - `MIN_PREFIX`
  - `MAX_PREFIX`
- One or more document chunks, each:
  - 4 bytes: chunk header ASCII `SCHK`
  - 4 bytes (LE): title length, followed by the title UTF-8 bytes
  - 4 bytes (LE): path length, followed by the path UTF-8 bytes (no `.md`)
  - 4 bytes (LE): filter length, followed by the raw Bloom filter bits
- File trailer (4 bytes): ASCII `HCRS`

## Development

- Contributions and improvements are welcome

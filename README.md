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

## Commands

### `smgen build-index`

Build the search index and store it in a file.

*alias smgen bi*

```sh
smgen-search build-index PAGES_DIR INDEX_FILE
```

* `PAGES_DIR` - Directory to scan for pages.
* `INDEX_FILE` - File to store the index.

`PAGES_DIR` & `INDEX_FILE` can be ALSO be provided as environment variables:

### `smgen search`

Search the index and return the results.

```sh
smgen-search search "search terms..."
```

*alias smgen s*

`INDEX_FILE` can be ALSO be provided as an environment variable here:

## Binary format

The custom binary index format consists of:

- A 4-byte file header: `SRCH`
- For each document chunk:
  - A 4-byte chunk header: `SCHK`
  - 4-byte little-endian title length, followed by the title UTF-8 bytes
  - 4-byte little-endian path length, followed by the path UTF-8 bytes
  - 4-byte little-endian filter length, followed by the raw filter bits
- A 4-byte trailer: `HCRS`

## Development

- Contributions and improvements are welcome

# smgen-search

Zero-deps Node.js Bloom-filter–based full-text search and indexing for Markdown files.

## Features

- Approximate full-text search using Bloom filters
- Phrase matching, n-grams, prefixes, and hashed-word features
- Custom binary index for fast loading
- Zero runtime dependencies in JavaScript

## Prerequisites

- Node.js (v14 or later)
- [yq](https://github.com/mikefarah/yq) (for extracting YAML front-matter in the indexer)

## Installation

```sh
git clone <repo-url>
cd smgen-search
# Install dependencies (none are required, but this will set up the repo)
npm install

# Optionally install globally for easy access:
npm install -g .
```

## Usage

### 1. Build the index

Scan a directory of Markdown files and write the binary index to stdout:

```sh
node index.mjs <path/to/markdown/dir> > search.bin
```

Or set the `PAGES_DIR` environment variable:

```sh
PAGES_DIR=path/to/markdown node index.mjs > search.bin
```

### 2. Search the index

Run a query against the generated index:

```sh
node search.mjs <search terms>
```

Results are scored and filtered by a minimum threshold (0.10 by default). Adjust `minScore` in `search.mjs` to change filtering.

### 3. Example usage

```sh
node TinyBloom.mjs
```

The `TinyBloom.mjs` script demonstrates basic `BloomWriter`/`BloomReader` usage.

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

- No linting or test suite configured
- Contributions and improvements are welcome
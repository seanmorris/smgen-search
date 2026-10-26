#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { BloomWriter } from './BloomWriter.mjs';
import { hashWord, ngramsOf, prefixesOf, stripWords } from './helpers.mjs';
import { SearchReader } from './SearchReader.mjs';

const encoder = new TextEncoder();
const frontmatterPattern = /^---[^\S\r\n]*\r?\n[\s\S]*?\r?\n(?:---|\.\.\.)[^\S\r\n]*(?:\r?\n|$)/u;

/**
 * Read and validate one numeric environment setting.
 *
 * @param {NodeJS.ProcessEnv} environment
 * @param {string} name
 * @param {number} fallback
 * @param {{integer?: boolean, minimum: number, maximum: number}} limits
 * @returns {number}
 */
function numericSetting(environment, name, fallback, limits) {
	const raw = environment[name];
	if (raw === undefined || raw === '') return fallback;
	const value = Number(raw);
	if (!Number.isFinite(value) || (limits.integer && !Number.isInteger(value)) ||
		value < limits.minimum || value > limits.maximum) {
		throw new Error(`${name} must be ${limits.integer ? 'an integer' : 'a number'} from ${limits.minimum} to ${limits.maximum}.`);
	}
	return value;
}

/**
 * Read search index settings from an environment mapping.
 *
 * @param {NodeJS.ProcessEnv} [environment]
 * @returns {{errorRate: number, minNgrams: number, maxNgrams: number, minPrefix: number, maxPrefix: number, yq: string}} Validated settings.
 */
export function readSettings(environment = process.env) {
	const settings = {
		errorRate: numericSetting(environment, 'BLOOM_ERROR_RATE', 0.08, { minimum: Number.EPSILON, maximum: 0.999999 }),
		minNgrams: numericSetting(environment, 'MIN_NGRAMS', 2, { integer: true, minimum: 1, maximum: 16 }),
		maxNgrams: numericSetting(environment, 'MAX_NGRAMS', 3, { integer: true, minimum: 1, maximum: 16 }),
		minPrefix: numericSetting(environment, 'MIN_PREFIX', 3, { integer: true, minimum: 1, maximum: 128 }),
		maxPrefix: numericSetting(environment, 'MAX_PREFIX', 5, { integer: true, minimum: 1, maximum: 128 }),
		yq: environment.YQ || 'yq',
	};
	if (settings.minNgrams > settings.maxNgrams) throw new Error('MIN_NGRAMS must not exceed MAX_NGRAMS.');
	if (settings.minPrefix > settings.maxPrefix) throw new Error('MIN_PREFIX must not exceed MAX_PREFIX.');
	return settings;
}

/**
 * Parse one YAML file through the supported yq command.
 *
 * @param {string} filename
 * @param {string} yq
 * @param {boolean} frontmatter
 * @returns {Record<string, unknown>}
 */
function readYaml(filename, yq, frontmatter) {
	const args = frontmatter
		? ['--front-matter=extract', '-o=json', 'select(di == 0)', filename]
		: ['-o=json', 'select(di == 0)', filename];
	const json = execFileSync(yq, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
	const value = JSON.parse(json || '{}');
	return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

/**
 * Split YAML frontmatter from the searchable Markdown body.
 *
 * @param {string} source
 * @returns {{body: string, hasFrontmatter: boolean}}
 */
export function splitFrontmatter(source) {
	const match = source.match(frontmatterPattern);
	if (!match) return { body: source, hasFrontmatter: false };
	return { body: source.slice(match[0].length), hasFrontmatter: true };
}

/**
 * Build a readable title when frontmatter does not provide one.
 *
 * @param {string} body
 * @param {string} docPath
 * @returns {string}
 */
function fallbackTitle(body, docPath) {
	const heading = body.match(/^#\s+(.+?)\s*$/mu)?.[1];
	if (heading) return heading.replace(/\s+\{#[^}]+\}\s*$/u, '').trim();
	return path.basename(docPath)
		.replace(/\.md$/iu, '')
		.replace(/[-_]+/gu, ' ')
		.replace(/\b[a-z]/gu, letter => letter.toUpperCase());
}

/**
 * Convert one Markdown page into a binary search-index chunk.
 *
 * @param {string} docPath
 * @param {Record<string, unknown>} frontmatter
 * @param {string} body
 * @param {ReturnType<typeof readSettings>} settings
 * @returns {{title: string, path: string, index: Uint8Array, docSize: number, indexSize: number}} Encoded document entry.
 */
export function processDocument(docPath, frontmatter, body, settings) {
	const configuredTitle = typeof frontmatter.title === 'string' ? frontmatter.title.trim() : '';
	const title = configuredTitle || fallbackTitle(body, docPath);
	const strippedWords = stripWords(`${title}\n${body}`);
	const uniqueWords = [...new Set(strippedWords)];
	const hashedWords = [...new Set(uniqueWords.map(hashWord))];
	const prefixes = uniqueWords.flatMap(word => prefixesOf(word, settings.minPrefix, settings.maxPrefix));
	const ngrams = [];

	for (let size = settings.minNgrams; size <= settings.maxNgrams; size += 1) {
		ngrams.push(...ngramsOf(size, strippedWords));
	}

	const terms = new Set([...uniqueWords, ...ngrams, ...hashedWords, ...prefixes]);
	if (!terms.size) terms.add(docPath.toLowerCase());
	const writer = BloomWriter.fromCapacity(terms.size, settings.errorRate);
	for (const term of terms) writer.add(term);

	const binTitle = encoder.encode(title);
	const resultPath = docPath.replace(/\.md$/iu, '');
	const binPath = encoder.encode(resultPath);
	const binIndex = writer.toBinary();
	const bytes = new Uint8Array(16 + binTitle.length + binPath.length + binIndex.length);
	const view = new DataView(bytes.buffer);

	bytes.set(encoder.encode('SCHK'));
	view.setUint32(4, binTitle.length, true);
	bytes.set(binTitle, 8);
	view.setUint32(8 + binTitle.length, binPath.length, true);
	bytes.set(binPath, 12 + binTitle.length);
	view.setUint32(12 + binTitle.length + binPath.length, binIndex.length, true);
	bytes.set(binIndex, 16 + binTitle.length + binPath.length);

	return {
		title,
		path: resultPath,
		index: bytes,
		docSize: Buffer.byteLength(body),
		indexSize: bytes.length,
	};
}

/**
 * Read Markdown pages recursively without following symbolic links.
 *
 * @param {string} directory
 * @param {string} rootDirectory
 * @param {Record<string, unknown>} inherited Directory metadata inherited by this level.
 * @param {ReturnType<typeof readSettings>} settings
 * @returns {ReturnType<typeof processDocument>[]}
 */
function readDocuments(directory, rootDirectory, inherited, settings) {
	const directoryMetadataPath = path.join(directory, '.fm.yaml');
	const localMetadata = fs.existsSync(directoryMetadataPath)
		? { ...inherited, ...readYaml(directoryMetadataPath, settings.yq, false) }
		: inherited;
	const documents = [];
	const entries = fs.readdirSync(directory, { withFileTypes: true })
		.sort((left, right) => left.name.localeCompare(right.name));

	for (const entry of entries) {
		if (entry.name.startsWith('.') || entry.isSymbolicLink()) continue;
		const filename = path.join(directory, entry.name);
		if (entry.isDirectory()) {
			documents.push(...readDocuments(filename, rootDirectory, localMetadata, settings));
			continue;
		}
		if (!entry.isFile() || path.extname(entry.name).toLowerCase() !== '.md') continue;

		const source = fs.readFileSync(filename, 'utf8');
		const split = splitFrontmatter(source);
		const pageMetadata = split.hasFrontmatter ? readYaml(filename, settings.yq, true) : {};
		const metadata = { ...localMetadata, ...pageMetadata };
		if (metadata.noSearch === true) continue;
		const docPath = path.relative(rootDirectory, filename).split(path.sep).join('/');
		documents.push(processDocument(docPath, metadata, split.body, settings));
	}

	return documents;
}

/**
 * Build one binary index from a directory of Markdown pages.
 *
 * @param {string} inputDirectory
 * @param {string} outputFile
 * @param {ReturnType<typeof readSettings>} [settings]
 * @returns {{corpusSize: number, documentCount: number, indexSize: number, outputFile: string}} Build statistics and output path.
 */
export function buildIndex(inputDirectory, outputFile, settings = readSettings()) {
	if (!inputDirectory) throw new Error('PAGES_DIR is required.');
	const rootDirectory = path.resolve(inputDirectory);
	if (!fs.statSync(rootDirectory, { throwIfNoEntry: false })?.isDirectory()) {
		throw new Error(`Pages directory does not exist: ${inputDirectory}`);
	}
	const documents = readDocuments(rootDirectory, rootDirectory, {}, settings);
	const indexSize = documents.reduce((total, document) => total + document.indexSize, 0);
	const corpusSize = documents.reduce((total, document) => total + document.docSize, 0);
	const bytes = new Uint8Array(24 + indexSize);
	const view = new DataView(bytes.buffer);

	bytes.set(encoder.encode('SRCH'));
	view.setUint32(4, settings.minNgrams, true);
	view.setUint32(8, settings.maxNgrams, true);
	view.setUint32(12, settings.minPrefix, true);
	view.setUint32(16, settings.maxPrefix, true);

	let cursor = 20;
	for (const document of documents) {
		bytes.set(document.index, cursor);
		cursor += document.indexSize;
	}
	bytes.set(encoder.encode('HCRS'), cursor);

	const resolvedOutput = path.resolve(outputFile || './search.bin');
	fs.mkdirSync(path.dirname(resolvedOutput), { recursive: true });
	fs.writeFileSync(resolvedOutput, bytes);
	return { corpusSize, documentCount: documents.length, indexSize: bytes.length, outputFile: resolvedOutput };
}

/**
 * Search one binary index and print its highest-scoring paths.
 *
 * @param {string} indexFile
 * @param {string} query
 * @returns {number}
 */
export function searchIndex(indexFile, query) {
	if (!query.trim()) throw new Error('Search terms are required.');
	const reader = new SearchReader(fs.readFileSync(indexFile));
	const results = reader.search(query, 0).slice(0, 15);
	for (const [document, score] of results) console.log(Number(score).toFixed(3), document.path);
	return results.length;
}

/**
 * Print command help to an output stream.
 *
 * @param {NodeJS.WritableStream} [stream] Destination stream.
 * @returns {void}
 */
function printHelp(stream = process.stdout) {
	stream.write(`Usage: smgen-search <command> [arguments]\n\nCommands:\n  build-index <pages> [output]  Build an index from Markdown pages.\n  search <terms...>             Search an index.\n  help                          Print this help message.\n\nEnvironment:\n  INDEX_FILE                    Index path; defaults to ./search.bin.\n  PAGES_DIR                     Pages path when build-index omits it.\n  YQ                            yq command; defaults to yq.\n  BLOOM_ERROR_RATE              Bloom filter false-positive rate.\n  MIN_NGRAMS, MAX_NGRAMS        Indexed phrase lengths.\n  MIN_PREFIX, MAX_PREFIX        Indexed prefix lengths.\n`);
}

/**
 * Run the command-line interface and return its process status.
 *
 * @param {string[]} [argv]
 * @param {NodeJS.ProcessEnv} [environment]
 * @returns {number}
 */
export function runCli(argv = process.argv.slice(2), environment = process.env) {
	const command = argv[0];
	try {
		switch (command) {
			case undefined:
			case 'help':
			case '--help':
			case '-h':
				printHelp();
				return 0;
			case 'build-index':
			case 'bi': {
				const inputDirectory = argv[1] || environment.PAGES_DIR;
				const outputFile = argv[2] || environment.INDEX_FILE || './search.bin';
				const result = buildIndex(inputDirectory || '', outputFile, readSettings(environment));
				console.error(`Indexed ${result.documentCount} pages in ${(result.indexSize / 1024).toFixed(1)} KiB.`);
				return 0;
			}
			case 'search':
			case 's':
				searchIndex(environment.INDEX_FILE || './search.bin', argv.slice(1).join(' '));
				return 0;
			default:
				console.error(`Unknown command: ${command}`);
				printHelp(process.stderr);
				return 1;
		}
	} catch (error) {
		console.error(`smgen-search: ${error instanceof Error ? error.message : String(error)}`);
		return 1;
	}
}

let invokedPath = '';
try {
	invokedPath = process.argv[1] ? fs.realpathSync(process.argv[1]) : '';
} catch {
	invokedPath = '';
}
if (invokedPath === fileURLToPath(import.meta.url)) process.exitCode = runCli();

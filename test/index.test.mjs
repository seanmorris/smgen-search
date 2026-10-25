import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { SearchReader } from '../SearchReader.mjs';
import { buildIndex, readSettings, splitFrontmatter } from '../index.mjs';

const projectDirectory = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const temporaryDirectories = [];

/**
 * Create a temporary directory removed after the test process exits.
 *
 * @param {string} name Directory name prefix.
 * @returns {string} Created directory path.
 */
function temporaryDirectory(name)
{
	const directory = fs.mkdtempSync(path.join(os.tmpdir(), `${name}-`));
	temporaryDirectories.push(directory);
	return directory;
}

/**
 * Write a small yq-compatible fixture for title and noSearch metadata.
 *
 * @param {string} directory Parent directory.
 * @returns {string} Executable path.
 */
function writeFixtureYq(directory)
{
	const executable = path.join(directory, 'fixture-yq.mjs');
	fs.writeFileSync(executable, `#!/usr/bin/env node
import fs from 'node:fs';
const filename = process.argv.at(-1);
let source = fs.readFileSync(filename, 'utf8');
if(process.argv.includes('--front-matter=extract'))
{
  const match = source.match(/^---\\s*\\n([\\s\\S]*?)\\n(?:---|\\.\\.)\\s*(?:\\n|$)/u);
  source = match?.[1] ?? '';
}
const metadata = {};
for(const line of source.split(/\\r?\\n/u))
{
  const match = line.match(/^([A-Za-z][A-Za-z0-9]*):\\s*(.*?)\\s*$/u);
  if(!match) continue;
  metadata[match[1]] = match[2] === 'true' ? true : match[2] === 'false' ? false : match[2];
}
process.stdout.write(JSON.stringify(metadata));
`);
	fs.chmodSync(executable, 0o755);
	return executable;
}

after(() => {
	for(const directory of temporaryDirectories)
	{
		fs.rmSync(directory, { recursive: true, force: true });
	}
});

test('readSettings keeps MAX_PREFIX independent from MIN_PREFIX', () => {
	const settings = readSettings({ MIN_PREFIX: '2', MAX_PREFIX: '9' });
	assert.equal(settings.minPrefix, 2);
	assert.equal(settings.maxPrefix, 9);
	assert.throws(
		() => readSettings({ MIN_NGRAMS: '4', MAX_NGRAMS: '2' }),
		/MIN_NGRAMS must not exceed MAX_NGRAMS/u,
	);
});

test('splitFrontmatter removes a complete YAML header only', () => {
	assert.deepEqual(
		splitFrontmatter('---\ntitle: Example\n---\n# Body\n'),
		{ body: '# Body\n', hasFrontmatter: true },
	);
	assert.deepEqual(
		splitFrontmatter('---\ntitle: Incomplete\n# Body\n'),
		{ body: '---\ntitle: Incomplete\n# Body\n', hasFrontmatter: false },
	);
});

test('buildIndex reads Markdown only and writes a queryable bounded buffer', () => {
	const directory = temporaryDirectory('smgen-search-index');
	const pages = path.join(directory, 'pages');
	const output = path.join(directory, 'assets', 'search.bin');
	fs.mkdirSync(path.join(pages, 'guide'), { recursive: true });
	fs.writeFileSync(path.join(pages, 'index.md'), '# Welcome\n\nBuild a static documentation site.\n');
	fs.writeFileSync(path.join(pages, 'guide', 'menus.md'), '# Menu Guide\n\nConfigure navigation menus.\n');
	fs.writeFileSync(path.join(pages, 'ignored.txt'), 'This text must not enter the index.\n');

	const result = buildIndex(pages, output, readSettings({}));
	assert.equal(result.documentCount, 2);
	assert.equal(result.outputFile, output);

	const binary = fs.readFileSync(output);
	const backing = Buffer.alloc(binary.length + 13, 255);
	binary.copy(backing, 5);
	const reader = new SearchReader(backing.subarray(5, 5 + binary.length));
	assert.equal(reader.search('navigation menus')[0][0].path, 'guide/menus');
	assert.deepEqual(reader.corpus.map(document => document.path).sort(), ['guide/menus', 'index']);
	assert.equal(reader.minPrefix, 3);
	assert.equal(reader.maxPrefix, 5);
});

test('buildIndex applies directory metadata and page overrides', () => {
	const directory = temporaryDirectory('smgen-search-frontmatter');
	const pages = path.join(directory, 'pages');
	const output = path.join(directory, 'search.bin');
	fs.mkdirSync(pages);
	fs.writeFileSync(path.join(pages, '.fm.yaml'), 'title: Inherited Title\n');
	fs.writeFileSync(path.join(pages, 'inherited.md'), '# Ignored Heading\n\nInherited body.\n');
	fs.writeFileSync(path.join(pages, 'override.md'), '---\ntitle: Page Title\n---\n# Body Heading\n');
	fs.writeFileSync(path.join(pages, 'private.md'), '---\nnoSearch: true\n---\n# Private\n');
	const settings = readSettings({ YQ: writeFixtureYq(directory) });

	buildIndex(pages, output, settings);
	const documents = new SearchReader(fs.readFileSync(output)).corpus
		.map(({ path: documentPath, title }) => ({ path: documentPath, title }));
	assert.deepEqual(documents, [
		{ path: 'inherited', title: 'Inherited Title' },
		{ path: 'override', title: 'Page Title' },
	]);
});

test('SearchReader rejects truncated indexes and data after the trailer', () => {
	const directory = temporaryDirectory('smgen-search-invalid');
	const pages = path.join(directory, 'pages');
	const output = path.join(directory, 'search.bin');
	fs.mkdirSync(pages);
	fs.writeFileSync(path.join(pages, 'index.md'), '# Valid\n');
	buildIndex(pages, output, readSettings({}));
	const binary = fs.readFileSync(output);

	assert.throws(() => new SearchReader(binary.subarray(0, -1)), /truncated chunk header/u);
	assert.throws(() => new SearchReader(Buffer.concat([binary, Buffer.from([0])])), /data follows the trailer/u);
});

test('the CLI reports invalid commands and can build and query an index', () => {
	const invalid = spawnSync(process.execPath, ['index.mjs', 'unknown'], {
		cwd: projectDirectory,
		encoding: 'utf8',
	});
	assert.equal(invalid.status, 1);
	assert.match(invalid.stderr, /Unknown command: unknown/u);

	const directory = temporaryDirectory('smgen-search-cli');
	const pages = path.join(directory, 'pages');
	const output = path.join(directory, 'search.bin');
	fs.mkdirSync(pages);
	fs.writeFileSync(path.join(pages, 'index.md'), '# Command Test\n\nSearchable content.\n');
	const built = spawnSync(process.execPath, ['index.mjs', 'build-index', pages, output], {
		cwd: projectDirectory,
		encoding: 'utf8',
	});
	assert.equal(built.status, 0, built.stderr);
	assert.match(built.stderr, /Indexed 1 pages/u);

	const searched = spawnSync(process.execPath, ['index.mjs', 'search', 'searchable'], {
		cwd: projectDirectory,
		encoding: 'utf8',
		env: { ...process.env, INDEX_FILE: output },
	});
	assert.equal(searched.status, 0, searched.stderr);
	assert.match(searched.stdout, /index/u);
});

test('the packed package installs its public modules and executable', () => {
	const directory = temporaryDirectory('smgen-search-package');
	const packed = spawnSync('npm', [
		'pack',
		'--ignore-scripts',
		'--silent',
		'--pack-destination',
		directory,
	], {
		cwd: projectDirectory,
		encoding: 'utf8',
		env: { ...process.env, npm_config_dry_run: 'false' },
	});
	assert.equal(packed.status, 0, packed.stderr);
	const archive = path.join(directory, packed.stdout.trim().split(/\r?\n/u).at(-1));
	const consumer = path.join(directory, 'consumer');
	fs.mkdirSync(consumer);
	fs.writeFileSync(path.join(consumer, 'package.json'), '{"private":true,"type":"module"}\n');
	const installed = spawnSync('npm', [
		'install',
		'--ignore-scripts',
		'--no-audit',
		'--no-fund',
		'--no-package-lock',
		archive,
	], {
		cwd: consumer,
		encoding: 'utf8',
		env: { ...process.env, npm_config_dry_run: 'false' },
	});
	assert.equal(installed.status, 0, installed.stderr);

	const help = spawnSync(path.join(consumer, 'node_modules', '.bin', 'smgen-search'), ['--help'], {
		cwd: consumer,
		encoding: 'utf8',
	});
	assert.equal(help.status, 0, help.stderr);
	assert.match(help.stdout, /Usage: smgen-search/u);
	assert.ok(fs.existsSync(path.join(consumer, 'node_modules', 'smgen-search', 'SearchReader.mjs')));
});

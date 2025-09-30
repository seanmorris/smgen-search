#!/usr/bin/env node

import fs from 'node:fs';
import { SearchReader } from './SearchReader.mjs';

const argv = process.argv.slice(2);

const cb = fs.readFileSync('search.bin').buffer;
const searchReader = new SearchReader( cb );

console.time('Search');
console.log(argv.join(' '));
const results = searchReader.search(argv.join(' '), 0.00);
console.timeEnd('Search');

console.log(results.map(r => [r[0].path, r[1]]).slice(0, 5));

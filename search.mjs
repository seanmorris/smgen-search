#!/usr/bin/env node

import fs from 'node:fs';
import { SearchReader } from './SearchReader.mjs';

const argv = process.argv.slice(2);

const searchReader = new SearchReader( fs.readFileSync('search.bin').buffer );

console.time('Search');
const results = searchReader.search(argv.join(' '), 0.00);
console.timeEnd('Search');

results
.slice(0, 15)
.forEach(r => console.log( Number(r[1]).toFixed(3), r[0].path ) );

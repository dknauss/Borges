#!/usr/bin/env node
/**
 * Generates src/benchmarks/fixtures/csl-200.json — 200 CSL-JSON entries
 * spanning all supported source types with varied authors and years.
 *
 * Usage: node scripts/generate-benchmark-fixtures.js
 */

'use strict';

const fs = require('fs');
const path = require('path');

const SURNAMES = [
	'Abbott',
	'Achebe',
	'Adorno',
	'Ahmad',
	'Arendt',
	'Atwood',
	'Azoulay',
	'Barad',
	'Barthes',
	'Beauvoir',
	'Benjamin',
	'Berlant',
	'Bourdieu',
	'Butler',
	'Chakrabarty',
	'Chomsky',
	'Crenshaw',
	'Crimp',
	'Damasio',
	'Dean',
	'Deleuze',
	'Derrida',
	'Dolar',
	'Douglas',
	'Eagleton',
	'Elden',
	'Ellison',
	'Fanon',
	'Foucault',
	'Fraser',
	'Freud',
	'Geertz',
	'Gilroy',
	'Gramsci',
	'Hall',
	'Haraway',
	'Harvey',
	'Hayles',
	'Hegel',
	'Heidegger',
	'hooks',
	'Irigaray',
	'Jameson',
	'Kant',
	'Kristeva',
	'Lacan',
	'Latour',
	'Levi-Strauss',
	'Lorde',
	'Lukacs',
	'Lyotard',
	'Marx',
	'Massey',
	'Mbembe',
	'Merleau-Ponty',
	'Mignolo',
	'Moraga',
	'Morrison',
	'Mouffe',
	'Nancy',
	'Nussbaum',
	'Ong',
	'Parisi',
	'Peirce',
	'Polanyi',
	'Quijano',
	'Ranciere',
	'Rawls',
	'Ricoeur',
	'Said',
	'Saussure',
	'Sedgwick',
	'Senghor',
	'Sharpe',
	'Simmel',
	'Smith',
	'Spivak',
	'Taylor',
	'Tsing',
	'Turner',
	'Vattimo',
	'Virilio',
	'Wallerstein',
	'Weber',
	'West',
	'Williams',
	'Wittgenstein',
	'Wynter',
	'Zizek',
];

const GIVEN = [
	'Alex',
	'Jordan',
	'Morgan',
	'Robin',
	'Sam',
	'Taylor',
	'Quinn',
	'Drew',
];
const JOURNALS = [
	'Journal of Comparative Literature',
	'Critical Inquiry',
	'New Left Review',
	'Social Text',
	'PMLA',
	'American Literature',
	'Cultural Studies',
	'Theory, Culture & Society',
	'Feminist Review',
	'Postcolonial Studies',
	'boundary 2',
	'Representations',
];
const PUBLISHERS = [
	'University of Chicago Press',
	'Duke University Press',
	'Verso',
	'Routledge',
	'Polity Press',
	'MIT Press',
	'Oxford University Press',
	'Princeton University Press',
	'Columbia University Press',
	'Harvard University Press',
];
const PLACES = [
	'Chicago',
	'Durham',
	'London',
	'New York',
	'Cambridge',
	'Oxford',
];
const INSTITUTIONS = [
	'University of Chicago',
	'Duke University',
	'Columbia University',
	'Harvard University',
	'MIT',
];
const DOMAINS = [
	'www.jstor.org',
	'www.muse.jhu.edu',
	'www.tandfonline.com',
	'www.cambridge.org',
	'www.wiley.com',
];

function pick(arr, index) {
	return arr[index % arr.length];
}

function year(index) {
	return 1990 + (index % 35);
}

function doi(index) {
	return `10.9999/benchmark.${String(index + 1).padStart(4, '0')}`;
}

function url(index) {
	return `https://${pick(DOMAINS, index)}/article/${String(
		index + 1
	).padStart(6, '0')}`;
}

function author(index, offset = 0) {
	return {
		family: pick(SURNAMES, index + offset),
		given: pick(GIVEN, index),
	};
}

function issued(index) {
	return { 'date-parts': [[year(index)]] };
}

function makeArticle(i) {
	return {
		id: `benchmark-${i + 1}`,
		type: 'article-journal',
		title: `Benchmark article title ${i + 1}: a critical reading`,
		author: [author(i), author(i, 10)],
		'container-title': pick(JOURNALS, i),
		volume: String(10 + (i % 30)),
		issue: String(1 + (i % 4)),
		page: `${100 + i * 3}–${103 + i * 3}`,
		issued: issued(i),
		DOI: doi(i),
	};
}

function makeBook(i) {
	return {
		id: `benchmark-${i + 1}`,
		type: 'book',
		title: `Benchmark book title ${i + 1}: a scholarly monograph`,
		author: [author(i)],
		publisher: pick(PUBLISHERS, i),
		'publisher-place': pick(PLACES, i),
		issued: issued(i),
	};
}

function makeChapter(i) {
	return {
		id: `benchmark-${i + 1}`,
		type: 'chapter',
		title: `Benchmark chapter title ${i + 1}: situated knowledge`,
		author: [author(i)],
		editor: [author(i, 20)],
		'container-title': `Benchmark edited volume ${1 + (i % 15)}`,
		publisher: pick(PUBLISHERS, i),
		'publisher-place': pick(PLACES, i),
		page: `${50 + i * 2}–${70 + i * 2}`,
		issued: issued(i),
	};
}

function makeThesis(i) {
	return {
		id: `benchmark-${i + 1}`,
		type: 'thesis',
		title: `Benchmark thesis ${
			i + 1
		}: interdisciplinary approaches to knowledge`,
		author: [author(i)],
		publisher: pick(INSTITUTIONS, i),
		genre: i % 2 === 0 ? 'PhD dissertation' : "Master's thesis",
		issued: issued(i),
	};
}

function makeWebpage(i) {
	return {
		id: `benchmark-${i + 1}`,
		type: 'webpage',
		title: `Benchmark online source ${
			i + 1
		}: digital humanities perspectives`,
		author: [author(i)],
		'container-title': `Benchmark Journal Online ${1 + (i % 8)}`,
		issued: issued(i),
		accessed: { 'date-parts': [[2024, 1, 15]] },
		URL: url(i),
	};
}

function makeReport(i) {
	return {
		id: `benchmark-${i + 1}`,
		type: 'report',
		title: `Benchmark report ${
			i + 1
		}: empirical findings and policy implications`,
		author: [author(i)],
		publisher: pick(INSTITUTIONS, i),
		number: String(100 + i),
		issued: issued(i),
		URL: url(i),
	};
}

function generate(count) {
	const entries = [];
	// Proportional mix: ~40% article, 20% book, 15% chapter, 10% thesis, 10% webpage, 5% report
	const types = [
		{ make: makeArticle, share: 40 },
		{ make: makeBook, share: 20 },
		{ make: makeChapter, share: 15 },
		{ make: makeThesis, share: 10 },
		{ make: makeWebpage, share: 10 },
		{ make: makeReport, share: 5 },
	];

	const total = types.reduce((sum, t) => sum + t.share, 0);
	let globalIndex = 0;
	let remainder = count;

	for (const [typeIndex, type] of types.entries()) {
		const isLast = typeIndex === types.length - 1;
		const n = isLast ? remainder : Math.round((type.share / total) * count);
		remainder -= n;
		for (let j = 0; j < n; j++) {
			entries.push(type.make(globalIndex));
			globalIndex++;
		}
	}

	// Shuffle so types are interleaved (deterministic Fisher-Yates)
	let seed = 42;
	function rand(n) {
		// eslint-disable-next-line no-bitwise -- deterministic LCG PRNG for reproducible fixtures
		seed = (seed * 1664525 + 1013904223) & 0xffffffff;
		return Math.abs(seed) % n;
	}
	for (let i = entries.length - 1; i > 0; i--) {
		const j = rand(i + 1);
		[entries[i], entries[j]] = [entries[j], entries[i]];
	}

	// Re-assign IDs after shuffle so they are 1-based sequential
	return entries.map((entry, i) => ({ ...entry, id: `benchmark-${i + 1}` }));
}

const outDir = path.join(__dirname, '..', 'src', 'benchmarks', 'fixtures');
const entries = generate(200);
const outPath = path.join(outDir, 'csl-200.json');
// One entry per line so the file is readable but stays under commit size limits.
const lines = [
	'[',
	...entries.map(
		(e, i) => JSON.stringify(e) + (i < entries.length - 1 ? ',' : '')
	),
	']',
];
fs.writeFileSync(outPath, lines.join('\n') + '\n');
// eslint-disable-next-line no-console -- CLI generator script intentionally reports output path
console.log(`Wrote ${entries.length} entries to ${outPath}`);

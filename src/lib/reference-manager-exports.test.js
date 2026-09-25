/**
 * Reference-manager export corpus, run through the real citation-js parser.
 *
 * Each fixture in `__fixtures__/reference-manager-exports/` models one
 * manager's export style (see that directory's README for provenance). The
 * suite pins what Borges extracts from a whole-file paste, so a citation-js
 * upgrade or a parser change that drops a record or a field fails here.
 */
import fs from 'fs';
import path from 'path';

import { parsePastedInput } from './parser';

jest.mock('@wordpress/api-fetch', () => jest.fn());

const FIXTURE_DIR = path.join(
	__dirname,
	'__fixtures__',
	'reference-manager-exports'
);

function readFixture(name) {
	return fs.readFileSync(path.join(FIXTURE_DIR, name), 'utf8');
}

async function parseExport(name, expectedCount) {
	const result = await parsePastedInput(readFixture(name));

	expect(result.errors).toEqual([]);
	expect(result.entries).toHaveLength(expectedCount);
	result.entries.forEach((entry) => {
		expect(entry.inputFormat).toBe('bibtex');
	});

	return result.entries.map((entry) => entry.csl);
}

function byTitle(cslItems, titleStart) {
	const match = cslItems.find((csl) => csl.title?.startsWith(titleStart));

	expect(match).toBeDefined();

	return match;
}

const NUMPY = {
	type: 'article-journal',
	title: 'Array programming with NumPy',
	'container-title': 'Nature',
	volume: '585',
	issue: '7825',
	page: '357-362',
	DOI: '10.1038/s41586-020-2649-2',
};

const KUHN = {
	type: 'book',
	title: 'The Structure of Scientific Revolutions',
	publisher: 'University of Chicago Press',
	'publisher-place': 'Chicago',
	author: [{ family: 'Kuhn', given: 'Thomas S.' }],
	issued: { 'date-parts': [[1962]] },
};

const GEERTZ = {
	type: 'chapter',
	title: 'Thick Description: Toward an Interpretive Theory of Culture',
	'container-title': 'The Interpretation of Cultures',
	publisher: 'Basic Books',
	'publisher-place': 'New York',
	page: '3-30',
};

const GODEL = {
	type: 'article-journal',
	title: 'Über formal unentscheidbare Sätze der Principia Mathematica und verwandter Systeme I',
	'container-title': 'Monatshefte für Mathematik und Physik',
	author: [{ family: 'Gödel', given: 'Kurt' }],
	volume: '38',
	issue: '1',
	page: '173-198',
	DOI: '10.1007/BF01700692',
};

describe('reference-manager export corpus (real citation-js)', () => {
	describe('Zotero BibTeX', () => {
		it('imports every record, including one whose abstract has a paragraph break', async () => {
			const items = await parseExport('zotero-bibtex.bib', 5);
			const numpy = byTitle(items, 'Array programming');

			expect(numpy).toMatchObject({
				...NUMPY,
				issued: { 'date-parts': [[2020, 9]] },
				language: 'en',
			});
			expect(numpy.abstract).toContain(
				'NumPy is the primary array programming library'
			);
			expect(numpy.author[2]).toMatchObject({
				family: 'Walt',
				given: 'Stéfan J.',
				'non-dropping-particle': 'van der',
			});
		});

		it('maps books, chapters, conference papers, and UTF-8 titles', async () => {
			const items = await parseExport('zotero-bibtex.bib', 5);

			expect(byTitle(items, 'The Structure')).toMatchObject(KUHN);
			expect(byTitle(items, 'Thick Description')).toMatchObject(GEERTZ);
			expect(byTitle(items, 'Attention')).toMatchObject({
				type: 'paper-conference',
				'container-title':
					'Advances in Neural Information Processing Systems',
				volume: '30',
			});
			expect(byTitle(items, 'Über')).toMatchObject({
				...GODEL,
				issued: { 'date-parts': [[1931, 12]] },
				language: 'de',
			});
		});
	});

	describe('Zotero BibLaTeX', () => {
		it('maps journaltitle, date, langid, location, and the extra entry types', async () => {
			const items = await parseExport('zotero-biblatex.bib', 6);

			expect(byTitle(items, 'Array programming')).toMatchObject({
				...NUMPY,
				issued: { 'date-parts': [[2020, 9]] },
				language: 'en',
				URL: 'https://www.nature.com/articles/s41586-020-2649-2',
			});
			expect(byTitle(items, 'The Structure')).toMatchObject(KUHN);
			expect(byTitle(items, 'A Symbolic Analysis')).toMatchObject({
				type: 'thesis',
				genre: "Master's thesis",
				publisher: 'Massachusetts Institute of Technology',
				'publisher-place': 'Cambridge, MA',
			});
			expect(byTitle(items, 'Citation Style Language')).toMatchObject({
				type: 'webpage',
				URL: 'https://citationstyles.org/',
				accessed: { 'date-parts': [[2024, 3, 11]] },
			});
		});
	});

	describe('Mendeley', () => {
		it('decodes LaTeX escapes and double-braced titles', async () => {
			const items = await parseExport('mendeley.bib', 5);

			expect(byTitle(items, 'Über')).toMatchObject(GODEL);
			expect(byTitle(items, 'Array programming')).toMatchObject({
				...NUMPY,
				PMID: '32939066',
			});
			expect(byTitle(items, 'The Structure')).toMatchObject({
				...KUHN,
				ISBN: '9780226458083',
			});
		});

		it('turns an arXiv eprint into an abstract-page link', async () => {
			const items = await parseExport('mendeley.bib', 5);

			expect(byTitle(items, 'Attention')).toMatchObject({
				URL: 'https://arxiv.org/abs/1706.03762',
			});
		});
	});

	describe('EndNote', () => {
		it('does not turn EndNote reference-type names into a genre', async () => {
			const items = await parseExport('endnote.bib', 5);

			items.forEach((csl) => {
				expect(csl).not.toHaveProperty('genre');
			});
			expect(byTitle(items, 'Array programming')).toMatchObject(NUMPY);
			expect(byTitle(items, 'Thick Description')).toMatchObject(GEERTZ);
		});

		it('reads uppercase field names and raw UTF-8', async () => {
			const items = await parseExport('endnote.bib', 5);

			expect(byTitle(items, 'Über')).toMatchObject(GODEL);
			expect(byTitle(items, 'The Structure')).toMatchObject({
				ISBN: '9780226458083',
			});
		});
	});

	describe('JabRef', () => {
		it('ignores the encoding header and jabref-meta comments', async () => {
			const items = await parseExport('jabref.bib', 3);

			expect(items.map((csl) => csl.title)).toEqual([
				'Array programming with NumPy',
				'The Structure of Scientific Revolutions',
				'Attention is All you Need',
			]);
		});

		it('resolves @String macros used as field values', async () => {
			const items = await parseExport('jabref.bib', 3);

			expect(byTitle(items, 'Array programming')).toMatchObject({
				...NUMPY,
				issued: { 'date-parts': [[2020, 9]] },
			});
		});

		it('turns an archiveprefix eprint into an abstract-page link', async () => {
			const items = await parseExport('jabref.bib', 3);

			expect(byTitle(items, 'Attention')).toMatchObject({
				type: 'paper-conference',
				URL: 'https://arxiv.org/abs/1706.03762',
			});
		});
	});

	describe('Zotero CSL-JSON', () => {
		it('rejects a JSON document instead of parsing it as free text', async () => {
			const result = await parsePastedInput(
				readFixture('zotero-csl.json')
			);

			expect(result.entries).toEqual([]);
			expect(result.errors).toHaveLength(1);
			expect(result.remainingInput).toBe(
				readFixture('zotero-csl.json').trim()
			);
		});
	});
});

describe('BibTeX file-level structure', () => {
	it('keeps an entry whole across blank lines inside a field', async () => {
		const result = await parsePastedInput(`@article{a,
  title = {First},
  abstract = {One.

Two.},
  journal = {J},
  year = {2020}
}`);

		expect(result.errors).toEqual([]);
		expect(result.entries).toHaveLength(1);
		expect(result.entries[0].csl.abstract).toContain('Two.');
	});

	it('drops @comment and @preamble blocks without reporting errors', async () => {
		const result =
			await parsePastedInput(`@preamble{"\\newcommand{\\noop}[1]{}"}

@comment{BibDesk Static Groups{
<?xml version="1.0"?>
}}

@book{b, title = {Only Entry}, publisher = {P}, year = {2001}}`);

		expect(result.errors).toEqual([]);
		expect(result.entries).toHaveLength(1);
		expect(result.entries[0].csl.title).toBe('Only Entry');
	});

	it('keeps an entry whole when a field mentions another @type{ key', async () => {
		const result = await parsePastedInput(`@article{outer,
  title = {Outer Entry},
  journal = {J},
  year = {2020},
  note = {Supersedes @misc{draft2019}}
}`);

		expect(result.errors).toEqual([]);
		expect(result.entries).toHaveLength(1);
		expect(result.entries[0].csl.title).toBe('Outer Entry');
	});

	it('treats an escaped brace as text when finding where an entry ends', async () => {
		// Counting `\{` as an opening brace would swallow the next entry into
		// this one, and the arXiv link below is only recovered when a segment
		// holds exactly one entry.
		const result = await parsePastedInput(`@misc{braces,
  title = {An Open \\{ Brace},
  year = {2017},
  eprint = {1706.03762},
  archiveprefix = {arXiv}
}

@book{after, title = {Second Book}, publisher = {P}, year = {2002}}`);

		expect(result.errors).toEqual([]);
		expect(result.entries).toHaveLength(2);
		expect(result.entries[0].csl.URL).toBe(
			'https://arxiv.org/abs/1706.03762'
		);
	});

	it('keeps a % inside a field value', async () => {
		const result = await parsePastedInput(
			`@article{c, title = {Growth of 50% or More}, journal = {J}, year = {2020}}`
		);

		expect(result.errors).toEqual([]);
		expect(result.entries[0].csl.title).toBe('Growth of 50% or More');
	});

	it('reports an unclosed entry as a BibTeX error without losing the others', async () => {
		const result =
			await parsePastedInput(`@book{ok, title = {Complete}, publisher = {P}, year = {2001}}

@article{broken, title = {Never closed`);

		expect(result.entries).toHaveLength(1);
		expect(result.entries[0].csl.title).toBe('Complete');
		expect(result.errors).toHaveLength(1);
	});

	it('does not treat a free-text citation that merely contains braces as JSON', async () => {
		const result = await parsePastedInput('{not json');

		expect(result.errors).toHaveLength(1);
		expect(result.remainingInput).toBe('{not json');
	});
});

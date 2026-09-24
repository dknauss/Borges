/**
 * BibLaTeX import through the real citation-js parser.
 *
 * Every other parser test mocks `@citation-js/core`, so they cannot catch a
 * BibLaTeX field that citation-js drops or maps into an unusable shape. These
 * fixtures run unmocked: only the network-facing modules are stubbed.
 */
import { parsePastedInput } from './parser';

jest.mock('@wordpress/api-fetch', () => jest.fn());

async function parseSingle(input) {
	const result = await parsePastedInput(input);

	expect(result.errors).toEqual([]);
	expect(result.entries).toHaveLength(1);
	expect(result.entries[0].inputFormat).toBe('bibtex');

	return result.entries[0].csl;
}

describe('BibLaTeX import (real citation-js)', () => {
	it('maps journaltitle, date, subtitle, DOI, and langid on @article', async () => {
		const csl = await parseSingle(`@article{smith2020,
  author = {Smith, Jane and Doe, John},
  title = {A Study},
  subtitle = {With Findings},
  journaltitle = {Journal of Things},
  date = {2020-03-15},
  volume = {12},
  number = {3},
  pages = {45--67},
  doi = {10.1234/abc.123},
  langid = {english}
}`);

		expect(csl).toMatchObject({
			type: 'article-journal',
			title: 'A Study: With Findings',
			'container-title': 'Journal of Things',
			issued: { 'date-parts': [[2020, 3, 15]] },
			volume: '12',
			issue: '3',
			page: '45-67',
			DOI: '10.1234/abc.123',
			language: 'en',
			author: [
				{ family: 'Smith', given: 'Jane' },
				{ family: 'Doe', given: 'John' },
			],
		});
	});

	it('maps @online with url and urldate to a webpage', async () => {
		const csl = await parseSingle(`@online{who2021,
  author = {{World Health Organization}},
  title = {Fact Sheet},
  date = {2021},
  url = {https://example.org/fs},
  urldate = {2022-01-05}
}`);

		expect(csl).toMatchObject({
			type: 'webpage',
			title: 'Fact Sheet',
			URL: 'https://example.org/fs',
			accessed: { 'date-parts': [[2022, 1, 5]] },
		});
	});

	it('maps @thesis with location and institution', async () => {
		const csl = await parseSingle(`@thesis{lee2019,
  author = {Lee, Ann},
  title = {On Things},
  type = {phdthesis},
  institution = {MIT},
  location = {Cambridge, MA},
  date = {2019}
}`);

		expect(csl).toMatchObject({
			type: 'thesis',
			publisher: 'MIT',
			'publisher-place': 'Cambridge, MA',
			issued: { 'date-parts': [[2019]] },
		});
	});

	it('maps @collection with an editor and no author', async () => {
		const csl = await parseSingle(`@collection{roe2015,
  editor = {Roe, Pat},
  title = {Edited Volume},
  publisher = {Univ Press},
  location = {Oxford},
  date = {2015}
}`);

		expect(csl).toMatchObject({
			type: 'book',
			editor: [{ family: 'Roe', given: 'Pat' }],
			publisher: 'Univ Press',
			'publisher-place': 'Oxford',
		});
		expect(csl.author).toBeUndefined();
	});

	it('converts a babel langid to a BCP 47 tag', async () => {
		const csl = await parseSingle(
			'@book{b, author={Mann, Thomas}, title={Buddenbrooks}, date={1901}, langid={ngerman}}'
		);

		expect(csl.language).toBe('de');
	});

	it('drops an unmappable language rather than saving it', async () => {
		const csl = await parseSingle(
			'@book{b, author={Doe, J.}, title={T}, date={2001}, langid={klingon}}'
		);

		expect(csl).not.toHaveProperty('language');
	});

	it('uses the first language of a BibLaTeX language list', async () => {
		// citation-js splits `and`-separated lists and keeps the first item.
		const csl = await parseSingle(
			'@book{b, author={Doe, J.}, title={T}, date={2001}, language={german and english}}'
		);

		expect(csl.language).toBe('de');
	});

	it('recovers an arXiv eprint as a URL', async () => {
		const csl = await parseSingle(`@article{ax2023,
  author = {Doe, Jane},
  title = {A Preprint},
  date = {2023},
  eprint = {2301.00001},
  eprinttype = {arxiv},
  eprintclass = {cs.CL}
}`);

		expect(csl.URL).toBe('https://arxiv.org/abs/2301.00001');
	});

	it('splits a mixed BibTeX + BibLaTeX paste into separate entries', async () => {
		const result = await parsePastedInput(`@article{classic,
  author = {Knuth, Donald E.},
  title = {Literate Programming},
  journal = {The Computer Journal},
  year = {1984},
  language = {english}
}

@online{modern,
  author = {Doe, Jane},
  title = {Web Page},
  date = {2024-02},
  url = {https://example.org/page},
  langid = {british}
}`);

		expect(result.errors).toEqual([]);
		expect(result.entries.map((entry) => entry.csl)).toEqual([
			expect.objectContaining({
				type: 'article-journal',
				'container-title': 'The Computer Journal',
				language: 'en',
			}),
			expect.objectContaining({
				type: 'webpage',
				URL: 'https://example.org/page',
				language: 'en-GB',
			}),
		]);
	});
});

jest.mock('@citation-js/core', () =>
	require('../__test-utils__/citation-js-mocks').citationJsCoreMock()
);

jest.mock('@citation-js/plugin-doi', () =>
	require('../__test-utils__/citation-js-mocks').citationJsPluginMock()
);
jest.mock('@citation-js/plugin-bibtex', () =>
	require('../__test-utils__/citation-js-mocks').citationJsPluginMock()
);
jest.mock('./formatting/csl', () =>
	require('../__test-utils__/citation-js-mocks').stubFormattingFactory()
);
jest.mock('@wordpress/api-fetch', () => jest.fn());

import { Cite } from '@citation-js/core';
import apiFetch from '@wordpress/api-fetch';
import {
	clearDoiMetadataCache,
	normalizeCrossRefCsl,
	parsePastedInput,
	validateAndSanitizeCsl,
} from './parser';
import { formatBibliographyEntries } from './formatting/csl';

describe('validateAndSanitizeCsl', () => {
	it('sanitizes nested values and normalizes issued date-parts', () => {
		const sanitized = validateAndSanitizeCsl({
			type: 'article-journal',
			title: 'Safe title',
			author: [
				{
					family: 'Smith',
					given: 'Ada',
					ORCID: '0000-0001-2345-6789',
					meta: {
						affiliation: 'Example University',
						constructor: 'ignored',
					},
				},
			],
			issued: {
				'date-parts': [['2024', '5', '1']],
			},
			extra: {
				note: 'Retained',
			},
		});

		expect(sanitized).toMatchObject({
			type: 'article-journal',
			title: 'Safe title',
			author: [
				{
					family: 'Smith',
					given: 'Ada',
					ORCID: '0000-0001-2345-6789',
					meta: {
						affiliation: 'Example University',
					},
				},
			],
			issued: {
				'date-parts': [[2024, 5, 1]],
			},
			extra: {
				note: 'Retained',
			},
		});
		expect(
			Object.prototype.hasOwnProperty.call(
				sanitized.author[0].meta,
				'constructor'
			)
		).toBe(false);
	});

	it('strips HTML tags from string fields', () => {
		const sanitized = validateAndSanitizeCsl({
			type: 'article-journal',
			title: '<i>\u201c</i>Contagious Air[s]\u201d: Wordsworth\u2019s Poetics and Politics of Immunity',
			'container-title': 'European <i>Romantic</i> Review',
		});

		expect(sanitized.title).toBe(
			'\u201cContagious Air[s]\u201d: Wordsworth\u2019s Poetics and Politics of Immunity'
		);
		expect(sanitized['container-title']).toBe('European Romantic Review');
	});

	it('strips nested HTML tags that survive a single replacement pass', () => {
		const sanitized = validateAndSanitizeCsl({
			type: 'article-journal',
			title: '<scr<script>ipt>alert(1)</scr</script>ipt>',
			'container-title': '<<b>img src=x</b>>',
		});

		// No intact HTML tags survive — leftover fragments are harmless text
		expect(sanitized.title).not.toMatch(/<[^>]*>/u);
		expect(sanitized['container-title']).not.toMatch(/<[^>]*>/u);
	});

	it('rejects invalid scalar CSL fields like DOI objects', () => {
		expect(() =>
			validateAndSanitizeCsl({
				type: 'article-journal',
				title: 'Unsafe DOI',
				DOI: {
					value: '10.1234/example',
				},
			})
		).toThrow('Invalid CSL DOI.');
	});

	it('sanitizes editor and accessed fields using the same structured rules', () => {
		const sanitized = validateAndSanitizeCsl({
			type: 'webpage',
			title: 'Structured webpage',
			editor: [
				{
					family: 'Marks',
					given: 'P. J. M.',
				},
			],
			accessed: {
				'date-parts': [['2026', '4', '3']],
			},
		});

		expect(sanitized).toMatchObject({
			editor: [
				{
					family: 'Marks',
					given: 'P. J. M.',
				},
			],
			accessed: {
				'date-parts': [[2026, 4, 3]],
			},
		});
	});

	it('sanitizes reviewed-author as a CSL name list', () => {
		const sanitized = validateAndSanitizeCsl({
			type: 'review-book',
			title: 'Review title',
			'reviewed-author': [
				{
					family: 'Gabriel',
					given: 'Mary',
				},
			],
		});

		expect(sanitized).toMatchObject({
			'reviewed-author': [
				{
					family: 'Gabriel',
					given: 'Mary',
				},
			],
		});
	});
});

describe('normalizeCrossRefCsl (CrossRef type mapping)', () => {
	it('maps CrossRef "monograph" to the CSL "book" type', () => {
		expect(normalizeCrossRefCsl({ type: 'monograph' }).type).toBe('book');
	});

	it('maps other CrossRef book/reference types to valid CSL types', () => {
		expect(normalizeCrossRefCsl({ type: 'edited-book' }).type).toBe('book');
		expect(normalizeCrossRefCsl({ type: 'reference-book' }).type).toBe(
			'book'
		);
		expect(normalizeCrossRefCsl({ type: 'reference-entry' }).type).toBe(
			'entry-encyclopedia'
		);
		expect(normalizeCrossRefCsl({ type: 'book-section' }).type).toBe(
			'chapter'
		);
	});

	it('keeps existing mappings (journal-article -> article-journal)', () => {
		expect(normalizeCrossRefCsl({ type: 'journal-article' }).type).toBe(
			'article-journal'
		);
	});

	it('falls back any unknown type to the generic "document"', () => {
		expect(normalizeCrossRefCsl({ type: 'grant' }).type).toBe('document');
		expect(normalizeCrossRefCsl({ type: 'totally-made-up' }).type).toBe(
			'document'
		);
	});

	it('preserves other fields, and a monograph now passes validation', () => {
		const csl = {
			type: 'monograph',
			title: 'The Structure of Scientific Revolutions',
			author: [{ given: 'Thomas S.', family: 'Kuhn' }],
			issued: { 'date-parts': [[2012]] },
		};
		const normalized = normalizeCrossRefCsl(csl);

		expect(normalized.title).toBe(
			'The Structure of Scientific Revolutions'
		);
		expect(() => validateAndSanitizeCsl(normalized)).not.toThrow();
	});
});

describe('parsePastedInput', () => {
	let originalCrypto;

	beforeEach(() => {
		jest.clearAllMocks();
		clearDoiMetadataCache();
		apiFetch.mockReset();
		originalCrypto = global.crypto;
		Object.defineProperty(global, 'crypto', {
			configurable: true,
			value: {
				...originalCrypto,
				randomUUID: jest.fn(() => 'test-uuid'),
			},
		});
	});

	afterEach(() => {
		Object.defineProperty(global, 'crypto', {
			configurable: true,
			value: originalCrypto,
		});
	});

	it('rejects parsed entries with invalid CSL shapes before persisting', async () => {
		Cite.async.mockResolvedValue({
			get: () => [
				{
					type: {
						unexpected: true,
					},
					title: 'Unsafe shape',
				},
			],
		});

		const result = await parsePastedInput('10.1234/example-doi');

		expect(result.entries).toHaveLength(0);
		expect(result.errors).toHaveLength(1);
		expect(result.errors[0]).toMatch(/Invalid CSL type/);
	});

	it('preserves suspicious BibTeX title text as inert data', async () => {
		Cite.async.mockResolvedValue({
			get: () => [
				{
					type: 'book',
					title: '<script>alert(1)</script>',
				},
			],
		});

		const result = await parsePastedInput(
			'@book{safe,title={<script>alert(1)</script>}}'
		);

		expect(result.errors).toEqual([]);
		expect(result.entries[0].csl.title).toBe('alert(1)');
	});

	it('does not throw when review-title cleanup sees regex metacharacters in names', async () => {
		Cite.async.mockResolvedValue({
			get: () => [
				{
					type: 'article-journal',
					title: 'John Smith (Jr.). Reviewed Book Smith (Jr.)A. 100 pp.',
					'container-title': 'Example Review Journal',
				},
			],
		});

		const result = await parsePastedInput('10.1234/review-metacharacters');

		expect(result.errors).toEqual([]);
		expect(result.entries).toHaveLength(1);
		expect(result.entries[0].csl.title).toContain('John Smith (Jr.).');
	});

	it('passes the requested style key through the formatting boundary', async () => {
		Cite.async.mockResolvedValue({
			get: () => [
				{
					type: 'article-journal',
					title: 'Example title',
				},
			],
		});

		const result = await parsePastedInput('10.1234/example-doi', 'apa-7', {
			deferFormatting: false,
		});

		expect(result.entries).toHaveLength(1);
		expect(formatBibliographyEntries).toHaveBeenCalledWith(
			[
				expect.objectContaining({
					type: 'article-journal',
					title: 'Example title',
				}),
			],
			'apa-7'
		);
		expect(result.entries[0].formattedText).toBe(
			'Formatted bibliography entry'
		);
	});

	it('defaults to parse-first behavior without formatter work', async () => {
		Cite.async.mockResolvedValue({
			get: () => [
				{
					type: 'article-journal',
					title: 'Deferred formatting example',
				},
			],
		});

		const result = await parsePastedInput('10.1234/deferred-formatting');

		expect(formatBibliographyEntries).not.toHaveBeenCalled();
		expect(result.entries).toHaveLength(1);
		expect(result.entries[0].formattedText).toBeNull();
	});

	it('returns no entries for empty or whitespace-only pasted input', async () => {
		await expect(parsePastedInput('')).resolves.toMatchObject({
			entries: [],
			errors: [],
			remainingInput: '',
		});
		await expect(parsePastedInput('   \n\t  ')).resolves.toMatchObject({
			entries: [],
			errors: [],
			remainingInput: '',
		});
	});

	it('can still opt in to parser-owned formatting explicitly', async () => {
		Cite.async.mockResolvedValue({
			get: () => [
				{
					type: 'article-journal',
					title: 'Explicit formatting example',
				},
			],
		});

		const result = await parsePastedInput(
			'10.1234/explicit-formatting',
			'harvard',
			{ deferFormatting: false }
		);

		expect(formatBibliographyEntries).toHaveBeenCalledWith(
			[
				expect.objectContaining({
					type: 'article-journal',
					title: 'Explicit formatting example',
				}),
			],
			'harvard'
		);
		expect(result.entries[0].formattedText).toBe(
			'Formatted bibliography entry'
		);
	});

	it('persists only the reduced citation payload fields for new entries', async () => {
		Cite.async.mockResolvedValue({
			get: () => [
				{
					type: 'article-journal',
					title: 'Lean payload example',
				},
			],
		});

		const result = await parsePastedInput('10.1234/lean-payload');

		expect(result.entries[0]).toMatchObject({
			id: 'test-uuid',
			csl: {
				type: 'article-journal',
				title: 'Lean payload example',
			},
			formattedText: null,
			displayOverride: null,
			inputFormat: 'doi',
			parseWarnings: [],
		});
		expect(result.entries[0]).not.toHaveProperty('inputRaw');
		expect(result.entries[0]).not.toHaveProperty('parsedAt');
		expect(result.entries[0]).not.toHaveProperty('parseConfidence');
	});

	it('normalizes additional common BibTeX entry-type aliases like @buch and @insammlung', async () => {
		Cite.async.mockResolvedValue({
			get: () => [
				{
					type: 'book',
					title: 'Beispiel Buch',
				},
			],
		});

		await parsePastedInput(`@buch{foo,
  title = {Beispiel Buch}
}`);
		expect(Cite.async).toHaveBeenCalledWith(
			expect.stringContaining('@book{foo')
		);

		await parsePastedInput(`@insammlung{bar,
  title = {Beispiel Kapitel}
}`);
		expect(Cite.async).toHaveBeenCalledWith(
			expect.stringContaining('@incollection{bar')
		);
	});

	it('normalizes BibTeX entry-type aliases @artikel and @inbuch', async () => {
		Cite.async.mockResolvedValue({
			get: () => [{ type: 'article-journal', title: 'Beispiel Artikel' }],
		});

		await parsePastedInput(`@artikel{baz,
  title = {Beispiel Artikel}
}`);
		expect(Cite.async).toHaveBeenCalledWith(
			expect.stringContaining('@article{baz')
		);

		Cite.async.mockResolvedValue({
			get: () => [{ type: 'chapter', title: 'Beispiel Kapitel' }],
		});

		await parsePastedInput(`@inbuch{qux,
  title = {Beispiel Kapitel}
}`);
		expect(Cite.async).toHaveBeenCalledWith(
			expect.stringContaining('@inbook{qux')
		);
	});

	it('falls back to a generated citation id when crypto.randomUUID is unavailable', async () => {
		Cite.async.mockResolvedValue({
			get: () => [
				{
					type: 'book',
					title: 'Fallback ID Example',
				},
			],
		});

		Object.defineProperty(global, 'crypto', {
			configurable: true,
			value: {},
		});

		const result = await parsePastedInput(`@book{fallback,
  title = {Fallback ID Example}
}`);

		expect(result.entries).toHaveLength(1);
		expect(result.entries[0].id).toMatch(/^citation-/u);
	});

	it('enforces the 50-entry paste cap and preserves overflow input for retry', async () => {
		Cite.async.mockImplementation(async (value) => ({
			get: () => [
				{
					type: 'article-journal',
					title: String(value),
				},
			],
		}));

		const input = Array.from(
			{ length: 55 },
			(_, index) => `10.1234/example-${index + 1}`
		).join('\n');
		const result = await parsePastedInput(input);

		expect(result.entries).toHaveLength(50);
		expect(result.truncated).toBe(true);
		expect(result.remainingInput).toContain('10.1234/example-51');
		expect(result.remainingInput).toContain('10.1234/example-55');
	});

	it('rejects input larger than 1MB', async () => {
		const result = await parsePastedInput('a'.repeat(1024 * 1024 + 1));

		expect(result.entries).toEqual([]);
		expect(result.errors).toEqual([
			'The pasted input is too large. Maximum size is 1 MB.',
		]);
	});

	it('serializes DOI batches while preserving order', async () => {
		let activeCount = 0;
		let maxActiveCount = 0;

		Cite.async.mockImplementation(async (value) => {
			activeCount += 1;
			maxActiveCount = Math.max(maxActiveCount, activeCount);
			await new Promise((resolve) => setTimeout(resolve, 10));
			activeCount -= 1;

			return {
				get: () => [
					{
						type: 'article-journal',
						title: `Resolved ${value}`,
					},
				],
			};
		});

		const result = await parsePastedInput(
			`10.1000/a\n10.1000/b\n10.1000/c\n10.1000/d\n10.1000/e`
		);

		expect(result.errors).toEqual([]);
		expect(result.entries).toHaveLength(5);
		expect(maxActiveCount).toBe(1);
		expect(result.entries.map((entry) => entry.csl.title)).toEqual([
			'Resolved 10.1000/a',
			'Resolved 10.1000/b',
			'Resolved 10.1000/c',
			'Resolved 10.1000/d',
			'Resolved 10.1000/e',
		]);
	});

	it('resolves DOI metadata through CrossRef when a fetch transport is available', async () => {
		const fetchFn = jest.fn().mockResolvedValue({
			ok: true,
			json: async () => ({
				type: 'journal-article',
				title: 'Array programming with NumPy',
				DOI: '10.1038/s41586-020-2649-2',
				author: [
					{
						given: 'Charles R.',
						family: 'Harris',
					},
				],
			}),
		});

		const result = await parsePastedInput(
			'10.1038/s41586-020-2649-2',
			'apa-7',
			{ fetchFn }
		);

		expect(fetchFn).toHaveBeenCalledWith(
			'https://api.crossref.org/works/10.1038%2Fs41586-020-2649-2/transform/application/vnd.citationstyles.csl+json'
		);
		expect(Cite.async).not.toHaveBeenCalled();
		expect(result.errors).toEqual([]);
		expect(result.entries).toHaveLength(1);
		expect(result.entries[0].csl).toMatchObject({
			type: 'article-journal',
			title: 'Array programming with NumPy',
			DOI: '10.1038/s41586-020-2649-2',
		});
	});

	it('title-cases ALL-CAPS author names and titles returned by CrossRef', async () => {
		const fetchFn = jest.fn().mockResolvedValue({
			ok: true,
			json: async () => ({
				type: 'journal-article',
				title: 'I.—COMPUTING MACHINERY AND INTELLIGENCE',
				'container-title': 'Mind',
				DOI: '10.1093/mind/LIX.236.433',
				author: [{ given: 'A. M.', family: 'TURING' }],
			}),
		});

		const result = await parsePastedInput(
			'10.1093/mind/LIX.236.433',
			'apa-7',
			{
				fetchFn,
			}
		);

		expect(result.errors).toEqual([]);
		expect(result.entries[0].csl.author).toEqual([
			{ given: 'A. M.', family: 'Turing' },
		]);
		expect(result.entries[0].csl.title).toBe(
			'I.—Computing Machinery and Intelligence'
		);
		expect(result.entries[0].csl['container-title']).toBe('Mind');
	});

	it('reuses DOI metadata for duplicate DOI values within one paste', async () => {
		Cite.async.mockResolvedValue({
			get: () => [
				{
					type: 'article-journal',
					title: 'Shared DOI metadata',
					DOI: '10.1234/shared',
				},
			],
		});

		const result = await parsePastedInput(
			`https://doi.org/10.1234/shared\n10.1234/shared`
		);

		expect(Cite.async).toHaveBeenCalledTimes(1);
		expect(result.errors).toEqual([]);
		expect(result.entries).toHaveLength(2);
		expect(result.entries[0].csl.title).toBe('Shared DOI metadata');
		expect(result.entries[1].csl.title).toBe('Shared DOI metadata');
	});

	it('reuses successful DOI metadata across parser calls in the same session', async () => {
		Cite.async.mockResolvedValue({
			get: () => [
				{
					type: 'article-journal',
					title: 'Session cached DOI metadata',
					DOI: '10.1234/session-cache',
				},
			],
		});

		await parsePastedInput('10.1234/session-cache');
		const second = await parsePastedInput(
			'https://doi.org/10.1234/session-cache'
		);

		expect(Cite.async).toHaveBeenCalledTimes(1);
		expect(second.entries).toHaveLength(1);
		expect(second.entries[0].csl.title).toBe('Session cached DOI metadata');
	});

	it('skips DOI resolution for DOI values already present in the bibliography', async () => {
		const result = await parsePastedInput(
			'https://doi.org/10.1234/already-present',
			'apa-7',
			{
				existingDoiValues: ['10.1234/already-present'],
			}
		);

		expect(Cite.async).not.toHaveBeenCalled();
		expect(result.entries).toEqual([]);
		expect(result.errors).toEqual([]);
		expect(result.skippedDuplicateCount).toBe(1);
	});

	it('normalizes common BibTeX entry-type aliases like @artikel before parsing', async () => {
		Cite.async.mockResolvedValue({
			get: () => [
				{
					type: 'article-journal',
					title: 'the true about tree',
					'container-title': 'Annalen der Physik',
					volume: '322',
					issue: '10',
					page: '891-921',
					issued: {
						'date-parts': [[1905]],
					},
					author: [
						{
							given: 'Albert',
							family: 'Einstein',
						},
					],
				},
			],
		});

		const input = `@artikel{einstein,
  author = {Albert Einstein},
  title = {the true about tree},
  journaltitle = {Annalen der Physik},
  year = {1905},
  volume = {322},
  number = {10},
  pages = {891-921}
}`;
		const result = await parsePastedInput(input);

		expect(Cite.async).toHaveBeenCalledWith(
			expect.stringContaining('@article{einstein')
		);
		expect(result.errors).toEqual([]);
		expect(result.entries).toHaveLength(1);
		expect(result.entries[0]).toMatchObject({
			inputFormat: 'bibtex',
			csl: {
				type: 'article-journal',
				'container-title': 'Annalen der Physik',
				volume: '322',
				issue: '10',
				page: '891-921',
			},
		});
	});

	it('normalizes duplicated review metadata in DOI-derived titles before persisting', async () => {
		Cite.async.mockResolvedValue({
			get: () => [
				{
					type: 'article-journal',
					title: 'Amy J. Binder and Jeffrey L. Kidder. The Channels of Student Activism: How the Left and Right Are Winning (and Losing) in Campus Politics Today BinderAmy J.KidderJeffrey L.The Channels of Student Activism: How the Left and Right Are Winning (and Losing) in Campus Politics Today. University of Chicago Press, 2022. 224 pp. $25, paper.',
					'container-title': 'Administrative Science Quarterly',
					volume: '71',
					issue: '1',
					DOI: '10.1177/00018392251368878',
					issued: {
						'date-parts': [[2025, 8, 27]],
					},
					author: [
						{
							given: 'Brayden G',
							family: 'King',
						},
					],
				},
			],
		});

		const result = await parsePastedInput('10.1177/00018392251368878');

		expect(result.errors).toEqual([]);
		expect(result.entries).toHaveLength(1);
		expect(result.entries[0].csl.title).toBe(
			'Amy J. Binder and Jeffrey L. Kidder. The Channels of Student Activism: How the Left and Right Are Winning (and Losing) in Campus Politics Today'
		);
		expect(result.entries[0].parseWarnings).toEqual([
			'review-metadata-incomplete',
		]);
	});

	it('does not flag review metadata as incomplete when DOI-derived review records include page metadata', async () => {
		Cite.async.mockResolvedValue({
			get: () => [
				{
					type: 'article-journal',
					title: 'Amy J. Binder and Jeffrey L. Kidder. The Channels of Student Activism: How the Left and Right Are Winning (and Losing) in Campus Politics Today. University of Chicago Press, 2022. 224 pp. $25, paper.',
					'container-title': 'Administrative Science Quarterly',
					volume: '71',
					issue: '1',
					page: '471-485',
					DOI: '10.1177/00018392251368878',
					issued: {
						'date-parts': [[2025, 8, 27]],
					},
					author: [
						{
							given: 'Brayden G',
							family: 'King',
						},
					],
				},
			],
		});

		const result = await parsePastedInput('10.1177/00018392251368878');

		expect(result.errors).toEqual([]);
		expect(result.entries).toHaveLength(1);
		expect(result.entries[0].csl.title).toBe(
			'Amy J. Binder and Jeffrey L. Kidder. The Channels of Student Activism: How the Left and Right Are Winning (and Losing) in Campus Politics Today'
		);
		expect(result.entries[0].parseWarnings).toEqual([]);
	});

	it('normalizes another duplicated review DOI title fixture before persisting', async () => {
		Cite.async.mockResolvedValue({
			get: () => [
				{
					type: 'article-journal',
					title: 'Mary Gabriel. Madonna: A Rebel Life GabrielMaryMadonna: A Rebel Life. Little, Brown Spark, 2023. 880 pp. $39.00, hardcover.',
					'container-title': 'New York Times Book Review',
					DOI: '10.1000/review-fixture',
					issued: {
						'date-parts': [[2023, 10, 8]],
					},
					author: [
						{
							given: 'Alexandra',
							family: 'Jacobs',
						},
					],
				},
			],
		});

		const result = await parsePastedInput('10.1000/review-fixture');

		expect(result.errors).toEqual([]);
		expect(result.entries).toHaveLength(1);
		expect(result.entries[0].csl.title).toBe(
			'Mary Gabriel. Madonna: A Rebel Life'
		);
		expect(result.entries[0].parseWarnings).toEqual([
			'review-metadata-incomplete',
		]);
	});

	it('parses supported free-text citations via the new parser backend', async () => {
		const result = await parsePastedInput(
			'Amy J. Binder and Jeffrey L. Kidder, The Channels of Student Activism: How the Left and Right Are Winning (and Losing) in Campus Politics Today (University of Chicago Press, 2022), 117–18.',
			'apa-7'
		);

		expect(Cite.async).not.toHaveBeenCalled();
		expect(result.errors).toEqual([]);
		expect(result.entries).toHaveLength(1);
		expect(result.entries[0]).toMatchObject({
			inputFormat: 'freetext',
			csl: {
				type: 'book',
				publisher: 'University of Chicago Press',
				page: '117–18',
			},
		});
		expect(formatBibliographyEntries).not.toHaveBeenCalled();
	});

	it('parses sentence-style free-text book citations via the parser backend', async () => {
		const result = await parsePastedInput(
			'Binder, Amy J., and Jeffrey L. Kidder. The Channels of Student Activism: How the Left and Right Are Winning (and Losing) in Campus Politics Today. University of Chicago Press, 2022.'
		);

		expect(result.errors).toEqual([]);
		expect(result.entries).toHaveLength(1);
		expect(result.entries[0]).toMatchObject({
			inputFormat: 'freetext',
			csl: {
				type: 'book',
				title: 'The Channels of Student Activism: How the Left and Right Are Winning (and Losing) in Campus Politics Today',
				publisher: 'University of Chicago Press',
			},
		});
	});

	it('parses sentence-style chapter citations via the parser backend', async () => {
		const result = await parsePastedInput(
			'Doyle, Kathleen. “The Queen Mary Psalter.” In The Book by Design: The Remarkable Story of the World’s Greatest Invention, edited by P. J. M. Marks and Stephen Parkin. University of Chicago Press, 2023.'
		);

		expect(result.errors).toEqual([]);
		expect(result.entries).toHaveLength(1);
		expect(result.entries[0]).toMatchObject({
			inputFormat: 'freetext',
			csl: {
				type: 'chapter',
				title: 'The Queen Mary Psalter',
				'container-title':
					'The Book by Design: The Remarkable Story of the World’s Greatest Invention',
				publisher: 'University of Chicago Press',
			},
		});
	});

	it('parses sentence-style Chicago book citations with editors, editions, URLs, and platform tails', async () => {
		const result =
			await parsePastedInput(`Marks, P. J. M., and Stephen Parkin, eds. The Book by Design: The Remarkable Story of the World’s Greatest Invention. University of Chicago Press, 2023.

Borel, Brooke. The Chicago Guide to Fact-Checking. 2nd ed. University of Chicago Press, 2023. EBSCOhost.

Kurland, Philip B., and Ralph Lerner, eds. The Founders’ Constitution. University of Chicago Press, 1987. https://press-pubs.uchicago.edu/founders/.

Melville, Herman. Moby-Dick; or, The Whale. New York, 1851. https://melville.electroniclibrary.org/moby-dick-side-by-side.

Roy, Arundhati. The God of Small Things. Random House, 2008. Kindle.`);

		expect(result.errors).toEqual([]);
		expect(result.entries).toHaveLength(5);
		expect(result.entries[0]).toMatchObject({
			inputFormat: 'freetext',
			csl: {
				type: 'collection',
				editor: expect.any(Array),
			},
		});
		expect(result.entries[1]).toMatchObject({
			csl: {
				type: 'book',
				edition: '2',
				medium: 'EBSCOhost',
			},
		});
		expect(result.entries[2]).toMatchObject({
			csl: {
				type: 'collection',
				URL: 'https://press-pubs.uchicago.edu/founders/',
			},
		});
		expect(result.entries[3]).toMatchObject({
			csl: {
				type: 'book',
				'publisher-place': 'New York',
				URL: 'https://melville.electroniclibrary.org/moby-dick-side-by-side',
			},
		});
		expect(result.entries[4]).toMatchObject({
			csl: {
				type: 'book',
				medium: 'Kindle',
			},
		});
	});

	it('parses free-text journal citations even when they include an inline DOI URL', async () => {
		const result = await parsePastedInput(
			'Ada Smith, "Learning Blocks," Journal of WordPress Studies 12, no. 3 (2024): 117-134. https://doi.org/10.1234/example-doi',
			'apa-7'
		);

		expect(Cite.async).not.toHaveBeenCalled();
		expect(result.errors).toEqual([]);
		expect(result.entries).toHaveLength(1);
		expect(result.entries[0]).toMatchObject({
			inputFormat: 'freetext',
			csl: {
				type: 'article-journal',
				title: 'Learning Blocks',
				'container-title': 'Journal of WordPress Studies',
				DOI: '10.1234/example-doi',
			},
		});
	});

	it('preserves low-confidence heuristic parse metadata for expanded free-text patterns', async () => {
		const result = await parsePastedInput(
			'OpenAI, “Responses API,” https://platform.openai.com/docs/api-reference/responses.'
		);

		expect(result.errors).toEqual([]);
		expect(result.entries).toHaveLength(1);
		expect(result.entries[0]).toMatchObject({
			inputFormat: 'freetext',
			csl: {
				type: 'webpage',
				title: 'Responses API',
			},
		});
	});

	it('parses APA-like journal citations with volume, issue, and DOI via heuristics', async () => {
		const result = await parsePastedInput(
			'King, B. G. (2025). Amy J. Binder and Jeffrey L. Kidder. The Channels of Student Activism: How the Left and Right Are Winning (and Losing) in Campus Politics Today BinderAmy J.KidderJeffrey L.The Channels of Student Activism: How the Left and Right Are Winning (and Losing) in Campus Politics Today. University of Chicago Press, 2022. 224 pp. $25, paper. Administrative Science Quarterly, 71(1). https://doi.org/10.1177/00018392251368878'
		);

		expect(result.errors).toEqual([]);
		expect(result.entries).toHaveLength(1);
		expect(result.entries[0]).toMatchObject({
			inputFormat: 'freetext',
			csl: {
				type: 'article-journal',
				'container-title': 'Administrative Science Quarterly',
				volume: '71',
				issue: '1',
				DOI: '10.1177/00018392251368878',
			},
		});
	});

	it('parses low-confidence APA-like title/volume/page citations via heuristics', async () => {
		const result = await parsePastedInput(
			'Einstein, A. (1905). the true about tree (Vol. 322, pp. 891–921).'
		);

		expect(result.errors).toEqual([]);
		expect(result.entries).toHaveLength(1);
		expect(result.entries[0]).toMatchObject({
			inputFormat: 'freetext',
			csl: {
				type: 'article-journal',
				title: 'the true about tree',
				volume: '322',
				page: '891–921',
			},
		});
	});

	it('reports limited free-text support when heuristics cannot parse the input', async () => {
		const result = await parsePastedInput(
			'This input is not a parseable citation.'
		);

		expect(result.entries).toEqual([]);
		expect(result.errors).toEqual([
			'Paste a DOI, PMID (PubMed ID), BibTeX entry, or supported citation for a book, article, chapter, or webpage. Separate multiple formatted citations with a blank line.',
		]);
		expect(result.remainingInput).toBe(
			'This input is not a parseable citation.'
		);
	});

	it('detects LaTeX document input and returns a friendlier error', async () => {
		const result = await parsePastedInput(`\\documentclass{article}
\\usepackage[backend=bibtex]{biblatex}
\\addbibresource{references.bib}
\\begin{document}
Hallo world\\cite{einstein}
\\printbibliography
\\end{document}`);

		expect(result.entries).toEqual([]);
		expect(result.errors).toEqual([
			'This looks like LaTeX, not a bibliography entry. Paste a DOI, PMID, BibTeX entry, or supported citation instead.',
		]);
		expect(result.remainingInput).toContain('\\documentclass{article}');
	});

	it('detects BibLaTeX citation command input and returns a friendlier error', async () => {
		const result = await parsePastedInput(`\\autocite{einstein}`);

		expect(result.entries).toEqual([]);
		expect(result.errors).toEqual([
			'This looks like LaTeX, not a bibliography entry. Paste a DOI, PMID, BibTeX entry, or supported citation instead.',
		]);
		expect(result.remainingInput).toBe('\\autocite{einstein}');
	});

	it('splits multiple standalone formatted citations on separate lines without requiring blank lines', async () => {
		const result = await parsePastedInput(
			`Glantz, A. (2009). The war comes home: Washington's battle against America's veterans. University of California Press.
Ginsberg, J. P. (2009). The war comes home: Washington's battle against America's veterans. University of California Press.`
		);

		expect(result.errors).toEqual([]);
		expect(result.entries).toHaveLength(2);
		expect(result.entries[0].csl.title).toBe(
			"The war comes home: Washington's battle against America's veterans"
		);
		expect(result.entries[1].csl.title).toBe(
			"The war comes home: Washington's battle against America's veterans"
		);
		expect(result.remainingInput).toBe('');
	});

	it('accepts doi.org links without an explicit URL scheme', async () => {
		Cite.async.mockResolvedValue({
			get: () => [
				{
					type: 'article-journal',
					title: 'Example title',
				},
			],
		});

		const result = await parsePastedInput('doi.org/10.1234/example-doi');

		expect(Cite.async).toHaveBeenCalledWith('doi.org/10.1234/example-doi');
		expect(result.entries).toHaveLength(1);
	});

	it('accepts DOI URLs with trailing punctuation', async () => {
		Cite.async.mockResolvedValue({
			get: () => [
				{
					type: 'article-journal',
					title: 'Example title',
				},
			],
		});

		const result = await parsePastedInput(
			'https://doi.org/10.1086/725865.'
		);

		expect(Cite.async).toHaveBeenCalledWith(
			'https://doi.org/10.1086/725865'
		);
		expect(result.entries).toHaveLength(1);
	});

	it('accepts doi:-prefixed DOI URLs and normalizes them for lookup', async () => {
		Cite.async.mockResolvedValue({
			get: () => [
				{
					type: 'article-journal',
					title: 'Example title',
				},
			],
		});

		const result = await parsePastedInput(
			'https://doi:10.1016/j.janxdis.2007.08.009'
		);

		expect(Cite.async).toHaveBeenCalledWith(
			'10.1016/j.janxdis.2007.08.009'
		);
		expect(result.entries).toHaveLength(1);
	});

	it('parses APA journal citations with multiple authors and doi: URL form via heuristics', async () => {
		const result = await parsePastedInput(
			'Ginsberg, J. P., Ayers, E., Burriss, L., & Powell, D. A. (2008). Discriminative delay Pavlovian eye-blink conditioning in veterans with and without post-traumatic stress disorder. Journal of Anxiety Disorders, 22, 809-823. https://doi:10.1016/j.janxdis.2007.08.009'
		);

		expect(result.errors).toEqual([]);
		expect(result.entries).toHaveLength(1);
		expect(result.entries[0]).toMatchObject({
			inputFormat: 'freetext',
			csl: {
				type: 'article-journal',
				title: 'Discriminative delay Pavlovian eye-blink conditioning in veterans with and without post-traumatic stress disorder',
				'container-title': 'Journal of Anxiety Disorders',
				volume: '22',
				page: '809-823',
				DOI: '10.1016/j.janxdis.2007.08.009',
				author: [
					{ family: 'Ginsberg', given: 'J. P.' },
					{ family: 'Ayers', given: 'E.' },
					{ family: 'Burriss', given: 'L.' },
					{ family: 'Powell', given: 'D. A' },
				],
			},
		});
	});

	it('parses APA-style book citations via heuristics', async () => {
		const result = await parsePastedInput(
			"Ginsberg, J. P. (2009). The war comes home: Washington's battle against America's veterans. University of California Press."
		);

		expect(result.errors).toEqual([]);
		expect(result.entries).toHaveLength(1);
		expect(result.entries[0]).toMatchObject({
			inputFormat: 'freetext',
			csl: {
				type: 'book',
				title: "The war comes home: Washington's battle against America's veterans",
				publisher: 'University of California Press',
				author: [{ family: 'Ginsberg', given: 'J. P' }],
			},
		});
	});

	it('parses APA-style corporate-author book citations with G.P.O. publishers via heuristics', async () => {
		const result = await parsePastedInput(
			'United States. Congress. House Committee on Foreign Affairs. Subcommittee on the Middle East and South Asia. (2007). Working in a war zone: Post traumatic stress disorder in civilians returning from Iraq. G.P.O.'
		);

		expect(result.errors).toEqual([]);
		expect(result.entries).toHaveLength(1);
		expect(result.entries[0]).toMatchObject({
			inputFormat: 'freetext',
			csl: {
				type: 'book',
				title: 'Working in a war zone: Post traumatic stress disorder in civilians returning from Iraq',
				publisher: 'G.P.O',
				author: [
					{
						literal:
							'United States. Congress. House Committee on Foreign Affairs. Subcommittee on the Middle East and South Asia',
					},
				],
			},
		});
	});

	it('parses Chicago-style dissertation citations via heuristics', async () => {
		const result = await parsePastedInput(
			'Blajer de la Garza, Yuna. “A House Is Not a Home: Citizenship and Belonging in Contemporary Democracies.” PhD diss., University of Chicago, 2019. ProQuest (13865986).'
		);

		expect(result.errors).toEqual([]);
		expect(result.entries).toHaveLength(1);
		expect(result.entries[0]).toMatchObject({
			inputFormat: 'freetext',
			csl: {
				type: 'thesis',
				title: 'A House Is Not a Home: Citizenship and Belonging in Contemporary Democracies',
				genre: 'PhD diss',
				publisher: 'University of Chicago',
				medium: 'ProQuest (13865986)',
				author: [
					{
						family: 'Blajer de la Garza',
						given: 'Yuna',
					},
				],
			},
		});
	});

	it('parses sentence-style Chicago journal citations with or without an inline DOI', async () => {
		const withDoi = await parsePastedInput(
			'Dittmar, Emily L., and Douglas W. Schemske. “Temporal Variation in Selection Influences Microgeographic Local Adaptation.” American Naturalist 202, no. 4 (2023): 471–85. https://doi.org/10.1086/725865.'
		);
		const withoutDoi = await parsePastedInput(
			'Dittmar, Emily L., and Douglas W. Schemske. “Temporal Variation in Selection Influences Microgeographic Local Adaptation.” American Naturalist 202, no. 4 (2023): 471–85.'
		);

		expect(withDoi.errors).toEqual([]);
		expect(withoutDoi.errors).toEqual([]);
		expect(withDoi.entries).toHaveLength(1);
		expect(withoutDoi.entries).toHaveLength(1);
		expect(withDoi.entries[0]).toMatchObject({
			inputFormat: 'freetext',
			csl: {
				type: 'article-journal',
				title: 'Temporal Variation in Selection Influences Microgeographic Local Adaptation',
				'container-title': 'American Naturalist',
				volume: '202',
				issue: '4',
				page: '471–85',
				DOI: '10.1086/725865',
				author: [
					{
						given: 'Emily L.',
						family: 'Dittmar',
					},
					{
						given: 'Douglas W.',
						family: 'Schemske',
					},
				],
			},
		});
		expect(withoutDoi.entries[0]).toMatchObject({
			inputFormat: 'freetext',
			csl: {
				type: 'article-journal',
				title: 'Temporal Variation in Selection Influences Microgeographic Local Adaptation',
				'container-title': 'American Naturalist',
				volume: '202',
				issue: '4',
				page: '471–85',
				author: [
					{
						given: 'Emily L.',
						family: 'Dittmar',
					},
					{
						given: 'Douglas W.',
						family: 'Schemske',
					},
				],
			},
		});
	});
});

describe('PMID input resolution', () => {
	const SAMPLE_CSL = {
		type: 'article-journal',
		title: 'CRISPR–Cas9 for medical genetic screens: applications and future perspectives',
		'container-title': 'Journal of medical genetics',
		author: [{ family: 'Xue', given: 'Hui-Ying' }],
		issued: { 'date-parts': [[2016, 2]] },
		DOI: '10.1136/jmedgenet-2015-103409',
		PMID: '26673779',
	};

	function makeFetchFn(status = 200, body = SAMPLE_CSL) {
		return jest.fn().mockResolvedValue({
			ok: status >= 200 && status < 300,
			status,
			json: jest.fn().mockResolvedValue(body),
		});
	}

	it('detects PMID: prefixed input and fetches from NCBI API', async () => {
		const fetchFn = makeFetchFn();

		const result = await parsePastedInput('PMID:26673779', 'apa', {
			fetchFn,
		});

		expect(fetchFn).toHaveBeenCalledWith(
			'https://api.ncbi.nlm.nih.gov/lit/ctxp/v1/pubmed/?format=csl&id=26673779'
		);
		expect(result.entries).toHaveLength(1);
		expect(result.errors).toHaveLength(0);
	});

	it('accepts lowercase pmid: prefix', async () => {
		const fetchFn = makeFetchFn();

		const result = await parsePastedInput('pmid:26673779', 'apa', {
			fetchFn,
		});

		expect(fetchFn).toHaveBeenCalledWith(
			'https://api.ncbi.nlm.nih.gov/lit/ctxp/v1/pubmed/?format=csl&id=26673779'
		);
		expect(result.entries).toHaveLength(1);
	});

	it('accepts PMID: with a space before the number', async () => {
		const fetchFn = makeFetchFn();

		const result = await parsePastedInput('PMID: 26673779', 'apa', {
			fetchFn,
		});

		expect(fetchFn).toHaveBeenCalledWith(
			'https://api.ncbi.nlm.nih.gov/lit/ctxp/v1/pubmed/?format=csl&id=26673779'
		);
		expect(result.entries).toHaveLength(1);
	});

	it('maps NCBI CSL-JSON to a citation entry with inputFormat pmid', async () => {
		const fetchFn = makeFetchFn();

		const result = await parsePastedInput('PMID:26673779', 'apa', {
			fetchFn,
		});

		expect(result.entries[0]).toMatchObject({
			inputFormat: 'pmid',
			csl: {
				type: 'article-journal',
				title: 'CRISPR–Cas9 for medical genetic screens: applications and future perspectives',
			},
		});
	});

	it('uses the WordPress REST proxy for PMID resolution by default', async () => {
		apiFetch.mockResolvedValue(SAMPLE_CSL);

		const result = await parsePastedInput('PMID:26673779', 'apa');

		expect(apiFetch).toHaveBeenCalledWith({
			path: '/bibliography/v1/pmid/26673779',
		});
		expect(result.entries).toHaveLength(1);
		expect(result.errors).toHaveLength(0);
	});

	it('returns an error when NCBI returns a non-OK status', async () => {
		const fetchFn = makeFetchFn(404);

		const result = await parsePastedInput('PMID:99999999', 'apa', {
			fetchFn,
		});

		expect(result.entries).toHaveLength(0);
		expect(result.errors).toHaveLength(1);
		expect(result.errors[0]).toMatch(/PMID/i);
	});

	it('returns a PMID error when the WordPress REST transport fails', async () => {
		apiFetch.mockRejectedValue(new Error('WordPress API unavailable'));

		const result = await parsePastedInput('PMID:26673779', 'apa');

		expect(result.entries).toHaveLength(0);
		expect(result.errors).toEqual([
			"Couldn't resolve the PMID. Check the number and try again.",
		]);
	});

	it('does not call Cite.async for PMID inputs', async () => {
		const fetchFn = makeFetchFn();
		Cite.async.mockClear();

		await parsePastedInput('PMID:26673779', 'apa', { fetchFn });

		expect(Cite.async).not.toHaveBeenCalled();
	});

	it('resolves multiple PMID lines when pasted together', async () => {
		const fetchFn = jest
			.fn()
			.mockResolvedValueOnce({
				ok: true,
				status: 200,
				json: jest
					.fn()
					.mockResolvedValue({ ...SAMPLE_CSL, PMID: '11111111' }),
			})
			.mockResolvedValueOnce({
				ok: true,
				status: 200,
				json: jest
					.fn()
					.mockResolvedValue({ ...SAMPLE_CSL, PMID: '22222222' }),
			});

		const result = await parsePastedInput(
			'PMID:11111111\nPMID:22222222',
			'apa',
			{ fetchFn }
		);

		expect(result.entries).toHaveLength(2);
		expect(result.errors).toHaveLength(0);
	});
});

describe('PMID fallback resolution', () => {
	const SAMPLE_CSL = {
		type: 'article-journal',
		title: 'Fallback PMID citation',
		PMID: '26673779',
	};

	function mockParserDependencies(apiFetchModule) {
		jest.resetModules();
		jest.doMock('@citation-js/core', () =>
			require('../__test-utils__/citation-js-mocks').citationJsCoreMock()
		);
		jest.doMock('@citation-js/plugin-doi', () =>
			require('../__test-utils__/citation-js-mocks').citationJsPluginMock()
		);
		jest.doMock('@citation-js/plugin-bibtex', () =>
			require('../__test-utils__/citation-js-mocks').citationJsPluginMock()
		);
		jest.doMock('./formatting/csl', () =>
			require('../__test-utils__/citation-js-mocks').stubFormattingFactory()
		);
		jest.doMock('@wordpress/api-fetch', () => apiFetchModule);
	}

	afterEach(() => {
		jest.resetModules();
		jest.dontMock('@wordpress/api-fetch');
	});

	it('falls back to window.fetch when the WordPress REST helper is unavailable', async () => {
		const originalFetch = window.fetch;
		const fetchMock = jest.fn().mockResolvedValue({
			ok: true,
			status: 200,
			json: jest.fn().mockResolvedValue(SAMPLE_CSL),
		});

		mockParserDependencies({ __esModule: true, default: undefined });
		window.fetch = fetchMock;

		const { parsePastedInput: parseWithFallback } = require('./parser');
		const result = await parseWithFallback('PMID:26673779', 'apa');

		expect(fetchMock).toHaveBeenCalledWith(
			'https://api.ncbi.nlm.nih.gov/lit/ctxp/v1/pubmed/?format=csl&id=26673779'
		);
		expect(result.errors).toEqual([]);
		expect(result.entries[0]).toMatchObject({
			inputFormat: 'pmid',
			csl: SAMPLE_CSL,
		});

		window.fetch = originalFetch;
	});

	it('reports a PMID error when no REST or fetch transport is available', async () => {
		const originalFetch = window.fetch;

		mockParserDependencies({ __esModule: true, default: undefined });
		delete window.fetch;

		const { parsePastedInput: parseWithoutTransport } = require('./parser');
		const result = await parseWithoutTransport('PMID:26673779', 'apa');

		expect(result.entries).toEqual([]);
		expect(result.errors).toEqual([
			"Couldn't resolve the PMID. Check the number and try again.",
		]);

		window.fetch = originalFetch;
	});
});

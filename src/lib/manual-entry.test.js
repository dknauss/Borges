import {
	buildManualCsl,
	createEmptyManualEntryFields,
	createManualCitation,
	MANUAL_ENTRY_TYPE_OPTIONS,
	normalizeDoiValue,
	normalizeUrlValue,
	validateIdentifierFields,
	validateManualEntry,
} from './manual-entry';

jest.mock('./formatting/csl', () => ({
	formatBibliographyEntry: jest.fn(
		(csl, styleKey) => `${styleKey}:${csl.title || 'Formatted'}`
	),
}));

describe('manual-entry', () => {
	let originalCrypto;

	beforeEach(() => {
		originalCrypto = global.crypto;
		Object.defineProperty(global, 'crypto', {
			configurable: true,
			value: {
				...originalCrypto,
				randomUUID: jest.fn(() => 'manual-uuid'),
			},
		});
	});

	afterEach(() => {
		Object.defineProperty(global, 'crypto', {
			configurable: true,
			value: originalCrypto,
		});
	});

	it('exposes the curated manual-entry type list', () => {
		expect(MANUAL_ENTRY_TYPE_OPTIONS.map((option) => option.value)).toEqual(
			[
				'book',
				'article-journal',
				'chapter',
				'collection',
				'thesis',
				'webpage',
			]
		);
	});

	it('creates empty manual fields with an optional preserved type', () => {
		expect(createEmptyManualEntryFields('book')).toMatchObject({
			type: 'book',
			title: '',
			authors: '',
		});
	});

	it('requires type and title only', () => {
		expect(validateManualEntry({ type: '', title: '' })).toBe(
			'Choose a publication type before adding.'
		);
		expect(validateManualEntry({ type: 'book', title: '' })).toBe(
			'Enter a title before adding.'
		);
		expect(
			validateManualEntry({ type: 'book', title: 'Example' })
		).toBeNull();
	});

	it('normalizes DOI values and rejects invalid DOI input', () => {
		expect(normalizeDoiValue(' doi:10.1234/example. ')).toBe(
			'10.1234/example'
		);
		expect(normalizeDoiValue('https://doi.org/10.1234/example')).toBeNull();
		expect(normalizeDoiValue('not a doi')).toBeNull();
		expect(normalizeDoiValue('   ')).toBe('');
		expect(normalizeDoiValue(10)).toBe('');
	});

	it('normalizes URL values and rejects non-http URLs', () => {
		expect(normalizeUrlValue(' https://example.com/page). ')).toBe(
			'https://example.com/page'
		);
		expect(normalizeUrlValue('ftp://example.com')).toBeNull();
		expect(normalizeUrlValue('example.com')).toBeNull();
		expect(normalizeUrlValue('')).toBe('');
		expect(normalizeUrlValue(null)).toBe('');
	});

	it('reports identifier validation errors before building CSL', () => {
		expect(
			validateIdentifierFields({
				doi: 'invalid-doi',
				url: 'https://example.com',
			})
		).toBe('Enter a valid DOI before adding.');
		expect(
			validateIdentifierFields({
				doi: '10.1234/valid',
				url: 'example.com',
			})
		).toBe(
			'Enter a valid URL beginning with http:// or https:// before adding.'
		);
		expect(
			validateIdentifierFields({
				doi: '',
				url: '',
			})
		).toBeNull();
	});

	it('maps curated manual types to the expected CSL shapes', () => {
		const expectations = [
			['book', 'author'],
			['article-journal', 'author'],
			['chapter', 'author'],
			['collection', 'editor'],
			['thesis', 'author'],
			['webpage', 'author'],
		];

		for (const [type, contributorKey] of expectations) {
			const csl = buildManualCsl({
				type,
				title: 'Example title',
				authors: 'Smith, Ada; Scholar, Jane',
			});

			expect(csl.type).toBe(type);
			expect(csl.title).toBe('Example title');
			expect(csl[contributorKey]).toEqual([
				{ family: 'Smith', given: 'Ada' },
				{ family: 'Scholar', given: 'Jane' },
			]);
		}
	});

	it('maps Article number to CSL number for journal articles only', () => {
		expect(
			buildManualCsl({
				type: 'article-journal',
				title: 'Numbered',
				articleNumber: ' 108125 ',
			}).number
		).toBe('108125');
		expect(
			buildManualCsl({
				type: 'book',
				title: 'Book',
				articleNumber: '108125',
			})
		).not.toHaveProperty('number');
	});

	it('builds sparse manual CSL records with only required data', () => {
		const csl = buildManualCsl({
			type: 'webpage',
			title: 'Only a Title',
		});

		expect(csl).toEqual({
			type: 'webpage',
			title: 'Only a Title',
		});
	});

	it('returns sanitized manual CSL output', () => {
		const csl = buildManualCsl({
			type: 'collection',
			title: 'Edited Volume',
			authors: 'Scholar, Jane',
			doi: '10.1234/edited-volume',
		});

		expect(csl).toEqual({
			type: 'collection',
			title: 'Edited Volume',
			editor: [{ family: 'Scholar', given: 'Jane' }],
			DOI: '10.1234/edited-volume',
		});
	});

	it('ignores invalid years and maps DOI/URL/page fields when present', () => {
		const csl = buildManualCsl({
			type: 'article-journal',
			title: 'Example title',
			year: '20AB',
			page: '117-134',
			doi: '10.1234/example-doi',
			url: 'https://example.com',
		});

		expect(csl).toMatchObject({
			type: 'article-journal',
			title: 'Example title',
			page: '117-134',
			DOI: '10.1234/example-doi',
			URL: 'https://example.com',
		});
		expect(csl).not.toHaveProperty('issued');
	});

	it('parses one-name, natural-order, and incomplete comma authors as expected', () => {
		const csl = buildManualCsl({
			type: 'book',
			title: 'Contributor Forms',
			authors: 'Anonymous; Ada Lovelace; Incomplete, ; Scholar, Jane.; ;',
		});

		expect(csl.author).toEqual([
			{ literal: 'Anonymous' },
			{ given: 'Ada', family: 'Lovelace' },
			{ literal: 'Incomplete,' },
			{ family: 'Scholar', given: 'Jane' },
		]);
	});

	it('maps optional container, publisher, page, URL, and valid year fields', () => {
		const csl = buildManualCsl({
			type: 'chapter',
			title: 'A Chapter',
			containerTitle: 'Edited Volume',
			publisher: 'Example Press',
			page: '10-20',
			url: 'https://example.com/chapter),',
			year: '2026',
		});

		expect(csl).toMatchObject({
			type: 'chapter',
			title: 'A Chapter',
			'container-title': 'Edited Volume',
			publisher: 'Example Press',
			page: '10-20',
			URL: 'https://example.com/chapter',
			issued: {
				'date-parts': [[2026]],
			},
		});
	});

	it('creates a full manual citation entry compatible with the save pipeline', async () => {
		const entry = await createManualCitation(
			{
				type: 'book',
				title: 'Example title',
				authors: 'Smith, Ada',
				year: '2024',
			},
			'apa-7'
		);

		expect(entry).toMatchObject({
			id: 'manual-uuid',
			csl: {
				type: 'book',
				title: 'Example title',
				author: [{ family: 'Smith', given: 'Ada' }],
				issued: {
					'date-parts': [[2024]],
				},
			},
			formattedText: 'apa-7:Example title',
			displayOverride: null,
			inputFormat: 'manual',
			parseWarnings: [],
		});
	});
});

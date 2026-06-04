import {
	buildPlainTextBibliographyContent,
	buildCslJsonExportContent,
	buildBibtexExportContent,
	buildBiblatexExportContent,
	buildRisExportContent,
	normalizeBibtexUnicodeQuotes,
	downloadTextExport,
	downloadCslJsonExport,
	downloadBibtexExport,
	downloadBiblatexExport,
	downloadRisExport,
	CSL_JSON_EXPORT_FILENAME,
	CSL_JSON_EXPORT_MIME_TYPE,
	BIBTEX_EXPORT_FILENAME,
	BIBTEX_EXPORT_MIME_TYPE,
	BIBLATEX_EXPORT_FILENAME,
	BIBLATEX_EXPORT_MIME_TYPE,
	RIS_EXPORT_FILENAME,
	RIS_EXPORT_MIME_TYPE,
} from './export';

describe('export helpers', () => {
	function createMatrixCitations() {
		return [
			{
				id: 'zulu',
				formattedText: 'Zulu formatted citation',
				csl: {
					type: 'book',
					title: 'Zulu Book',
					author: [{ family: 'Zulu', given: 'Zoe' }],
					issued: { 'date-parts': [[2024]] },
				},
			},
			{
				id: 'alpha',
				formattedText: 'Alpha formatted citation',
				csl: {
					type: 'book',
					title: 'Alpha Book',
					author: [{ family: 'Alpha', given: 'Ada' }],
					issued: { 'date-parts': [[2020]] },
				},
			},
		];
	}

	function createOrderingCiteCtor(expectedFormat) {
		return jest.fn().mockImplementation((data) => ({
			format: jest.fn((format) => {
				expect(format).toBe(expectedFormat);
				return data.map((csl) => csl.title).join('\n');
			}),
		}));
	}

	function getRisTitles(content) {
		return [...content.matchAll(/^TI  - (.+)$/gmu)].map(
			(match) => match[1]
		);
	}

	it('builds a sorted plain-text bibliography payload', () => {
		const content = buildPlainTextBibliographyContent(
			[
				{
					id: '2',
					formattedText: 'Zulu citation',
					csl: {
						type: 'book',
						title: 'Zeta Book',
						author: [{ family: 'Zulu', given: 'Zoe' }],
						issued: { 'date-parts': [[2024]] },
					},
				},
				{
					id: '1',
					displayOverride: 'Alpha override',
					formattedText: 'Alpha citation',
					csl: {
						type: 'book',
						title: 'Alpha Book',
						author: [{ family: 'Alpha', given: 'Ada' }],
						issued: { 'date-parts': [[2020]] },
					},
				},
			],
			'chicago-author-date'
		);

		expect(content).toBe('Alpha override\nZulu citation\n');
	});

	it('builds a sorted CSL-JSON export payload', () => {
		const content = buildCslJsonExportContent(
			[
				{
					id: '2',
					csl: {
						type: 'book',
						title: 'Zeta Book',
						author: [{ family: 'Zulu', given: 'Zoe' }],
						issued: { 'date-parts': [[2024]] },
					},
				},
				{
					id: '1',
					csl: {
						type: 'book',
						title: 'Alpha Book',
						author: [{ family: 'Alpha', given: 'Ada' }],
						issued: { 'date-parts': [[2020]] },
					},
				},
			],
			'chicago-author-date'
		);

		const parsed = JSON.parse(content);

		expect(parsed).toHaveLength(2);
		expect(parsed[0].title).toBe('Alpha Book');
		expect(parsed[1].title).toBe('Zeta Book');
		expect(content.endsWith('\n')).toBe(true);
	});

	it.each([
		{
			style: 'chicago-author-date',
			expectedTitles: ['Alpha Book', 'Zulu Book'],
			expectedText: 'Alpha formatted citation\nZulu formatted citation\n',
		},
		{
			style: 'ieee',
			expectedTitles: ['Zulu Book', 'Alpha Book'],
			expectedText: 'Zulu formatted citation\nAlpha formatted citation\n',
		},
	])(
		'sorts every export format correctly for $style',
		async ({ style, expectedTitles, expectedText }) => {
			const citations = createMatrixCitations();

			expect(buildPlainTextBibliographyContent(citations, style)).toBe(
				expectedText
			);

			expect(
				JSON.parse(buildCslJsonExportContent(citations, style)).map(
					(csl) => csl.title
				)
			).toEqual(expectedTitles);

			expect(
				await buildBibtexExportContent(citations, style, {
					CiteCtor: createOrderingCiteCtor('bibtex'),
				})
			).toBe(`${expectedTitles.join('\n')}\n`);

			expect(
				await buildBiblatexExportContent(citations, style, {
					CiteCtor: createOrderingCiteCtor('biblatex'),
				})
			).toBe(`${expectedTitles.join('\n')}\n`);

			expect(
				getRisTitles(buildRisExportContent(citations, style))
			).toEqual(expectedTitles);
		}
	);

	it('downloads text content as a file', () => {
		const click = jest.fn();
		const remove = jest.fn();
		const appendChild = jest.fn();
		const createObjectURL = jest.fn(() => 'blob:download');
		const revokeObjectURL = jest.fn();
		const documentRef = {
			createElement: jest.fn(() => ({
				click,
				remove,
			})),
			body: {
				appendChild,
			},
		};
		const BlobCtor = jest.fn(function MockBlob(parts, options) {
			this.parts = parts;
			this.options = options;
		});

		expect(
			downloadTextExport(
				{
					content: '{"ok":true}',
					filename: 'citations.json',
					mimeType: 'application/json',
				},
				{
					documentRef,
					urlRef: { createObjectURL, revokeObjectURL },
					BlobCtor,
				}
			)
		).toBeUndefined();

		expect(BlobCtor).toHaveBeenCalledWith(['{"ok":true}'], {
			type: 'application/json',
		});
		expect(appendChild).toHaveBeenCalled();
		expect(click).toHaveBeenCalled();
		expect(remove).toHaveBeenCalled();
		expect(revokeObjectURL).toHaveBeenCalledWith('blob:download');
	});

	it('throws clearly when browser download APIs are unavailable', () => {
		expect(() =>
			downloadTextExport(
				{
					content: 'citation data',
					filename: 'citations.txt',
					mimeType: 'text/plain',
				},
				{
					documentRef: {
						createElement: jest.fn(),
						body: null,
					},
					urlRef: {
						createObjectURL: jest.fn(),
					},
					BlobCtor: Blob,
				}
			)
		).toThrow('Download API unavailable');
	});

	it('downloads CSL-JSON with the expected filename and MIME type', () => {
		const click = jest.fn();
		const remove = jest.fn();
		const appendChild = jest.fn();
		const createObjectURL = jest.fn(() => 'blob:csl');
		const revokeObjectURL = jest.fn();
		const documentRef = {
			createElement: jest.fn(() => ({
				click,
				remove,
			})),
			body: {
				appendChild,
			},
		};
		const BlobCtor = jest.fn(function MockBlob(parts, options) {
			this.parts = parts;
			this.options = options;
		});

		downloadCslJsonExport(
			[
				{
					id: 'citation-1',
					csl: {
						type: 'webpage',
						title: 'Responses API',
					},
				},
			],
			'apa-7',
			{
				documentRef,
				urlRef: { createObjectURL, revokeObjectURL },
				BlobCtor,
			}
		);

		expect(documentRef.createElement).toHaveBeenCalledWith('a');
		expect(BlobCtor).toHaveBeenCalledWith(
			[expect.stringContaining('"Responses API"')],
			{
				type: CSL_JSON_EXPORT_MIME_TYPE,
			}
		);
		expect(documentRef.createElement.mock.results[0].value.download).toBe(
			CSL_JSON_EXPORT_FILENAME
		);
	});

	it('builds a sorted BibTeX export payload', async () => {
		const CiteCtor = jest.fn().mockImplementation((data) => ({
			format: jest.fn(() => {
				expect(data[0].title).toBe('Alpha Book');
				expect(data[1].title).toBe('Zeta Book');
				return '@book{Alpha2020Alpha,...}';
			}),
		}));

		const content = await buildBibtexExportContent(
			[
				{
					id: '2',
					csl: {
						type: 'book',
						title: 'Zeta Book',
						author: [{ family: 'Zulu', given: 'Zoe' }],
						issued: { 'date-parts': [[2024]] },
					},
				},
				{
					id: '1',
					csl: {
						type: 'book',
						title: 'Alpha Book',
						author: [{ family: 'Alpha', given: 'Ada' }],
						issued: { 'date-parts': [[2020]] },
					},
				},
			],
			'chicago-author-date',
			{ CiteCtor }
		);

		expect(CiteCtor).toHaveBeenCalled();
		expect(content).toContain('@book{Alpha2020Alpha');
		expect(content.endsWith('\n')).toBe(true);
	});

	it('normalizes citation-js TeX quote ligatures in BibTeX exports to UTF-8 quotes', async () => {
		const CiteCtor = jest.fn().mockImplementation(() => ({
			format: jest.fn(
				() =>
					'@article{Mallory2015Contagious,\n' +
					"\ttitle = {``{Contagious} {Air}[s]'': Wordsworth's {Poetics} and {Politics} of {Immunity}},\n" +
					'}'
			),
		}));

		const content = await buildBibtexExportContent(
			[
				{
					id: 'mallory-2015',
					csl: {
						type: 'article-journal',
						title: '“Contagious Air[s]”: Wordsworth’s Poetics and Politics of Immunity',
						author: [{ family: 'Mallory-Kani', given: 'Amy' }],
						issued: { 'date-parts': [[2015]] },
					},
				},
			],
			'chicago-author-date',
			{ CiteCtor }
		);

		expect(content).toContain(
			"title = {“{Contagious} {Air}[s]”: Wordsworth's {Poetics}"
		);
		expect(content).not.toContain('``');
		expect(content).not.toContain("''");
	});

	it('exports real citation-js BibTeX with Unicode opening quotes for citation managers', async () => {
		const content = await buildBibtexExportContent(
			[
				{
					id: 'mallory-2015',
					csl: {
						type: 'article-journal',
						title: "“Contagious Air[s]”: Wordsworth's Poetics and Politics of Immunity",
						author: [{ family: 'Mallory-Kani', given: 'Amy' }],
						'container-title': 'European Romantic Review',
						issued: { 'date-parts': [[2015, 11]] },
						volume: '26',
						issue: '6',
						page: '699-717',
						DOI: '10.1080/10509585.2015.1092083',
					},
				},
			],
			'chicago-author-date'
		);

		expect(content).toContain(
			"title = {“{Contagious} {Air}[s]”: Wordsworth's {Poetics}"
		);
		expect(content).not.toContain('``{Contagious}');
		expect(content).not.toContain("{Air}[s]''");
	});

	it('normalizes citation-js TeX single quote commands in BibTeX exports', () => {
		expect(
			normalizeBibtexUnicodeQuotes(
				'title = {\\textquoteleft{}{No}.\\textquoteright{} O\\textquoteright{}{Connor}}'
			)
		).toBe('title = {‘{No}.’ O’{Connor}}');
	});

	it('downloads BibTeX with the expected filename and MIME type', async () => {
		const click = jest.fn();
		const remove = jest.fn();
		const appendChild = jest.fn();
		const createObjectURL = jest.fn(() => 'blob:bib');
		const revokeObjectURL = jest.fn();
		const documentRef = {
			createElement: jest.fn(() => ({
				click,
				remove,
			})),
			body: {
				appendChild,
			},
		};
		const BlobCtor = jest.fn(function MockBlob(parts, options) {
			this.parts = parts;
			this.options = options;
		});

		await downloadBibtexExport(
			[
				{
					id: 'citation-1',
					csl: {
						type: 'book',
						title: 'Test Book',
					},
				},
			],
			'apa-7',
			{
				documentRef,
				urlRef: { createObjectURL, revokeObjectURL },
				BlobCtor,
				CiteCtor: jest.fn().mockImplementation(() => ({
					format: () => '@book{TestBook,...}',
				})),
			}
		);

		expect(documentRef.createElement).toHaveBeenCalledWith('a');
		expect(BlobCtor).toHaveBeenCalledWith(['@book{TestBook,...}\n'], {
			type: BIBTEX_EXPORT_MIME_TYPE,
		});
		expect(documentRef.createElement.mock.results[0].value.download).toBe(
			BIBTEX_EXPORT_FILENAME
		);
	});

	it('builds RIS output with practical core fields', () => {
		const content = buildRisExportContent(
			[
				{
					id: 'citation-1',
					csl: {
						type: 'chapter',
						title: 'A Chapter',
						'container-title': 'Collected Volume',
						publisher: 'Example Press',
						editor: [{ family: 'Reyes', given: 'Carla' }],
						ISBN: '9780226819909',
						page: '117-134',
						author: [{ family: 'Alpha', given: 'Ada' }],
						issued: { 'date-parts': [[2024]] },
					},
				},
			],
			'apa-7'
		);

		expect(content).toContain('TY  - CHAP');
		expect(content).toContain('AU  - Alpha, Ada');
		expect(content).toContain('TI  - A Chapter');
		expect(content).toContain('T2  - Collected Volume');
		expect(content).toContain('A2  - Reyes, Carla');
		expect(content).toContain('PB  - Example Press');
		expect(content).toContain('SN  - 9780226819909');
		expect(content).toContain('SP  - 117');
		expect(content).toContain('EP  - 134');
		expect(content).toContain('ER  - ');
	});

	it('builds RIS authors from literal and partial personal names', () => {
		const content = buildRisExportContent(
			[
				{
					id: 'citation-1',
					csl: {
						type: 'report',
						title: 'Institutional Report',
						author: [
							{ literal: 'World Health Organization' },
							{ given: 'Alex' },
						],
					},
				},
			],
			'apa-7'
		);

		expect(content).toContain('AU  - World Health Organization');
		expect(content).toContain('AU  - Alex');
	});

	it('downloads RIS with the expected filename and MIME type', () => {
		const click = jest.fn();
		const remove = jest.fn();
		const appendChild = jest.fn();
		const createObjectURL = jest.fn(() => 'blob:ris');
		const revokeObjectURL = jest.fn();
		const documentRef = {
			createElement: jest.fn(() => ({
				click,
				remove,
			})),
			body: {
				appendChild,
			},
		};
		const BlobCtor = jest.fn(function MockBlob(parts, options) {
			this.parts = parts;
			this.options = options;
		});

		downloadRisExport(
			[
				{
					id: 'citation-1',
					csl: {
						type: 'webpage',
						title: 'Test RIS',
					},
				},
			],
			'apa-7',
			{
				documentRef,
				urlRef: { createObjectURL, revokeObjectURL },
				BlobCtor,
			}
		);

		expect(BlobCtor).toHaveBeenCalledWith(
			[expect.stringContaining('TY  - ELEC')],
			{
				type: RIS_EXPORT_MIME_TYPE,
			}
		);
		expect(documentRef.createElement.mock.results[0].value.download).toBe(
			RIS_EXPORT_FILENAME
		);
	});

	it('buildBiblatexExportContent sorts citations and calls cite.format("biblatex")', async () => {
		const CiteCtor = jest.fn().mockImplementation((data) => ({
			format: jest.fn((fmt) => {
				expect(fmt).toBe('biblatex');
				expect(data[0].title).toBe('Alpha Book');
				expect(data[1].title).toBe('Zeta Book');
				return '@book{Alpha2020Alpha,\n\tdate = {2020},\n}';
			}),
		}));

		const content = await buildBiblatexExportContent(
			[
				{
					id: '2',
					csl: {
						type: 'book',
						title: 'Zeta Book',
						author: [{ family: 'Zulu', given: 'Zoe' }],
						issued: { 'date-parts': [[2024]] },
					},
				},
				{
					id: '1',
					csl: {
						type: 'book',
						title: 'Alpha Book',
						author: [{ family: 'Alpha', given: 'Ada' }],
						issued: { 'date-parts': [[2020]] },
					},
				},
			],
			'chicago-author-date',
			{ CiteCtor }
		);

		expect(CiteCtor).toHaveBeenCalled();
		expect(content).toContain('@book{Alpha2020Alpha');
		expect(content).toContain('date = {2020}');
		expect(content.endsWith('\n')).toBe(true);
	});

	it('buildBiblatexExportContent uses date field instead of year field', async () => {
		const content = await buildBiblatexExportContent(
			[
				{
					id: 'test',
					csl: {
						type: 'book',
						title: 'Test Book',
						author: [{ family: 'Smith', given: 'A' }],
						issued: { 'date-parts': [[2021]] },
					},
				},
			],
			'chicago-author-date'
		);

		expect(content).toContain('date = {2021}');
		expect(content).not.toContain('year = {2021}');
	});

	it('buildBiblatexExportContent uses journaltitle instead of journal for articles', async () => {
		const content = await buildBiblatexExportContent(
			[
				{
					id: 'article',
					csl: {
						type: 'article-journal',
						title: 'My Article',
						author: [{ family: 'Smith', given: 'A' }],
						'container-title': 'Journal of Things',
						issued: { 'date-parts': [[2021]] },
					},
				},
			],
			'chicago-author-date'
		);

		expect(content).toContain('journaltitle = {Journal of Things}');
		expect(content).not.toContain('\tjournal = ');
	});

	it('BIBLATEX_EXPORT_FILENAME and BIBLATEX_EXPORT_MIME_TYPE are defined', () => {
		expect(BIBLATEX_EXPORT_FILENAME).toBe('bibliography.biblatex.bib');
		expect(BIBLATEX_EXPORT_MIME_TYPE).toContain('text/x-bibtex');
	});

	it('downloadBiblatexExport triggers download with correct filename and MIME type', async () => {
		const click = jest.fn();
		const remove = jest.fn();
		const createObjectURL = jest.fn(() => 'blob:test-biblatex');
		const revokeObjectURL = jest.fn();
		const BlobCtor = jest.fn(function MockBlob(parts, options) {
			this.parts = parts;
			this.options = options;
		});
		const documentRef = {
			createElement: jest.fn(() => ({ click, remove })),
			body: { appendChild: jest.fn() },
		};

		await downloadBiblatexExport(
			[
				{
					id: 'book1',
					csl: {
						type: 'book',
						title: 'A Book',
						author: [{ family: 'Author', given: 'A' }],
						issued: { 'date-parts': [[2020]] },
					},
				},
			],
			'chicago-notes-bibliography',
			{
				BlobCtor,
				urlRef: { createObjectURL, revokeObjectURL },
				documentRef,
				CiteCtor: jest.fn().mockImplementation(() => ({
					format: () => '@book{Author2020A,...}',
				})),
			}
		);

		expect(BlobCtor).toHaveBeenCalledWith(
			[expect.stringContaining('@book{')],
			{ type: BIBLATEX_EXPORT_MIME_TYPE }
		);
		expect(documentRef.createElement.mock.results[0].value.download).toBe(
			BIBLATEX_EXPORT_FILENAME
		);
	});
});

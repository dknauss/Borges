import { renderToStaticMarkup } from 'react-dom/server';
import { Cite } from '@citation-js/core';
import { parsePastedInput } from './lib/parser';
import save from './save';

jest.mock('@citation-js/core', () =>
	require('./__test-utils__/citation-js-mocks').citationJsCoreMock()
);

jest.mock('@citation-js/plugin-doi', () =>
	require('./__test-utils__/citation-js-mocks').citationJsPluginMock()
);
jest.mock('@citation-js/plugin-bibtex', () =>
	require('./__test-utils__/citation-js-mocks').citationJsPluginMock()
);
jest.mock('./lib/formatting/csl', () =>
	require('./__test-utils__/citation-js-mocks').descriptiveFormattingFactory()
);

jest.mock(
	'@wordpress/block-editor',
	() => ({
		useBlockProps: {
			save: () => ({
				className: 'wp-block-bibliography-builder-bibliography',
			}),
		},
	}),
	{ virtual: true }
);

describe('parse → store → render integration', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		global.crypto = {
			randomUUID: jest.fn(() => 'integration-uuid'),
		};
	});

	it('parses a DOI-backed citation, stores it, and renders safe saved output', async () => {
		Cite.async.mockResolvedValue({
			get: () => [
				{
					type: 'webpage',
					title: 'Example Resource',
					URL: 'https://example.com/resource',
					author: [{ given: 'Ada', family: 'Smith' }],
					issued: { 'date-parts': [[2026, 4, 6]] },
				},
			],
		});

		const parsed = await parsePastedInput(
			'10.1234/example-resource',
			'chicago-author-date',
			{ deferFormatting: false }
		);

		expect(parsed.errors).toEqual([]);
		expect(parsed.entries).toHaveLength(1);
		expect(parsed.entries[0]).toMatchObject({
			inputFormat: 'doi',
			formattedText:
				'Smith. Example Resource. https://example.com/resource',
			displayOverride: null,
			csl: {
				type: 'webpage',
				title: 'Example Resource',
				URL: 'https://example.com/resource',
			},
		});

		const markup = renderToStaticMarkup(
			save({
				attributes: {
					citationStyle: 'chicago-author-date',
					outputJsonLd: true,
					outputCoins: true,
					citations: parsed.entries,
				},
			})
		);

		expect(markup).toContain('Smith. <i>Example Resource</i>.');
		expect(markup).toContain(
			'<a href="https://example.com/resource" rel="nofollow noopener noreferrer" aria-label="Example Resource — https://example.com/resource">https://example.com/resource</a>'
		);
		expect(markup).toContain('<script type="application/ld+json">');
		expect(markup).toContain('class="Z3988"');
		expect(markup).not.toContain('<script>alert(');
	});
});

/**
 * Unit tests for the Block Accessibility Checks validation logic.
 */
import { addFilter } from '@wordpress/hooks';
import { bacValidateBlock, validateBibliographyBlock } from './validation';

jest.mock('@wordpress/hooks', () => ({
	addFilter: jest.fn(),
}));

describe('BAC filter registration', () => {
	it('registers the ba11yc.validateBlock filter (dot-separated, v4 API)', () => {
		expect(addFilter).toHaveBeenCalledWith(
			'ba11yc.validateBlock',
			'borges-bibliography-builder/bac-validation',
			bacValidateBlock
		);
	});
});

describe('validateBibliographyBlock', () => {
	describe('empty_bibliography check', () => {
		it('passes when citations array has at least one entry', () => {
			expect(
				validateBibliographyBlock(
					{ citations: [{ id: '1' }] },
					'empty_bibliography'
				)
			).toBe(true);
		});

		it('fails when citations array is empty', () => {
			expect(
				validateBibliographyBlock(
					{ citations: [] },
					'empty_bibliography'
				)
			).toBe(false);
		});

		it('fails when citations attribute is missing', () => {
			expect(validateBibliographyBlock({}, 'empty_bibliography')).toBe(
				false
			);
		});

		it('fails when citations is null', () => {
			expect(
				validateBibliographyBlock(
					{ citations: null },
					'empty_bibliography'
				)
			).toBe(false);
		});

		it('fails when citations is not an array', () => {
			expect(
				validateBibliographyBlock(
					{ citations: 'bad' },
					'empty_bibliography'
				)
			).toBe(false);
		});
	});

	describe('heading_missing check', () => {
		it('passes when headingText is a non-empty string', () => {
			expect(
				validateBibliographyBlock(
					{
						citations: [{ csl: { title: 'Example' } }],
						headingText: 'References',
					},
					'heading_missing'
				)
			).toBe(true);
		});

		it('passes when headingText is empty and the block has no citations', () => {
			expect(
				validateBibliographyBlock(
					{ citations: [], headingText: '' },
					'heading_missing'
				)
			).toBe(true);
		});

		it('passes when citations attribute is missing', () => {
			expect(validateBibliographyBlock({}, 'heading_missing')).toBe(true);
		});

		it('fails when citations exist and headingText is an empty string', () => {
			expect(
				validateBibliographyBlock(
					{
						citations: [{ csl: { title: 'Example' } }],
						headingText: '',
					},
					'heading_missing'
				)
			).toBe(false);
		});

		it('fails when citations exist and headingText is missing', () => {
			expect(
				validateBibliographyBlock(
					{ citations: [{ csl: { title: 'Example' } }] },
					'heading_missing'
				)
			).toBe(false);
		});

		it('fails when citations exist and headingText is whitespace-only', () => {
			expect(
				validateBibliographyBlock(
					{
						citations: [{ csl: { title: 'Example' } }],
						headingText: '   ',
					},
					'heading_missing'
				)
			).toBe(false);
		});
	});

	describe('raw_url_link_text check', () => {
		it('passes when citations have descriptive titles', () => {
			expect(
				validateBibliographyBlock(
					{
						citations: [
							{ URL: 'https://example.com', title: 'My Paper' },
						],
					},
					'raw_url_link_text'
				)
			).toBe(true);
		});

		it('fails when a citation has a URL but no title', () => {
			expect(
				validateBibliographyBlock(
					{ citations: [{ URL: 'https://example.com/paper' }] },
					'raw_url_link_text'
				)
			).toBe(false);
		});

		it('fails when a citation has a DOI but no title', () => {
			expect(
				validateBibliographyBlock(
					{ citations: [{ DOI: '10.1234/example' }] },
					'raw_url_link_text'
				)
			).toBe(false);
		});

		it('fails when a citation title is itself a raw URL', () => {
			expect(
				validateBibliographyBlock(
					{
						citations: [
							{
								URL: 'https://example.com',
								title: 'https://example.com',
							},
						],
					},
					'raw_url_link_text'
				)
			).toBe(false);
		});

		it('passes when citations array is empty', () => {
			expect(
				validateBibliographyBlock(
					{ citations: [] },
					'raw_url_link_text'
				)
			).toBe(true);
		});
	});

	describe('all_metadata_disabled check', () => {
		it('fails when all three metadata outputs are disabled', () => {
			expect(
				validateBibliographyBlock(
					{
						outputJsonLd: false,
						outputCoins: false,
						outputCslJson: false,
					},
					'all_metadata_disabled'
				)
			).toBe(false);
		});

		it('passes when outputJsonLd is enabled', () => {
			expect(
				validateBibliographyBlock(
					{
						outputJsonLd: true,
						outputCoins: false,
						outputCslJson: false,
					},
					'all_metadata_disabled'
				)
			).toBe(true);
		});

		it('passes when outputCoins is enabled', () => {
			expect(
				validateBibliographyBlock(
					{
						outputJsonLd: false,
						outputCoins: true,
						outputCslJson: false,
					},
					'all_metadata_disabled'
				)
			).toBe(true);
		});

		it('passes when outputCslJson is enabled', () => {
			expect(
				validateBibliographyBlock(
					{
						outputJsonLd: false,
						outputCoins: false,
						outputCslJson: true,
					},
					'all_metadata_disabled'
				)
			).toBe(true);
		});
	});

	describe('unknown check name', () => {
		it('returns true (passes) for unrecognised check names', () => {
			expect(validateBibliographyBlock({}, 'some_future_check')).toBe(
				true
			);
		});
	});
});

describe('bacValidateBlock', () => {
	it('passes through validation state for other block types', () => {
		expect(
			bacValidateBlock(true, 'core/paragraph', {}, 'empty_bibliography')
		).toBe(true);
	});

	it('preserves an earlier failed BAC validation result', () => {
		expect(
			bacValidateBlock(
				false,
				'bibliography-builder/bibliography',
				{ citations: [{ id: '1' }] },
				'empty_bibliography'
			)
		).toBe(false);
	});
});

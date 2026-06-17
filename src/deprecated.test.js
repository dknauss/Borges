import { renderToStaticMarkup } from 'react-dom/server';
import metadata from '../block.json';
import { deprecated } from './deprecated';

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

function createCitation({ id, family, title }) {
	return {
		id,
		csl: {
			type: 'book',
			title,
			author: [{ family }],
		},
		formattedText: `${family} citation`,
		displayOverride: null,
	};
}

describe('deprecated block versions', () => {
	it('pins the current attribute schema on every deprecated definition', () => {
		expect(deprecated).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					attributes: metadata.attributes,
				}),
			])
		);
	});

	it('freezes the current pre-Phase-4 save shape: <li> with no <details>', () => {
		const markup = renderToStaticMarkup(
			deprecated[0].save({
				attributes: {
					citationStyle: 'chicago-notes-bibliography',
					headingText: 'References',
					citations: [
						createCitation({
							id: 'smith',
							family: 'Smith',
							title: 'Example Resource',
						}),
					],
				},
			})
		);

		expect(markup).toContain('<li');
		expect(markup).not.toContain('<details');
	});

	it('supports the immediate prior save markup with deprecated entry roles', () => {
		const markup = renderToStaticMarkup(
			deprecated[1].save({
				attributes: {
					citationStyle: 'chicago-notes-bibliography',
					headingText: 'References',
					citations: [
						{
							...createCitation({
								id: 'url-entry',
								family: 'Smith',
								title: 'Example Resource',
							}),
							csl: {
								type: 'webpage',
								title: 'Example Resource',
								URL: 'https://example.com/resource',
								author: [{ family: 'Smith' }],
							},
							formattedText:
								'Smith. Example Resource. https://example.com/resource.',
						},
					],
				},
			})
		);

		// This deprecated version matches the immediate previous save markup:
		// linked URLs, heading-derived aria-label, and deprecated
		// doc-biblioentry roles for existing saved posts.
		expect(markup).toContain('<a href=');
		expect(markup).toContain('aria-label="References"');
		expect(markup).toContain('role="doc-biblioentry"');
	});

	it('supports the prior save markup with linked URLs and static aria-label', () => {
		const markup = renderToStaticMarkup(
			deprecated[2].save({
				attributes: {
					citationStyle: 'chicago-notes-bibliography',
					headingText: 'References',
					citations: [
						{
							...createCitation({
								id: 'url-entry',
								family: 'Smith',
								title: 'Example Resource',
							}),
							csl: {
								type: 'webpage',
								title: 'Example Resource',
								URL: 'https://example.com/resource',
								author: [{ family: 'Smith' }],
							},
							formattedText:
								'Smith. Example Resource. https://example.com/resource.',
						},
					],
				},
			})
		);

		// This deprecated version links URLs but always uses aria-label="Bibliography".
		expect(markup).toContain('<a href=');
		expect(markup).toContain('aria-label="Bibliography"');
		expect(markup).not.toContain('aria-label="References"');
	});

	it('supports the prior save markup variant without linked visible URLs', () => {
		const markup = renderToStaticMarkup(
			deprecated[3].save({
				attributes: {
					citationStyle: 'chicago-notes-bibliography',
					citations: [
						{
							...createCitation({
								id: 'url-entry',
								family: 'Smith',
								title: 'Example Resource',
							}),
							csl: {
								type: 'webpage',
								title: 'Example Resource',
								URL: 'https://example.com/resource',
								author: [{ family: 'Smith' }],
							},
							formattedText:
								'Smith. Example Resource. https://example.com/resource.',
						},
					],
				},
			})
		);

		expect(markup).toContain('https://example.com/resource.');
		expect(markup).not.toContain('<a href=');
	});

	it('migrate re-sorts citations into style order', () => {
		const migrated = deprecated[4].migrate({
			citationStyle: 'chicago-author-date',
			citations: [
				createCitation({ id: 'z', family: 'Zulu', title: 'Zeta Book' }),
				createCitation({
					id: 'a',
					family: 'Alpha',
					title: 'Alpha Book',
				}),
			],
		});

		expect(migrated.citations[0].id).toBe('a');
		expect(migrated.citations[1].id).toBe('z');
	});

	it('migrate handles missing citations attribute with empty array fallback', () => {
		const migrated = deprecated[4].migrate({ citationStyle: 'apa-7' });

		expect(migrated.citations).toEqual([]);
	});

	it('supports the prior unsorted save markup variant', () => {
		const markup = renderToStaticMarkup(
			deprecated[4].save({
				attributes: {
					citationStyle: 'chicago-notes-bibliography',
					citations: [
						createCitation({
							id: 'marks',
							family: 'Marks',
							title: 'The Book by Design',
						}),
						createCitation({
							id: 'borel',
							family: 'Borel',
							title: 'The Chicago Guide to Fact-Checking',
						}),
					],
				},
			})
		);

		expect(markup.indexOf('Marks citation')).toBeLessThan(
			markup.indexOf('Borel citation')
		);
	});
});

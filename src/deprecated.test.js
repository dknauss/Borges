import { renderToStaticMarkup } from 'react-dom/server';
import metadata from '../block.json';
import { deprecated } from './deprecated';
import save from './save';

jest.mock('@wordpress/block-editor', () => ({
	useBlockProps: {
		save: () => ({
			className: 'wp-block-bibliography-builder-bibliography',
		}),
	},
}));

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
			deprecated[3].save({
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
			deprecated[4].save({
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
			deprecated[5].save({
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
			deprecated[6].save({
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
		const migrated = deprecated[7].migrate({
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
		const migrated = deprecated[7].migrate({ citationStyle: 'apa-7' });

		expect(migrated.citations).toEqual([]);
	});

	it('supports the prior unsorted save markup variant', () => {
		const markup = renderToStaticMarkup(
			deprecated[7].save({
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

describe('locale-independence deprecation (deprecated[2])', () => {
	const untitled = {
		id: 'untitled',
		csl: { type: 'webpage', author: [{ family: 'Beta' }] },
		formattedText: 'Beta. https://example.com/x.',
	};

	it('falls back to the current translations when the markup gave no labels', () => {
		const markup = renderToStaticMarkup(
			deprecated[2].save({
				attributes: {
					citationStyle: 'chicago-notes-bibliography',
					citations: [untitled],
				},
			})
		);

		// outputCiteExport unset: no panel, and no legacy labels were sourced.
		expect(markup).not.toContain('<details');
		expect(markup).toContain(
			'aria-label="Link to publication — https://example.com/x"'
		);
	});

	it('reads the fallback label from a matching link and skips one that does not match', () => {
		const markup = renderToStaticMarkup(
			deprecated[2].save({
				attributes: {
					citationStyle: 'chicago-notes-bibliography',
					citations: [untitled],
					legacyEntryLinks: [
						// aria-label for a different href: not a fallback label.
						{
							ariaLabel: 'Ignored — https://example.com/other',
							href: 'https://example.com/x',
						},
						{
							ariaLabel:
								'Lien vers la publication — https://example.com/x',
							href: 'https://example.com/x',
						},
					],
				},
			})
		);

		expect(markup).toContain(
			'aria-label="Lien vers la publication — https://example.com/x"'
		);
	});

	it('renders nothing when the block has no citations', () => {
		expect(
			deprecated[2].save({
				attributes: { citationStyle: 'chicago-notes-bibliography' },
			})
		).toBeNull();
	});
});

describe('pre-repeated-author deprecation (deprecated[1])', () => {
	const borges = (id, title) => ({
		id,
		csl: {
			type: 'book',
			title,
			author: [{ family: 'Borges', given: 'Jorge Luis' }],
		},
		formattedText: `Borges, Jorge Luis. ${title}. Sur, 1944.`,
		displayOverride: null,
	});
	const attributes = {
		citationStyle: 'mla-9',
		citations: [borges('b1', 'Ficciones'), borges('b2', 'El Aleph')],
	};

	it('writes repeated MLA authors in full, as save() did before', () => {
		const old = renderToStaticMarkup(deprecated[1].save({ attributes }));
		const current = renderToStaticMarkup(save({ attributes }));

		expect(old).not.toContain('bibliography-builder-repeated-author');
		expect(old).toContain('Borges, Jorge Luis. <i>El Aleph</i>');
		expect(current).toContain('bibliography-builder-repeated-author');
		expect(current).not.toBe(old);
	});
});

describe('pre-inline-markup deprecation (deprecated[0])', () => {
	const attributes = {
		citationStyle: 'chicago-notes-bibliography',
		citations: [
			{
				id: 'ostrom1990',
				csl: { type: 'book', title: 'Governing the Commons' },
				formattedText:
					'Ostrom, Elinor. <i>Governing the Commons</i>. Cambridge University Press, 1990.',
				displayOverride: null,
			},
		],
	};

	it('showed tags in stored text as text; save() now reads them', () => {
		const old = renderToStaticMarkup(deprecated[0].save({ attributes }));
		const current = renderToStaticMarkup(save({ attributes }));

		expect(old).toContain(
			'&lt;i&gt;<i>Governing the Commons</i>&lt;/i&gt;'
		);
		expect(current).toContain(
			'Ostrom, Elinor. <i>Governing the Commons</i>. Cambridge'
		);
		expect(current).not.toContain('&lt;i');
	});

	it('matches save() for text without tags', () => {
		const plain = {
			...attributes,
			citations: [
				{
					...attributes.citations[0],
					formattedText:
						'Ostrom, Elinor. Governing the Commons. Cambridge University Press, 1990.',
				},
			],
		};

		expect(
			renderToStaticMarkup(deprecated[0].save({ attributes: plain }))
		).toBe(renderToStaticMarkup(save({ attributes: plain })));
	});
});

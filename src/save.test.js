import { renderToStaticMarkup } from 'react-dom/server';
import save from './save';

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

function createCitation(overrides = {}) {
	return {
		id: 'citation-1',
		csl: {
			type: 'article-journal',
			title: 'Example title',
			author: [
				{
					given: 'Ada',
					family: 'Smith',
				},
			],
			issued: {
				'date-parts': [[2024]],
			},
			...overrides.csl,
		},
		formattedText: 'Example formatted citation',
		displayOverride: null,
		...overrides,
	};
}

describe('save', () => {
	it('returns null when there are no citations', () => {
		expect(
			save({
				attributes: {
					citationStyle: 'chicago-author-date',
					citations: [],
				},
			})
		).toBeNull();
	});

	it('renders an optional visible heading when provided', () => {
		const markup = renderToStaticMarkup(
			save({
				attributes: {
					citationStyle: 'chicago-notes-bibliography',
					headingText: 'Bibliography',
					citations: [createCitation()],
				},
			})
		);

		expect(markup).toContain(
			'<p class="bibliography-builder-heading">Bibliography</p>'
		);
	});

	it('renders author-date styles as an unordered list', () => {
		for (const style of ['chicago-author-date', 'apa-7']) {
			const markup = renderToStaticMarkup(
				save({
					attributes: {
						citationStyle: style,
						citations: [createCitation()],
					},
				})
			);

			expect(markup).toContain(
				'<ul class="bibliography-builder-list bibliography-builder-list-unordered'
			);
			expect(markup).not.toContain('<ol>');
		}
	});

	it('renders notes styles as an unordered list', () => {
		const markup = renderToStaticMarkup(
			save({
				attributes: {
					citationStyle: 'chicago-notes-bibliography',
					citations: [createCitation()],
				},
			})
		);

		expect(markup).toContain(
			'<ul class="bibliography-builder-list bibliography-builder-list-unordered'
		);
		expect(markup).not.toContain('<ol>');
	});

	it('sorts citations before rendering saved output', () => {
		const markup = renderToStaticMarkup(
			save({
				attributes: {
					citationStyle: 'chicago-notes-bibliography',
					citations: [
						createCitation({
							id: 'marks',
							csl: {
								title: 'The Book by Design',
								author: [
									{ family: 'Marks', given: 'P. J. M.' },
								],
							},
							formattedText: 'Marks citation',
						}),
						createCitation({
							id: 'borel',
							csl: {
								title: 'The Chicago Guide to Fact-Checking',
								author: [{ family: 'Borel', given: 'Brooke' }],
							},
							formattedText: 'Borel citation',
						}),
					],
				},
			})
		);

		expect(markup.indexOf('Borel citation')).toBeLessThan(
			markup.indexOf('Marks citation')
		);
	});

	it('renders numeric styles as an ordered list', () => {
		for (const style of ['ieee', 'vancouver']) {
			const markup = renderToStaticMarkup(
				save({
					attributes: {
						citationStyle: style,
						citations: [createCitation()],
					},
				})
			);

			expect(markup).toContain(
				`<ol class="bibliography-builder-list bibliography-builder-list-numeric bibliography-builder-list-${style}">`
			);
			expect(markup).not.toContain('<ul>');
		}
	});

	it('renders semantic bibliography role and language attributes without deprecated entry roles', () => {
		const markup = renderToStaticMarkup(
			save({
				attributes: {
					citationStyle: 'chicago-author-date',
					citations: [
						createCitation({
							id: 'citation-7',
							csl: {
								language: 'fr',
								DOI: '10.1234/example-doi',
								page: '117-134',
								'container-title':
									'Journal of WordPress Studies',
							},
						}),
					],
				},
			})
		);

		expect(markup).toContain('role="doc-bibliography"');
		expect(markup).toContain('aria-label="Bibliography"');

		// aria-label should match custom heading text when provided.
		const customHeadingMarkup = renderToStaticMarkup(
			save({
				attributes: {
					citationStyle: 'chicago-author-date',
					headingText: 'References',
					citations: [createCitation()],
				},
			})
		);
		expect(customHeadingMarkup).toContain('aria-label="References"');
		expect(markup).not.toContain('role="doc-biblioentry"');
		expect(markup).toContain('id="ref-citation-7"');
		expect(markup).toContain('lang="fr"');
	});

	it('omits the lang attribute when no citation language is present', () => {
		const markup = renderToStaticMarkup(
			save({
				attributes: {
					citationStyle: 'chicago-author-date',
					citations: [createCitation()],
				},
			})
		);

		expect(markup).not.toContain(' lang=');
	});

	it('retains the CSL language attribute even when displayOverride is used', () => {
		const markup = renderToStaticMarkup(
			save({
				attributes: {
					citationStyle: 'chicago-author-date',
					citations: [
						createCitation({
							displayOverride: 'Remplacement manuel',
							csl: {
								language: 'fr',
							},
						}),
					],
				},
			})
		);

		expect(markup).toContain('lang="fr"');
		expect(markup).toContain('Remplacement manuel');
	});

	it('applies lang only to entries that declare a CSL language', () => {
		const markup = renderToStaticMarkup(
			save({
				attributes: {
					citationStyle: 'chicago-author-date',
					citations: [
						createCitation({
							id: 'fr-entry',
							csl: {
								language: 'fr',
							},
						}),
						createCitation({
							id: 'default-entry',
						}),
					],
				},
			})
		);

		expect(markup).toContain('<li id="ref-fr-entry" lang="fr">');
		expect(markup).toContain('<li id="ref-default-entry">');
	});

	it('prefers displayOverride over auto-formatted text', () => {
		const markup = renderToStaticMarkup(
			save({
				attributes: {
					citationStyle: 'chicago-author-date',
					citations: [
						createCitation({
							displayOverride: 'Manual citation override',
							formattedText: 'Auto formatted citation',
						}),
					],
				},
			})
		);

		expect(markup).toContain(
			'<cite class="bibliography-builder-entry-text">Manual citation override</cite>'
		);
		expect(markup).not.toContain('Auto formatted citation');
	});

	it('escapes citation text and script payloads safely', () => {
		const markup = renderToStaticMarkup(
			save({
				attributes: {
					citationStyle: 'chicago-author-date',
					citations: [
						createCitation({
							formattedText:
								'</cite><script>alert("citation")</script>',
							csl: {
								title: '</script><script>alert("jsonld")</script>',
								DOI: '10.1234/example-doi',
							},
						}),
					],
				},
			})
		);

		expect(markup).toContain(
			'&lt;/cite&gt;&lt;script&gt;alert(&quot;citation&quot;)&lt;/script&gt;'
		);
		expect(markup).toContain(
			'\\u003c/script>\\u003cscript>alert(\\"jsonld\\")\\u003c/script>'
		);
		expect(markup).not.toContain('<script>alert("citation")</script>');
	});

	it('escapes HTML and event-handler payloads in visible citation text safely', () => {
		const markup = renderToStaticMarkup(
			save({
				attributes: {
					citationStyle: 'chicago-author-date',
					citations: [
						createCitation({
							displayOverride:
								'<img src=x onerror=alert(1)><svg onload=alert(1)></svg><div onmouseover=alert(1)>hover</div>',
						}),
					],
				},
			})
		);

		expect(markup).toContain(
			'&lt;img src=x onerror=alert(1)&gt;&lt;svg onload=alert(1)&gt;&lt;/svg&gt;&lt;div onmouseover=alert(1)&gt;hover&lt;/div&gt;'
		);
		expect(markup).not.toContain('<img');
		expect(markup).not.toContain('<svg');
		expect(markup).not.toContain('<div onmouseover=');
	});

	it('escapes displayOverride script payloads without executing or preserving HTML', () => {
		const markup = renderToStaticMarkup(
			save({
				attributes: {
					citationStyle: 'chicago-author-date',
					citations: [
						createCitation({
							displayOverride:
								'<script>alert("override")</script>',
						}),
					],
				},
			})
		);

		expect(markup).toContain(
			'&lt;script&gt;alert(&quot;override&quot;)&lt;/script&gt;'
		);
		expect(markup).not.toContain('<script>alert("override")</script>');
	});

	it('escapes img and svg payloads in auto-formatted citation text safely', () => {
		const markup = renderToStaticMarkup(
			save({
				attributes: {
					citationStyle: 'chicago-author-date',
					citations: [
						createCitation({
							formattedText:
								'<img src=x onerror=alert(1)><svg onload=alert(1)></svg>',
						}),
					],
				},
			})
		);

		expect(markup).toContain(
			'&lt;img src=x onerror=alert(1)&gt;&lt;svg onload=alert(1)&gt;&lt;/svg&gt;'
		);
		expect(markup).not.toContain('<img');
		expect(markup).not.toContain('<svg');
	});

	it('renders visible frontend URLs as safe clickable links', () => {
		const markup = renderToStaticMarkup(
			save({
				attributes: {
					citationStyle: 'chicago-notes-bibliography',
					citations: [
						createCitation({
							formattedText:
								'Smith, Ada. Example resource. https://example.com/resource.',
							csl: {
								type: 'webpage',
								title: 'Example resource',
								URL: 'https://example.com/resource',
							},
						}),
					],
				},
			})
		);

		expect(markup).toContain(
			'<a href="https://example.com/resource" rel="nofollow noopener noreferrer" aria-label="Example resource — https://example.com/resource">https://example.com/resource</a>.'
		);
	});

	it('italicizes only work titles that should be italicized in saved output', () => {
		const bookMarkup = renderToStaticMarkup(
			save({
				attributes: {
					citationStyle: 'chicago-notes-bibliography',
					citations: [
						createCitation({
							csl: {
								type: 'book',
								title: 'The Example Book',
							},
							formattedText:
								'Smith, Ada. The Example Book. Press, 2024.',
						}),
					],
				},
			})
		);

		const articleMarkup = renderToStaticMarkup(
			save({
				attributes: {
					citationStyle: 'chicago-notes-bibliography',
					citations: [
						createCitation({
							csl: {
								type: 'article-journal',
								title: 'Example Article',
								'container-title': 'Journal of Examples',
							},
							formattedText:
								'Smith, Ada. “Example Article.” Journal of Examples 12 (3): 117–34.',
						}),
					],
				},
			})
		);

		expect(bookMarkup).toContain('<i>The Example Book</i>');
		expect(articleMarkup).toContain(
			'“Example Article.” <i>Journal of Examples</i>'
		);
		expect(articleMarkup).not.toContain('<i>Example Article</i>');
	});

	it('outputs JSON-LD by default without COinS or CSL-JSON', () => {
		const markup = renderToStaticMarkup(
			save({
				attributes: {
					citationStyle: 'chicago-author-date',
					citations: [createCitation()],
				},
			})
		);

		expect(markup).toContain('<script type="application/ld+json">');
		expect(markup).toContain('"@context":"https://schema.org"');
		expect(markup).not.toContain(
			'<script type="application/vnd.citationstyles.csl+json">'
		);
		expect(markup).not.toContain('class="Z3988"');
	});

	it('outputs COinS and CSL-JSON only when those layers are enabled', () => {
		const markup = renderToStaticMarkup(
			save({
				attributes: {
					citationStyle: 'chicago-author-date',
					outputJsonLd: true,
					outputCoins: true,
					outputCslJson: true,
					citations: [createCitation()],
				},
			})
		);

		expect(markup).toContain('<script type="application/ld+json">');
		expect(markup).toContain(
			'<script type="application/vnd.citationstyles.csl+json">'
		);
		expect(markup).toContain('class="Z3988"');
		expect(markup).toContain('aria-hidden="true"');
		expect(markup).toContain('title="ctx_ver=Z39.88-2004');
	});

	it('can disable JSON-LD output entirely', () => {
		const markup = renderToStaticMarkup(
			save({
				attributes: {
					citationStyle: 'chicago-author-date',
					outputJsonLd: false,
					citations: [createCitation()],
				},
			})
		);

		expect(markup).not.toContain('<script type="application/ld+json">');
	});

	it('renders manually entered citations through the normal save path', () => {
		const markup = renderToStaticMarkup(
			save({
				attributes: {
					citationStyle: 'harvard',
					citations: [
						createCitation({
							inputFormat: 'manual',
							formattedText: 'Smith, A. (2024) Manual citation.',
							csl: {
								type: 'book',
								title: 'Manual citation',
								author: [{ given: 'Ada', family: 'Smith' }],
								issued: { 'date-parts': [[2024]] },
							},
						}),
					],
				},
			})
		);

		expect(markup).toContain(
			'<ul class="bibliography-builder-list bibliography-builder-list-unordered'
		);
		expect(markup).toContain('Smith, A. (2024) <i>Manual citation</i>.');
	});

	it('applies metadata-layer toggles to manually entered citations', () => {
		const markup = renderToStaticMarkup(
			save({
				attributes: {
					citationStyle: 'ieee',
					outputJsonLd: false,
					outputCoins: true,
					outputCslJson: true,
					citations: [
						createCitation({
							inputFormat: 'manual',
							formattedText: 'Manual citation.',
							csl: {
								type: 'article-journal',
								title: 'Manual citation',
								author: [{ given: 'Ada', family: 'Smith' }],
								issued: { 'date-parts': [[2024]] },
							},
						}),
					],
				},
			})
		);

		expect(markup).not.toContain('<script type="application/ld+json">');
		expect(markup).toContain(
			'<script type="application/vnd.citationstyles.csl+json">'
		);
		expect(markup).toContain('class="Z3988"');
		expect(markup).toContain(
			'<ol class="bibliography-builder-list bibliography-builder-list-numeric bibliography-builder-list-ieee">'
		);
	});

	it('adds aria-label to URL anchors in saved output using citation title', () => {
		const markup = renderToStaticMarkup(
			save({
				attributes: {
					citationStyle: 'chicago-notes-bibliography',
					citations: [
						createCitation({
							formattedText:
								'Smith, Ada. Example Article. https://example.org/article.',
							csl: {
								type: 'article-journal',
								title: 'Example Article',
							},
						}),
					],
				},
			})
		);

		expect(markup).toContain(
			'aria-label="Example Article — https://example.org/article"'
		);
	});

	it('falls back to container-title for aria-label when citation title is absent', () => {
		const markup = renderToStaticMarkup(
			save({
				attributes: {
					citationStyle: 'chicago-notes-bibliography',
					citations: [
						createCitation({
							formattedText:
								'Smith, Ada. Journal of Examples. https://example.org/article.',
							csl: {
								type: 'article-journal',
								'container-title': 'Journal of Examples',
							},
						}),
					],
				},
			})
		);

		expect(markup).toContain(
			'aria-label="Journal of Examples — https://example.org/article"'
		);
	});

	it('falls back to localized label when title and container-title are absent', () => {
		const markup = renderToStaticMarkup(
			save({
				attributes: {
					citationStyle: 'chicago-notes-bibliography',
					citations: [
						createCitation({
							formattedText: 'See https://example.org/resource.',
							csl: {
								type: 'webpage',
							},
						}),
					],
				},
			})
		);

		expect(markup).toContain(
			'aria-label="Link to publication — https://example.org/resource"'
		);
	});

	it('includes the visible URL in the aria-label to satisfy label-in-name requirement', () => {
		const markup = renderToStaticMarkup(
			save({
				attributes: {
					citationStyle: 'chicago-notes-bibliography',
					citations: [
						createCitation({
							formattedText:
								'Smith. My Work. https://example.org/work.',
							csl: {
								type: 'book',
								title: 'My Work',
							},
						}),
					],
				},
			})
		);

		expect(markup).toContain('https://example.org/work');
		expect(markup).toContain(
			'aria-label="My Work — https://example.org/work"'
		);
	});
});

import { renderToStaticMarkup } from 'react-dom/server';
import save from './save';
import { getListSemantics, STYLE_DEFINITIONS } from './lib/formatting';

jest.mock('@wordpress/block-editor', () => ({
	useBlockProps: {
		save: () => ({
			className: 'wp-block-bibliography-builder-bibliography',
		}),
	},
}));

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

	it('keeps the heading a paragraph when no heading level is set', () => {
		for (const headingLevel of [undefined, 0, 1, 7, 2.5, '2', null]) {
			const markup = renderToStaticMarkup(
				save({
					attributes: {
						citationStyle: 'chicago-notes-bibliography',
						headingText: 'Bibliography',
						headingLevel,
						citations: [createCitation()],
					},
				})
			);

			expect(markup).toContain(
				'<p class="bibliography-builder-heading">Bibliography</p>'
			);
		}
	});

	it('renders the heading as a real heading element at levels 2 to 6', () => {
		for (const headingLevel of [2, 3, 4, 5, 6]) {
			const markup = renderToStaticMarkup(
				save({
					attributes: {
						citationStyle: 'chicago-notes-bibliography',
						headingText: 'Sources',
						headingLevel,
						citations: [createCitation()],
					},
				})
			);

			expect(markup).toContain(
				`<section class="wp-block-bibliography-builder-bibliography" role="doc-bibliography" aria-label="Sources"><h${headingLevel} class="bibliography-builder-heading">Sources</h${headingLevel}>`
			);
			expect(markup).not.toContain(
				'<p class="bibliography-builder-heading">'
			);
		}
	});

	it('prints no heading element without heading text, whatever the level', () => {
		const markup = renderToStaticMarkup(
			save({
				attributes: {
					citationStyle: 'chicago-notes-bibliography',
					headingLevel: 2,
					citations: [createCitation()],
				},
			})
		);

		expect(markup).not.toContain('bibliography-builder-heading');
		expect(markup).toContain('aria-label="Bibliography"');
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

	it('preserves semantic save markup across every registered style', () => {
		const styleKeys = Object.keys(STYLE_DEFINITIONS);

		expect(styleKeys).toEqual([
			'chicago-notes-bibliography',
			'chicago-author-date',
			'apa-7',
			'mla-9',
			'harvard',
			'ieee',
			'vancouver',
			'oscola',
			'abnt',
		]);

		for (const style of styleKeys) {
			const listTag = getListSemantics(style);
			const listClass =
				listTag === 'ol'
					? 'bibliography-builder-list-numeric'
					: 'bibliography-builder-list-unordered';
			const markup = renderToStaticMarkup(
				save({
					attributes: {
						citationStyle: style,
						headingText: `Heading for ${style}`,
						outputJsonLd: true,
						outputCoins: true,
						outputCslJson: true,
						citations: [
							createCitation({
								id: `matrix-${style}`,
								csl: {
									language: 'en',
									DOI: `10.1234/${style}`,
									URL: `https://example.org/${style}`,
								},
							}),
						],
					},
				})
			);

			expect(markup).toContain('role="doc-bibliography"');
			expect(markup).toContain(`aria-label="Heading for ${style}"`);
			expect(markup).toContain(
				`<${listTag} class="bibliography-builder-list ${listClass} bibliography-builder-list-${style}">`
			);
			expect(markup).toContain(`id="ref-matrix-${style}"`);
			expect(markup).toContain('lang="en"');
			expect(markup).toContain('<script type="application/ld+json">');
			expect(markup).toContain(
				'<script type="application/vnd.citationstyles.csl+json">'
			);
			expect(markup).toContain('class="Z3988"');
			expect(markup).toContain('aria-hidden="true"');
			expect(markup).not.toContain('role="doc-biblioentry"');
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
			'<span class="bibliography-builder-entry-text">Manual citation override</span>'
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
								'</span><script>alert("citation")</script>',
							csl: {
								title: '</script><script>alert("jsonld")</script>',
								DOI: '10.1234/example-doi',
							},
						}),
					],
				},
			})
		);

		// Tags in stored text are dropped, never emitted or shown as text.
		expect(markup).toContain(
			'<span class="bibliography-builder-entry-text">alert(&quot;citation&quot;)</span>'
		);
		expect(markup).not.toContain('&lt;script');
		expect(markup).toContain(
			'\\u003c/script>\\u003cscript>alert(\\"jsonld\\")\\u003c/script>'
		);
		expect(markup).not.toContain('<script>alert("citation")</script>');
	});

	it('strips HTML and event-handler payloads from visible citation text', () => {
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
			'<span class="bibliography-builder-entry-text">hover</span>'
		);
		expect(markup).not.toContain('onerror');
		expect(markup).not.toContain('&lt;');
		expect(markup).not.toContain('<img');
		expect(markup).not.toContain('<svg');
		expect(markup).not.toContain('<div onmouseover=');
	});

	it('strips displayOverride script tags without executing or preserving HTML', () => {
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
			'<span class="bibliography-builder-entry-text">alert(&quot;override&quot;)</span>'
		);
		expect(markup).not.toContain('&lt;script');
		expect(markup).not.toContain('<script>alert("override")</script>');
	});

	it('strips img and svg payloads from auto-formatted citation text', () => {
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

		expect(markup).not.toContain('onerror');
		expect(markup).not.toContain('&lt;img');
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

	it('omits the aria-label when title and container-title are absent, so the visible URL names the link', () => {
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
			'<a href="https://example.org/resource" rel="nofollow noopener noreferrer">https://example.org/resource</a>'
		);
		expect(markup).not.toContain('aria-label="Link to publication');
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

describe('save cite/export data', () => {
	function renderWith(attrs) {
		return renderToStaticMarkup(
			save({
				attributes: {
					citationStyle: 'chicago-author-date',
					citations: [createCitation()],
					...attrs,
				},
			})
		);
	}

	it('saves no cite/export data by default (opt-in)', () => {
		const markup = renderWith({});
		expect(markup).not.toContain('data-cite-');
		expect(markup).not.toContain('bibliography-builder-cite-export');
	});

	// The panel is built by view.js. A saved panel showed expanded and
	// unusable in email and feed readers, which run no script and load no
	// stylesheet.
	it('saves the data for the panel, not the panel', () => {
		const markup = renderWith({ outputCiteExport: true });
		expect(markup).not.toContain('<details');
		expect(markup).not.toContain('<button');
		expect(markup).not.toContain('Cite / Export');
		expect(markup).not.toContain('Copy citation');
		expect(markup).not.toContain('href="data:');
		expect(markup).toContain('data-cite-text="Example formatted citation"');
		expect(markup).toContain('data-cite-filename="Smith-2024"');
		expect(markup).toContain('data-cite-ris="TY  - ');
		expect(markup).toContain('data-cite-csl-json="{');
	});

	it('saves BibTeX/BibLaTeX only when pre-computed strings are present', () => {
		const withStrings = renderWith({
			outputCiteExport: true,
			citations: [
				createCitation({
					exportBibtex: '@article{x}',
					exportBiblatex: '@article{y}',
				}),
			],
		});
		expect(withStrings).toContain('data-cite-bibtex="@article{x}"');
		expect(withStrings).toContain('data-cite-biblatex="@article{y}"');

		const withoutStrings = renderWith({ outputCiteExport: true });
		expect(withoutStrings).not.toContain('data-cite-bibtex');
		expect(withoutStrings).not.toContain('data-cite-biblatex');
	});

	it('keeps the visible citation text in the entry, without requiring JS', () => {
		const markup = renderWith({
			outputCiteExport: true,
			citations: [
				createCitation({ formattedText: 'Smith, Ada. A Study. 2024.' }),
			],
		});
		expect(markup).toContain(
			'<span class="bibliography-builder-entry-text">Smith, Ada. A Study. 2024.</span>'
		);
	});

	it('escapes markup in the saved data (no raw markup injection)', () => {
		const markup = renderWith({
			outputCiteExport: true,
			citations: [
				createCitation({
					formattedText: 'Benign text',
					csl: {
						type: 'article-journal',
						title: '<script>alert(1)</script>',
					},
				}),
			],
		});
		expect(markup).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
		expect(markup).not.toContain('<script>alert(1)</script>');
	});
});

describe('save inline markup', () => {
	it('renders a title stored with <i> as italics, never as literal tags', () => {
		const markup = renderToStaticMarkup(
			save({
				attributes: {
					citationStyle: 'chicago-notes-bibliography',
					outputCiteExport: true,
					citations: [
						createCitation({
							csl: {
								type: 'book',
								title: '<i>Governing the Commons</i>',
								URL: 'https://example.com/ostrom',
								author: [{ family: 'Ostrom', given: 'Elinor' }],
							},
							formattedText:
								'Ostrom, Elinor. <i>Governing the Commons</i>. Cambridge University Press, 1990. https://example.com/ostrom.',
						}),
					],
				},
			})
		);

		expect(markup).toContain(
			'<span class="bibliography-builder-entry-text">Ostrom, Elinor. <i>Governing the Commons</i>. Cambridge University Press, 1990. '
		);
		// No escaped tag in the text, the link's aria-label, or the copy text.
		// The RIS and CSL-JSON exports carry the CSL title as stored.
		const visible = markup.replace(
			/ data-cite-(?:ris|csl-json)="[^"]*"/g,
			''
		);
		expect(visible).not.toContain('&lt;i&gt;');
		expect(visible).not.toContain('&lt;i>');
		expect(markup).toContain(
			'aria-label="Governing the Commons — https://example.com/ostrom"'
		);
		expect(markup).toContain(
			'data-cite-text="Ostrom, Elinor. Governing the Commons. Cambridge University Press, 1990. https://example.com/ostrom."'
		);
	});
});

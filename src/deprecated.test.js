import { renderToStaticMarkup } from 'react-dom/server';
import metadata from '../block.json';
import { deprecated } from './deprecated';
import save from './save';

jest.mock( '@wordpress/block-editor', () => ( {
	useBlockProps: {
		save: () => ( {
			className: 'wp-block-bibliography-builder-bibliography',
		} ),
	},
} ) );

function createCitation( { id, family, title } ) {
	return {
		id,
		csl: {
			type: 'book',
			title,
			author: [ { family } ],
		},
		formattedText: `${ family } citation`,
		displayOverride: null,
	};
}

describe( 'deprecated block versions', () => {
	it( 'pins the current attribute schema on every deprecated definition', () => {
		expect( deprecated ).toEqual(
			expect.arrayContaining( [
				expect.objectContaining( {
					attributes: metadata.attributes,
				} ),
			] )
		);
	} );

	it( 'freezes the current pre-Phase-4 save shape: <li> with no <details>', () => {
		const markup = renderToStaticMarkup(
			deprecated[ 11 ].save( {
				attributes: {
					citationStyle: 'chicago-notes-bibliography',
					headingText: 'References',
					citations: [
						createCitation( {
							id: 'smith',
							family: 'Smith',
							title: 'Example Resource',
						} ),
					],
				},
			} )
		);

		expect( markup ).toContain( '<li' );
		expect( markup ).not.toContain( '<details' );
	} );

	it( 'supports the immediate prior save markup with deprecated entry roles', () => {
		const markup = renderToStaticMarkup(
			deprecated[ 12 ].save( {
				attributes: {
					citationStyle: 'chicago-notes-bibliography',
					headingText: 'References',
					citations: [
						{
							...createCitation( {
								id: 'url-entry',
								family: 'Smith',
								title: 'Example Resource',
							} ),
							csl: {
								type: 'webpage',
								title: 'Example Resource',
								URL: 'https://example.com/resource',
								author: [ { family: 'Smith' } ],
							},
							formattedText:
								'Smith. Example Resource. https://example.com/resource.',
						},
					],
				},
			} )
		);

		// This deprecated version matches the immediate previous save markup:
		// linked URLs, heading-derived aria-label, and deprecated
		// doc-biblioentry roles for existing saved posts.
		expect( markup ).toContain( '<a href=' );
		expect( markup ).toContain( 'aria-label="References"' );
		expect( markup ).toContain( 'role="doc-biblioentry"' );
	} );

	it( 'supports the prior save markup with linked URLs and static aria-label', () => {
		const markup = renderToStaticMarkup(
			deprecated[ 13 ].save( {
				attributes: {
					citationStyle: 'chicago-notes-bibliography',
					headingText: 'References',
					citations: [
						{
							...createCitation( {
								id: 'url-entry',
								family: 'Smith',
								title: 'Example Resource',
							} ),
							csl: {
								type: 'webpage',
								title: 'Example Resource',
								URL: 'https://example.com/resource',
								author: [ { family: 'Smith' } ],
							},
							formattedText:
								'Smith. Example Resource. https://example.com/resource.',
						},
					],
				},
			} )
		);

		// This deprecated version links URLs but always uses aria-label="Bibliography".
		expect( markup ).toContain( '<a href=' );
		expect( markup ).toContain( 'aria-label="Bibliography"' );
		expect( markup ).not.toContain( 'aria-label="References"' );
	} );

	it( 'supports the prior save markup variant without linked visible URLs', () => {
		const markup = renderToStaticMarkup(
			deprecated[ 14 ].save( {
				attributes: {
					citationStyle: 'chicago-notes-bibliography',
					citations: [
						{
							...createCitation( {
								id: 'url-entry',
								family: 'Smith',
								title: 'Example Resource',
							} ),
							csl: {
								type: 'webpage',
								title: 'Example Resource',
								URL: 'https://example.com/resource',
								author: [ { family: 'Smith' } ],
							},
							formattedText:
								'Smith. Example Resource. https://example.com/resource.',
						},
					],
				},
			} )
		);

		expect( markup ).toContain( 'https://example.com/resource.' );
		expect( markup ).not.toContain( '<a href=' );
	} );

	it( 'migrate re-sorts citations into style order', () => {
		const migrated = deprecated[ 15 ].migrate( {
			citationStyle: 'chicago-author-date',
			citations: [
				createCitation( {
					id: 'z',
					family: 'Zulu',
					title: 'Zeta Book',
				} ),
				createCitation( {
					id: 'a',
					family: 'Alpha',
					title: 'Alpha Book',
				} ),
			],
		} );

		expect( migrated.citations[ 0 ].id ).toBe( 'a' );
		expect( migrated.citations[ 1 ].id ).toBe( 'z' );
	} );

	it( 'migrate handles missing citations attribute with empty array fallback', () => {
		const migrated = deprecated[ 15 ].migrate( { citationStyle: 'apa-7' } );

		expect( migrated.citations ).toEqual( [] );
	} );

	it( 'supports the prior unsorted save markup variant', () => {
		const markup = renderToStaticMarkup(
			deprecated[ 15 ].save( {
				attributes: {
					citationStyle: 'chicago-notes-bibliography',
					citations: [
						createCitation( {
							id: 'marks',
							family: 'Marks',
							title: 'The Book by Design',
						} ),
						createCitation( {
							id: 'borel',
							family: 'Borel',
							title: 'The Chicago Guide to Fact-Checking',
						} ),
					],
				},
			} )
		);

		expect( markup.indexOf( 'Marks citation' ) ).toBeLessThan(
			markup.indexOf( 'Borel citation' )
		);
	} );
} );

describe( 'locale-independence deprecation (deprecated[10])', () => {
	const untitled = {
		id: 'untitled',
		csl: { type: 'webpage', author: [ { family: 'Beta' } ] },
		formattedText: 'Beta. https://example.com/x.',
	};

	it( 'falls back to the current translations when the markup gave no labels', () => {
		const markup = renderToStaticMarkup(
			deprecated[ 10 ].save( {
				attributes: {
					citationStyle: 'chicago-notes-bibliography',
					citations: [ untitled ],
				},
			} )
		);

		// outputCiteExport unset: no panel, and no legacy labels were sourced.
		expect( markup ).not.toContain( '<details' );
		expect( markup ).toContain(
			'aria-label="Link to publication — https://example.com/x"'
		);
	} );

	it( 'reads the fallback label from a matching link and skips one that does not match', () => {
		const markup = renderToStaticMarkup(
			deprecated[ 10 ].save( {
				attributes: {
					citationStyle: 'chicago-notes-bibliography',
					citations: [ untitled ],
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
			} )
		);

		expect( markup ).toContain(
			'aria-label="Lien vers la publication — https://example.com/x"'
		);
	} );

	it( 'renders nothing when the block has no citations', () => {
		expect(
			deprecated[ 10 ].save( {
				attributes: { citationStyle: 'chicago-notes-bibliography' },
			} )
		).toBeNull();
	} );
} );

describe( 'pre-repeated-author deprecation (deprecated[9])', () => {
	const borges = ( id, title ) => ( {
		id,
		csl: {
			type: 'book',
			title,
			author: [ { family: 'Borges', given: 'Jorge Luis' } ],
		},
		formattedText: `Borges, Jorge Luis. ${ title }. Sur, 1944.`,
		displayOverride: null,
	} );
	const attributes = {
		citationStyle: 'mla-9',
		citations: [ borges( 'b1', 'Ficciones' ), borges( 'b2', 'El Aleph' ) ],
	};

	it( 'writes repeated MLA authors in full, as save() did before', () => {
		const old = renderToStaticMarkup(
			deprecated[ 9 ].save( { attributes } )
		);
		const current = renderToStaticMarkup( save( { attributes } ) );

		expect( old ).not.toContain( 'bibliography-builder-repeated-author' );
		expect( old ).toContain( 'Borges, Jorge Luis. <i>El Aleph</i>' );
		expect( current ).toContain( 'bibliography-builder-repeated-author' );
		expect( current ).not.toBe( old );
	} );
} );

describe( 'pre-inline-markup deprecation (deprecated[8])', () => {
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

	it( 'showed tags in stored text as text; save() now reads them', () => {
		const old = renderToStaticMarkup(
			deprecated[ 8 ].save( { attributes } )
		);
		const current = renderToStaticMarkup( save( { attributes } ) );

		expect( old ).toContain(
			'&lt;i&gt;<i>Governing the Commons</i>&lt;/i&gt;'
		);
		expect( current ).toContain(
			'Ostrom, Elinor. <i>Governing the Commons</i>. Cambridge'
		);
		expect( current ).not.toContain( '&lt;i' );
	} );

	it( 'matches save() for text without tags', () => {
		const plain = {
			...attributes,
			citations: [
				{
					...attributes.citations[ 0 ],
					formattedText:
						'Ostrom, Elinor. Governing the Commons. Cambridge University Press, 1990.',
				},
			],
		};

		// Compared with save() as of 1.10.x (deprecated[5]): 1.11.0 changed only
		// the JSON-LD shape, which this deprecation predates.
		expect(
			renderToStaticMarkup(
				deprecated[ 8 ].save( { attributes: plain } )
			)
		).toBe(
			renderToStaticMarkup(
				deprecated[ 5 ].save( { attributes: plain } )
			)
		);
	} );
} );

describe( 'pre-1.9.1 deprecation (deprecated[7])', () => {
	const attributes = {
		citationStyle: 'chicago-notes-bibliography',
		citations: [
			{
				id: 'drupal',
				csl: {
					type: 'webpage',
					title: 'Usage Statistics for Drupal Core',
				},
				formattedText:
					'Drupal.org. “Usage Statistics for Drupal Core.” Accessed October 6, 2026.',
				displayOverride: null,
			},
			{
				id: 'ndss',
				csl: {
					type: 'paper-conference',
					title: 'Paper',
					DOI: '10.14722/ndss.2019.23386',
				},
				formattedText: 'Moss, Ann. “Paper.” NDSS, 2019.',
				displayOverride: null,
			},
		],
	};

	it( 'italicized a quoted title and encoded the DOI slash; save() does neither', () => {
		const old = renderToStaticMarkup(
			deprecated[ 7 ].save( { attributes } )
		);
		const current = renderToStaticMarkup( save( { attributes } ) );

		expect( old ).toContain( '“<i>Usage Statistics for Drupal Core</i>.”' );
		expect( old ).toContain( 'https://doi.org/10.14722%2Fndss.2019.23386' );
		expect( current ).toContain( '“Usage Statistics for Drupal Core.”' );
		expect( current ).not.toContain( '<i>Usage Statistics' );
		expect( current ).toContain(
			'https://doi.org/10.14722/ndss.2019.23386'
		);
	} );
} );

describe( 'pre-1.10.0 deprecation (deprecated[6])', () => {
	const attributes = {
		citationStyle: 'chicago-notes-bibliography',
		citations: [
			{
				id: 'elife',
				csl: {
					type: 'article-journal',
					title: 'A Study of Cell Signalling',
					'container-title': 'eLife',
					DOI: '10.7554/eLife.83254',
				},
				formattedText:
					'Kim, Lee. “A Study of Cell Signalling.” eLife 12 (2023): e83254. https://doi.org/10.7554/eLife.83254.',
				displayOverride: null,
			},
		],
	};

	it( 'split the eLife DOI link with an italic journal name; save() keeps it whole', () => {
		const old = renderToStaticMarkup(
			deprecated[ 6 ].save( { attributes } )
		);
		const current = renderToStaticMarkup( save( { attributes } ) );

		expect( old ).toContain( 'href="https://doi.org/10.7554/"' );
		expect( old ).toContain( '<i>eLife</i>.83254.' );
		expect( current ).toContain(
			'href="https://doi.org/10.7554/eLife.83254"'
		);
		expect( current ).toContain( '” <i>eLife</i> 12 (2023)' );
		expect( current ).not.toContain( '<i>eLife</i>.83254' );
	} );
} );

describe( 'pre-1.11.0 deprecation (deprecated[5])', () => {
	const attributes = {
		citationStyle: 'chicago-notes-bibliography',
		outputJsonLd: true,
		citations: [
			{
				id: 'albertina',
				csl: {
					type: 'webpage',
					title: 'Nemesis (Das große Glück)',
					author: [ { literal: 'Albertina' } ],
					URL: 'https://sammlungenonline.albertina.at/objects/100442/nemesis-das-groe-gluck',
				},
				formattedText:
					'Albertina. “Nemesis (Das große Glück).” https://sammlungenonline.albertina.at/objects/100442/nemesis-das-groe-gluck.',
				displayOverride: null,
			},
		],
	};

	function jsonLd( markup ) {
		const match = markup.match(
			/<script type="application\/ld\+json">(.*?)<\/script>/s
		);
		return JSON.parse( match[ 1 ] );
	}

	it( 'wrote cited works as top-level JSON-LD; 1.11.0 nested them in an ItemList', () => {
		const old = renderToStaticMarkup(
			deprecated[ 5 ].save( { attributes } )
		);
		// Compared with 1.11.0 (deprecated[4]), which changed only the JSON-LD.
		const current = renderToStaticMarkup(
			deprecated[ 4 ].save( { attributes } )
		);

		expect( jsonLd( old ) ).toEqual( [
			expect.objectContaining( {
				'@context': 'https://schema.org',
				'@type': 'WebPage',
			} ),
		] );
		expect( jsonLd( current ) ).toMatchObject( {
			'@type': 'ItemList',
			itemListElement: [
				{
					'@type': 'ListItem',
					position: 1,
					item: {
						'@type': 'WebPage',
						name: 'Nemesis (Das große Glück)',
					},
				},
			],
		} );
		// Everything outside the JSON-LD script is unchanged.
		const strip = ( markup ) =>
			markup.replace(
				/<script type="application\/ld\+json">.*?<\/script>/s,
				''
			);
		expect( strip( old ) ).toBe( strip( current ) );
	} );
} );

describe( '1.11.0 deprecation (deprecated[4])', () => {
	const attributes = {
		citationStyle: 'chicago-notes-bibliography',
		citations: [
			{
				id: 'edwards',
				csl: {
					type: 'book',
					title: 'A Later Book',
					author: [ { family: 'Edwards', given: 'Ann' } ],
				},
				formattedText: 'Edwards, Ann. A Later Book.',
				displayOverride: null,
			},
			{
				id: 'duijnhoven',
				csl: {
					type: 'book',
					title: 'An Earlier Book',
					author: [ { family: 'van Duijnhoven', given: 'Elza' } ],
				},
				formattedText: 'Duijnhoven, Elza van. An Earlier Book.',
				displayOverride: null,
			},
		],
	};

	it( 'filed a particle name under the particle; save() files it under the surname in Chicago', () => {
		const old = renderToStaticMarkup(
			deprecated[ 4 ].save( { attributes } )
		);
		const current = renderToStaticMarkup( save( { attributes } ) );

		expect( old.indexOf( 'Edwards, Ann' ) ).toBeLessThan(
			old.indexOf( 'Duijnhoven, Elza van' )
		);
		expect( current.indexOf( 'Duijnhoven, Elza van' ) ).toBeLessThan(
			current.indexOf( 'Edwards, Ann' )
		);
	} );
} );

describe( '1.11.0 deprecation JSON-LD', () => {
	it( 'kept the ItemList JSON-LD that 1.11.0 introduced', () => {
		const attributes = {
			citationStyle: 'apa-7',
			citations: [
				createCitation( { id: 'a', family: 'Alpha', title: 'A Book' } ),
			],
		};
		const old = renderToStaticMarkup(
			deprecated[ 4 ].save( { attributes } )
		);

		expect( old ).toContain( '"@type":"ItemList"' );
	} );
} );

describe( 'email-safe markup deprecation (deprecated[3])', () => {
	const attributes = {
		citationStyle: 'chicago-notes-bibliography',
		outputCiteExport: true,
		citations: [
			{
				id: 'alpha',
				csl: {
					type: 'book',
					title: 'A Book',
					author: [ { family: 'Alpha', given: 'Ada' } ],
				},
				formattedText: 'Alpha, Ada. <i>A Book</i>.',
				displayOverride: null,
				exportBibtex: '@book{alpha, title = {A Book}}',
			},
		],
	};

	it( 'saved entries in <cite> and the Cite / Export panel in the post', () => {
		const old = renderToStaticMarkup(
			deprecated[ 3 ].save( { attributes } )
		);

		expect( old ).toContain(
			'<cite class="bibliography-builder-entry-text">'
		);
		expect( old ).toContain(
			'<details class="bibliography-builder-cite-export">'
		);
		expect( old ).toContain( 'href="data:' );
	} );

	it( 'save() writes plain spans and Cite / Export data for the view script instead', () => {
		const current = renderToStaticMarkup( save( { attributes } ) );

		expect( current ).toContain(
			'<span class="bibliography-builder-entry-text">Alpha, Ada. <i>A Book</i>.</span>'
		);
		expect( current ).not.toContain( '<cite' );
		expect( current ).not.toContain( '<details' );
		expect( current ).not.toContain( '<button' );
		expect( current ).not.toContain( 'href="data:' );
		expect( current ).toContain( 'data-cite-text="Alpha, Ada. A Book."' );
		expect( current ).toContain( 'data-cite-filename="Alpha"' );
		expect( current ).toContain( 'data-cite-ris="TY  - BOOK' );
		expect( current ).toContain( 'data-cite-csl-json="{' );
		expect( current ).toContain( 'data-cite-bibtex="@book{alpha' );
		expect( current ).not.toContain( 'data-cite-biblatex' );
	} );

	it( 'saves no Cite / Export data when the panel is off', () => {
		const current = renderToStaticMarkup(
			save( { attributes: { ...attributes, outputCiteExport: false } } )
		);

		expect( current ).not.toContain( 'data-cite-' );
	} );
} );

describe( '1.15.0 deprecation italics (deprecated[2])', () => {
	const attributes = {
		citationStyle: 'chicago-notes-bibliography',
		citations: [
			{
				id: 'nelson',
				csl: {
					type: 'book',
					title: "Ted Nelson's Computer Paradigm, Expressed as One-Liners",
					author: [ { family: 'Nelson', given: 'Ted' } ],
				},
				formattedText:
					'Nelson, Ted. Ted Nelson’s Computer Paradigm, Expressed as One-Liners. Mindful Press, 1999.',
				displayOverride: null,
			},
		],
	};

	it( 'left a title with a straight apostrophe roman; save() italicizes it', () => {
		const old = renderToStaticMarkup(
			deprecated[ 2 ].save( { attributes } )
		);
		const current = renderToStaticMarkup( save( { attributes } ) );

		expect( old ).not.toContain( '<i>' );
		expect( current ).toContain(
			'Nelson, Ted. <i>Ted Nelson’s Computer Paradigm, Expressed as One-Liners</i>. Mindful Press, 1999.'
		);
	} );
} );

describe( '1.15.0 deprecation notes order (deprecated[2])', () => {
	const gessner = { family: 'Gessner', given: 'Conrad' };
	const attributes = {
		citationStyle: 'chicago-notes-bibliography',
		citations: [
			{
				id: 'gessner-simler',
				csl: {
					type: 'book',
					title: 'Bibliotheca',
					author: [ gessner, { family: 'Simler', given: 'Josias' } ],
				},
				formattedText:
					'Gessner, Conrad, and Josias Simler. Bibliotheca. Christoph Froschauer, 1574.',
				displayOverride: null,
			},
			{
				id: 'gessner',
				csl: {
					type: 'book',
					title: 'Bibliotheca universalis',
					author: [ gessner ],
				},
				formattedText:
					'Gessner, Conrad. Bibliotheca universalis. Christoph Froschauer, 1545.',
				displayOverride: null,
			},
		],
	};
	const order = ( markup ) =>
		[ ...markup.matchAll( /id="ref-([^"]+)"/g ) ].map(
			( match ) => match[ 1 ]
		);

	it( 'sorted by first surname then title; save() puts the single author first (#212)', () => {
		const old = renderToStaticMarkup(
			deprecated[ 2 ].save( { attributes } )
		);
		const current = renderToStaticMarkup( save( { attributes } ) );

		expect( order( old ) ).toEqual( [ 'gessner-simler', 'gessner' ] );
		expect( order( current ) ).toEqual( [ 'gessner', 'gessner-simler' ] );
	} );
} );

describe( '1.16.0 deprecation OSCOLA tables (deprecated[1])', () => {
	const attributes = {
		citationStyle: 'oscola',
		headingText: 'Bibliography',
		headingLevel: 2,
		citations: [
			{
				id: 'craig',
				csl: {
					type: 'article-journal',
					title: 'Theory, “Pure Theory” and Values in Public Law',
					author: [ { family: 'Craig', given: 'Paul' } ],
				},
				formattedText:
					'Craig P, ‘Theory, “Pure Theory” and Values in Public Law’ [2005] PL 440',
				displayOverride: null,
			},
			{
				id: 'donoghue',
				csl: { type: 'legal_case', title: 'Donoghue v Stevenson' },
				formattedText: 'Donoghue v Stevenson [1932] AC 562 (HL)',
				displayOverride: null,
			},
			{
				id: 'hra',
				csl: { type: 'legislation', title: 'Human Rights Act 1998' },
				formattedText: 'Human Rights Act 1998',
				displayOverride: null,
			},
		],
	};
	const order = ( markup ) =>
		[ ...markup.matchAll( /id="ref-([^"]+)"/g ) ].map(
			( match ) => match[ 1 ]
		);

	it( 'saved one alphabetical list; save() writes OSCOLA 5 tables first', () => {
		const old = renderToStaticMarkup(
			deprecated[ 1 ].save( { attributes } )
		);
		const current = renderToStaticMarkup( save( { attributes } ) );

		expect( old ).not.toContain( 'bibliography-builder-group' );
		expect( old ).toContain( '<i>Donoghue v Stevenson</i>' );
		expect( order( old ) ).toEqual( [ 'craig', 'donoghue', 'hra' ] );

		expect( order( current ) ).toEqual( [ 'donoghue', 'hra', 'craig' ] );
		expect( current ).toContain(
			'<h3 class="bibliography-builder-group-heading" id="bibliography-group-cases-donoghue">Table of Cases</h3>'
		);
		expect( current ).toContain(
			'aria-labelledby="bibliography-group-cases-donoghue"'
		);
		expect( current ).toContain( 'Donoghue v Stevenson [1932]' );
		expect( current ).not.toContain( '<i>Donoghue' );
		expect( current ).toContain( '<i>Human Rights Act 1998</i>' );
		expect( current ).toContain( '>Secondary Sources</h3>' );
	} );

	it( 'matches save() for OSCOLA secondary sources alone', () => {
		const secondary = {
			...attributes,
			citations: [ attributes.citations[ 0 ] ],
		};

		expect(
			renderToStaticMarkup(
				deprecated[ 1 ].save( { attributes: secondary } )
			)
		).toBe( renderToStaticMarkup( save( { attributes: secondary } ) ) );
	} );
} );

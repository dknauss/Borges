import {
	classifyCitation,
	findCitationLinks,
	getShortFormHtml,
	isGeneratedText,
	planCitationUpdates,
	recoverLocator,
	setLocatorOnTag,
	updateCitationsInHtml,
	updateCitationsInValue,
} from './citation-update';

const illich = {
	type: 'book',
	title: 'Tools for Conviviality',
	author: [ { family: 'Illich', given: 'Ivan' } ],
	issued: { 'date-parts': [ [ 1973 ] ] },
};

const grafton = {
	type: 'article-journal',
	title: 'The Footnote: A Curious History',
	author: [ { family: 'Grafton', given: 'Anthony' } ],
	issued: { 'date-parts': [ [ 1997 ] ] },
};

const borges = {
	type: 'book',
	title: 'Ficciones',
	author: [ { family: 'Borges', given: 'Jorge Luis' } ],
	issued: { 'date-parts': [ [ 1944 ] ] },
};

// Titles with markup characters, to check escaping.
const tricky = {
	type: 'book',
	title: 'Less < More & "Most": Notes',
	author: [ { family: "O'Neil", given: 'Cathy' } ],
	issued: { 'date-parts': [ [ 2016 ] ] },
};

const link = ( id, locator ) =>
	`<a class="bibliography-builder-citation h-cite" href="#ref-${ id }" data-bibliography-ref="${ id }"${
		locator === undefined ? '' : ` data-locator="${ locator }"`
	}>`;

const citation = ( id, csl ) => ( { id, csl } );

const bibBlock = ( clientId, citationStyle, citations ) => ( {
	clientId,
	name: 'bibliography-builder/bibliography',
	attributes: { citationStyle, citations },
	innerBlocks: [],
} );

const paragraph = ( clientId, content, innerBlocks = [] ) => ( {
	clientId,
	name: 'core/paragraph',
	attributes: { content },
	innerBlocks,
} );

const entriesFor = ( styleKey, items ) => ( {
	entries: items.map( ( [ id, csl ], index ) => ( {
		id,
		csl,
		styleKey,
		number: index + 1,
	} ) ),
} );

describe( 'findCitationLinks', () => {
	it( 'finds citation links with their ref, locator, and text', () => {
		const html = `Plain <a href="https://example.com">link</a>, ${ link(
			'illich',
			'12'
		) }Illich, <em>Tools for Conviviality</em>, 12</a> and ${ link(
			'grafton'
		) }[2]</a>.`;
		const links = findCitationLinks( html );

		expect( links ).toHaveLength( 2 );
		expect( links[ 0 ] ).toMatchObject( {
			ref: 'illich',
			locator: '12',
			text: 'Illich, Tools for Conviviality, 12',
		} );
		expect( html.slice( links[ 0 ].start, links[ 0 ].end ) ).toBe(
			`${ link(
				'illich',
				'12'
			) }Illich, <em>Tools for Conviviality</em>, 12</a>`
		);
		expect( links[ 1 ] ).toMatchObject( {
			ref: 'grafton',
			locator: null,
			text: '[2]',
		} );
	} );

	it( 'keeps adjacent citations to different entries apart', () => {
		const links = findCitationLinks(
			`${ link( 'a' ) }[1]</a>${ link( 'b' ) }[2]</a>`
		);

		expect( links.map( ( item ) => [ item.ref, item.text ] ) ).toEqual( [
			[ 'a', '[1]' ],
			[ 'b', '[2]' ],
		] );
	} );

	it( 'reads attributes with ">" in quoted values and decodes entities', () => {
		const [ found ] = findCitationLinks(
			`${ link( 'x', 'p. &gt;3 &amp; 4' ) }A &amp; B</a>`.replace(
				'&gt;',
				'>'
			)
		);

		expect( found.locator ).toBe( 'p. >3 & 4' );
		expect( found.text ).toBe( 'A & B' );
	} );

	it( 'returns nothing for HTML without citations', () => {
		expect( findCitationLinks( 'No <a href="#x">links</a> here' ) ).toEqual(
			[]
		);
		expect( findCitationLinks( undefined ) ).toEqual( [] );
	} );
} );

describe( 'isGeneratedText and classifyCitation', () => {
	it( 'recognizes each family’s short form', () => {
		expect(
			isGeneratedText( 'Illich, Tools for Conviviality', illich, '' )
		).toBe( true );
		expect( isGeneratedText( '(Illich 1973, 12)', illich, '12' ) ).toBe(
			true
		);
		expect( isGeneratedText( '(Illich 12)', illich, '12' ) ).toBe( true );
		expect( isGeneratedText( '[7, 12]', illich, '12' ) ).toBe( true );
		expect( isGeneratedText( '[7]', illich, '' ) ).toBe( true );
		expect( isGeneratedText( '[7]', illich, '12' ) ).toBe( false );
		expect( isGeneratedText( 'Illich argues', illich, '' ) ).toBe( false );
	} );

	it( 'uses data-locator when the link has one', () => {
		expect(
			classifyCitation(
				{ text: '(Illich 1973, chap. 3)', locator: 'chap. 3' },
				illich
			)
		).toEqual( {
			status: 'generated',
			locator: 'chap. 3',
			recovered: false,
		} );
		expect(
			classifyCitation( { text: 'as Illich says', locator: '9' }, illich )
		).toEqual( { status: 'reworded', locator: '9', recovered: false } );
	} );

	it( 'recovers the locator of a legacy citation from each family', () => {
		expect(
			recoverLocator( 'Illich, Tools for Conviviality, 22', illich )
		).toBe( '22' );
		expect(
			recoverLocator( 'Grafton, “The Footnote,” 15–20', grafton )
		).toBe( '15–20' );
		expect( recoverLocator( '(Illich 1973, 12)', illich ) ).toBe( '12' );
		expect( recoverLocator( '(Illich § 4)', illich ) ).toBe( '§ 4' );
		expect( recoverLocator( '[3, p. 5]', illich ) ).toBe( 'p. 5' );
		expect( recoverLocator( 'Illich says so', illich ) ).toBeNull();
	} );

	it( 'classifies legacy citations', () => {
		expect(
			classifyCitation( { text: '(Illich 1973)', locator: null }, illich )
		).toEqual( { status: 'generated', locator: '', recovered: false } );
		expect(
			classifyCitation(
				{ text: '(Illich 1973, 12)', locator: null },
				illich
			)
		).toEqual( { status: 'generated', locator: '12', recovered: true } );
		expect(
			classifyCitation( { text: 'Illich', locator: null }, illich )
		).toEqual( { status: 'reworded', locator: '', recovered: false } );
	} );
} );

describe( 'getShortFormHtml and setLocatorOnTag', () => {
	it( 'escapes entry text and wraps italics in em', () => {
		expect(
			getShortFormHtml(
				{ csl: tricky, styleKey: 'chicago-notes-bibliography' },
				'1 & 2'
			)
		).toBe( 'O\'Neil, <em>Less &lt; More &amp; "Most"</em>, 1 &amp; 2' );
	} );

	it( 'adds data-locator last, or replaces it in place', () => {
		expect( setLocatorOnTag( link( 'a' ), 'p. "5"' ) ).toBe(
			link( 'a', 'p. &quot;5&quot;' )
		);
		expect( setLocatorOnTag( link( 'a', 'old' ), 'new' ) ).toBe(
			link( 'a', 'new' )
		);
		expect( setLocatorOnTag( link( 'a' ), '' ) ).toBe( link( 'a' ) );
	} );
} );

describe( 'updateCitationsInHtml', () => {
	const notesHtml = `See ${ link(
		'illich',
		'12'
	) }Illich, <em>Tools for Conviviality</em>, 12</a> and ${ link(
		'grafton'
	) }Grafton, “The Footnote,” 15</a>; also ${ link(
		'borges'
	) }as Borges put it</a>.`;

	it( 'rewrites generated citations for a new style and keeps the rest', () => {
		const bibliography = entriesFor( 'chicago-author-date', [
			[ 'borges', borges ],
			[ 'grafton', grafton ],
			[ 'illich', illich ],
		] );
		const { html, counts } = updateCitationsInHtml(
			notesHtml,
			bibliography
		);

		expect( html ).toBe(
			`See ${ link( 'illich', '12' ) }(Illich 1973, 12)</a> and ${ link(
				'grafton',
				'15'
			) }(Grafton 1997, 15)</a>; also ${ link(
				'borges'
			) }as Borges put it</a>.`
		);
		expect( counts ).toEqual( {
			total: 3,
			updated: 2,
			unchanged: 0,
			reworded: 1,
			stale: 2,
			missing: 0,
		} );
	} );

	it( 'replaces reworded citations when asked, keeping their locator', () => {
		const bibliography = entriesFor( 'ieee', [
			[ 'borges', borges ],
			[ 'illich', illich ],
		] );
		const { html, counts } = updateCitationsInHtml(
			`${ link( 'borges', '4' ) }Borges’s story</a> ${ link(
				'illich'
			) }Illich’s book</a>`,
			bibliography,
			{ includeReworded: true }
		);

		expect( html ).toBe(
			`${ link( 'borges', '4' ) }[1, 4]</a> ${ link( 'illich' ) }[2]</a>`
		);
		expect( counts.updated ).toBe( 2 );
		expect( counts.reworded ).toBe( 2 );
		expect( counts.stale ).toBe( 0 );
	} );

	it( 'renumbers numeric citations when the list order shifts', () => {
		const before = `${ link( 'illich', '3' ) }[1, 3]</a>, ${ link(
			'grafton'
		) }[2]</a>`;
		const { html } = updateCitationsInHtml(
			before,
			entriesFor( 'ieee', [
				[ 'borges', borges ],
				[ 'grafton', grafton ],
				[ 'illich', illich ],
			] )
		);

		expect( html ).toBe(
			`${ link( 'illich', '3' ) }[3, 3]</a>, ${ link( 'grafton' ) }[2]</a>`
		);
	} );

	it( 'round-trips a locator through several style changes', () => {
		let html = `${ link( 'illich', 'chap. 3' ) }Illich, <em>Tools for Conviviality</em>, chap. 3</a>`;

		for ( const [ styleKey, expected ] of [
			[ 'apa-7', '(Illich 1973, chap. 3)' ],
			[ 'mla-9', '(Illich chap. 3)' ],
			[ 'vancouver', '[1, chap. 3]' ],
			[
				'chicago-notes-bibliography',
				'Illich, <em>Tools for Conviviality</em>, chap. 3',
			],
		] ) {
			html = updateCitationsInHtml(
				html,
				entriesFor( styleKey, [ [ 'illich', illich ] ] )
			).html;
			expect( html ).toBe(
				`${ link( 'illich', 'chap. 3' ) }${ expected }</a>`
			);
		}
	} );

	it( 'writes a recovered legacy locator, and skips unrecoverable ones', () => {
		const { html, counts } = updateCitationsInHtml(
			`${ link( 'illich' ) }(Illich 1973, 22)</a> ${ link(
				'grafton'
			) }Grafton’s essay</a>`,
			entriesFor( 'ieee', [
				[ 'grafton', grafton ],
				[ 'illich', illich ],
			] )
		);

		expect( html ).toBe(
			`${ link( 'illich', '22' ) }[2, 22]</a> ${ link(
				'grafton'
			) }Grafton’s essay</a>`
		);
		expect( counts.reworded ).toBe( 1 );
	} );

	it( 'leaves current citations and other bibliographies’ citations alone', () => {
		const html = `${ link( 'illich' ) }(Illich 1973)</a> ${ link(
			'elsewhere'
		) }[9]</a> ${ link( 'gone' ) }[4]</a>`;
		const result = updateCitationsInHtml(
			html,
			entriesFor( 'apa-7', [ [ 'illich', illich ] ] ),
			{ knownIds: new Set( [ 'illich', 'elsewhere' ] ) }
		);

		expect( result.html ).toBe( html );
		expect( result.counts ).toMatchObject( {
			total: 1,
			unchanged: 1,
			updated: 0,
			missing: 1,
		} );
	} );

	it( 'escapes entry text, and treats escaping differences as unchanged', () => {
		const bibliography = entriesFor( 'chicago-notes-bibliography', [
			[ 'tricky', tricky ],
		] );
		const legacy = `${ link( 'tricky' ) }(O'Neil 2016)</a> ${ link(
			'tricky'
		) }O'Neil, <em>Less &lt; More &#38; "Most"</em></a>`;
		const { html, counts } = updateCitationsInHtml( legacy, bibliography );

		expect( html ).toBe(
			`${ link(
				'tricky'
			) }O'Neil, <em>Less &lt; More &amp; "Most"</em></a> ${ link(
				'tricky'
			) }O'Neil, <em>Less &lt; More &#38; "Most"</em></a>`
		);
		expect( html ).not.toContain( '< More' );
		expect( counts ).toMatchObject( { updated: 1, unchanged: 1 } );
	} );
} );

describe( 'updateCitationsInValue', () => {
	const bibliography = entriesFor( 'ieee', [ [ 'illich', illich ] ] );
	const stale = `${ link( 'illich' ) }(Illich 1973)</a>`;

	it( 'walks arrays and objects (table cells)', () => {
		const body = [ { cells: [ { content: stale, tag: 'td' } ] } ];
		const result = updateCitationsInValue( body, bibliography );

		expect( result.changed ).toBe( true );
		expect( result.value[ 0 ].cells[ 0 ].content ).toBe(
			`${ link( 'illich' ) }[1]</a>`
		);
		expect( body[ 0 ].cells[ 0 ].content ).toBe( stale );
	} );

	it( 'keeps a rich-text object’s type', () => {
		class FakeRichText {
			constructor( html ) {
				this.html = html;
			}
			static fromHTMLString( html ) {
				return new FakeRichText( html );
			}
			toHTMLString() {
				return this.html;
			}
		}

		const result = updateCitationsInValue(
			new FakeRichText( stale ),
			bibliography
		);

		expect( result.value ).toBeInstanceOf( FakeRichText );
		expect( result.value.toHTMLString() ).toBe(
			`${ link( 'illich' ) }[1]</a>`
		);

		const same = new FakeRichText( 'no citations' );

		expect( updateCitationsInValue( same, bibliography ).value ).toBe(
			same
		);
	} );
} );

describe( 'planCitationUpdates', () => {
	it( 'plans updates for nested blocks, using save() numbering', () => {
		const blocks = [
			paragraph(
				'p1',
				`${ link( 'illich' ) }Illich, <em>Tools for Conviviality</em></a>`
			),
			{
				clientId: 'g',
				name: 'core/group',
				attributes: {},
				innerBlocks: [
					paragraph(
						'p2',
						`${ link( 'grafton', '5' ) }Grafton, “The Footnote,” 5</a>`
					),
				],
			},
			bibBlock( 'bib', 'ieee', [
				citation( 'illich', illich ),
				citation( 'grafton', grafton ),
			] ),
			bibBlock( 'other', 'apa-7', [ citation( 'borges', borges ) ] ),
			paragraph( 'p3', `${ link( 'borges' ) }Ficciones</a>` ),
		];
		const { updates, counts } = planCitationUpdates( blocks, 'bib' );

		// IEEE sorts by list order as stored: illich [1], grafton [2].
		expect( updates ).toEqual( [
			{
				clientId: 'p1',
				attributes: { content: `${ link( 'illich' ) }[1]</a>` },
			},
			{
				clientId: 'p2',
				attributes: {
					content: `${ link( 'grafton', '5' ) }[2, 5]</a>`,
				},
			},
		] );
		expect( counts ).toMatchObject( {
			total: 2,
			updated: 2,
			stale: 2,
			missing: 0,
		} );
	} );

	it( 'returns nothing for an unknown bibliography', () => {
		expect( planCitationUpdates( [], 'nope' ) ).toEqual( {
			updates: [],
			counts: expect.objectContaining( { total: 0 } ),
		} );
	} );
} );

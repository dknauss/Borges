import {
	create,
	registerFormatType,
	toHTMLString,
	unregisterFormatType,
} from '@wordpress/rich-text';

import { render, screen } from '@testing-library/react';

import {
	CITATION_FORMAT_NAME,
	CitationPicker,
	applyCitation,
	getCitationFormat,
	getCitationRange,
	registerCitationFormat,
	removeCitation,
} from './citation';

const ID = '3f1c2b7e-9a4d-4c1e-8f2a-5b6c7d8e9f01';
const LINK = `<a class="bibliography-builder-citation h-cite" href="#ref-${ ID }" data-bibliography-ref="${ ID }">`;

const entry = {
	id: ID,
	number: 2,
	styleKey: 'chicago-notes-bibliography',
	csl: {
		type: 'book',
		title: 'Tools for Conviviality: A Study',
		author: [ { family: 'Illich', given: 'Ivan' } ],
		issued: { 'date-parts': [ [ 1973 ] ] },
	},
};

const valueOf = ( html, start, end = start ) => ( {
	...create( { html } ),
	start,
	end,
} );

beforeAll( () => {
	// jsdom has no matchMedia; @wordpress/components asks for it.
	window.matchMedia =
		window.matchMedia ||
		( () => ( {
			matches: false,
			addListener: () => {},
			removeListener: () => {},
			addEventListener: () => {},
			removeEventListener: () => {},
		} ) );
	registerFormatType( 'core/italic', {
		title: 'Italic',
		tagName: 'em',
		className: null,
		edit: () => null,
	} );
	registerFormatType( 'core/link', {
		title: 'Link',
		tagName: 'a',
		className: null,
		attributes: { url: 'href' },
		edit: () => null,
	} );
	registerCitationFormat();
} );

afterAll( () => {
	unregisterFormatType( CITATION_FORMAT_NAME );
	unregisterFormatType( 'core/italic' );
	unregisterFormatType( 'core/link' );
} );

describe( 'applyCitation', () => {
	it( 'inserts the short form at a caret, with italics and the link', () => {
		const value = valueOf( 'As argued .', 10 );
		const next = applyCitation( value, entry, { locator: '12' } );

		expect( toHTMLString( { value: next } ) ).toBe(
			`As argued ${ LINK.replace(
				'">',
				'" data-locator="12">'
			) }Illich, <em>Tools for Conviviality</em>, 12</a>.`
		);
		expect( next.start ).toBe( next.end );
		expect( next.activeFormats ).toEqual( [] );
	} );

	it( 'wraps selected text and keeps it', () => {
		const value = valueOf( 'Illich says so.', 0, 6 );

		expect( toHTMLString( { value: applyCitation( value, entry ) } ) ).toBe(
			`${ LINK }Illich</a> says so.`
		);
	} );

	it( 'replaces an ordinary link over the cited text instead of nesting in it', () => {
		const value = valueOf(
			'<a href="https://example.com/">Illich says</a> so.',
			0,
			6
		);
		const html = toHTMLString( { value: applyCitation( value, entry ) } );

		expect( html ).toBe(
			`${ LINK }Illich</a><a href="https://example.com/"> says</a> so.`
		);
		expect( html ).not.toMatch( /<a[^>]*>[^<]*<a/ );
	} );

	it( 'replaces selected text when asked', () => {
		const value = valueOf( 'See this.', 4, 8 );

		expect(
			toHTMLString( {
				value: applyCitation( value, entry, { replaceText: true } ),
			} )
		).toBe( `See ${ LINK }Illich, <em>Tools for Conviviality</em></a>.` );
	} );

	it( 'gives a numeric style the entry number', () => {
		const value = valueOf( 'Shown ', 6 );

		expect(
			toHTMLString( {
				value: applyCitation(
					value,
					{ ...entry, styleKey: 'ieee' },
					{}
				),
			} )
		).toBe( `Shown ${ LINK }[2]</a>` );
	} );
} );

describe( 'getCitationRange and removeCitation', () => {
	const html = `Before ${ LINK }cited text</a> after.`;

	it( 'finds the whole citation from a caret inside or at either end', () => {
		expect( getCitationRange( valueOf( html, 10 ) ) ).toEqual( {
			start: 7,
			end: 17,
		} );
		expect( getCitationRange( valueOf( html, 7 ) ) ).toEqual( {
			start: 7,
			end: 17,
		} );
		expect( getCitationRange( valueOf( html, 17 ) ) ).toEqual( {
			start: 7,
			end: 17,
		} );
		expect( getCitationRange( valueOf( html, 2 ) ) ).toBeNull();
	} );

	it( 'reads the saved markup back as the citation format', () => {
		const value = valueOf( html, 10 );

		expect( value.formats[ 10 ][ 0 ] ).toMatchObject( {
			type: CITATION_FORMAT_NAME,
			attributes: { href: `#ref-${ ID }`, ref: ID },
		} );
		expect( toHTMLString( { value } ) ).toBe( html );
	} );

	it( 'updates an existing citation in place', () => {
		const value = valueOf( html, 10 );
		const next = applyCitation(
			value,
			{ ...entry, id: 'other' },
			{ range: getCitationRange( value ) }
		);

		expect( toHTMLString( { value: next } ) ).toContain(
			'href="#ref-other" data-bibliography-ref="other">cited text</a>'
		);
	} );

	it( 'removes the link and keeps the text', () => {
		expect(
			toHTMLString( { value: removeCitation( valueOf( html, 10 ) ) } )
		).toBe( 'Before cited text after.' );

		const outside = valueOf( html, 2 );

		expect( removeCitation( outside ) ).toBe( outside );
	} );
} );

describe( 'data-locator', () => {
	const withLocator = ( locator ) =>
		LINK.replace( '">', `" data-locator="${ locator }">` );

	it( 'is left out when there is no locator', () => {
		expect( getCitationFormat( ID ).attributes ).toEqual( {
			href: `#ref-${ ID }`,
			ref: ID,
		} );
		expect( getCitationFormat( ID, '  ' ).attributes ).not.toHaveProperty(
			'locator'
		);
	} );

	it( 'saves the locator as typed, spaces collapsed, and escaped', () => {
		const next = applyCitation( valueOf( 'See ', 4 ), entry, {
			locator: ' chap.  3 & "notes" ',
		} );

		expect( toHTMLString( { value: next } ) ).toBe(
			`See ${ withLocator(
				'chap. 3 &amp; &quot;notes&quot;'
			) }Illich, <em>Tools for Conviviality</em>, chap. 3 &amp; "notes"</a>`
		);
	} );

	it( 'reads back and saves again with the same attribute order', () => {
		const html = `A ${ withLocator(
			'22'
		) }Illich, <em>Tools for Conviviality</em>, 22</a> b.`;
		const value = valueOf( html, 4 );
		const format = value.formats[ 4 ].find(
			( candidate ) => candidate.type === CITATION_FORMAT_NAME
		);

		expect( format.attributes ).toEqual( {
			href: `#ref-${ ID }`,
			ref: ID,
			locator: '22',
		} );
		expect( toHTMLString( { value } ) ).toBe( html );
	} );

	it( 'keeps the locator when wrapping text without replacing it', () => {
		const next = applyCitation( valueOf( 'Illich says.', 0, 6 ), entry, {
			locator: '9',
		} );

		expect( toHTMLString( { value: next } ) ).toBe(
			`${ withLocator( '9' ) }Illich</a> says.`
		);
	} );
} );

describe( 'adjacent citations', () => {
	const OTHER = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';
	const link = ( id ) =>
		`<a class="bibliography-builder-citation h-cite" href="#ref-${ id }" data-bibliography-ref="${ id }">`;
	const html = `See ${ link( ID ) }[1]</a>${ link( OTHER ) }[2]</a>.`;
	const ieee = { ...entry, styleKey: 'ieee' };

	it( 'treats two citations side by side as two ranges', () => {
		expect( getCitationRange( valueOf( html, 5 ) ) ).toEqual( {
			start: 4,
			end: 7,
		} );
		expect( getCitationRange( valueOf( html, 8 ) ) ).toEqual( {
			start: 7,
			end: 10,
		} );
		// At the boundary, the active ref picks the citation.
		expect( getCitationRange( valueOf( html, 7 ), ID ) ).toEqual( {
			start: 4,
			end: 7,
		} );
		expect( getCitationRange( valueOf( html, 7 ), OTHER ) ).toEqual( {
			start: 7,
			end: 10,
		} );
	} );

	it( 'keeps two citations of one entry apart when their locators differ', () => {
		const at = ( locator ) =>
			link( ID ).replace( '">', `" data-locator="${ locator }">` );
		const pages = `See ${ at( '12' ) }[1, 12]</a>${ at( '20' ) }[1, 20]</a>.`;

		expect( getCitationRange( valueOf( pages, 6 ), ID ) ).toEqual( {
			start: 4,
			end: 11,
		} );
		expect( getCitationRange( valueOf( pages, 13 ), ID ) ).toEqual( {
			start: 11,
			end: 18,
		} );
		expect(
			toHTMLString( {
				value: removeCitation( valueOf( pages, 13 ), ID ),
			} )
		).toBe( `See ${ at( '12' ) }[1, 12]</a>[1, 20].` );
	} );

	it( 'replaces only the active citation', () => {
		const value = valueOf( html, 5 );
		const next = applyCitation(
			value,
			{ ...ieee, number: 3 },
			{ replaceText: true, range: getCitationRange( value, ID ) }
		);

		expect( toHTMLString( { value: next } ) ).toBe(
			`See ${ link( ID ) }[3]</a>${ link( OTHER ) }[2]</a>.`
		);
	} );

	it( 'retargets only the active citation when keeping the text', () => {
		const value = valueOf( html, 5 );
		const next = applyCitation(
			value,
			{ ...ieee, id: 'third' },
			{ range: getCitationRange( value, ID ) }
		);

		expect( toHTMLString( { value: next } ) ).toBe(
			`See ${ link( 'third' ) }[1]</a>${ link( OTHER ) }[2]</a>.`
		);
	} );

	it( 'removes only the active citation', () => {
		expect(
			toHTMLString( {
				value: removeCitation( valueOf( html, 8 ), OTHER ),
			} )
		).toBe( `See ${ link( ID ) }[1]</a>[2].` );
	} );

	it( 'keeps one citation whole when italics split its text', () => {
		const split = `See ${ link(
			ID
		) }Illich, <em>Tools</em>, 12</a> and more.`;

		// "Illich, Tools, 12" is 17 characters, from 4 to 21.
		expect( getCitationRange( valueOf( split, 6 ), ID ) ).toEqual( {
			start: 4,
			end: 21,
		} );
		expect( getCitationRange( valueOf( split, 21 ) ) ).toEqual( {
			start: 4,
			end: 21,
		} );
	} );
} );

describe( 'CitationPicker', () => {
	const bibliographies = [
		{
			clientId: 'b1',
			family: 'notes',
			label: 'Bibliography',
			entries: [ { ...entry, author: 'Illich', year: '1973' } ],
		},
	];

	it( 'prefills the locator of the citation it was opened on', () => {
		render(
			<CitationPicker
				bibliographies={ bibliographies }
				initialRef={ ID }
				initialLocator="chap. 3"
				hasText
				isActive
				onApply={ () => {} }
				onRemove={ () => {} }
			/>
		);

		expect(
			screen.getByLabelText( 'Page, chapter or section (optional)' )
		).toHaveProperty( 'value', 'chap. 3' );
		expect(
			screen.getByText(
				'Added to the end of the citation as typed, e.g. 22, chap. 3, § 4.'
			)
		).toBeTruthy();
		expect(
			screen.getByText(
				/Inserts: Illich, Tools for Conviviality, chap\. 3/
			)
		).toBeTruthy();
	} );

	it( 'starts empty for a new citation', () => {
		render(
			<CitationPicker
				bibliographies={ bibliographies }
				initialRef=""
				hasText={ false }
				isActive={ false }
				onApply={ () => {} }
				onRemove={ () => {} }
			/>
		);

		expect(
			screen.getByLabelText( 'Page, chapter or section (optional)' )
		).toHaveProperty( 'value', '' );
	} );
} );

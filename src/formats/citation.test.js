import {
	create,
	registerFormatType,
	toHTMLString,
	unregisterFormatType,
} from '@wordpress/rich-text';

import {
	CITATION_FORMAT_NAME,
	applyCitation,
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
	registerFormatType( 'core/italic', {
		title: 'Italic',
		tagName: 'em',
		className: null,
		edit: () => null,
	} );
	registerCitationFormat();
} );

afterAll( () => {
	unregisterFormatType( CITATION_FORMAT_NAME );
	unregisterFormatType( 'core/italic' );
} );

describe( 'applyCitation', () => {
	it( 'inserts the short form at a caret, with italics and the link', () => {
		const value = valueOf( 'As argued .', 10 );
		const next = applyCitation( value, entry, { locator: '12' } );

		expect( toHTMLString( { value: next } ) ).toBe(
			`As argued ${ LINK }Illich, <em>Tools for Conviviality</em>, 12</a>.`
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

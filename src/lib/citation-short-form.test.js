import {
	getShortFormFamily,
	getShortFormSegments,
	getShortFormText,
	getShortName,
	getShortNames,
	getShortTitle,
	getShortYear,
	isItalicTitleType,
	joinShortNames,
} from './citation-short-form';

const book = {
	type: 'book',
	title: 'The Craft of Research: Fourth Edition',
	author: [
		{ family: 'Booth', given: 'Wayne C.' },
		{ family: 'Colomb', given: 'Gregory G.' },
		{ family: 'Williams', given: 'Joseph M.' },
	],
	issued: { 'date-parts': [ [ 2016 ] ] },
};

const article = {
	type: 'article-journal',
	title: 'Deep Learning',
	author: [
		{ family: 'LeCun', given: 'Yann' },
		{ family: 'Bengio', given: 'Yoshua' },
	],
	issued: { 'date-parts': [ [ 2015, 5, 28 ] ] },
};

const single = {
	type: 'chapter',
	title: 'Tools for Conviviality',
	author: [ { family: 'Illich', given: 'Ivan' } ],
	issued: { 'date-parts': [ [ 1973 ] ] },
};

describe( 'getShortFormFamily', () => {
	it( 'reads the family from the style table', () => {
		expect( getShortFormFamily( 'chicago-notes-bibliography' ) ).toBe(
			'notes'
		);
		expect( getShortFormFamily( 'oscola' ) ).toBe( 'notes' );
		expect( getShortFormFamily( 'apa-7' ) ).toBe( 'author-date' );
		expect( getShortFormFamily( 'ieee' ) ).toBe( 'numeric' );
	} );
} );

describe( 'names', () => {
	it( 'keeps a particle and falls back to a literal name', () => {
		expect(
			getShortName( {
				family: 'Gogh',
				'non-dropping-particle': 'van',
				given: 'Vincent',
			} )
		).toBe( 'van Gogh' );
		expect( getShortName( { literal: 'World Health Organization' } ) ).toBe(
			'World Health Organization'
		);
		expect( getShortName( { given: 'Plato' } ) ).toBe( 'Plato' );
		expect( getShortName( null ) ).toBe( '' );
	} );

	it( 'uses editors when there are no authors', () => {
		expect(
			getShortNames( {
				editor: [ { family: 'Ortner', given: 'Sherry' } ],
			} )
		).toEqual( [ 'Ortner' ] );
		expect( getShortNames( {} ) ).toEqual( [] );
	} );

	it( 'joins one, two, and three or more names', () => {
		expect( joinShortNames( [] ) ).toBe( '' );
		expect( joinShortNames( [ 'Illich' ] ) ).toBe( 'Illich' );
		expect( joinShortNames( [ 'LeCun', 'Bengio' ] ) ).toBe(
			'LeCun and Bengio'
		);
		expect( joinShortNames( [ 'Booth', 'Colomb', 'Williams' ] ) ).toBe(
			'Booth et al.'
		);
	} );
} );

describe( 'getShortTitle and getShortYear', () => {
	it( 'prefers title-short, else cuts at the first colon', () => {
		expect( getShortTitle( book ) ).toBe( 'The Craft of Research' );
		expect(
			getShortTitle( { ...book, 'title-short': 'Craft of Research' } )
		).toBe( 'Craft of Research' );
		expect( getShortTitle( { title: 'No Colon Here' } ) ).toBe(
			'No Colon Here'
		);
		expect( getShortTitle( { title: '<i>E. coli</i> in Water' } ) ).toBe(
			'E. coli in Water'
		);
		expect( getShortTitle( {} ) ).toBe( '' );
	} );

	it( 'reads the year from date-parts, a literal date, or gives n.d.', () => {
		expect( getShortYear( article ) ).toBe( '2015' );
		expect( getShortYear( { issued: { literal: 'Spring 1999' } } ) ).toBe(
			'1999'
		);
		expect( getShortYear( { issued: { raw: '2001-04' } } ) ).toBe( '2001' );
		expect( getShortYear( {} ) ).toBe( 'n.d.' );
	} );

	it( 'italicizes book-like types only', () => {
		expect( isItalicTitleType( 'book' ) ).toBe( true );
		expect( isItalicTitleType( 'report' ) ).toBe( true );
		expect( isItalicTitleType( 'article-journal' ) ).toBe( false );
		expect( isItalicTitleType( 'thesis' ) ).toBe( false );
	} );
} );

describe( 'notes family (Chicago short note)', () => {
	const style = 'chicago-notes-bibliography';

	it( 'italicizes a book title, with et al. for three authors', () => {
		expect(
			getShortFormSegments( book, style, { locator: '12' } )
		).toEqual( [
			{ text: 'Booth et al., ', italic: false },
			{ text: 'The Craft of Research', italic: true },
			{ text: ', 12', italic: false },
		] );
	} );

	it( 'quotes an article title with the comma inside', () => {
		expect( getShortFormText( article, style, { locator: '437' } ) ).toBe(
			'LeCun and Bengio, “Deep Learning,” 437'
		);
		expect( getShortFormText( article, style ) ).toBe(
			'LeCun and Bengio, “Deep Learning”'
		);
	} );

	it( 'handles one author and no locator', () => {
		expect( getShortFormText( single, style ) ).toBe(
			'Illich, “Tools for Conviviality”'
		);
	} );

	it( 'leads with the title when there are no names', () => {
		expect(
			getShortFormSegments( { type: 'book', title: 'Beowulf' }, style )
		).toEqual( [ { text: 'Beowulf', italic: true } ] );
	} );

	it( 'gives the names alone when there is no title', () => {
		expect(
			getShortFormText( { author: [ { family: 'Anon' } ] }, style, {
				locator: '3',
			} )
		).toBe( 'Anon, 3' );
	} );

	it( 'never returns an empty citation', () => {
		expect( getShortFormText( {}, style ) ).toBe( '[?]' );
	} );

	it( 'trims the locator and ignores a blank one', () => {
		expect(
			getShortFormText( single, style, { locator: '   ' } )
		).not.toContain( ',”' );
		expect( getShortFormText( single, style, { locator: ' 4 ' } ) ).toBe(
			'Illich, “Tools for Conviviality,” 4'
		);
	} );
} );

describe( 'author-date family', () => {
	it( 'gives (Family Year) and (Family Year, locator)', () => {
		expect( getShortFormText( single, 'chicago-author-date' ) ).toBe(
			'(Illich 1973)'
		);
		expect(
			getShortFormText( article, 'apa-7', { locator: 'p. 437' } )
		).toBe( '(LeCun and Bengio 2015, p. 437)' );
		expect( getShortFormText( book, 'harvard' ) ).toBe(
			'(Booth et al. 2016)'
		);
	} );

	it( 'uses n.d. without a year and the title without names', () => {
		expect(
			getShortFormSegments(
				{ type: 'book', title: 'Beowulf: A New Translation' },
				'chicago-author-date'
			)
		).toEqual( [
			{ text: '(', italic: false },
			{ text: 'Beowulf', italic: true },
			{ text: ' n.d.)', italic: false },
		] );
	} );

	it( 'leaves the year out for MLA', () => {
		expect( getShortFormText( single, 'mla-9', { locator: '12' } ) ).toBe(
			'(Illich 12)'
		);
		expect( getShortFormText( single, 'mla-9' ) ).toBe( '(Illich)' );
	} );
} );

describe( 'numeric family', () => {
	it( 'gives the entry number, with an optional locator', () => {
		expect( getShortFormText( article, 'ieee', { number: 3 } ) ).toBe(
			'[3]'
		);
		expect(
			getShortFormText( article, 'vancouver', {
				number: 1,
				locator: 'p. 5',
			} )
		).toBe( '[1, p. 5]' );
	} );

	it( 'shows a placeholder without a usable number', () => {
		expect( getShortFormText( article, 'ieee' ) ).toBe( '[?]' );
		expect( getShortFormText( article, 'ieee', { number: 0 } ) ).toBe(
			'[?]'
		);
	} );
} );

describe( 'escaping', () => {
	it( 'returns markup in entry data as text, never as tags', () => {
		const text = getShortFormText(
			{
				type: 'book',
				title: 'Fish & <b>Chips</b>',
				author: [ { family: '<script>x</script>Smith' } ],
			},
			'chicago-notes-bibliography'
		);

		expect( text ).toBe( 'xSmith, Fish & Chips' );
	} );
} );

import {
	collectCitableBibliographies,
	entryMatchesQuery,
	filterCitableBibliographies,
	findBibliographyBlocks,
	findCitableEntry,
	getEntryHref,
} from './citation-entries';

const citation = ( id, family, year, title, type = 'book' ) => ( {
	id,
	csl: {
		type,
		title,
		author: [ { family, given: 'A.' } ],
		issued: { 'date-parts': [ [ year ] ] },
	},
	formattedText: `${ family }. ${ title }.`,
} );

const bibliography = ( clientId, attributes, innerBlocks = [] ) => ( {
	clientId,
	name: 'bibliography-builder/bibliography',
	attributes,
	innerBlocks,
} );

describe( 'findBibliographyBlocks', () => {
	it( 'finds nested blocks in document order', () => {
		const blocks = [
			{ clientId: 'p', name: 'core/paragraph', attributes: {} },
			{
				clientId: 'g',
				name: 'core/group',
				attributes: {},
				innerBlocks: [ bibliography( 'b1', {} ) ],
			},
			bibliography( 'b2', {} ),
			null,
		];

		expect(
			findBibliographyBlocks( blocks ).map( ( b ) => b.clientId )
		).toEqual( [ 'b1', 'b2' ] );
		expect( findBibliographyBlocks( undefined ) ).toEqual( [] );
	} );
} );

describe( 'collectCitableBibliographies', () => {
	it( 'lists entries in save() order with labels and numbers', () => {
		const [ result ] = collectCitableBibliographies( [
			bibliography( 'b1', {
				citationStyle: 'chicago-notes-bibliography',
				headingText: 'Works <i>Cited</i>',
				bibliographyId: 'block-1',
				citations: [
					citation( 'z', 'Zola', 1880, 'Nana' ),
					citation( 'a', 'Austen', 1813, 'Pride and Prejudice' ),
				],
			} ),
		] );

		expect( result.label ).toBe( 'Works Cited' );
		expect( result.family ).toBe( 'notes' );
		expect( result.bibliographyId ).toBe( 'block-1' );
		expect( result.entries.map( ( e ) => [ e.id, e.number ] ) ).toEqual( [
			[ 'a', 1 ],
			[ 'z', 2 ],
		] );
		expect( result.entries[ 0 ] ).toMatchObject( {
			author: 'Austen',
			year: '1813',
			title: 'Pride and Prejudice',
			styleKey: 'chicago-notes-bibliography',
		} );
	} );

	it( 'keeps a numeric list in its stored order', () => {
		const [ result ] = collectCitableBibliographies( [
			bibliography( 'b1', {
				citationStyle: 'ieee',
				citations: [
					citation( 'z', 'Zola', 1880, 'Nana' ),
					citation( 'a', 'Austen', 1813, 'Emma' ),
				],
			} ),
		] );

		expect( result.family ).toBe( 'numeric' );
		expect( result.entries.map( ( e ) => [ e.id, e.number ] ) ).toEqual( [
			[ 'z', 1 ],
			[ 'a', 2 ],
		] );
	} );

	it( 'skips unusable citations and empty blocks, and names unlabelled ones', () => {
		const result = collectCitableBibliographies( [
			bibliography( 'empty', { citations: [] } ),
			bibliography( 'b2', {
				citationStyle: 'apa-7',
				citations: [
					citation( 'has space', 'Bad', 2000, 'No ID' ),
					{ id: 'no-csl' },
					null,
					citation( 'ok', 'Good', 2001, 'Fine' ),
				],
			} ),
		] );

		expect( result ).toHaveLength( 1 );
		expect( result[ 0 ].label ).toBe( 'Bibliography 2' );
		expect( result[ 0 ].entries.map( ( e ) => e.id ) ).toEqual( [ 'ok' ] );
	} );

	it( 'falls back to the default style for an unknown one', () => {
		const warn = jest
			.spyOn( console, 'warn' )
			.mockImplementation( () => {} );
		const [ result ] = collectCitableBibliographies( [
			bibliography( 'b1', {
				citationStyle: 'nope',
				citations: [ citation( 'a', 'Austen', 1813, 'Emma' ) ],
			} ),
		] );

		expect( result.styleKey ).toBe( 'chicago-notes-bibliography' );
		warn.mockRestore();
	} );
} );

describe( 'searching', () => {
	const bibliographies = collectCitableBibliographies( [
		bibliography( 'b1', {
			citationStyle: 'chicago-author-date',
			citations: [
				citation( 'a', 'Austen', 1813, 'Pride and Prejudice' ),
				citation( 'b', 'Brontë', 1847, 'Jane Eyre' ),
			],
		} ),
		bibliography( 'b2', {
			citationStyle: 'ieee',
			citations: [ citation( 'c', 'Carroll', 1865, 'Alice' ) ],
		} ),
	] );

	it( 'matches every word against author, year, and title, ignoring case and accents', () => {
		const [ austen, bronte ] = bibliographies[ 0 ].entries;

		expect( entryMatchesQuery( austen, '' ) ).toBe( true );
		expect( entryMatchesQuery( austen, 'austen 1813' ) ).toBe( true );
		expect( entryMatchesQuery( austen, 'PRIDE' ) ).toBe( true );
		expect( entryMatchesQuery( austen, 'austen eyre' ) ).toBe( false );
		expect( entryMatchesQuery( bronte, 'bronte' ) ).toBe( true );
	} );

	it( 'drops bibliographies with no matching entries', () => {
		const result = filterCitableBibliographies( bibliographies, 'alice' );

		expect( result ).toHaveLength( 1 );
		expect( result[ 0 ].clientId ).toBe( 'b2' );
		expect(
			filterCitableBibliographies( bibliographies, '' )
		).toHaveLength( 2 );
	} );

	it( 'finds an entry by ID across bibliographies', () => {
		expect( findCitableEntry( bibliographies, 'c' )?.title ).toBe(
			'Alice'
		);
		expect( findCitableEntry( bibliographies, 'missing' ) ).toBeNull();
	} );
} );

describe( 'getEntryHref', () => {
	it( 'links to the ref- ID save() writes', () => {
		expect( getEntryHref( '3f1c2b7e-9a4d-4c1e-8f2a-5b6c7d8e9f01' ) ).toBe(
			'#ref-3f1c2b7e-9a4d-4c1e-8f2a-5b6c7d8e9f01'
		);
		expect( getEntryHref( 'odd"id' ) ).toBe( '#ref-odd%22id' );
	} );
} );

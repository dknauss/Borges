import {
	getGroupIndex,
	getGroupLabelTag,
	getStyleGroups,
	groupCitations,
} from './bibliography-groups';
import { sortCitations } from './sorter';

const cite = ( id, type, title, author ) => ( {
	id,
	csl: { type, title, ...( author ? { author: [ author ] } : {} ) },
} );

describe( 'getStyleGroups', () => {
	it( "lists OSCOLA 5's tables, then its secondary sources", () => {
		expect(
			getStyleGroups( 'oscola' ).map( ( group ) => group.key )
		).toEqual( [ 'cases', 'legislation', 'treaties', 'secondary' ] );
	} );

	it( 'returns null for styles without groups', () => {
		expect( getStyleGroups( 'chicago-notes-bibliography' ) ).toBeNull();
		expect( getStyleGroups( 'apa-7' ) ).toBeNull();
	} );
} );

describe( 'getGroupIndex', () => {
	const groups = getStyleGroups( 'oscola' );

	it.each( [
		[ 'legal_case', 0 ],
		[ 'legislation', 1 ],
		[ 'bill', 1 ],
		[ 'regulation', 1 ],
		[ 'treaty', 2 ],
		[ 'book', 3 ],
		[ 'webpage', 3 ],
		[ undefined, 3 ],
	] )( 'puts %s in group %i', ( type, index ) => {
		expect( getGroupIndex( { type }, groups ) ).toBe( index );
	} );
} );

describe( 'groupCitations', () => {
	it( 'is null when every citation is a secondary source', () => {
		expect(
			groupCitations(
				[
					cite( 'a', 'book', 'A' ),
					cite( 'b', 'article-journal', 'B' ),
				],
				'oscola'
			)
		).toBeNull();
	} );

	it( 'is null for a style without groups', () => {
		expect(
			groupCitations(
				[ cite( 'c', 'legal_case', 'Smith v Jones' ) ],
				'chicago-notes-bibliography'
			)
		).toBeNull();
	} );

	it( 'keeps only non-empty groups, in order', () => {
		const groups = groupCitations(
			[
				cite( 'b', 'book', 'Book' ),
				cite( 't', 'treaty', 'Treaty' ),
				cite( 'c', 'legal_case', 'Case' ),
			],
			'oscola'
		);

		expect( groups.map( ( group ) => group.key ) ).toEqual( [
			'cases',
			'treaties',
			'secondary',
		] );
		expect( groups[ 0 ].romanTitles ).toBe( true );
		expect( groups[ 2 ].romanTitles ).toBe( false );
		expect( groups[ 2 ].citations.map( ( c ) => c.id ) ).toEqual( [ 'b' ] );
	} );
} );

describe( 'sortCitations with OSCOLA groups', () => {
	const citations = [
		cite( 'craig', 'article-journal', 'Theory', {
			family: 'Craig',
			given: 'Paul',
		} ),
		cite( 'si', 'regulation', 'Air Navigation Order 2016' ),
		cite( 'zeta', 'legislation', 'Zoos Act 1981' ),
		cite( 'farquar', 'legal_case', "Re Farquar's Estate" ),
		cite( 'donoghue', 'legal_case', 'Donoghue v Stevenson' ),
		cite( 'inre', 'legal_case', 'In re Gault' ),
		cite( 'reading', 'legal_case', 'Reading v Attorney-General' ),
		cite( 'abbey', 'legal_case', 'The Abbey Case' ),
		cite( 'aston', 'book', 'Aston on Law', { family: 'Aston' } ),
	];
	const ids = ( list ) => list.map( ( c ) => c.id );

	it( 'files cases by first significant word, then statutes before SIs, then secondary sources', () => {
		expect( ids( sortCitations( citations, 'oscola' ) ) ).toEqual( [
			'abbey',
			'donoghue',
			'farquar',
			'inre',
			'reading',
			'zeta',
			'si',
			'aston',
			'craig',
		] );
	} );

	it( 'sorts one list with sourceGroups: false', () => {
		expect(
			ids( sortCitations( citations, 'oscola', { sourceGroups: false } ) )
		).toEqual( [
			'abbey',
			'si',
			'aston',
			'craig',
			'donoghue',
			'inre',
			'farquar',
			'reading',
			'zeta',
		] );
	} );

	it( 'leaves other styles alone', () => {
		expect(
			ids( sortCitations( citations, 'chicago-notes-bibliography' ) )
		).toEqual(
			ids(
				sortCitations( citations, 'chicago-notes-bibliography', {
					sourceGroups: false,
				} )
			)
		);
	} );
} );

describe( 'getGroupLabelTag', () => {
	it.each( [
		[ 'p', 'p' ],
		[ 'h2', 'h3' ],
		[ 'h5', 'h6' ],
		[ 'h6', 'p' ],
		[ undefined, 'p' ],
	] )( 'labels groups under a %s heading with %s', ( heading, label ) => {
		expect( getGroupLabelTag( heading ) ).toBe( label );
	} );
} );

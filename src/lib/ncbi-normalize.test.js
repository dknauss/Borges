import {
	dotBareInitials,
	normalizeNcbiCsl,
	stripIssuePartLabel,
	stripNlmJournalSubtitle,
} from './ncbi-normalize';

describe( 'dotBareInitials', () => {
	it.each( [
		[ 'C', 'C.' ],
		[ 'KG', 'K. G.' ],
		[ 'JRR', 'J. R. R.' ],
		[ 'Kristien G', 'Kristien G.' ],
		[ 'Kristien', 'Kristien' ],
		[ 'K. G.', 'K. G.' ],
		[ 'C.', 'C.' ],
		[ 'Jean-Paul', 'Jean-Paul' ],
		[ 'ABCD', 'ABCD' ],
		[ 'É', 'É.' ],
		[ '  KG ', 'K. G.' ],
	] )( '%p becomes %p', ( input, expected ) => {
		expect( dotBareInitials( input ) ).toBe( expected );
	} );

	it( 'leaves non-strings alone', () => {
		expect( dotBareInitials( undefined ) ).toBeUndefined();
	} );
} );

describe( 'stripIssuePartLabel', () => {
	it.each( [
		[ 'Pt 8', '8' ],
		[ 'pt 2', '2' ],
		[ 'Pt. 3', '3' ],
		[ 'Pt 2-3', '2-3' ],
		[ 'Suppl 2', 'Suppl 2' ],
		[ '8 Pt 1', '8 Pt 1' ],
		[ '8', '8' ],
		[ 'Pt', 'Pt' ],
		[ 'Ptolemy', 'Ptolemy' ],
	] )( '%p becomes %p', ( input, expected ) => {
		expect( stripIssuePartLabel( input ) ).toBe( expected );
	} );
} );

describe( 'stripNlmJournalSubtitle', () => {
	it( 'drops a subtitle when the short title names the journal', () => {
		expect(
			stripNlmJournalSubtitle( 'Brain : a journal of neurology', 'Brain' )
		).toBe( 'Brain' );
	} );

	it( 'keeps the title when the short title is an abbreviation', () => {
		expect(
			stripNlmJournalSubtitle(
				'Journal of virology : an example subtitle',
				'J Virol'
			)
		).toBe( 'Journal of virology : an example subtitle' );
	} );

	it( 'keeps the title without a short title or a subtitle', () => {
		expect(
			stripNlmJournalSubtitle( 'Brain : a journal of neurology' )
		).toBe( 'Brain : a journal of neurology' );
		expect(
			stripNlmJournalSubtitle( 'Nature genetics', 'Nat Genet' )
		).toBe( 'Nature genetics' );
	} );
} );

describe( 'normalizeNcbiCsl', () => {
	const record = {
		type: 'article-journal',
		author: [
			{ family: 'Zhao', given: 'C' },
			{ family: 'Claeys', given: 'KG' },
			{ literal: 'CMT Consortium' },
		],
		editor: [ { family: 'Smith', given: 'J' } ],
		issue: 'Pt 8',
		'container-title': 'Brain : a journal of neurology',
		'container-title-short': 'Brain',
	};

	it( 'cleans names, issue, and journal without changing the input', () => {
		const copy = JSON.parse( JSON.stringify( record ) );

		expect( normalizeNcbiCsl( record ) ).toEqual( {
			...record,
			author: [
				{ family: 'Zhao', given: 'C.' },
				{ family: 'Claeys', given: 'K. G.' },
				{ literal: 'CMT Consortium' },
			],
			editor: [ { family: 'Smith', given: 'J.' } ],
			issue: '8',
			'container-title': 'Brain',
		} );
		expect( record ).toEqual( copy );
	} );

	it( 'is idempotent', () => {
		const once = normalizeNcbiCsl( record );

		expect( normalizeNcbiCsl( once ) ).toEqual( once );
	} );

	it( 'leaves non-records alone', () => {
		expect( normalizeNcbiCsl( null ) ).toBeNull();
		expect( normalizeNcbiCsl( [ record ] ) ).toEqual( [ record ] );
	} );

	it( 'does not add fields the record lacks', () => {
		expect( normalizeNcbiCsl( { title: 'T' } ) ).toEqual( { title: 'T' } );
	} );
} );

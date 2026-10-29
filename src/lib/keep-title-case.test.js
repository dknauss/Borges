import {
	KEEP_TITLE_CASE_KEY,
	keepsTitleCase,
	setKeepTitleCase,
} from './keep-title-case';
import { buildManualCsl } from './manual-entry';

describe( 'keep-title-case', () => {
	it( 'sets and clears the flag, keeping other custom data', () => {
		const kept = setKeepTitleCase(
			{ type: 'book', custom: { other: 1 } },
			true
		);

		expect( kept.custom ).toEqual( {
			other: 1,
			[ KEEP_TITLE_CASE_KEY ]: true,
		} );
		expect( keepsTitleCase( kept ) ).toBe( true );
		expect( setKeepTitleCase( kept, false ).custom ).toEqual( {
			other: 1,
		} );
	} );

	it( 'drops an emptied custom object', () => {
		const kept = setKeepTitleCase( { type: 'book' }, true );

		expect( setKeepTitleCase( kept, false ) ).toEqual( { type: 'book' } );
		expect( keepsTitleCase( { type: 'book' } ) ).toBe( false );
		expect( keepsTitleCase( undefined ) ).toBe( false );
	} );

	it( 'is set by manual entry only when checked', () => {
		const fields = { type: 'book', title: 'Darwin and Wallace' };

		expect( keepsTitleCase( buildManualCsl( fields ) ) ).toBe( false );
		expect( buildManualCsl( fields ) ).not.toHaveProperty( 'custom' );
		expect(
			keepsTitleCase(
				buildManualCsl( { ...fields, keepTitleCase: true } )
			)
		).toBe( true );
	} );
} );

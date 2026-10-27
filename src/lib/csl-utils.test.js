import { getPrimaryIdentifierValue } from './csl-utils';

describe( 'CSL utility helpers', () => {
	it( 'returns scalar identifier strings unchanged', () => {
		expect( getPrimaryIdentifierValue( '9780226819909' ) ).toBe(
			'9780226819909'
		);
	} );

	it( 'returns the first non-empty string from identifier arrays', () => {
		expect(
			getPrimaryIdentifierValue( [
				null,
				'',
				42,
				'2049-3630',
				'2049-3631',
			] )
		).toBe( '2049-3630' );
	} );

	it( 'returns an empty string for missing or unsupported identifier values', () => {
		expect( getPrimaryIdentifierValue() ).toBe( '' );
		expect( getPrimaryIdentifierValue( 1234 ) ).toBe( '' );
		expect( getPrimaryIdentifierValue( [ '', null, false ] ) ).toBe( '' );
	} );
} );

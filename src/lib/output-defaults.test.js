import metadata from '../../block.json';
import {
	OUTPUT_TOGGLE_KEYS,
	getOutputDefaultChanges,
	isNewBibliographyBlock,
} from './output-defaults';

const fresh = {
	bibliographyId: '',
	citations: [],
	outputJsonLd: true,
	outputCoins: false,
	outputCslJson: false,
	outputCiteExport: false,
};

describe( 'output defaults', () => {
	it( 'covers every output toggle in block.json', () => {
		OUTPUT_TOGGLE_KEYS.forEach( ( key ) => {
			expect( metadata.attributes[ key ].type ).toBe( 'boolean' );
		} );
		expect(
			Object.keys( metadata.attributes ).filter( ( key ) =>
				key.startsWith( 'output' )
			)
		).toEqual( OUTPUT_TOGGLE_KEYS );
	} );

	it( 'changes only the toggles that differ on a new block', () => {
		expect(
			getOutputDefaultChanges( fresh, {
				outputJsonLd: true,
				outputCoins: true,
				outputCiteExport: true,
			} )
		).toEqual( { outputCoins: true, outputCiteExport: true } );
	} );

	it( 'returns null when the site keeps the block.json defaults', () => {
		expect(
			getOutputDefaultChanges( fresh, {
				outputJsonLd: true,
				outputCoins: false,
				outputCslJson: false,
				outputCiteExport: false,
			} )
		).toBeNull();
		expect( getOutputDefaultChanges( fresh, undefined ) ).toBeNull();
	} );

	it( 'ignores values that are not booleans', () => {
		expect(
			getOutputDefaultChanges( fresh, { outputCoins: 'yes' } )
		).toBeNull();
	} );

	it( 'leaves saved, duplicated, and pasted blocks alone', () => {
		const saved = { ...fresh, bibliographyId: 'abc' };
		const filled = { ...fresh, citations: [ { id: 'a' } ] };

		expect( isNewBibliographyBlock( fresh ) ).toBe( true );
		expect( isNewBibliographyBlock( saved ) ).toBe( false );
		expect( isNewBibliographyBlock( filled ) ).toBe( false );
		expect(
			getOutputDefaultChanges( saved, { outputCoins: true } )
		).toBeNull();
		expect(
			getOutputDefaultChanges( filled, { outputCoins: true } )
		).toBeNull();
	} );
} );

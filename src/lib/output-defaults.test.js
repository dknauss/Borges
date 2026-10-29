import metadata from '../../block.json';
import {
	HEADING_LEVELS,
	NEW_BLOCK_HEADING_LEVEL,
	OUTPUT_TOGGLE_KEYS,
	getOutputDefaultChanges,
	isNewBibliographyBlock,
} from './output-defaults';

// A new block as block.json defines it.
const inserted = {
	bibliographyId: '',
	citations: [],
	headingLevel: 0,
	outputJsonLd: true,
	outputCoins: false,
	outputCslJson: false,
	outputCiteExport: false,
};
// The same block once it has the new-block heading level.
const fresh = { ...inserted, headingLevel: NEW_BLOCK_HEADING_LEVEL };

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

	it( 'starts a new block with an h2, not the block.json paragraph', () => {
		expect( metadata.attributes.headingLevel.default ).toBe( 0 );
		expect( metadata.attributes.headingLevel.enum ).toEqual(
			HEADING_LEVELS
		);
		expect( NEW_BLOCK_HEADING_LEVEL ).toBe( 2 );
		expect( getOutputDefaultChanges( inserted, undefined ) ).toEqual( {
			headingLevel: 2,
		} );
		expect( getOutputDefaultChanges( inserted, {} ) ).toEqual( {
			headingLevel: 2,
		} );
		expect( getOutputDefaultChanges( inserted, 'not an object' ) ).toEqual(
			{ headingLevel: 2 }
		);

		// An attribute left out reads as block.json's 0.
		const { headingLevel, ...withoutLevel } = inserted;

		expect( headingLevel ).toBe( 0 );
		expect( getOutputDefaultChanges( withoutLevel, undefined ) ).toEqual( {
			headingLevel: 2,
		} );
		expect(
			getOutputDefaultChanges( withoutLevel, { headingLevel: 0 } )
		).toBeNull();
	} );

	it( 'uses the site heading level when it is a valid one', () => {
		expect(
			getOutputDefaultChanges( inserted, { headingLevel: 3 } )
		).toEqual( { headingLevel: 3 } );
		expect(
			getOutputDefaultChanges( inserted, { headingLevel: 0 } )
		).toBeNull();
		expect(
			getOutputDefaultChanges( inserted, { headingLevel: 7 } )
		).toEqual( { headingLevel: 2 } );
		expect(
			getOutputDefaultChanges( inserted, { headingLevel: '3' } )
		).toEqual( { headingLevel: 2 } );
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
		expect(
			getOutputDefaultChanges(
				{ ...inserted, bibliographyId: 'abc' },
				{ headingLevel: 3 }
			)
		).toBeNull();
	} );
} );

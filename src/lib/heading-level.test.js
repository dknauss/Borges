import {
	HEADING_ALIGNMENTS,
	getHeadingAlignClass,
	getHeadingTag,
} from './heading-level';
import metadata from '../../block.json';

describe( 'getHeadingTag', () => {
	it( 'prints h2 to h6 and falls back to a paragraph', () => {
		expect( getHeadingTag( 2 ) ).toBe( 'h2' );
		expect( getHeadingTag( 6 ) ).toBe( 'h6' );
		expect( getHeadingTag( 0 ) ).toBe( 'p' );
		expect( getHeadingTag( 1 ) ).toBe( 'p' );
	} );
} );

describe( 'getHeadingAlignClass', () => {
	it( 'adds a class only for start', () => {
		expect( getHeadingAlignClass( 'start' ) ).toBe(
			'bibliography-builder-heading-align-start'
		);
		expect( getHeadingAlignClass( 'center' ) ).toBe( '' );
		expect( getHeadingAlignClass( undefined ) ).toBe( '' );
		expect( getHeadingAlignClass( 'right' ) ).toBe( '' );
	} );

	it( 'matches the block.json attribute, whose default adds no class', () => {
		const { headingAlign } = metadata.attributes;

		expect( [ ...headingAlign.enum ].sort() ).toEqual(
			[ ...HEADING_ALIGNMENTS ].sort()
		);
		expect( getHeadingAlignClass( headingAlign.default ) ).toBe( '' );
	} );
} );

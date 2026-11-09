import metadata from '../../block.json';
import { REPEATED_AUTHOR_MARK_SETTINGS } from '../lib/repeated-authors';
import { getRepeatedAuthorMarkOptions } from './repeated-author-mark-control';

const values = ( style ) =>
	getRepeatedAuthorMarkOptions( style ).map( ( option ) => option.value );

describe( 'getRepeatedAuthorMarkOptions', () => {
	it( 'matches the block.json enum', () => {
		expect( metadata.attributes.repeatedAuthorMark ).toEqual( {
			type: 'string',
			enum: [ ...REPEATED_AUTHOR_MARK_SETTINGS ],
			default: 'style',
		} );
	} );

	it( 'offers only the choices a style has', () => {
		expect( values( 'mla-9' ) ).toEqual( [ 'style', 'none' ] );
		expect( values( 'oscola' ) ).toEqual( [ 'style', 'none' ] );
		expect( values( 'chicago-notes-bibliography' ) ).toEqual( [
			'style',
			'dash',
		] );
		expect( values( 'chicago-author-date' ) ).toEqual( [
			'style',
			'dash',
		] );
		expect( values( 'abnt' ) ).toEqual( [ 'style', 'underscore' ] );
		expect( values( 'apa-7' ) ).toEqual( [] );
		expect( values( 'ieee' ) ).toEqual( [] );
	} );
} );

import apiFetch from '@wordpress/api-fetch';
import { clearFormattingCache, formatBibliographyEntry } from './csl';

jest.mock( '@wordpress/api-fetch', () =>
	jest.fn( ( { data } = {} ) =>
		Promise.resolve( {
			entries: ( data?.cslItems || [] ).map( ( item, index ) => ( {
				index,
				text: item.title,
			} ) ),
		} )
	)
);

describe( 'formatting runtime cache behavior', () => {
	beforeEach( () => {
		clearFormattingCache();
		apiFetch.mockClear();
	} );

	it( 'evicts the least recently used cache entry instead of clearing the entire cache', async () => {
		for ( let index = 0; index < 500; index += 1 ) {
			await formatBibliographyEntry(
				{
					type: 'book',
					title: `Title ${ index }`,
				},
				'apa-7'
			);
		}

		expect( apiFetch ).toHaveBeenCalledTimes( 500 );

		await formatBibliographyEntry(
			{
				type: 'book',
				title: 'Title 0',
			},
			'apa-7'
		);

		expect( apiFetch ).toHaveBeenCalledTimes( 500 );

		await formatBibliographyEntry(
			{
				type: 'book',
				title: 'Title 500',
			},
			'apa-7'
		);

		expect( apiFetch ).toHaveBeenCalledTimes( 501 );

		await formatBibliographyEntry(
			{
				type: 'book',
				title: 'Title 0',
			},
			'apa-7'
		);
		await formatBibliographyEntry(
			{
				type: 'book',
				title: 'Title 1',
			},
			'apa-7'
		);

		expect( apiFetch ).toHaveBeenCalledTimes( 502 );
	} );
} );

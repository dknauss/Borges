import { renderHook } from '@testing-library/react';

import {
	getCitationUpdateMessage,
	useCitationUpdates,
} from './use-citation-updates';

const mockUpdateBlockAttributes = jest.fn();
const mockCreateNotice = jest.fn();
const mockRemoveNotice = jest.fn();
let mockBlocks = [];

jest.mock( '@wordpress/data', () => ( {
	useRegistry: () => ( {
		select: () => ( { getBlocks: () => mockBlocks } ),
		dispatch: ( store ) =>
			store === 'core/notices'
				? {
						createNotice: mockCreateNotice,
						removeNotice: mockRemoveNotice,
					}
				: { updateBlockAttributes: mockUpdateBlockAttributes },
	} ),
} ) );

jest.mock( '@wordpress/block-editor', () => ( {
	store: 'core/block-editor',
} ) );

jest.mock( '@wordpress/notices', () => ( { store: 'core/notices' } ) );

const counts = ( overrides ) => ( {
	total: 0,
	updated: 0,
	unchanged: 0,
	reworded: 0,
	stale: 0,
	missing: 0,
	...overrides,
} );

describe( 'getCitationUpdateMessage', () => {
	it( 'reports updated, reworded, and missing citations', () => {
		expect(
			getCitationUpdateMessage(
				counts( { updated: 3, reworded: 1, missing: 2 } ),
				false
			)
		).toBe(
			'Updated 3 citations. Left 1 hand-edited citation as it is. 2 citations point at entries no longer in the bibliography.'
		);
	} );

	it( 'says when nothing changed, and leaves out replaced rewordings', () => {
		expect(
			getCitationUpdateMessage( counts( { reworded: 2 } ), true )
		).toBe( 'No citations needed updating.' );
	} );
} );

describe( 'useCitationUpdates', () => {
	const id = 'illich';
	const link = `<a class="bibliography-builder-citation h-cite" href="#ref-${ id }" data-bibliography-ref="${ id }">`;

	beforeEach( () => {
		mockUpdateBlockAttributes.mockClear();
		mockCreateNotice.mockClear();
		mockRemoveNotice.mockClear();
		mockBlocks = [
			{
				clientId: 'p1',
				name: 'core/paragraph',
				attributes: { content: `${ link }(Illich 1973)</a>` },
				innerBlocks: [],
			},
			{
				clientId: 'bib',
				name: 'bibliography-builder/bibliography',
				attributes: {
					citationStyle: 'ieee',
					citations: [
						{
							id,
							csl: {
								type: 'book',
								title: 'Tools for Conviviality',
								author: [ { family: 'Illich' } ],
								issued: { 'date-parts': [ [ 1973 ] ] },
							},
						},
					],
				},
				innerBlocks: [],
			},
		];
	} );

	it( 'applies every change in one updateBlockAttributes call', () => {
		const { result } = renderHook( () => useCitationUpdates( 'bib' ) );

		expect( result.current.getPlan().counts.stale ).toBe( 1 );

		result.current.updateCitations( false );

		expect( mockUpdateBlockAttributes ).toHaveBeenCalledTimes( 1 );
		expect( mockUpdateBlockAttributes ).toHaveBeenCalledWith(
			[ 'p1' ],
			{ p1: { content: `${ link }[1]</a>` } },
			true
		);
		expect( mockCreateNotice ).toHaveBeenCalledWith(
			'success',
			'Updated 1 citation.',
			expect.objectContaining( { type: 'snackbar' } )
		);
	} );

	it( 'only reports when nothing needs changing', () => {
		mockBlocks[ 0 ].attributes.content = `${ link }[1]</a>`;

		const { result } = renderHook( () => useCitationUpdates( 'bib' ) );

		result.current.updateCitations( false );

		expect( mockUpdateBlockAttributes ).not.toHaveBeenCalled();
		expect( mockCreateNotice ).toHaveBeenCalledWith(
			'success',
			'No citations needed updating.',
			expect.anything()
		);
	} );

	it( 'dismisses the style-change snackbar once citations are updated', () => {
		const { result } = renderHook( () => useCitationUpdates( 'bib' ) );

		result.current.updateCitations( false );

		expect( mockRemoveNotice ).toHaveBeenCalledWith(
			'borges-citation-style-bib'
		);
		expect( mockRemoveNotice.mock.invocationCallOrder[ 0 ] ).toBeLessThan(
			mockCreateNotice.mock.invocationCallOrder[ 0 ]
		);
	} );
} );

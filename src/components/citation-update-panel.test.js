import '@testing-library/jest-dom';
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import { CitationUpdatePanel } from './citation-update-panel';

let mockCounts = {};

jest.mock( '@wordpress/data', () => ( {
	useSelect: () => [],
} ) );

jest.mock( '@wordpress/block-editor', () => ( {
	store: 'core/block-editor',
} ) );

jest.mock( '../lib/citation-update', () => ( {
	planCitationUpdates: () => ( { counts: mockCounts } ),
} ) );

jest.mock( '@wordpress/components', () => {
	const ReactLocal = require( 'react' );

	return {
		PanelBody: ( { title, children } ) =>
			ReactLocal.createElement(
				'section',
				null,
				ReactLocal.createElement( 'h2', null, title ),
				children
			),
		CheckboxControl: ( { label, help, checked, onChange } ) =>
			ReactLocal.createElement(
				'label',
				null,
				ReactLocal.createElement( 'input', {
					type: 'checkbox',
					checked,
					onChange: ( event ) => onChange( event.target.checked ),
				} ),
				label,
				ReactLocal.createElement( 'span', null, help )
			),
		Button: ( { children, onClick } ) =>
			ReactLocal.createElement(
				'button',
				{ type: 'button', onClick },
				children
			),
	};
} );

/**
 * Counts with defaults.
 *
 * @param {Object} values Overrides.
 * @return {Object} Counts.
 */
function counts( values = {} ) {
	return {
		total: 0,
		updated: 0,
		unchanged: 0,
		reworded: 0,
		stale: 0,
		missing: 0,
		...values,
	};
}

describe( 'CitationUpdatePanel', () => {
	it( 'tells an author with no citations where Cite is', () => {
		mockCounts = counts();
		render( <CitationUpdatePanel clientId="a" onUpdate={ jest.fn() } /> );

		expect(
			screen.getByText(
				"No in-text citations in this post link to this bibliography yet. To add one, select text in a paragraph, then choose Cite from the block toolbar's More menu."
			)
		).toBeInTheDocument();
		expect( screen.queryByRole( 'button' ) ).not.toBeInTheDocument();
	} );

	it( 'says when no citation needs updating', () => {
		mockCounts = counts( { total: 3 } );
		render( <CitationUpdatePanel clientId="a" onUpdate={ jest.fn() } /> );

		expect(
			screen.getByText(
				'3 in-text citations in this post link to this bibliography. None need updating.'
			)
		).toBeInTheDocument();
	} );

	it( 'counts out-of-date and hand-edited citations in plain words', () => {
		mockCounts = counts( { total: 3, stale: 2, reworded: 1 } );
		render( <CitationUpdatePanel clientId="a" onUpdate={ jest.fn() } /> );

		expect(
			screen.getByText(
				'3 in-text citations in this post link to this bibliography. 2 are out of date with the current style or numbering. 1 was edited by hand.'
			)
		).toBeInTheDocument();
	} );

	it( 'passes the hand-edited choice to the update', () => {
		const onUpdate = jest.fn();
		mockCounts = counts( { total: 1, reworded: 1 } );
		render( <CitationUpdatePanel clientId="a" onUpdate={ onUpdate } /> );

		expect(
			screen.getByText(
				'Your wording is replaced with the standard citation. Leave this unticked to keep it.'
			)
		).toBeInTheDocument();

		fireEvent.click(
			screen.getByRole( 'button', { name: 'Update citations' } )
		);
		fireEvent.click(
			screen.getByRole( 'checkbox', {
				name: /Also update citations I edited by hand/,
			} )
		);
		fireEvent.click(
			screen.getByRole( 'button', { name: 'Update citations' } )
		);

		expect( onUpdate.mock.calls ).toEqual( [ [ false ], [ true ] ] );
	} );
} );

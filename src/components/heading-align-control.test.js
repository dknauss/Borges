/**
 * Tests for the block toolbar's heading alignment control.
 */

import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import {
	HeadingAlignControl,
	getHeadingAlignOptions,
} from './heading-align-control';
import { HEADING_ALIGNMENTS } from '../lib/heading-level';

let mockRtl = false;

jest.mock( '@wordpress/i18n', () => ( {
	__: ( text ) => text,
	isRTL: () => mockRtl,
} ) );

jest.mock( '@wordpress/icons', () => ( {
	alignCenter: 'align-center',
	alignLeft: 'align-left',
	alignRight: 'align-right',
} ) );

jest.mock( '@wordpress/components', () => {
	const ReactLocal = require( 'react' );

	return {
		ToolbarGroup: ( { children } ) =>
			ReactLocal.createElement( 'div', null, children ),
		ToolbarDropdownMenu: ( { icon, label, controls } ) =>
			ReactLocal.createElement(
				'div',
				{ role: 'menu', 'aria-label': label, 'data-icon': icon },
				controls.map( ( control ) =>
					ReactLocal.createElement(
						'button',
						{
							key: control.title,
							type: 'button',
							role: control.role,
							'aria-checked': control.isActive ? 'true' : 'false',
							'data-icon': control.icon,
							onClick: control.onClick,
						},
						control.title
					)
				)
			),
	};
} );

const START_TITLE = 'Align heading to the start (in line with the entries)';

describe( 'HeadingAlignControl', () => {
	afterEach( () => {
		mockRtl = false;
	} );

	it( 'offers exactly the attribute values block.json allows', () => {
		expect(
			getHeadingAlignOptions()
				.map( ( option ) => option.value )
				.sort()
		).toEqual( [ ...HEADING_ALIGNMENTS ].sort() );
	} );

	it( 'reads a missing or unknown value as center, as it renders', () => {
		const { rerender } = render(
			<HeadingAlignControl value={ undefined } onChange={ jest.fn() } />
		);

		expect(
			screen.getByRole( 'menuitemradio', { name: 'Center heading' } )
		).toHaveAttribute( 'aria-checked', 'true' );

		rerender(
			<HeadingAlignControl value="right" onChange={ jest.fn() } />
		);

		expect(
			screen.getByRole( 'menuitemradio', { name: 'Center heading' } )
		).toHaveAttribute( 'aria-checked', 'true' );
		expect( screen.getByRole( 'menu' ) ).toHaveAttribute(
			'data-icon',
			'align-center'
		);
	} );

	it( 'marks Start as active and shows its icon on the toolbar', () => {
		render( <HeadingAlignControl value="start" onChange={ jest.fn() } /> );

		expect(
			screen.getByRole( 'menuitemradio', { name: START_TITLE } )
		).toHaveAttribute( 'aria-checked', 'true' );
		expect( screen.getByRole( 'menu' ) ).toHaveAttribute(
			'data-icon',
			'align-left'
		);
	} );

	it( 'draws Start as right-aligned in right-to-left languages', () => {
		mockRtl = true;
		render( <HeadingAlignControl value="start" onChange={ jest.fn() } /> );

		expect(
			screen.getByRole( 'menuitemradio', { name: START_TITLE } )
		).toHaveAttribute( 'data-icon', 'align-right' );
	} );

	it( 'reports the chosen value', async () => {
		const onChange = jest.fn();
		render( <HeadingAlignControl value="center" onChange={ onChange } /> );

		await userEvent.click(
			screen.getByRole( 'menuitemradio', { name: START_TITLE } )
		);
		expect( onChange ).toHaveBeenLastCalledWith( 'start' );

		await userEvent.click(
			screen.getByRole( 'menuitemradio', { name: 'Center heading' } )
		);
		expect( onChange ).toHaveBeenLastCalledWith( 'center' );
	} );
} );

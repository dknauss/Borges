import '@testing-library/jest-dom';
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { StructuredCitationEditor } from './structured-citation-editor';

jest.mock( '@wordpress/components', () => {
	const ReactLocal = require( 'react' );

	return {
		Button: ( { className, onClick, children } ) =>
			ReactLocal.createElement(
				'button',
				{ type: 'button', className, onClick },
				children
			),
	};
} );

jest.mock( '../lib/wp-icons', () => {
	const ReactLocal = require( 'react' );
	const MockIcon = () =>
		ReactLocal.createElement( 'span', { 'aria-hidden': 'true' } );

	return { CancelIcon: MockIcon, ConfirmIcon: MockIcon };
} );

function renderEditor( props ) {
	return render(
		<StructuredCitationEditor
			fields={ {} }
			getStructuredFieldId={ ( id, key ) => `${ id }-${ key }` }
			onFieldChange={ () => {} }
			onSave={ () => {} }
			onCancel={ () => {} }
			{ ...props }
		/>
	);
}

describe( 'StructuredCitationEditor', () => {
	it( 'shows Article number only for journal articles', () => {
		const { unmount } = renderEditor( {
			citation: { id: 'a', csl: { type: 'article-journal' } },
			fields: { articleNumber: '108125' },
		} );

		expect( screen.getByLabelText( 'Article number' ) ).toHaveValue(
			'108125'
		);
		unmount();

		renderEditor( { citation: { id: 'b', csl: { type: 'book' } } } );
		expect( screen.queryByLabelText( 'Article number' ) ).toBeNull();
		expect( screen.getByLabelText( 'Pages' ) ).toBeInTheDocument();
	} );

	it( 'follows the selected type in manual entry', () => {
		const { rerender } = renderEditor( {
			showTypeSelector: true,
			fields: { type: 'book' },
			onTypeChange: () => {},
		} );

		expect( screen.queryByLabelText( 'Article number' ) ).toBeNull();

		rerender(
			<StructuredCitationEditor
				fields={ { type: 'article-journal' } }
				getStructuredFieldId={ ( id, key ) => `${ id }-${ key }` }
				onFieldChange={ () => {} }
				onSave={ () => {} }
				onCancel={ () => {} }
				onTypeChange={ () => {} }
				showTypeSelector
			/>
		);
		expect( screen.getByLabelText( 'Article number' ) ).toBeInTheDocument();
	} );
} );

describe( 'StructuredCitationEditor annotation field', () => {
	it( 'edits the annotation in a described textarea', () => {
		const onFieldChange = jest.fn();

		renderEditor( {
			citation: { id: 'd', csl: { type: 'book' } },
			fields: { annotation: 'One.\n\nTwo.' },
			onFieldChange,
		} );

		const textarea = screen.getByLabelText( 'Annotation' );

		expect( textarea.tagName ).toBe( 'TEXTAREA' );
		expect( textarea ).toHaveValue( 'One.\n\nTwo.' );
		expect( textarea ).toHaveAccessibleDescription(
			/Leave a blank line between paragraphs/u
		);

		fireEvent.change( textarea, { target: { value: 'Three.' } } );
		expect( onFieldChange ).toHaveBeenCalledWith( 'annotation', 'Three.' );
	} );

	it( 'cancels on Escape from the textarea', () => {
		const onCancel = jest.fn();

		renderEditor( {
			citation: { id: 'e', csl: { type: 'book' } },
			onCancel,
		} );

		fireEvent.keyDown( screen.getByLabelText( 'Annotation' ), {
			key: 'Escape',
		} );
		expect( onCancel ).toHaveBeenCalled();
	} );
} );

describe( 'StructuredCitationEditor keep-title-case checkbox', () => {
	it( 'reports the checkbox state as a boolean', () => {
		const onFieldChange = jest.fn();

		renderEditor( {
			citation: { id: 'c', csl: { type: 'book' } },
			fields: { keepTitleCase: false },
			onFieldChange,
		} );

		const checkbox = screen.getByLabelText(
			'Keep title capitalization as entered'
		);

		expect( checkbox ).not.toBeChecked();
		expect( checkbox ).toHaveAccessibleDescription(
			'APA, Harvard, IEEE, and Vancouver otherwise print the title in sentence case.'
		);

		checkbox.click();
		expect( onFieldChange ).toHaveBeenCalledWith( 'keepTitleCase', true );
	} );
} );

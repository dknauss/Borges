import '@testing-library/jest-dom';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { CitationEntryBody } from './citation-entry-body';

jest.mock( '@wordpress/components', () => {
	const ReactLocal = require( 'react' );

	return {
		Button: ( { label, className, onClick, children } ) =>
			ReactLocal.createElement(
				'button',
				{
					type: 'button',
					className,
					'aria-label': label,
					onClick,
				},
				children
			),
	};
} );

jest.mock( '../lib/wp-icons', () => {
	const ReactLocal = require( 'react' );
	const MockIcon = () =>
		ReactLocal.createElement( 'span', { 'aria-hidden': 'true' } );

	return {
		ChevronDownIcon: MockIcon,
		ChevronUpIcon: MockIcon,
		CopyIcon: MockIcon,
		DeleteIcon: MockIcon,
		EditIcon: MockIcon,
		ResetIcon: MockIcon,
		StructuredEditIcon: MockIcon,
	};
} );

jest.mock( '../lib/formatting', () => ( {
	getDisplaySegments: jest.fn( () => [
		{
			text: 'Alpha citation',
			italic: false,
		},
	] ),
} ) );

function renderEntry( overrides = {} ) {
	const citation = {
		id: 'entry-alpha',
		csl: {
			title: 'Alpha citation',
		},
		...overrides.citation,
	};

	render(
		<CitationEntryBody
			citation={ citation }
			citationWarnings={ overrides.citationWarnings || [] }
			editText=""
			editingId={ null }
			getEntryLabel={ () => 'Alpha 2024' }
			getStructuredFieldId={ () => 'field-id' }
			handleDelete={ jest.fn() }
			handleEntryActivate={ jest.fn() }
			handleEditConfirm={ jest.fn() }
			handleEditKeyDown={ jest.fn() }
			handleEditStart={ jest.fn() }
			handleCopyCitation={ jest.fn() }
			handleResetAutoFormat={ jest.fn() }
			handleStructuredEditCancel={ jest.fn() }
			handleStructuredEditSave={ jest.fn() }
			handleStructuredEditStart={ jest.fn() }
			handleStructuredFieldChange={ jest.fn() }
			onEditTextChange={ jest.fn() }
			showAnnotations={ overrides.showAnnotations }
			structuredEditingId={ null }
			structuredFields={ {} }
		/>
	);
}

describe( 'CitationEntryBody', () => {
	it( 'uses only phrasing content inside the row trigger button', () => {
		renderEntry( {
			citationWarnings: [ 'Review before publishing.' ],
		} );

		const trigger = screen.getByRole( 'button', {
			name: 'Edit fields: Alpha 2024',
		} );

		expect( trigger.querySelector( 'div' ) ).not.toBeInTheDocument();
		expect(
			trigger.querySelector( '.bibliography-builder-entry-main' )?.tagName
		).toBe( 'SPAN' );
		expect( trigger ).toHaveTextContent( 'Alpha citation' );
		expect( trigger ).toHaveTextContent( 'Review before publishing.' );
	} );

	it( 'shows annotation paragraphs only when annotations are shown', () => {
		const annotated = {
			citation: {
				csl: { title: 'Alpha citation', annote: 'First.\n\nSecond.' },
			},
		};

		renderEntry( annotated );
		expect(
			document.querySelectorAll( '.bibliography-builder-annotation' )
		).toHaveLength( 0 );
		document.body.innerHTML = '';

		renderEntry( { ...annotated, showAnnotations: true } );
		const paragraphs = document.querySelectorAll(
			'.bibliography-builder-annotation'
		);

		expect( [ ...paragraphs ].map( ( node ) => node.textContent ) ).toEqual(
			[ 'First.', 'Second.' ]
		);
		// Inside the row's button, so phrasing content only.
		expect( paragraphs[ 0 ].tagName ).toBe( 'SPAN' );
	} );
} );

import '@testing-library/jest-dom';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { CitationEntryBody } from './citation-entry-body';

jest.mock(
	'@wordpress/components',
	() => {
		const ReactLocal = require('react');

		return {
			Button: ({ label, className, onClick, children }) =>
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
	},
	{ virtual: true }
);

jest.mock('../lib/wp-icons', () => {
	const ReactLocal = require('react');
	const MockIcon = () =>
		ReactLocal.createElement('span', { 'aria-hidden': 'true' });

	return {
		ChevronDownIcon: MockIcon,
		ChevronUpIcon: MockIcon,
		CopyIcon: MockIcon,
		DeleteIcon: MockIcon,
		EditIcon: MockIcon,
		ResetIcon: MockIcon,
		StructuredEditIcon: MockIcon,
	};
});

jest.mock('../lib/formatting', () => ({
	getDisplaySegments: jest.fn(() => [
		{
			text: 'Alpha citation',
			italic: false,
		},
	]),
}));

function renderEntry(overrides = {}) {
	const citation = {
		id: 'entry-alpha',
		csl: {
			title: 'Alpha citation',
		},
		...overrides.citation,
	};

	render(
		<CitationEntryBody
			citation={citation}
			citationWarnings={overrides.citationWarnings || []}
			editText=""
			editingId={null}
			getEntryLabel={() => 'Alpha 2024'}
			getStructuredFieldId={() => 'field-id'}
			handleDelete={jest.fn()}
			handleEntryActivate={jest.fn()}
			handleEditConfirm={jest.fn()}
			handleEditKeyDown={jest.fn()}
			handleEditStart={jest.fn()}
			handleCopyCitation={jest.fn()}
			handleResetAutoFormat={jest.fn()}
			handleStructuredEditCancel={jest.fn()}
			handleStructuredEditSave={jest.fn()}
			handleStructuredEditStart={jest.fn()}
			handleStructuredFieldChange={jest.fn()}
			isStructuredEditable={false}
			onEditTextChange={jest.fn()}
			structuredEditingId={null}
			structuredFields={{}}
		/>
	);
}

describe('CitationEntryBody', () => {
	it('uses only phrasing content inside the row trigger button', () => {
		renderEntry({
			citationWarnings: ['Review before publishing.'],
		});

		const trigger = screen.getByRole('button', { name: 'Edit Alpha 2024' });

		expect(trigger.querySelector('div')).not.toBeInTheDocument();
		expect(
			trigger.querySelector('.bibliography-builder-entry-main')?.tagName
		).toBe('SPAN');
		expect(trigger).toHaveTextContent('Alpha citation');
		expect(trigger).toHaveTextContent('Review before publishing.');
	});
});

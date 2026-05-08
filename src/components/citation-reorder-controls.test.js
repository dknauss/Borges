import '@testing-library/jest-dom';
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { CitationReorderControls } from './citation-reorder-controls';

jest.mock(
	'@wordpress/i18n',
	() => ({
		__: (text) => text,
	}),
	{ virtual: true }
);

jest.mock(
	'@wordpress/components',
	() => {
		const ReactLocal = require('react');
		return {
			Button: ({ label, disabled, onClick, children }) =>
				ReactLocal.createElement(
					'button',
					{
						type: 'button',
						'aria-label': label,
						disabled,
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
	};
});

describe('CitationReorderControls', () => {
	it('renders move controls with expected enabled states', () => {
		render(
			<CitationReorderControls
				label="Smith 2020"
				canMoveUp={false}
				canMoveDown
				onMoveUp={jest.fn()}
				onMoveDown={jest.fn()}
			/>
		);

		expect(
			screen.getByRole('button', { name: "Move 'Smith 2020' up" })
		).toBeDisabled();
		expect(
			screen.getByRole('button', { name: "Move 'Smith 2020' down" })
		).toBeEnabled();
	});

	it('calls move handlers when controls are activated', () => {
		const onMoveUp = jest.fn();
		const onMoveDown = jest.fn();

		render(
			<CitationReorderControls
				label="Smith 2020"
				canMoveUp
				canMoveDown
				onMoveUp={onMoveUp}
				onMoveDown={onMoveDown}
			/>
		);

		fireEvent.click(
			screen.getByRole('button', { name: "Move 'Smith 2020' up" })
		);
		fireEvent.click(
			screen.getByRole('button', { name: "Move 'Smith 2020' down" })
		);

		expect(onMoveUp).toHaveBeenCalledTimes(1);
		expect(onMoveDown).toHaveBeenCalledTimes(1);
	});
});

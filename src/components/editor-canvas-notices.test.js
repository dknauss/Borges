import '@testing-library/jest-dom';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { EditorCanvasNotices } from './editor-canvas-notices';

jest.mock('@wordpress/components', () => {
	const ReactLocal = require('react');

	return {
		Notice: ({ status = 'info', onRemove, children, className }) =>
			ReactLocal.createElement(
				'div',
				{
					role: 'status',
					className: `${
						className || ''
					} components-notice is-${status}`.trim(),
				},
				children,
				onRemove
					? ReactLocal.createElement(
							'button',
							{
								type: 'button',
								'aria-label': 'Dismiss',
								onClick: onRemove,
							},
							'Dismiss'
					  )
					: null
			),
		Snackbar: ({ onRemove, children, className }) =>
			ReactLocal.createElement(
				'div',
				{
					role: 'status',
					className: `${className || ''} components-snackbar`.trim(),
				},
				children,
				onRemove
					? ReactLocal.createElement(
							'button',
							{
								type: 'button',
								'aria-label': 'Dismiss',
								onClick: onRemove,
							},
							'Dismiss'
					  )
					: null
			),
	};
});

jest.mock('@wordpress/element', () => {
	const ReactLocal = require('react');

	return {
		createElement: ReactLocal.createElement,
		Fragment: ReactLocal.Fragment,
		useState: ReactLocal.useState,
		useRef: ReactLocal.useRef,
		useCallback: ReactLocal.useCallback,
		useEffect: ReactLocal.useEffect,
	};
});

describe('EditorCanvasNotices', () => {
	it('renders nothing when there is no current notice', () => {
		render(<EditorCanvasNotices currentNotice={null} noticeRef={null} />);

		expect(screen.queryByRole('status')).not.toBeInTheDocument();
		expect(
			document.querySelector('.bibliography-builder-editor-notices')
		).not.toHaveAttribute('tabindex');
	});

	it('renders the current notice inline', () => {
		const noticeRef = { current: null };
		const onDismiss = jest.fn();

		render(
			<EditorCanvasNotices
				currentNotice={{
					id: 'notice-1',
					status: 'info',
					message: 'Notice text',
				}}
				noticeRef={noticeRef}
				onDismiss={onDismiss}
			/>
		);

		expect(screen.getByRole('status')).toHaveTextContent('Notice text');
		expect(
			screen
				.getByText('Notice text')
				.closest('.bibliography-builder-inline-notice')
		).toHaveClass('components-notice', 'is-info');
		expect(
			screen.getByRole('button', { name: 'Dismiss' })
		).toBeInTheDocument();
		expect(
			document.querySelector('.bibliography-builder-editor-notices')
		).toHaveAttribute('tabindex', '-1');
	});

	it('renders snackbar-style notices for pure success messages', () => {
		render(
			<EditorCanvasNotices
				currentNotice={{
					id: 'notice-2',
					status: 'success',
					type: 'snackbar',
					message: 'Added 1 citation.',
				}}
				noticeRef={null}
				onDismiss={jest.fn()}
			/>
		);

		expect(screen.getByRole('status')).toHaveTextContent(
			'Added 1 citation.'
		);
		expect(
			screen
				.getByText('Added 1 citation.')
				.closest('.bibliography-builder-inline-snackbar')
		).toHaveClass('components-snackbar');
	});
});

import '@testing-library/jest-dom';
import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { useBlockNotices } from './use-block-notices';

jest.useFakeTimers();

jest.mock('@wordpress/notices', () => ({
	store: 'core/notices',
}));

jest.mock('@wordpress/data', () =>
	require('../test-utils/wordpress-data-notices-mock').createWordpressDataNoticesMock()
);

jest.mock('@wordpress/element', () => {
	const ReactLocal = require('react');

	return {
		createElement: ReactLocal.createElement,
		Fragment: ReactLocal.Fragment,
		useState: ReactLocal.useState,
		useRef: ReactLocal.useRef,
		useCallback: ReactLocal.useCallback,
		useEffect: ReactLocal.useEffect,
		useMemo: ReactLocal.useMemo,
	};
});

function NoticeHarness() {
	const { announce, clearNotice, currentNotice } = useBlockNotices();

	return (
		<div>
			<button
				type="button"
				onClick={() => announce('info', 'Info notice')}
			>
				Show info
			</button>
			<button
				type="button"
				onClick={() =>
					announce('success', 'Success notice', {
						type: 'snackbar',
					})
				}
			>
				Show success snackbar
			</button>
			<button
				type="button"
				onClick={() => announce('warning', 'Warning notice')}
			>
				Show warning
			</button>
			<button type="button" onClick={clearNotice}>
				Clear
			</button>
			{currentNotice ? <p>{currentNotice.message}</p> : null}
		</div>
	);
}

describe('useBlockNotices', () => {
	afterEach(() => {
		jest.clearAllTimers();
		act(() => {
			require('@wordpress/data').__unstableResetNotices();
		});
	});

	it('does not auto-dismiss default info notices', () => {
		render(<NoticeHarness />);

		act(() => {
			fireEvent.click(screen.getByRole('button', { name: 'Show info' }));
		});
		expect(screen.getByText('Info notice')).toBeInTheDocument();

		act(() => {
			jest.advanceTimersByTime(5000);
		});

		expect(screen.getByText('Info notice')).toBeInTheDocument();
	});

	it('auto-dismisses snackbar notices after five seconds', () => {
		render(<NoticeHarness />);

		act(() => {
			fireEvent.click(
				screen.getByRole('button', { name: 'Show success snackbar' })
			);
		});
		expect(screen.getByText('Success notice')).toBeInTheDocument();

		act(() => {
			jest.advanceTimersByTime(5000);
		});

		expect(screen.queryByText('Success notice')).not.toBeInTheDocument();
	});

	it('does not auto-dismiss warning notices', () => {
		render(<NoticeHarness />);

		act(() => {
			fireEvent.click(
				screen.getByRole('button', { name: 'Show warning' })
			);
		});
		expect(screen.getByText('Warning notice')).toBeInTheDocument();

		act(() => {
			jest.advanceTimersByTime(5000);
		});

		expect(screen.getByText('Warning notice')).toBeInTheDocument();
	});

	it('clears both default and snackbar notice buckets before announcing', () => {
		render(<NoticeHarness />);

		act(() => {
			fireEvent.click(screen.getByRole('button', { name: 'Show info' }));
		});

		expect(
			require('@wordpress/data').__unstableGetRemoveAllCalls()
		).toEqual([
			['default', 'bibliography/editor'],
			['snackbar', 'bibliography/editor'],
		]);
	});
});

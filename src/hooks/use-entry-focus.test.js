import { act, renderHook } from '@testing-library/react';
import { useEntryFocus } from './use-entry-focus';

jest.mock('@wordpress/element', () => {
	const React = require('react');
	return {
		useCallback: React.useCallback,
		useEffect: React.useEffect,
		useRef: React.useRef,
		useState: React.useState,
	};
});

// --- Helpers ---

function makeFocusNode(overrides = {}) {
	return {
		focus: jest.fn(),
		scrollIntoView: jest.fn(),
		...overrides,
	};
}

function makeMatchMedia(prefersReducedMotion = false) {
	return jest.fn((query) => ({
		matches: query.includes('reduce') && prefersReducedMotion,
	}));
}

// --- Tests ---

describe('useEntryFocus', () => {
	beforeEach(() => {
		window.matchMedia = makeMatchMedia(false);
	});

	it('registers and unregisters entry refs via setEntryRef', () => {
		const { result } = renderHook(() =>
			useEntryFocus({ citations: [], noticeVersion: 0 })
		);

		const node = makeFocusNode();
		act(() => result.current.setEntryRef('cit-1', node));
		expect(result.current.entryRefs.current.get('cit-1')).toBe(node);

		act(() => result.current.setEntryRef('cit-1', null));
		expect(result.current.entryRefs.current.has('cit-1')).toBe(false);
	});

	it('focuses an entry node when queueFocus({ type: "entry" }) is called', () => {
		const { result } = renderHook(() =>
			useEntryFocus({ citations: [], noticeVersion: 0 })
		);

		const node = makeFocusNode();
		act(() => result.current.setEntryRef('cit-1', node));
		act(() => result.current.queueFocus({ type: 'entry', id: 'cit-1' }));

		expect(node.focus).toHaveBeenCalledWith({ preventScroll: true });
		expect(node.scrollIntoView).toHaveBeenCalledWith(
			expect.objectContaining({ block: 'nearest', behavior: 'smooth' })
		);
	});

	it('uses behavior "auto" when prefers-reduced-motion is set', () => {
		window.matchMedia = makeMatchMedia(true);

		const { result } = renderHook(() =>
			useEntryFocus({ citations: [], noticeVersion: 0 })
		);

		const node = makeFocusNode();
		act(() => result.current.setEntryRef('cit-1', node));
		act(() => result.current.queueFocus({ type: 'entry', id: 'cit-1' }));

		expect(node.scrollIntoView).toHaveBeenCalledWith(
			expect.objectContaining({ behavior: 'auto' })
		);
	});

	it('focuses the notice ref when queueFocus({ type: "notice" }) is called', () => {
		const { result } = renderHook(() =>
			useEntryFocus({ citations: [], noticeVersion: 0 })
		);

		const node = makeFocusNode();
		act(() => {
			result.current.noticeRef.current = node;
		});
		act(() => result.current.queueFocus({ type: 'notice' }));

		expect(node.focus).toHaveBeenCalled();
	});

	it('focuses the paste zone when queueFocus({ type: "paste" }) is called', () => {
		const { result } = renderHook(() =>
			useEntryFocus({ citations: [], noticeVersion: 0 })
		);

		const node = makeFocusNode();
		act(() => {
			result.current.pasteZoneRef.current = node;
		});
		act(() => result.current.queueFocus({ type: 'paste' }));

		expect(node.focus).toHaveBeenCalled();
	});

	it('does nothing when the target node is not mounted', () => {
		const { result } = renderHook(() =>
			useEntryFocus({ citations: [], noticeVersion: 0 })
		);

		// Queue focus for an id that has no registered ref — must not throw.
		expect(() => {
			act(() =>
				result.current.queueFocus({ type: 'entry', id: 'missing' })
			);
		}).not.toThrow();
	});

	it('clears pendingFocusRef after successful focus so it does not re-fire', () => {
		const { result } = renderHook(() =>
			useEntryFocus({ citations: [], noticeVersion: 0 })
		);

		const node = makeFocusNode();
		act(() => result.current.setEntryRef('cit-1', node));
		act(() => result.current.queueFocus({ type: 'entry', id: 'cit-1' }));

		// Reset call count and verify no double-focus on re-render.
		node.focus.mockClear();
		act(() => result.current.queueFocus({ type: 'entry', id: 'cit-1' })); // second queue
		expect(node.focus).toHaveBeenCalledTimes(1); // only for the second queue, not the cleared first
	});
});

import { act, renderHook } from '@testing-library/react';
import { useCitationReorder } from './use-citation-reorder';

jest.mock(
	'@wordpress/element',
	() => {
		const React = require('react');
		return {
			useCallback: React.useCallback,
		};
	},
	{ virtual: true }
);

function makeCitation(id, family, year) {
	return {
		id,
		csl: {
			title: `${family} Study`,
			author: [
				{
					family,
				},
			],
			issued: {
				'date-parts': [[year]],
			},
		},
	};
}

describe('useCitationReorder', () => {
	it('moves a citation up and announces the new position', () => {
		const citationsRef = {
			current: [
				makeCitation('a', 'Alpha', 2020),
				makeCitation('b', 'Bravo', 2021),
				makeCitation('c', 'Charlie', 2022),
			],
		};
		const announce = jest.fn();
		const queueFocus = jest.fn();
		const setAttributes = jest.fn((update) => {
			citationsRef.current = update.citations;
		});

		const { result } = renderHook(() =>
			useCitationReorder({
				announce,
				citationsRef,
				queueFocus,
				setAttributes,
			})
		);

		act(() => {
			result.current.moveCitationUp('c', 'Charlie 2022');
		});

		expect(citationsRef.current.map((citation) => citation.id)).toEqual([
			'a',
			'c',
			'b',
		]);
		expect(announce).toHaveBeenCalledWith(
			'success',
			"Moved 'Charlie 2022' to position 2 of 3.",
			{ type: 'snackbar' }
		);
		expect(queueFocus).toHaveBeenCalledWith({ type: 'entry', id: 'c' });
	});

	it('moves a citation down and preserves focus target', () => {
		const citationsRef = {
			current: [
				makeCitation('a', 'Alpha', 2020),
				makeCitation('b', 'Bravo', 2021),
			],
		};
		const announce = jest.fn();
		const queueFocus = jest.fn();
		const setAttributes = jest.fn((update) => {
			citationsRef.current = update.citations;
		});

		const { result } = renderHook(() =>
			useCitationReorder({
				announce,
				citationsRef,
				queueFocus,
				setAttributes,
			})
		);

		act(() => {
			result.current.moveCitationDown('a', 'Alpha 2020');
		});

		expect(citationsRef.current.map((citation) => citation.id)).toEqual([
			'b',
			'a',
		]);
		expect(queueFocus).toHaveBeenCalledWith({ type: 'entry', id: 'a' });
	});

	it('announces a generated citation label when none is provided', () => {
		const citationsRef = {
			current: [
				makeCitation('a', 'Alpha', 2020),
				makeCitation('b', 'Bravo', 2021),
			],
		};
		const announce = jest.fn();
		const queueFocus = jest.fn();
		const setAttributes = jest.fn((update) => {
			citationsRef.current = update.citations;
		});

		const { result } = renderHook(() =>
			useCitationReorder({
				announce,
				citationsRef,
				queueFocus,
				setAttributes,
			})
		);

		act(() => {
			result.current.moveCitationDown('a');
		});

		expect(announce).toHaveBeenCalledWith(
			'success',
			"Moved 'Alpha 2020' to position 2 of 2.",
			{ type: 'snackbar' }
		);
	});

	it('falls back to an Unknown label for sparse citation metadata', () => {
		const citationsRef = {
			current: [
				{
					id: 'a',
					csl: {},
				},
				makeCitation('b', 'Bravo', 2021),
			],
		};
		const announce = jest.fn();
		const queueFocus = jest.fn();
		const setAttributes = jest.fn((update) => {
			citationsRef.current = update.citations;
		});

		const { result } = renderHook(() =>
			useCitationReorder({
				announce,
				citationsRef,
				queueFocus,
				setAttributes,
			})
		);

		act(() => {
			result.current.moveCitationDown('a');
		});

		expect(announce).toHaveBeenCalledWith(
			'success',
			"Moved 'Unknown' to position 2 of 2.",
			{ type: 'snackbar' }
		);
	});

	it('does nothing when the requested citation id is missing', () => {
		const citationsRef = {
			current: [
				makeCitation('a', 'Alpha', 2020),
				makeCitation('b', 'Bravo', 2021),
			],
		};
		const announce = jest.fn();
		const queueFocus = jest.fn();
		const setAttributes = jest.fn();

		const { result } = renderHook(() =>
			useCitationReorder({
				announce,
				citationsRef,
				queueFocus,
				setAttributes,
			})
		);

		let moved;
		act(() => {
			moved = result.current.moveCitationDown('missing');
		});

		expect(moved).toBe(false);
		expect(setAttributes).not.toHaveBeenCalled();
		expect(announce).not.toHaveBeenCalled();
		expect(queueFocus).not.toHaveBeenCalled();
	});

	it('does not move first entry up or last entry down', () => {
		const citationsRef = {
			current: [
				makeCitation('a', 'Alpha', 2020),
				makeCitation('b', 'Bravo', 2021),
			],
		};
		const announce = jest.fn();
		const queueFocus = jest.fn();
		const setAttributes = jest.fn();

		const { result } = renderHook(() =>
			useCitationReorder({
				announce,
				citationsRef,
				queueFocus,
				setAttributes,
			})
		);

		act(() => {
			result.current.moveCitationUp('a', 'Alpha 2020');
			result.current.moveCitationDown('b', 'Bravo 2021');
		});

		expect(setAttributes).not.toHaveBeenCalled();
		expect(announce).not.toHaveBeenCalled();
		expect(queueFocus).not.toHaveBeenCalled();
		expect(citationsRef.current.map((citation) => citation.id)).toEqual([
			'a',
			'b',
		]);
	});
});

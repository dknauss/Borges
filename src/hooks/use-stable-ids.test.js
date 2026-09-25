import { renderHook } from '@testing-library/react';

import { useStableIds } from './use-stable-ids';

const mockRegistry = { current: null };

jest.mock(
	'@wordpress/data',
	() => ({ useRegistry: () => mockRegistry.current }),
	{ virtual: true }
);

jest.mock('@wordpress/block-editor', () => ({ store: 'core/block-editor' }), {
	virtual: true,
});

const BLOCK = 'bibliography-builder/bibliography';

function createRegistry(blocks) {
	const markNotPersistent = jest.fn();

	return {
		markNotPersistent,
		select: () => ({
			getClientIdsWithDescendants: () =>
				blocks.map((block) => block.clientId),
			getBlockName: (id) =>
				blocks.find((block) => block.clientId === id).name,
			getBlockAttributes: (id) =>
				blocks.find((block) => block.clientId === id).attributes,
		}),
		dispatch: () => ({
			__unstableMarkNextChangeAsNotPersistent: markNotPersistent,
		}),
	};
}

function mount(clientId, attributes, blocks) {
	const registry = createRegistry(blocks);
	const setAttributes = jest.fn();

	mockRegistry.current = registry;
	renderHook(() => useStableIds({ clientId, attributes, setAttributes }));

	return { registry, setAttributes };
}

describe('useStableIds', () => {
	const original = {
		bibliographyId: 'block-a',
		citations: [{ id: 'c1' }, { id: 'c2' }],
	};

	it('leaves a block with stable, unique IDs untouched', () => {
		const { setAttributes, registry } = mount('one', original, [
			{ clientId: 'one', name: BLOCK, attributes: original },
		]);

		expect(setAttributes).not.toHaveBeenCalled();
		expect(registry.markNotPersistent).not.toHaveBeenCalled();
	});

	it('re-keys the later copy of a duplicated block, marked as non-persistent', () => {
		const blocks = [
			{ clientId: 'one', name: BLOCK, attributes: original },
			{ clientId: 'para', name: 'core/paragraph', attributes: {} },
			{ clientId: 'copy', name: BLOCK, attributes: original },
		];
		const { setAttributes, registry } = mount('copy', original, blocks);

		expect(registry.markNotPersistent).toHaveBeenCalledTimes(1);
		expect(setAttributes).toHaveBeenCalledTimes(1);

		const changes = setAttributes.mock.calls[0][0];

		expect(changes.bibliographyId).not.toBe('block-a');
		expect(changes.citations.map((citation) => citation.id)).not.toEqual([
			'c1',
			'c2',
		]);
	});

	it('keeps the original block of a duplicated pair as it is', () => {
		const blocks = [
			{ clientId: 'one', name: BLOCK, attributes: original },
			{ clientId: 'copy', name: BLOCK, attributes: original },
		];
		const { setAttributes } = mount('one', original, blocks);

		expect(setAttributes).not.toHaveBeenCalled();
	});

	it('assigns a missing block ID even when the block editor store is unavailable', () => {
		const setAttributes = jest.fn();

		mockRegistry.current = null;
		renderHook(() =>
			useStableIds({
				clientId: 'one',
				attributes: { bibliographyId: '', citations: [] },
				setAttributes,
			})
		);

		expect(setAttributes).toHaveBeenCalledWith({
			bibliographyId: expect.any(String),
		});
	});
});

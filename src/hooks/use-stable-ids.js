import { useEffect } from '@wordpress/element';
import { useRegistry } from '@wordpress/data';
import { store as blockEditorStore } from '@wordpress/block-editor';

import {
	BIBLIOGRAPHY_BLOCK_NAME,
	ensureStableIds,
	hasEarlierDuplicate,
} from '../lib/stable-ids';

/**
 * List bibliography blocks in document order with their `bibliographyId`.
 *
 * @param {Object} editor Block editor selectors.
 * @return {Array<{clientId: string, bibliographyId: string}>} Ordered blocks.
 */
function getOrderedBibliographyBlocks(editor) {
	if (
		!editor ||
		typeof editor.getClientIdsWithDescendants !== 'function' ||
		typeof editor.getBlockName !== 'function' ||
		typeof editor.getBlockAttributes !== 'function'
	) {
		return [];
	}

	return editor
		.getClientIdsWithDescendants()
		.filter((id) => editor.getBlockName(id) === BIBLIOGRAPHY_BLOCK_NAME)
		.map((id) => ({
			clientId: id,
			bibliographyId: editor.getBlockAttributes(id)?.bibliographyId,
		}));
}

/**
 * Give the block a stable, unique `bibliographyId` and its citations stable,
 * unique IDs when it mounts (see `lib/stable-ids.js`).
 *
 * Runs once per mount: on insert, on opening a post, and on duplicate or
 * paste, which mount a new block. The block store is read through the
 * registry instead of `useSelect`, so bibliography blocks do not re-render on
 * every editor change just to repeat a check that only matters at mount.
 *
 * The assignment is marked non-persistent where the block editor supports it,
 * so it does not add an undo step the author never made.
 *
 * @param {Object}   params
 * @param {string}   params.clientId      This block's client ID.
 * @param {Object}   params.attributes    Block attributes.
 * @param {Function} params.setAttributes Block attribute setter.
 */
export function useStableIds({ clientId, attributes, setAttributes }) {
	const registry = useRegistry();

	useEffect(() => {
		const editor = registry?.select?.(blockEditorStore);
		const isDuplicateBlock = hasEarlierDuplicate(
			clientId,
			attributes.bibliographyId,
			getOrderedBibliographyBlocks(editor)
		);
		const changes = ensureStableIds(attributes, { isDuplicateBlock });

		if (!changes) {
			return;
		}

		const dispatch = registry?.dispatch?.(blockEditorStore);

		if (
			typeof dispatch?.__unstableMarkNextChangeAsNotPersistent ===
			'function'
		) {
			dispatch.__unstableMarkNextChangeAsNotPersistent();
		}

		setAttributes(changes);
		// Mount-only by design; see the docblock.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);
}

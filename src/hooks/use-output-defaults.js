import { useEffect } from '@wordpress/element';
import { useRegistry } from '@wordpress/data';
import { store as blockEditorStore } from '@wordpress/block-editor';

import {
	OUTPUT_DEFAULTS_SETTING,
	getOutputDefaultChanges,
} from '../lib/output-defaults';

/**
 * Apply the site's output toggle defaults to a newly inserted block (see
 * `lib/output-defaults.js`).
 *
 * Runs once, at mount, like `useStableIds()`, and is marked non-persistent
 * for the same reason: the author did not make the change, so it should not
 * be an undo step.
 *
 * @param {Object}   params
 * @param {Object}   params.attributes    Block attributes.
 * @param {Function} params.setAttributes Block attribute setter.
 */
export function useOutputDefaults({ attributes, setAttributes }) {
	const registry = useRegistry();

	useEffect(() => {
		const settings = registry?.select?.(blockEditorStore)?.getSettings?.();
		const changes = getOutputDefaultChanges(
			attributes,
			settings?.[OUTPUT_DEFAULTS_SETTING]
		);

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

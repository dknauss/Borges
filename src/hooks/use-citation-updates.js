import { useCallback } from '@wordpress/element';
import { useRegistry } from '@wordpress/data';
import { store as blockEditorStore } from '@wordpress/block-editor';
import { store as noticesStore } from '@wordpress/notices';
import { __, _n, sprintf } from '@wordpress/i18n';

import { planCitationUpdates } from '../lib/citation-update';

/**
 * The notice that reports an update.
 *
 * @param {import('../lib/citation-update').CitationUpdateCounts} counts          Counts.
 * @param {boolean}                                               includeReworded Whether reworded citations were replaced.
 * @return {string} Message.
 */
export function getCitationUpdateMessage( counts, includeReworded ) {
	const parts = [
		counts.updated
			? sprintf(
					/* translators: %d: number of citations updated. */
					_n(
						'Updated %d citation.',
						'Updated %d citations.',
						counts.updated,
						'borges-bibliography-builder'
					),
					counts.updated
				)
			: __(
					'No citations needed updating.',
					'borges-bibliography-builder'
				),
	];

	if ( counts.reworded && ! includeReworded ) {
		parts.push(
			sprintf(
				/* translators: %d: number of reworded citations left alone. */
				_n(
					'Left %d reworded citation as it is.',
					'Left %d reworded citations as they are.',
					counts.reworded,
					'borges-bibliography-builder'
				),
				counts.reworded
			)
		);
	}

	if ( counts.missing ) {
		parts.push(
			sprintf(
				/* translators: %d: number of citations whose entry is gone. */
				_n(
					'%d citation points at an entry no longer in the bibliography.',
					'%d citations point at entries no longer in the bibliography.',
					counts.missing,
					'borges-bibliography-builder'
				),
				counts.missing
			)
		);
	}

	return parts.join( ' ' );
}

/**
 * Update the post's citations of one bibliography to its current style and
 * numbering (src/lib/citation-update.js).
 *
 * The changes go in as one `updateBlockAttributes()` call, so they are one
 * ordinary, undoable edit. The result is reported in an editor snackbar.
 *
 * @param {string} clientId The bibliography block's client ID.
 * @return {{
 *     getPlan: (includeReworded?: boolean) => ReturnType<typeof planCitationUpdates>,
 *     updateCitations: (includeReworded?: boolean) => Object,
 * }} Plan reader and updater.
 */
export function useCitationUpdates( clientId ) {
	const registry = useRegistry();

	const getPlan = useCallback(
		( includeReworded = false ) =>
			planCitationUpdates(
				registry.select( blockEditorStore ).getBlocks(),
				clientId,
				{ includeReworded }
			),
		[ clientId, registry ]
	);

	const updateCitations = useCallback(
		( includeReworded = false ) => {
			const { updates, counts } = getPlan( includeReworded );

			if ( updates.length ) {
				registry.dispatch( blockEditorStore ).updateBlockAttributes(
					updates.map( ( update ) => update.clientId ),
					Object.fromEntries(
						updates.map( ( update ) => [
							update.clientId,
							update.attributes,
						] )
					),
					true
				);
			}

			registry
				.dispatch( noticesStore )
				.createNotice(
					counts.missing ? 'warning' : 'success',
					getCitationUpdateMessage( counts, includeReworded ),
					{
						id: `borges-citation-update-${ clientId }`,
						type: 'snackbar',
					}
				);

			return counts;
		},
		[ clientId, getPlan, registry ]
	);

	return { getPlan, updateCitations };
}

import { __, _n, sprintf } from '@wordpress/i18n';
import { useMemo, useState } from '@wordpress/element';
import { useSelect } from '@wordpress/data';
import { store as blockEditorStore } from '@wordpress/block-editor';
import { Button, CheckboxControl, PanelBody } from '@wordpress/components';

import { planCitationUpdates } from '../lib/citation-update';

/**
 * Sidebar panel: how many in-text citations in the post link to this
 * bibliography, and a button that updates them to its current style and
 * numbering.
 *
 * The wording is for authors, not developers: "in-text citations" are the
 * links the Cite tool (the paragraph toolbar's More menu) inserts, "out of
 * date" is the `stale` count, and "edited by hand" is the `reworded` count
 * (src/lib/citation-update.js).
 *
 * It lives in its own component so only the panel, not the whole block,
 * re-renders as the post is edited.
 *
 * @param {Object}                     props
 * @param {string}                     props.clientId Bibliography block.
 * @param {(include: boolean) => void} props.onUpdate Runs the update.
 * @return {Element} Panel.
 */
export function CitationUpdatePanel( { clientId, onUpdate } ) {
	const [ includeReworded, setIncludeReworded ] = useState( false );
	const blocks = useSelect(
		( select ) => select( blockEditorStore ).getBlocks(),
		[]
	);
	const { counts } = useMemo(
		() => planCitationUpdates( blocks, clientId ),
		[ blocks, clientId ]
	);
	const lines = [];

	if ( counts.total ) {
		lines.push(
			sprintf(
				/* translators: %d: number of citations. */
				_n(
					'%d in-text citation in this post links to this bibliography.',
					'%d in-text citations in this post link to this bibliography.',
					counts.total,
					'borges-bibliography-builder'
				),
				counts.total
			)
		);

		lines.push(
			counts.stale
				? sprintf(
						/* translators: %d: number of citations. */
						_n(
							'%d is out of date with the current style or numbering.',
							'%d are out of date with the current style or numbering.',
							counts.stale,
							'borges-bibliography-builder'
						),
						counts.stale
					)
				: __( 'None need updating.', 'borges-bibliography-builder' )
		);

		if ( counts.reworded ) {
			lines.push(
				sprintf(
					/* translators: %d: number of citations. */
					_n(
						'%d was edited by hand.',
						'%d were edited by hand.',
						counts.reworded,
						'borges-bibliography-builder'
					),
					counts.reworded
				)
			);
		}
	} else {
		lines.push(
			__(
				"No in-text citations in this post link to this bibliography yet. To add one, select text in a paragraph, then choose Cite from the block toolbar's More menu.",
				'borges-bibliography-builder'
			)
		);
	}

	return (
		<PanelBody
			title={ __(
				'Citations in this post',
				'borges-bibliography-builder'
			) }
			className="bibliography-builder-citation-update-panel"
		>
			<p>{ lines.join( ' ' ) }</p>
			{ counts.total ? (
				<>
					<CheckboxControl
						__nextHasNoMarginBottom
						label={ __(
							'Also update citations I edited by hand',
							'borges-bibliography-builder'
						) }
						help={ __(
							'Your wording is replaced with the standard citation. Leave this unticked to keep it.',
							'borges-bibliography-builder'
						) }
						checked={ includeReworded }
						onChange={ setIncludeReworded }
					/>
					<Button
						__next40pxDefaultSize
						variant="secondary"
						onClick={ () => onUpdate( includeReworded ) }
					>
						{ __(
							'Update citations',
							'borges-bibliography-builder'
						) }
					</Button>
				</>
			) : null }
		</PanelBody>
	);
}

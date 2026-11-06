import { __, _n, sprintf } from '@wordpress/i18n';
import { useMemo, useState } from '@wordpress/element';
import { useSelect } from '@wordpress/data';
import { store as blockEditorStore } from '@wordpress/block-editor';
import { Button, CheckboxControl, PanelBody } from '@wordpress/components';

import { planCitationUpdates } from '../lib/citation-update';

/**
 * Sidebar panel: how many citations in the post point at this bibliography,
 * and a button that updates them to its current style and numbering.
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
					'%d citation in this post points at this bibliography.',
					'%d citations in this post point at this bibliography.',
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
							'%d does not match the current style.',
							'%d do not match the current style.',
							counts.stale,
							'borges-bibliography-builder'
						),
						counts.stale
					)
				: __(
						'Citations made with Cite match the current style.',
						'borges-bibliography-builder'
					)
		);

		if ( counts.reworded ) {
			lines.push(
				sprintf(
					/* translators: %d: number of citations. */
					_n(
						'%d has been reworded.',
						'%d have been reworded.',
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
				'No citations in this post point at this bibliography yet. Use Cite in any paragraph to add one.',
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
							'Also replace citations I reworded',
							'borges-bibliography-builder'
						) }
						help={ __(
							'Reworded citations are left alone unless this is ticked.',
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

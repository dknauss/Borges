/**
 * Block toolbar control for the `headingAlign` setting.
 *
 * The setting itself dates from 1.20.0, when it was a "Heading Alignment"
 * dropdown in the block sidebar. The toolbar is where core blocks such as
 * Heading and Paragraph put text alignment, so authors look for it there, and
 * moving it keeps the sidebar shorter. The attribute, its values, and the
 * saved markup are unchanged: `center` (the default) adds no class, `start`
 * adds `bibliography-builder-heading-align-start` (`getHeadingAlignClass()`).
 *
 * Core's `typography.textAlign` block support was considered instead (#275)
 * and not used: it stores physical `left`/`right` values in `style`, would
 * have moved a setting that had just shipped, and its support key has changed
 * names across the WordPress versions Borges supports (6.4 and later).
 *
 * The label says "Align heading" because a selected bibliography block holds
 * both the heading and the citation list, and only the heading moves.
 *
 * @since 1.21.0
 */

import { __, isRTL } from '@wordpress/i18n';
import { ToolbarDropdownMenu, ToolbarGroup } from '@wordpress/components';
import { alignCenter, alignLeft, alignRight } from '@wordpress/icons';

import { HEADING_ALIGNMENTS } from '../lib/heading-level';

/**
 * The control's choices, in the order the menu lists them.
 *
 * Start is drawn as left-aligned text in left-to-right languages and as
 * right-aligned text in right-to-left ones, since that is where it puts the
 * heading.
 *
 * @return {Array<{value: string, title: string, icon: Object}>} Choices.
 */
export function getHeadingAlignOptions() {
	return [
		{
			value: 'center',
			title: __( 'Center heading', 'borges-bibliography-builder' ),
			icon: alignCenter,
		},
		{
			value: 'start',
			title: __(
				'Align heading to the start (in line with the entries)',
				'borges-bibliography-builder'
			),
			icon: isRTL() ? alignRight : alignLeft,
		},
	];
}

/**
 * Toolbar dropdown that sets the bibliography heading's alignment.
 *
 * @param {Object}                  props          Component props.
 * @param {string}                  props.value    The `headingAlign` attribute. Anything but
 *                                                 `start` reads as `center`, as it renders.
 * @param {(value: string) => void} props.onChange Called with `center` or `start`.
 * @return {Element} The toolbar group.
 */
export function HeadingAlignControl( { value, onChange } ) {
	const current = HEADING_ALIGNMENTS.includes( value ) ? value : 'center';
	const options = getHeadingAlignOptions();
	const active = options.find( ( option ) => option.value === current );

	return (
		<ToolbarGroup>
			<ToolbarDropdownMenu
				icon={ active.icon }
				label={ __( 'Align heading', 'borges-bibliography-builder' ) }
				controls={ options.map( ( option ) => ( {
					title: option.title,
					icon: option.icon,
					isActive: option.value === current,
					role: 'menuitemradio',
					onClick: () => onChange( option.value ),
				} ) ) }
			/>
		</ToolbarGroup>
	);
}

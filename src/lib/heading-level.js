/**
 * Heading levels the block heading can take. 0, the `headingLevel` default,
 * keeps the paragraph the block has always printed, so blocks saved before the
 * setting existed stay valid.
 */
export const HEADING_LEVELS = Object.freeze( [ 2, 3, 4, 5, 6 ] );

/**
 * The element for the block heading at a `headingLevel` attribute value.
 *
 * Mirrored by bibliography_builder_save_heading_tag() in
 * includes/save-markup.php.
 *
 * @param {number} headingLevel The `headingLevel` attribute (an integer in `block.json`).
 * @return {string} `h2` to `h6`, or `p` for 0 and anything else.
 */
export function getHeadingTag( headingLevel ) {
	return HEADING_LEVELS.includes( headingLevel ) ? `h${ headingLevel }` : 'p';
}

/**
 * Values of the `headingAlign` attribute (since 1.20.0). `center`, the
 * default, adds no class, so blocks saved before the setting existed stay
 * valid and center as the stylesheet sets them.
 */
export const HEADING_ALIGNMENTS = Object.freeze( [ 'center', 'start' ] );

/**
 * The extra class for the block heading at a `headingAlign` attribute value.
 *
 * Mirrored by bibliography_builder_save_heading_align_class() in
 * includes/save-markup.php.
 *
 * @since 1.20.0
 *
 * @param {string} headingAlign The `headingAlign` attribute.
 * @return {string} `bibliography-builder-heading-align-start` for `start`, or
 *                  an empty string for `center` and anything else.
 */
export function getHeadingAlignClass( headingAlign ) {
	return headingAlign === 'start'
		? 'bibliography-builder-heading-align-start'
		: '';
}

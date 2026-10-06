/**
 * Heading levels the block heading can take. 0, the `headingLevel` default,
 * keeps the paragraph the block has always printed, so blocks saved before the
 * setting existed stay valid.
 */
export const HEADING_LEVELS = Object.freeze([2, 3, 4, 5, 6]);

/**
 * The element for the block heading at a `headingLevel` attribute value.
 *
 * Mirrored by bibliography_builder_save_heading_tag() in
 * includes/save-markup.php.
 *
 * @param {*} headingLevel The `headingLevel` attribute.
 * @return {string} `h2` to `h6`, or `p` for 0 and anything else.
 */
export function getHeadingTag(headingLevel) {
	return HEADING_LEVELS.includes(headingLevel) ? `h${headingLevel}` : 'p';
}

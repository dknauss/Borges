/**
 * Site-wide defaults for the output toggles (JSON-LD, COinS, CSL-JSON, and
 * the Cite / Export panel).
 *
 * A site sets them with the `bibliography_builder_output_defaults` PHP
 * filter, which reaches the editor as a block editor setting. They are
 * written into a newly inserted block as explicit attributes rather than by
 * changing the defaults in `block.json`: an attribute left at its default is
 * not saved, so changing a default would change how every existing block
 * parses and invalidate its saved markup.
 *
 * The same setting carries `headingLevel`, the heading a new block starts
 * with: an `<h2>` unless the site's `bibliography_builder_new_block_heading_level`
 * filter says otherwise, though `block.json` keeps 0 (a paragraph).
 */

export const OUTPUT_DEFAULTS_SETTING = 'bibliographyBuilderOutputDefaults';

export const OUTPUT_TOGGLE_KEYS = [
	'outputJsonLd',
	'outputCoins',
	'outputCslJson',
	'outputCiteExport',
];

/**
 * The heading level a new block starts with when the site sets none.
 */
export const NEW_BLOCK_HEADING_LEVEL = 2;

/**
 * Heading levels the block accepts: 0 (a paragraph) and 2 to 6.
 */
export const HEADING_LEVELS = [ 0, 2, 3, 4, 5, 6 ];

/**
 * Whether the block was just inserted: it has no ID and no citations yet.
 *
 * A block opened from a saved post, duplicated, or pasted already has a
 * `bibliographyId`, so its toggles are the author's and stay as they are.
 *
 * @param {Object} attributes Block attributes.
 * @return {boolean} Whether the block is new.
 */
export function isNewBibliographyBlock( attributes ) {
	return (
		! attributes?.bibliographyId &&
		( ! Array.isArray( attributes?.citations ) ||
			attributes.citations.length === 0 )
	);
}

/**
 * The changes that bring a new block in line with the site defaults: the
 * output toggles and the heading level.
 *
 * @param {Object} attributes   Block attributes.
 * @param {Object} siteDefaults Site defaults from the editor settings; when
 *                              missing, a new block still gets the default
 *                              heading level.
 * @return {Object|null} Attribute changes, or null when there are none.
 */
export function getOutputDefaultChanges( attributes, siteDefaults ) {
	if ( ! isNewBibliographyBlock( attributes ) ) {
		return null;
	}

	const defaults =
		siteDefaults && typeof siteDefaults === 'object' ? siteDefaults : {};
	const changes = {};
	const headingLevel = HEADING_LEVELS.includes( defaults.headingLevel )
		? defaults.headingLevel
		: NEW_BLOCK_HEADING_LEVEL;

	if ( headingLevel !== ( attributes.headingLevel ?? 0 ) ) {
		changes.headingLevel = headingLevel;
	}

	OUTPUT_TOGGLE_KEYS.forEach( ( key ) => {
		if (
			typeof defaults[ key ] === 'boolean' &&
			defaults[ key ] !== attributes[ key ]
		) {
			changes[ key ] = defaults[ key ];
		}
	} );

	return Object.keys( changes ).length > 0 ? changes : null;
}

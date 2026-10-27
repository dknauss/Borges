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
 */

export const OUTPUT_DEFAULTS_SETTING = 'bibliographyBuilderOutputDefaults';

export const OUTPUT_TOGGLE_KEYS = [
	'outputJsonLd',
	'outputCoins',
	'outputCslJson',
	'outputCiteExport',
];

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
 * The toggle changes that bring a new block in line with the site defaults.
 *
 * @param {Object} attributes   Block attributes.
 * @param {Object} siteDefaults Site defaults from the editor settings.
 * @return {Object|null} Attribute changes, or null when there are none.
 */
export function getOutputDefaultChanges( attributes, siteDefaults ) {
	if (
		! siteDefaults ||
		typeof siteDefaults !== 'object' ||
		! isNewBibliographyBlock( attributes )
	) {
		return null;
	}

	const changes = {};

	OUTPUT_TOGGLE_KEYS.forEach( ( key ) => {
		if (
			typeof siteDefaults[ key ] === 'boolean' &&
			siteDefaults[ key ] !== attributes[ key ]
		) {
			changes[ key ] = siteDefaults[ key ];
		}
	} );

	return Object.keys( changes ).length > 0 ? changes : null;
}

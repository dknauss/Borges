import styleData from '../../../includes/styles.json';

// The style table lives in includes/styles.json, which the PHP formatter, the
// PHP save() port, and the write routes read too.
//
// TODO(Epic-OSCOLA): OSCOLA convention requires bibliographies grouped by source type
// (cases, legislation, books, articles, online). Currently rendered as a single
// alphabetized list. See docs/planning/sort-conformance-plan.md Epic-OSCOLA section.

export const DEFAULT_CITATION_STYLE = styleData.defaultStyle;

export const STYLE_DEFINITIONS = Object.fromEntries(
	Object.entries( styleData.styles ).map( ( [ key, definition ] ) => [
		key,
		{ key, ...definition },
	] )
);

function emitStyleRegistryWarning( message ) {
	// eslint-disable-next-line no-console
	console?.warn?.( message );
}

/**
 * Get the style definition for a given style key.
 *
 * @param {string} [styleKey=DEFAULT_CITATION_STYLE] Style key.
 * @return {Object} Style definition object.
 *
 * @since 0.1.0
 */
export function getStyleDefinition( styleKey = DEFAULT_CITATION_STYLE ) {
	if ( styleKey && ! STYLE_DEFINITIONS[ styleKey ] ) {
		emitStyleRegistryWarning(
			`Unknown citation style "${ styleKey }". Falling back to ${ DEFAULT_CITATION_STYLE }.`
		);
	}

	return (
		STYLE_DEFINITIONS[ styleKey ] ||
		STYLE_DEFINITIONS[ DEFAULT_CITATION_STYLE ]
	);
}

/**
 * Get the list semantics (ol/ul) for a citation style.
 *
 * @param {string} [styleKey=DEFAULT_CITATION_STYLE] Style key.
 * @return {string} 'ol' or 'ul'.
 *
 * @since 0.1.0
 */
export function getListSemantics( styleKey = DEFAULT_CITATION_STYLE ) {
	return getStyleDefinition( styleKey ).listType;
}

/**
 * Get the heading placeholder text for a citation style.
 *
 * @param {string} [styleKey=DEFAULT_CITATION_STYLE] Style key.
 * @return {string} Heading placeholder text.
 *
 * @since 0.1.0
 */
export function getHeadingPlaceholder( styleKey = DEFAULT_CITATION_STYLE ) {
	return getStyleDefinition( styleKey ).headingPlaceholder || 'Bibliography';
}

export const getDefaultHeadingText = getHeadingPlaceholder;

/**
 * Get selectable styles for the inspector dropdown.
 *
 * @return {Array<{label: string, value: string}>} Selectable style options.
 *
 * @since 0.1.0
 */
export function getSelectableStyles() {
	return Object.values( STYLE_DEFINITIONS )
		.filter( ( definition ) => definition.enabled )
		.map( ( { key, label } ) => ( {
			label,
			value: key,
		} ) );
}

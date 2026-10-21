/**
 * Citation style definitions, shared with PHP.
 *
 * The table lives in `includes/styles.json` so the editor and the PHP
 * formatter, save port, and write routes read one copy (refactor memo,
 * Phase C). It sits in `includes/` because that folder ships in the release
 * ZIP and `src/` does not. Each entry carries:
 *
 * - `cslTemplate` and `cslLocale`: the CSL style and locale citeproc-php
 *   formats with. Harvard formats in en-GB (Cite Them Right is a UK style).
 * - `locale`: the collation locale for sorting, in JS and the PHP save port.
 * - `family`, `listType`, `inlineCitationMode`: display and sort semantics.
 * - `demoteNonDroppingParticle`: mirrors the style's CSL attribute;
 *   `name-particles.test.js` checks it against the XML.
 * - `headingPlaceholder`: the default heading, also used by the write routes.
 *
 * TODO(Epic-OSCOLA): OSCOLA convention requires bibliographies grouped by
 * source type (cases, legislation, books, articles, online). Currently
 * rendered as a single alphabetized list. See
 * docs/planning/sort-conformance-plan.md Epic-OSCOLA section.
 */
import styleData from '../../../includes/styles.json';

export const DEFAULT_CITATION_STYLE = styleData.defaultStyle;

export const STYLE_DEFINITIONS = styleData.styles;

function emitStyleRegistryWarning(message) {
	// eslint-disable-next-line no-console
	console?.warn?.(message);
}

/**
 * Get the style definition for a given style key.
 *
 * @param {string} [styleKey=DEFAULT_CITATION_STYLE] Style key.
 * @return {Object} Style definition object.
 *
 * @since 0.1.0
 */
export function getStyleDefinition(styleKey = DEFAULT_CITATION_STYLE) {
	if (styleKey && !STYLE_DEFINITIONS[styleKey]) {
		emitStyleRegistryWarning(
			`Unknown citation style "${styleKey}". Falling back to ${DEFAULT_CITATION_STYLE}.`
		);
	}

	return (
		STYLE_DEFINITIONS[styleKey] || STYLE_DEFINITIONS[DEFAULT_CITATION_STYLE]
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
export function getListSemantics(styleKey = DEFAULT_CITATION_STYLE) {
	return getStyleDefinition(styleKey).listType;
}

/**
 * Get the heading placeholder text for a citation style.
 *
 * @param {string} [styleKey=DEFAULT_CITATION_STYLE] Style key.
 * @return {string} Heading placeholder text.
 *
 * @since 0.1.0
 */
export function getHeadingPlaceholder(styleKey = DEFAULT_CITATION_STYLE) {
	return getStyleDefinition(styleKey).headingPlaceholder || 'Bibliography';
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
	return Object.values(STYLE_DEFINITIONS)
		.filter((definition) => definition.enabled)
		.map(({ key, label }) => ({
			label,
			value: key,
		}));
}

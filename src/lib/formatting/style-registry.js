export const DEFAULT_CITATION_STYLE = 'chicago-notes-bibliography';

export const STYLE_DEFINITIONS = {
	'chicago-notes-bibliography': {
		key: 'chicago-notes-bibliography',
		label: 'Chicago Notes-Bibliography',
		enabled: true,
		backend: 'csl',
		cslTemplate: 'chicago-notes-bibliography',
		listType: 'ul',
		family: 'notes',
		locale: 'en-US',
		inlineCitationMode: 'note',
		headingPlaceholder: 'Bibliography',
	},
	'chicago-author-date': {
		key: 'chicago-author-date',
		label: 'Chicago Author-Date',
		enabled: true,
		backend: 'csl',
		cslTemplate: 'chicago-author-date',
		listType: 'ul',
		family: 'author-date',
		locale: 'en-US',
		inlineCitationMode: 'parenthetical',
		headingPlaceholder: 'References',
	},
	'apa-7': {
		key: 'apa-7',
		label: 'APA 7',
		enabled: true,
		backend: 'csl',
		cslTemplate: 'apa',
		listType: 'ul',
		family: 'author-date',
		locale: 'en-US',
		inlineCitationMode: 'parenthetical',
		headingPlaceholder: 'References',
	},
	'mla-9': {
		key: 'mla-9',
		label: 'MLA 9',
		enabled: true,
		backend: 'csl',
		cslTemplate: 'modern-language-association',
		listType: 'ul',
		family: 'author-date',
		locale: 'en-US',
		inlineCitationMode: 'parenthetical',
		headingPlaceholder: 'Works Cited',
	},
	harvard: {
		key: 'harvard',
		label: 'Harvard',
		enabled: true,
		backend: 'csl',
		cslTemplate: 'harvard1',
		listType: 'ul',
		family: 'author-date',
		locale: 'en-US',
		inlineCitationMode: 'parenthetical',
		headingPlaceholder: 'References',
	},
	ieee: {
		key: 'ieee',
		label: 'IEEE',
		enabled: true,
		backend: 'csl',
		cslTemplate: 'ieee',
		listType: 'ol',
		family: 'numeric',
		locale: 'en-US',
		inlineCitationMode: 'numeric',
		headingPlaceholder: 'References',
	},
	vancouver: {
		key: 'vancouver',
		label: 'Vancouver',
		enabled: true,
		backend: 'csl',
		cslTemplate: 'vancouver',
		listType: 'ol',
		family: 'numeric',
		locale: 'en-US',
		inlineCitationMode: 'numeric',
		headingPlaceholder: 'References',
	},
	// TODO(Epic-OSCOLA): OSCOLA convention requires bibliographies grouped by source type
	// (cases, legislation, books, articles, online). Currently rendered as a single
	// alphabetized list. See docs/planning/sort-conformance-plan.md Epic-OSCOLA section.
	oscola: {
		key: 'oscola',
		label: 'OSCOLA',
		enabled: true,
		backend: 'csl',
		cslTemplate: 'oscola',
		listType: 'ul',
		family: 'notes',
		locale: 'en-GB',
		inlineCitationMode: 'note',
		headingPlaceholder: 'Bibliography',
	},
	abnt: {
		key: 'abnt',
		label: 'ABNT',
		enabled: true,
		backend: 'csl',
		cslTemplate: 'abnt',
		listType: 'ul',
		family: 'author-date',
		locale: 'pt-BR',
		inlineCitationMode: 'parenthetical',
		headingPlaceholder: 'Referências',
	},
};

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

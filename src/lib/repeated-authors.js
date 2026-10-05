/**
 * MLA 9 repeated authors.
 *
 * In an MLA works-cited list, an entry by exactly the same author or authors
 * as the entry before it replaces the names with three hyphens: "---. Title".
 * Every other bundled style writes the names out again, in its current
 * edition (see docs/csl-styles.md).
 *
 * The substitution depends on the order of the list, which the block decides
 * when it sorts at save time, so it is applied there rather than by the CSL
 * style. It is deliberately strict: an entry gets the hyphens only when its
 * author list matches the previous entry's field for field, it has no manual
 * display text, and the names it would replace are literally where both
 * entries start. Anything else keeps the full names.
 *
 * Mirrored by bibliography_builder_save_repeated_author_prefixes() in
 * includes/save-markup.php; the save-parity fixtures pin the two together.
 */

export const REPEATED_AUTHOR_STYLES = Object.freeze(['mla-9']);

export const REPEATED_AUTHOR_MARK = '---';

const NAME_KEYS = [
	'family',
	'given',
	'literal',
	'suffix',
	'dropping-particle',
	'non-dropping-particle',
];

function namePart(name, key) {
	return name && typeof name[key] === 'string' ? name[key] : '';
}

/**
 * A comparable key for a citation's author list, or null when it has none.
 *
 * @param {Object} citation Citation record.
 * @return {string|null} Key.
 */
function getAuthorKey(citation) {
	const authors = citation?.csl?.author;

	if (!Array.isArray(authors) || authors.length === 0) {
		return null;
	}

	return authors
		.map((name) =>
			NAME_KEYS.map((key) => namePart(name, key)).join('\u0001')
		)
		.join('\u0002');
}

/**
 * The text that ends the author part of an MLA entry: "et al." for three or
 * more authors, the second author's last name for two, and the first
 * author's given name (written after the family name) for one.
 *
 * @param {Array} authors CSL names.
 * @return {string} Text, or '' when it cannot be told.
 */
function getAuthorEnd(authors) {
	if (authors.length >= 3) {
		return 'et al.';
	}

	const name = authors[authors.length - 1];
	const candidates =
		authors.length === 2
			? ['suffix', 'literal', 'family']
			: ['suffix', 'given', 'literal', 'family'];

	for (const key of candidates) {
		const value = namePart(name, key);
		if (value !== '') {
			return value;
		}
	}

	return '';
}

/**
 * The author names an entry's display text starts with, without the period
 * after them, or null when they cannot be found.
 *
 * @param {Object} citation Citation record.
 * @param {string} text     Its display text.
 * @return {string|null} Names.
 */
function getAuthorPrefix(citation, text) {
	const authors = citation.csl.author;
	const end = getAuthorEnd(authors);
	const first =
		namePart(authors[0], 'literal') || namePart(authors[0], 'family');

	if (end === '' || first === '') {
		return null;
	}

	// Search for the names' closing period with them: two authors can share
	// a family name ("Smith, John, and Jane Smith."), and only the last one
	// is followed by it.
	const target = end.endsWith('.') ? end : `${end}.`;
	const index = text.indexOf(target);

	if (index === -1) {
		return null;
	}

	const prefix = text.slice(0, index + target.length - 1);

	return prefix.includes(first) ? prefix : null;
}

/**
 * For each citation in display order, the author names to replace with
 * three hyphens, or null.
 *
 * @param {Array}    citations   Citations in display order.
 * @param {string}   styleKey    Citation style.
 * @param {Function} displayText (citation) => its display text.
 * @return {Array<string|null>} Per-citation prefix.
 */
export function getRepeatedAuthorPrefixes(citations, styleKey, displayText) {
	if (!REPEATED_AUTHOR_STYLES.includes(styleKey)) {
		return citations.map(() => null);
	}

	return citations.map((citation, index) => {
		if (index === 0 || citation.displayOverride) {
			return null;
		}

		const previous = citations[index - 1];
		const key = getAuthorKey(citation);

		if (key === null || key !== getAuthorKey(previous)) {
			return null;
		}

		const text = displayText(citation);
		const prefix = getAuthorPrefix(citation, text);

		if (
			prefix === null ||
			!displayText(previous).startsWith(`${prefix}.`)
		) {
			return null;
		}

		return prefix;
	});
}

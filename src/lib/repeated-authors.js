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
 * display text, and both entries start with exactly the names the MLA style
 * writes for that list. Anything else keeps the full names.
 *
 * Mirrored by bibliography_builder_save_repeated_author_prefixes() in
 * includes/save-markup.php; the save-parity fixtures pin the two together.
 */

export const REPEATED_AUTHOR_STYLES = Object.freeze(['mla-9']);

export const REPEATED_AUTHOR_MARK = '---';

/**
 * The mark as saved: character references, not "-" characters. On the front
 * end wptexturize turns "---" into an em dash, and a "-" alone between tags
 * into an en dash; it never sees a hyphen written as "&#45;".
 */
export const REPEATED_AUTHOR_MARK_HTML = '&#45;&#45;&#45;';

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

function joinParts(parts) {
	return parts.filter((part) => part !== '').join(' ');
}

/**
 * A name as the MLA style writes the first author: "van Gogh, Vincent",
 * "Beauvoir, Simone de", "King, Martin Luther, Jr.".
 *
 * @param {Object} name CSL name.
 * @return {string} Name, or '' when it has no family name or literal.
 */
function getInvertedName(name) {
	const literal = namePart(name, 'literal');

	if (literal !== '') {
		return literal;
	}

	if (namePart(name, 'family') === '') {
		return '';
	}

	return [
		joinParts([
			namePart(name, 'non-dropping-particle'),
			namePart(name, 'family'),
		]),
		joinParts([
			namePart(name, 'given'),
			namePart(name, 'dropping-particle'),
		]),
		namePart(name, 'suffix'),
	]
		.filter((part) => part !== '')
		.join(', ');
}

/**
 * A name as the MLA style writes the second author: "James Doe Jr.".
 *
 * @param {Object} name CSL name.
 * @return {string} Name, or '' when it has no family name or literal.
 */
function getDisplayName(name) {
	const literal = namePart(name, 'literal');

	if (literal !== '') {
		return literal;
	}

	if (namePart(name, 'family') === '') {
		return '';
	}

	return joinParts([
		namePart(name, 'given'),
		namePart(name, 'dropping-particle'),
		namePart(name, 'non-dropping-particle'),
		namePart(name, 'family'),
		namePart(name, 'suffix'),
	]);
}

/**
 * The author names an MLA entry starts with, without the period after them:
 * "Smith, John", "Smith, John, and Jane Smith", "Kim, Ji-woo, et al", or null
 * when a name cannot be written.
 *
 * Built from the CSL names, not searched for in the text, so a title or a
 * suffix that repeats part of a name cannot be mistaken for the names.
 *
 * @param {Array} authors CSL names.
 * @return {string|null} Names.
 */
function getAuthorPrefix(authors) {
	const first = getInvertedName(authors[0]);
	let block = first;

	if (authors.length === 2) {
		const second = getDisplayName(authors[1]);
		block = second === '' ? '' : `${first}, and ${second}`;
	} else if (authors.length >= 3) {
		block = `${first}, et al.`;
	}

	if (first === '' || block === '') {
		return null;
	}

	// A name ending in a period ("Jr.", "et al.") shares it with the entry.
	return block.endsWith('.') ? block.slice(0, -1) : block;
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

		const prefix = getAuthorPrefix(citation.csl.author);

		if (
			prefix === null ||
			!displayText(citation).startsWith(`${prefix}.`) ||
			!displayText(previous).startsWith(`${prefix}.`)
		) {
			return null;
		}

		return prefix;
	});
}

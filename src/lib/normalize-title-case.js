/**
 * Normalize ALL-CAPS titles from resolved metadata.
 *
 * Some CrossRef and PubMed records return the work title (and occasionally the
 * container title) fully uppercased — e.g. CrossRef returns Turing's Mind paper
 * as `I.—COMPUTING MACHINERY AND INTELLIGENCE`. The block renders titles
 * verbatim, so these display shouting. This module title-cases fully-uppercase
 * titles while leaving anything already mixed-case (the common case, including
 * sentence-case article titles) untouched.
 *
 * Applied only to machine-resolved CSL (DOI / PMID / BibTeX / free text), never
 * to manual entry — see `normalizeResolvedCsl` in parser.js.
 *
 * Known limitation: acronyms inside an all-caps title cannot be distinguished
 * from ordinary words and flatten to title case (`DNA` -> `Dna`). Still better
 * than rendering the all-caps form, and only reached when the source itself is
 * all-caps (a mixed-case title keeps its casing and is left untouched).
 */

const TITLE_FIELDS = ['title', 'container-title'];

// Lowercased in title case unless first/last word or after a sentence break.
const TITLE_MINOR_WORDS = new Set([
	'a',
	'an',
	'and',
	'as',
	'at',
	'but',
	'by',
	'for',
	'if',
	'in',
	'nor',
	'of',
	'on',
	'or',
	'per',
	'the',
	'to',
	'v',
	'vs',
	'via',
	'with',
]);

function capitalizeSegments(word) {
	// Capitalize the first letter of each segment, treating spaces, hyphens,
	// dashes, colons and periods as segment boundaries so that "i.—computing"
	// -> "I.—Computing". Apostrophes are intentionally NOT boundaries here, so a
	// possessive stays lowercase ("women's" -> "Women's", not "Women'S").
	return word.replace(
		/(^|[\s\-—–:.])(\p{L})/gu,
		(match, separator, letter) => separator + letter.toUpperCase()
	);
}

/**
 * Title-case a fully-uppercase title string.
 *
 * @param {string} value Title text.
 * @return {string} Title-cased text, or the original value when it is not a
 *   fully-uppercase string.
 */
export function normalizeTitleCase(value) {
	if (typeof value !== 'string' || value === '') {
		return value;
	}

	// Any lowercase letter means the casing is intentional — leave it.
	if (/\p{Ll}/u.test(value)) {
		return value;
	}

	// No uppercase letter at all (punctuation, digits, caseless scripts).
	if (!/\p{Lu}/u.test(value)) {
		return value;
	}

	const tokens = value.toLowerCase().split(/(\s+)/);
	const wordIndices = [];
	tokens.forEach((token, index) => {
		if (token.trim() !== '') {
			wordIndices.push(index);
		}
	});

	const firstIndex = wordIndices[0];
	const lastIndex = wordIndices[wordIndices.length - 1];

	let forceNext = true;

	return tokens
		.map((token, index) => {
			if (token.trim() === '') {
				return token;
			}

			const bareWord = token.replace(/[^\p{L}]/gu, '');
			const isMinor = TITLE_MINOR_WORDS.has(bareWord);
			const force =
				forceNext || index === firstIndex || index === lastIndex;

			// A token ending in a sentence break starts a new clause/subtitle.
			forceNext = /[:.!?—–]$/u.test(token);

			if (isMinor && !force) {
				return token;
			}

			return capitalizeSegments(token);
		})
		.join('');
}

/**
 * Return a copy of a CSL object with ALL-CAPS titles title-cased.
 *
 * Only `title` and `container-title` are touched, and only when fully
 * uppercase. The input is not mutated.
 *
 * @param {Object} csl CSL-JSON object.
 * @return {Object} New CSL object with normalized title casing.
 */
export function normalizeCslTitleCase(csl) {
	if (!csl || typeof csl !== 'object') {
		return csl;
	}

	const result = { ...csl };

	for (const field of TITLE_FIELDS) {
		if (typeof result[field] === 'string') {
			result[field] = normalizeTitleCase(result[field]);
		}
	}

	return result;
}

/**
 * Normalize ALL-CAPS personal author names from resolved metadata.
 *
 * Some CrossRef and PubMed records return author family (and occasionally
 * given) names fully uppercased — e.g. `TURING`, `WATSON`. The block stores and
 * renders CSL names verbatim, so without normalization they surface as
 * `TURING, A. M.` in every style. This module title-cases such names while
 * leaving anything that is already mixed-case, dotted/concatenated initials,
 * caseless scripts (e.g. CJK), and organization `literal` names alone.
 *
 * Applied only to machine-resolved CSL (DOI / PMID / BibTeX / free text), never
 * to manual entry — see `normalizeResolvedCsl` in parser.js.
 */

const NAME_LIST_FIELDS = ['author', 'editor', 'reviewed-author'];

// Lowercase nobiliary particles kept lowercase when they appear inside a name.
const NAME_PARTICLES = new Set([
	'van',
	'von',
	'vom',
	'zu',
	'zur',
	'der',
	'den',
	'de',
	'del',
	'della',
	'di',
	'da',
	'das',
	'dos',
	'du',
	'la',
	'le',
	'el',
	'al',
	'bin',
	'ibn',
	'ter',
	'ten',
	'op',
]);

function titleCaseWord(word) {
	const lower = word.toLowerCase();

	if (NAME_PARTICLES.has(lower)) {
		return lower;
	}

	// Capitalize the first letter of each segment split on hyphen/apostrophe so
	// "smith-jones" -> "Smith-Jones" and "o'brien" -> "O'Brien".
	return lower.replace(
		/(^|[-'’])(\p{L})/gu,
		(match, separator, letter) => separator + letter.toUpperCase()
	);
}

/**
 * Title-case a single name token if it is fully uppercase.
 *
 * @param {string}  value                        Name token (family or given).
 * @param {Object}  [options]                    Options.
 * @param {boolean} [options.allowShortInitials] When true, leave short
 *                                               concatenated all-caps tokens (e.g. "JD", "FHC") untouched — appropriate for
 *                                               the given-name field, where such tokens are almost always initials.
 * @return {string} Normalized token (or the original value when not a string).
 */
export function normalizeNameToken(value, { allowShortInitials = false } = {}) {
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

	const letterRuns = value.match(/\p{L}+/gu) || [];

	// Dotted/spaced initials ("A. M.", "J. D.") — every letter run is a single
	// character. Leave these regardless of field.
	if (letterRuns.length > 0 && letterRuns.every((run) => run.length === 1)) {
		return value;
	}

	// Given field: also leave short concatenated initials ("JD", "FHC").
	if (allowShortInitials) {
		const letterCount = letterRuns.reduce(
			(total, run) => total + run.length,
			0
		);

		if (letterCount > 0 && letterCount <= 3) {
			return value;
		}
	}

	return value.replace(/\p{L}[\p{L}'’.-]*/gu, titleCaseWord);
}

function normalizeNameEntry(name) {
	if (!name || typeof name !== 'object') {
		return name;
	}

	const next = { ...name };

	if (typeof next.family === 'string') {
		next.family = normalizeNameToken(next.family);
	}

	if (typeof next.given === 'string') {
		next.given = normalizeNameToken(next.given, {
			allowShortInitials: true,
		});
	}

	return next;
}

/**
 * Return a copy of a CSL object with ALL-CAPS personal author names title-cased.
 *
 * Only `author`, `editor`, and `reviewed-author` name lists are touched, and
 * within each entry only `family` and `given` — never `literal` (organizations),
 * to avoid mangling acronyms like "IEEE". The input is not mutated.
 *
 * @param {Object} csl CSL-JSON object.
 * @return {Object} New CSL object with normalized name casing.
 */
export function normalizeCslNameCase(csl) {
	if (!csl || typeof csl !== 'object') {
		return csl;
	}

	const result = { ...csl };

	for (const field of NAME_LIST_FIELDS) {
		if (Array.isArray(result[field])) {
			result[field] = result[field].map(normalizeNameEntry);
		}
	}

	return result;
}

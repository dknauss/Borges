/**
 * BibTeX/BibLaTeX field normalization applied after citation-js parsing.
 *
 * citation-js maps BibLaTeX natively (`date`, `journaltitle`, `location`,
 * `urldate`, `@online`, `@report`, ...), but these fields reach CSL in a shape
 * Borges cannot use as-is, or not at all:
 *
 * - `langid` / `language` carry babel/polyglossia names ("ngerman",
 *   "american") that citation-js copies verbatim into CSL `language`, which
 *   `save()` then writes into the HTML `lang` attribute. Those names are not
 *   BCP 47 tags, so assistive technology would receive an invalid language.
 * - `eprint` with `eprinttype = {arxiv}` (or BibTeX's `archiveprefix`) is
 *   dropped entirely, leaving arXiv preprints with no link.
 * - `type` in EndNote's BibTeX export holds EndNote's reference-type name
 *   ("Journal Article"), which would otherwise surface as CSL `genre`.
 * - `city` is where Mendeley's BibTeX export writes the place of publication,
 *   instead of `address` or `location`, so citation-js drops it. It is renamed
 *   before parsing (`renameBibtexCityField()`), so citation-js decodes it
 *   like any other field.
 */

// Babel and polyglossia language names, lowercased, mapped to BCP 47 tags.
// Only unambiguous names are listed; anything else is dropped rather than
// guessed, because an absent `lang` attribute is correct and a wrong one is not.
const BABEL_LANGUAGE_TAGS = {
	afrikaans: 'af',
	american: 'en-US',
	arabic: 'ar',
	australian: 'en-AU',
	austrian: 'de-AT',
	basque: 'eu',
	bengali: 'bn',
	brazil: 'pt-BR',
	brazilian: 'pt-BR',
	british: 'en-GB',
	bulgarian: 'bg',
	canadian: 'en-CA',
	catalan: 'ca',
	chinese: 'zh',
	croatian: 'hr',
	czech: 'cs',
	danish: 'da',
	dutch: 'nl',
	english: 'en',
	estonian: 'et',
	farsi: 'fa',
	finnish: 'fi',
	francais: 'fr',
	french: 'fr',
	galician: 'gl',
	german: 'de',
	greek: 'el',
	hebrew: 'he',
	hindi: 'hi',
	hungarian: 'hu',
	icelandic: 'is',
	indonesian: 'id',
	irish: 'ga',
	italian: 'it',
	japanese: 'ja',
	korean: 'ko',
	latin: 'la',
	latvian: 'lv',
	lithuanian: 'lt',
	magyar: 'hu',
	naustrian: 'de-AT',
	newzealand: 'en-NZ',
	ngerman: 'de',
	norsk: 'nb',
	norwegian: 'nb',
	nswissgerman: 'de-CH',
	nynorsk: 'nn',
	persian: 'fa',
	polish: 'pl',
	portuges: 'pt',
	portuguese: 'pt',
	romanian: 'ro',
	russian: 'ru',
	serbian: 'sr',
	slovak: 'sk',
	slovene: 'sl',
	slovenian: 'sl',
	spanish: 'es',
	swedish: 'sv',
	swissgerman: 'de-CH',
	tamil: 'ta',
	telugu: 'te',
	thai: 'th',
	turkish: 'tr',
	ukenglish: 'en-GB',
	ukrainian: 'uk',
	usenglish: 'en-US',
	vietnamese: 'vi',
	welsh: 'cy',
};

// Syntactic BCP 47 check: a 2-3 letter primary subtag plus optional subtags.
// Babel names are all longer than three letters, so they never pass.
const BCP47_TAG_PATTERN = /^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/iu;

// Modern (2301.00001, optional version) and legacy (hep-th/9901001) arXiv IDs.
const ARXIV_ID_PATTERN =
	/^(?:\d{4}\.\d{4,5}|[a-z-]+(?:\.[a-z]{2})?\/\d{7})(?:v\d+)?$/iu;

/**
 * Convert a BibTeX/BibLaTeX language value to a BCP 47 tag.
 *
 * @param {*} value CSL `language` value produced by citation-js.
 * @return {string|undefined} A BCP 47 tag, or undefined when none applies.
 */
export function normalizeBibtexLanguage(value) {
	if (typeof value !== 'string') {
		return undefined;
	}

	const trimmed = value.trim();

	if (BCP47_TAG_PATTERN.test(trimmed)) {
		return trimmed;
	}

	return BABEL_LANGUAGE_TAGS[trimmed.toLowerCase()];
}

/**
 * Read a single field value from one raw BibTeX/BibLaTeX entry.
 *
 * Handles `{braced}`, `"quoted"`, and bare values; nested braces are not
 * needed for the identifier-like fields this is used for.
 *
 * @param {string} rawEntry  Raw entry text.
 * @param {string} fieldName Field name, matched case-insensitively.
 * @return {string|undefined} The field value, or undefined when absent.
 */
function readRawField(rawEntry, fieldName) {
	const match = rawEntry.match(
		new RegExp(
			`[,{\\s]${fieldName}\\s*=\\s*(?:\\{([^{}]*)\\}|"([^"]*)"|([^,}\\s]+))`,
			'iu'
		)
	);

	if (!match) {
		return undefined;
	}

	const value = (match[1] ?? match[2] ?? match[3]).trim();
	return value || undefined;
}

/**
 * Build an arXiv abstract URL from a raw entry's eprint fields.
 *
 * @param {string} rawEntry Raw entry text.
 * @return {string|undefined} The arXiv URL, or undefined when not applicable.
 */
export function getArxivUrlFromRawEntry(rawEntry) {
	if (typeof rawEntry !== 'string') {
		return undefined;
	}

	const archive =
		readRawField(rawEntry, 'eprinttype') ||
		readRawField(rawEntry, 'archiveprefix');

	if (!archive || archive.toLowerCase() !== 'arxiv') {
		return undefined;
	}

	const eprint = readRawField(rawEntry, 'eprint')?.replace(/^arxiv:/iu, '');

	if (!eprint || !ARXIV_ID_PATTERN.test(eprint)) {
		return undefined;
	}

	return `https://arxiv.org/abs/${eprint}`;
}

// EndNote's BibTeX export writes its own reference-type name into `type`
// (`type = {Journal Article}`), which citation-js maps to CSL `genre`. Styles
// that print genre would then show "Book Section" or "Conference Proceedings"
// in the citation. Only names that are EndNote reference types and never a
// real genre are listed; "Thesis" and "Report" can be genuine, so they stay.
const ENDNOTE_REFERENCE_TYPES = new Set([
	'book',
	'book section',
	'conference paper',
	'conference proceedings',
	'edited book',
	'electronic article',
	'electronic book',
	'electronic book section',
	'generic',
	'journal article',
	'magazine article',
	'newspaper article',
	'web page',
]);

// citation-js turns `@mastersthesis`, `@phdthesis`, and `@techreport`, and a
// BibLaTeX `type` field holding one of the standard type keys (`mathesis`,
// `patentde`), into a CSL `genre` that is the bare key, so a style that prints
// genre would show "[mathesis]". These are the BibLaTeX manual's type keys,
// with the localized strings biblatex prints for them (the same labels
// citation-js uses when it exports them).
const BIBLATEX_TYPE_KEY_LABELS = {
	bathesis: "Bachelor's thesis",
	mathesis: "Master's thesis",
	phdthesis: 'PhD thesis',
	candthesis: 'Candidate thesis',
	techreport: 'technical report',
	resreport: 'research report',
	software: 'computer software',
	datacd: 'data CD',
	audiocd: 'audio CD',
	patent: 'patent',
	patentde: 'German patent',
	patenteu: 'European patent',
	patentfr: 'French patent',
	patentuk: 'British patent',
	patentus: 'U.S. patent',
	patreq: 'patent request',
	patreqde: 'German patent request',
	patreqeu: 'European patent request',
	patreqfr: 'French patent request',
	patrequk: 'British patent request',
	patrequs: 'U.S. patent request',
};

/**
 * Apply BibTeX/BibLaTeX-specific CSL fixes to one citation-js result.
 *
 * @param {Object} csl      CSL item produced by citation-js.
 * @param {string} rawEntry The single raw entry it was parsed from.
 * @return {Object} A new CSL item with normalized fields.
 */
export function normalizeBibtexCsl(csl, rawEntry) {
	const normalized = { ...csl };

	if (
		typeof normalized.genre === 'string' &&
		ENDNOTE_REFERENCE_TYPES.has(normalized.genre.trim().toLowerCase())
	) {
		delete normalized.genre;
	}

	if (typeof normalized.genre === 'string') {
		const typeKey = normalized.genre.trim().toLowerCase();

		if (
			Object.prototype.hasOwnProperty.call(
				BIBLATEX_TYPE_KEY_LABELS,
				typeKey
			)
		) {
			normalized.genre = BIBLATEX_TYPE_KEY_LABELS[typeKey];
		}
	}

	if ('language' in normalized) {
		const language = normalizeBibtexLanguage(normalized.language);

		if (language) {
			normalized.language = language;
		} else {
			delete normalized.language;
		}
	}

	if (!normalized.URL) {
		const arxivUrl = getArxivUrlFromRawEntry(rawEntry);

		if (arxivUrl) {
			normalized.URL = arxivUrl;
		}
	}

	return normalized;
}

const BIBTEX_MACRO_TYPES = new Set(['string', 'comment', 'preamble']);
const BIBTEX_BLOCK_START_REGEX = /@\s*([a-z][\w-]*)\s*\{/iuy;
const BIBTEX_FIELD_NAME_REGEX = /\s*([a-z][\w:.+-]*)\s*=/iuy;

/**
 * Find the index past the brace that closes the block opened at `open`.
 *
 * @param {string} value BibTeX text.
 * @param {number} open  Index of the block's opening brace.
 * @return {number} Index after the closing brace, or the text length when
 *                  the block is never closed.
 */
function findBibtexBlockEnd(value, open) {
	let depth = 0;

	for (let index = open; index < value.length; index++) {
		if (value[index] === '{') {
			depth++;
		} else if (value[index] === '}') {
			depth--;

			if (depth === 0) {
				return index + 1;
			}
		}
	}

	return value.length;
}

/**
 * Find the opening brace of the first entry that is not a macro block.
 *
 * Only `@` signs outside every block count, so text inside a field value or
 * an `@string` macro (`title = {On @book{} keys}`) never starts an entry.
 *
 * @param {string} value BibTeX segment text.
 * @return {number} Index of the entry's opening brace, or -1.
 */
function findBibtexEntryOpenBrace(value) {
	let index = 0;

	while (index < value.length) {
		const at = value.indexOf('@', index);

		if (at === -1) {
			return -1;
		}

		BIBTEX_BLOCK_START_REGEX.lastIndex = at;
		const match = BIBTEX_BLOCK_START_REGEX.exec(value);

		if (!match) {
			index = at + 1;
			continue;
		}

		const open = at + match[0].length - 1;

		if (!BIBTEX_MACRO_TYPES.has(match[1].toLowerCase())) {
			return open;
		}

		index = findBibtexBlockEnd(value, open);
	}

	return -1;
}

/**
 * List an entry's field names and where each one starts.
 *
 * Walks the entry from its opening brace and reads a name only where BibTeX
 * allows one: right after the brace (a keyless entry) or after a comma, at
 * the entry's own brace depth and outside a quoted value. Text inside a value
 * (`title = {Why city = culture matters}`) is never read as a field name.
 *
 * @param {string} value BibTeX text.
 * @param {number} open  Index of the entry's opening brace.
 * @return {Array<{name: string, index: number}>} Lowercased names, in order,
 *         with the index of each name's first character.
 */
function getBibtexFieldNames(value, open) {
	const fields = [];
	let depth = 0;
	let inQuotes = false;

	for (let index = open; index < value.length; index++) {
		const char = value[index];

		if (char === '{') {
			depth++;
		} else if (char === '}') {
			depth--;

			if (depth === 0) {
				break;
			}
		} else if (char === '"' && depth === 1) {
			inQuotes = !inQuotes;
		}

		const startsField =
			depth === 1 &&
			!inQuotes &&
			((char === '{' && index === open) || char === ',');

		if (!startsField) {
			continue;
		}

		BIBTEX_FIELD_NAME_REGEX.lastIndex = index + 1;
		const match = BIBTEX_FIELD_NAME_REGEX.exec(value);

		if (match) {
			fields.push({
				name: match[1].toLowerCase(),
				index: index + 1 + match[0].indexOf(match[1]),
			});
		}
	}

	return fields;
}

/**
 * Rename Mendeley's `city` field to `address` in a segment's entry.
 *
 * A segment is one entry, after any `@string` macros, so only that entry is
 * changed. Only real field names are matched, never text inside a value,
 * and an entry that already has an `address` or `location` field is left
 * alone.
 *
 * @param {string} value BibTeX segment text.
 * @return {string} The segment with `city` read as `address`.
 */
export function renameBibtexCityField(value) {
	const open = findBibtexEntryOpenBrace(value);

	if (open === -1) {
		return value;
	}

	const fields = getBibtexFieldNames(value, open);

	if (fields.some(({ name }) => name === 'address' || name === 'location')) {
		return value;
	}

	const city = fields.find(({ name }) => name === 'city');

	if (!city) {
		return value;
	}

	return (
		value.slice(0, city.index) +
		'address' +
		value.slice(city.index + 'city'.length)
	);
}

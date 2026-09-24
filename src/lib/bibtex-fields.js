/**
 * BibTeX/BibLaTeX field normalization applied after citation-js parsing.
 *
 * citation-js maps BibLaTeX natively (`date`, `journaltitle`, `location`,
 * `urldate`, `@online`, `@report`, ...), but two fields reach CSL in a shape
 * Borges cannot use as-is:
 *
 * - `langid` / `language` carry babel/polyglossia names ("ngerman",
 *   "american") that citation-js copies verbatim into CSL `language`, which
 *   `save()` then writes into the HTML `lang` attribute. Those names are not
 *   BCP 47 tags, so assistive technology would receive an invalid language.
 * - `eprint` with `eprinttype = {arxiv}` (or BibTeX's `archiveprefix`) is
 *   dropped entirely, leaving arXiv preprints with no link.
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

/**
 * Apply BibTeX/BibLaTeX-specific CSL fixes to one citation-js result.
 *
 * @param {Object} csl      CSL item produced by citation-js.
 * @param {string} rawEntry The single raw entry it was parsed from.
 * @return {Object} A new CSL item with normalized fields.
 */
export function normalizeBibtexCsl(csl, rawEntry) {
	const normalized = { ...csl };

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

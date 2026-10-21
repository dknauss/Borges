/**
 * Identifier detection for pasted input: the patterns and normalizers for DOIs,
 * PMIDs, PMCIDs, arXiv IDs, ISBNs, OCLC numbers, LCCNs, Open Library and
 * Internet Archive IDs, and identifiers embedded in a longer citation.
 *
 * Split from parser.js (refactor memo, Phase E); parser.js re-exports the
 * public names, so importers are unchanged.
 */

export const DOI_ONLY_REGEX =
	/^(?:(?:https?:\/\/)?(?:dx\.)?doi\.org\/|(?:https?:\/\/)?doi:)?10\.\d{4,}\/[^\s]+$/i;
export const BIBTEX_REGEX = /@\w+\{/;
export const PMID_REGEX = /^PMID:\s*(\d{1,8})$/i;
// PMCID: the `PMC` prefix is what distinguishes it from a PMID, so it is
// required; the `PMCID:` label is optional.
export const PMCID_REGEX = /^(?:PMCID:\s*)?PMC(\d{1,9})$/i;
// Unanchored variants — find an identifier anywhere inside a longer free-text string.
// EMBEDDED_DOI_REGEX: requires registrant prefix (10.\d{4,}/) plus at least one path
// character to avoid matching bare decimals or chapter references like "Chapter 10.".
const EMBEDDED_DOI_REGEX =
	/(?:(?:https?:\/\/)?(?:dx\.)?doi\.org\/|(?:https?:\/\/)?doi:|(?<!\w))10\.\d{4,}\/[^\s]+/iu;
// EMBEDDED_PMID_REGEX: requires the "PMID" label (colon or space form) to avoid
// matching bare 8-digit numbers in page ranges, ISBNs, and phone numbers.
const EMBEDDED_PMID_REGEX = /\bPMID[:\s]\s*(\d{1,8})\b/iu;
// EMBEDDED_PMCID_REGEX: `PMC` plus at least four digits, which is how PMCIDs
// appear in published reference lists (with or without a `PMCID:` label).
const EMBEDDED_PMCID_REGEX = /\bPMC(\d{4,9})\b/u;
// arXiv IDs: modern `2301.00001` or legacy `hep-th/9901001`, optional `vN`.
// Mirrors BIBLIOGRAPHY_BUILDER_ARXIV_ID_PATTERN in bibliography-builder.php.
const ARXIV_ID_SOURCE =
	'(?:\\d{4}\\.\\d{4,5}|[a-z-]+(?:\\.[a-z]{2})?\\/\\d{7})(?:v\\d+)?';
const ARXIV_URL_PREFIX_SOURCE =
	'(?:https?:\\/\\/)?(?:www\\.|export\\.)?arxiv\\.org\\/(?:abs|pdf)\\/';
// Standalone: `arXiv:ID` or an arxiv.org abs/pdf URL. A bare `2301.00001` is
// not accepted; without the label it is indistinguishable from a number.
const ARXIV_REGEX = new RegExp(
	`^(?:arxiv:\\s*|${ARXIV_URL_PREFIX_SOURCE})(${ARXIV_ID_SOURCE})(?:\\.pdf)?\\/?$`,
	'iu'
);
// The lookbehind keeps an embedded link from matching inside a longer
// hostname: `evilarxiv.org/abs/…` or `mirror.arxiv.org/abs/…` is not arXiv.
const EMBEDDED_ARXIV_REGEX = new RegExp(
	`(?:\\barxiv:\\s*|(?<![\\w.-])${ARXIV_URL_PREFIX_SOURCE})(${ARXIV_ID_SOURCE})`,
	'iu'
);
// arXiv's own DataCite DOIs (10.48550/arXiv.ID) are not in CrossRef, so they
// resolve through the arXiv backend instead of the DOI one.
const ARXIV_DOI_REGEX = new RegExp(
	`^(?:(?:https?:\\/\\/)?(?:dx\\.)?doi\\.org\\/|doi:)?10\\.48550\\/arxiv\\.(${ARXIV_ID_SOURCE})$`,
	'iu'
);
// Standalone ISBN: an `ISBN`/`ISBN-10`/`ISBN-13` label with either length, or
// a bare 978/979 ISBN-13. A bare ISBN-10 is never accepted: too many ordinary
// 10-digit numbers pass its checksum by chance. Checksums are verified in
// normalizeIsbn(); these patterns only find candidates.
const LABELED_ISBN_REGEX =
	/^ISBN(?:-1[03])?:?\s*([0-9][0-9\s-]{8,15}[0-9X])$/iu;
const BARE_ISBN13_REGEX = /^(97[89][0-9\s-]{10,14})$/u;
const EMBEDDED_ISBN_REGEX =
	/\bISBN(?:-1[03])?:?\s*([0-9][0-9\s-]{8,15}[0-9X])\b/iu;
// Library catalog numbers must carry a label or come as a catalog URL: a bare
// OCLC number or LCCN is indistinguishable from a PMID or any other number.
// These patterns mirror bibliography_builder_normalize_catalog_key().
const OCLC_INPUT_REGEX =
	/^(?:urn:oclc:record:|\(OCoLC\)\s*|OC(?:o)?LC\s*(?:#|no\.?|number)?\s*:?\s*)(?:ocm|ocn|on)?0*([1-9]\d{0,11})$/iu;
const WORLDCAT_URL_REGEX =
	/^(?:https?:\/\/)?(?:www\.|search\.)?worldcat\.org\/(?:title\/(?:[^/?#\s]+\/oclc\/)?|oclc\/)0*([1-9]\d{0,11})(?:[/?#]\S*)?$/iu;
const LCCN_INPUT_REGEX = /^LCCN\s*:?\s*(.+)$/iu;
const LCCN_URL_REGEX =
	/^(?:https?:\/\/)?lccn\.loc\.gov\/([a-z0-9-]+)(?:[/?#]\S*)?$/iu;
const OPEN_LIBRARY_EDITION_REGEX =
	/^(?:(?:https?:\/\/)?(?:www\.)?openlibrary\.org\/books\/|OLID\s*:?\s*)?(OL[1-9]\d{0,9}M)(?:[/?#]\S*)?$/iu;
export const OPEN_LIBRARY_WORK_REGEX =
	/^(?:(?:https?:\/\/)?(?:www\.)?openlibrary\.org\/works\/|OLID\s*:?\s*)?OL[1-9]\d{0,9}W(?:[/?#]\S*)?$/iu;
export const OPEN_LIBRARY_WORK_ERROR = 'Open Library work ID';
// Internet Archive items: an archive.org item URL, an `ia:` label, or an
// Internet Archive ARK (name assigning authority 13960). A bare identifier is
// never accepted: it is just a word.
const ARCHIVE_URL_REGEX =
	/^(?:https?:\/\/)?(?:www\.)?archive\.org\/(?:details|embed|download|stream)\/([A-Za-z0-9][A-Za-z0-9._-]{0,99})(?:[/?#]\S*)?$/u;
const ARCHIVE_LABEL_REGEX = /^ia:\s*([A-Za-z0-9][A-Za-z0-9._-]{0,99})$/iu;
const ARCHIVE_ARK_REGEX =
	/^(?:(?:https?:\/\/)?(?:n2t\.net|(?:www\.)?archive\.org(?:\/details)?)\/)?ark:\/?13960\/([a-z0-9]{1,40})\/?$/iu;

export function normalizePmidInput(value) {
	return value.replace(/^PMID:\s*/iu, '').trim();
}

export function normalizePmcidInput(value) {
	return value.replace(/^(?:PMCID:\s*)?PMC/iu, '').trim();
}

export function normalizeDoiInput(value) {
	return value
		.trim()
		.replace(/[).,;:\s]+$/u, '')
		.replace(/^(?:https?:\/\/)?doi:/iu, '');
}

export function normalizeDoiValueForLookup(value) {
	return normalizeDoiInput(value)
		.toLowerCase()
		.replace(/^(?:https?:\/\/)?(?:dx\.)?doi\.org\//u, '');
}

/**
 * Scan `chunk` for an embedded DOI, labeled PMID, or PMCID.
 *
 * DOI is preferred over PMID when both are present (DOI resolves via CrossRef
 * and returns richer structured metadata). PMCID is tried last: a PMID
 * resolves the same article through PubMed, and the unlabeled `PMC1234` form
 * is the least specific of the three patterns. Only the first match is
 * extracted — one citation, one identifier.
 *
 * @param {string} chunk Free-text citation string (already trimmed).
 * @return {{ format: 'doi'|'pmid'|'pmcid'|'arxiv'|'isbn', value: string, rawValue: string } | null} Extracted identifier result, or null if none found.
 */
export function extractEmbeddedIdentifier(chunk) {
	// DOI first — higher authority than PMID when both co-occur.
	const doiMatch = chunk.match(EMBEDDED_DOI_REGEX);
	if (doiMatch) {
		const arxivIdFromDoi = getArxivId(doiMatch[0]);

		if (arxivIdFromDoi) {
			return {
				format: 'arxiv',
				value: `arXiv:${arxivIdFromDoi}`,
				rawValue: chunk,
			};
		}

		return {
			format: 'doi',
			// Strip trailing punctuation (.,;:) and any doi: URL prefix via the
			// existing normalizeDoiInput helper. Preserves the https://doi.org/ form.
			value: normalizeDoiInput(doiMatch[0]),
			rawValue: chunk,
		};
	}

	// PMID second — label required to avoid false positives on bare numbers.
	const pmidMatch = chunk.match(EMBEDDED_PMID_REGEX);
	if (pmidMatch) {
		return {
			format: 'pmid',
			// Normalized to the PMID:NNNN form that PARSER_BACKENDS.pmid expects.
			value: `PMID:${pmidMatch[1]}`,
			rawValue: chunk,
		};
	}

	const pmcidMatch = chunk.match(EMBEDDED_PMCID_REGEX);
	if (pmcidMatch) {
		return {
			format: 'pmcid',
			value: `PMC${pmcidMatch[1]}`,
			rawValue: chunk,
		};
	}

	const arxivMatch = chunk.match(EMBEDDED_ARXIV_REGEX);
	if (arxivMatch) {
		return {
			format: 'arxiv',
			value: `arXiv:${arxivMatch[1]}`,
			rawValue: chunk,
		};
	}

	// ISBN last: a book DOI or PMID carries richer metadata when present.
	const isbnMatch = chunk.match(EMBEDDED_ISBN_REGEX);
	const embeddedIsbn = isbnMatch ? normalizeIsbn(isbnMatch[1]) : null;
	if (embeddedIsbn) {
		return {
			format: 'isbn',
			value: `ISBN ${embeddedIsbn}`,
			rawValue: chunk,
		};
	}

	return null;
}

/**
 * Extract a bare arXiv ID from an `arXiv:` label, arxiv.org URL, or arXiv DOI.
 *
 * @param {string} value Standalone identifier text.
 * @return {string|null} The arXiv ID, or null when the value is not one.
 */
export function getArxivId(value) {
	const trimmed = value.trim();
	const match =
		trimmed.match(ARXIV_REGEX) ||
		normalizeDoiInput(trimmed).match(ARXIV_DOI_REGEX);

	return match ? match[1] : null;
}

/**
 * Reduce ISBN text to a checksum-valid ISBN-13.
 *
 * Mirrors bibliography_builder_normalize_isbn() in bibliography-builder.php.
 *
 * @param {string} value Digits (with optional hyphens/spaces), ISBN-10 or -13.
 * @return {string|null} The ISBN-13, or null when the checksum fails.
 */
export function normalizeIsbn(value) {
	const isbn = String(value).replace(/[\s-]/gu, '').toUpperCase();

	const isbn13CheckDigit = (firstTwelve) => {
		let sum = 0;
		for (let i = 0; i < 12; i++) {
			sum += Number(firstTwelve[i]) * (i % 2 === 0 ? 1 : 3);
		}
		return String((10 - (sum % 10)) % 10);
	};

	if (/^\d{9}[\dX]$/u.test(isbn)) {
		let sum = 0;
		for (let i = 0; i < 10; i++) {
			sum += (isbn[i] === 'X' ? 10 : Number(isbn[i])) * (10 - i);
		}
		if (sum % 11 !== 0) {
			return null;
		}
		const base = `978${isbn.slice(0, 9)}`;
		return base + isbn13CheckDigit(base);
	}

	if (/^97[89]\d{10}$/u.test(isbn)) {
		return isbn13CheckDigit(isbn.slice(0, 12)) === isbn[12] ? isbn : null;
	}

	return null;
}

export function getStandaloneIsbn(value) {
	const trimmed = value.trim();
	const match =
		trimmed.match(LABELED_ISBN_REGEX) || trimmed.match(BARE_ISBN13_REGEX);

	return match ? normalizeIsbn(match[1]) : null;
}

/**
 * Normalize an LCCN to Library of Congress's normalized form.
 *
 * Mirrors bibliography_builder_normalize_lccn() in includes/resolvers.php.
 *
 * @param {string} value Raw LCCN.
 * @return {string|null} The normalized LCCN, or null when it is not one.
 */
export function normalizeLccn(value) {
	let lccn = String(value)
		.replace(/\s+/gu, '')
		.toLowerCase()
		.replace(/\/.*$/u, '');
	const hyphenated = lccn.match(/^([a-z]{0,3}(?:\d{2}|\d{4}))-(\d{1,6})$/u);

	if (hyphenated) {
		lccn = hyphenated[1] + hyphenated[2].padStart(6, '0');
	}

	// A normalized LCCN is a two- or four-digit year plus a six-digit serial.
	return /^[a-z]{0,3}(?:\d{8}|\d{10})$/u.test(lccn) ? lccn : null;
}

/**
 * Reduce a library catalog number to an Open Library Books API key.
 *
 * Accepts a labelled OCLC number, a WorldCat URL, a labelled LCCN, an
 * lccn.loc.gov URL, or an Open Library edition ID or URL. Mirrors
 * bibliography_builder_normalize_catalog_key() in includes/resolvers.php.
 *
 * @param {string} value Standalone identifier text.
 * @return {string|null} `OCLC:…`, `LCCN:…`, or `OLID:…`; null when not one.
 */
export function getCatalogKey(value) {
	const trimmed = String(value).trim();
	const oclc =
		trimmed.match(OCLC_INPUT_REGEX) || trimmed.match(WORLDCAT_URL_REGEX);

	if (oclc) {
		return `OCLC:${oclc[1]}`;
	}

	const lccnInput =
		trimmed.match(LCCN_INPUT_REGEX) || trimmed.match(LCCN_URL_REGEX);

	if (lccnInput) {
		const lccn = normalizeLccn(lccnInput[1]);

		return lccn ? `LCCN:${lccn}` : null;
	}

	const olid = trimmed.match(OPEN_LIBRARY_EDITION_REGEX);

	return olid ? `OLID:${olid[1].toUpperCase()}` : null;
}

/**
 * Extract an Internet Archive item identifier or ARK.
 *
 * Mirrors bibliography_builder_normalize_archive_id() in includes/resolvers.php.
 *
 * @param {string} value Standalone identifier text.
 * @return {string|null} The item identifier or `ark:/13960/…`; null when not one.
 */
export function getArchiveId(value) {
	const trimmed = String(value).trim();
	const ark = trimmed.match(ARCHIVE_ARK_REGEX);

	if (ark) {
		return `ark:/13960/${ark[1].toLowerCase()}`;
	}

	const item =
		trimmed.match(ARCHIVE_URL_REGEX) || trimmed.match(ARCHIVE_LABEL_REGEX);

	return item ? item[1] : null;
}

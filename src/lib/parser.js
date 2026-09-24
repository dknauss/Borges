/**
 * Input format detection and citation-js orchestration.
 *
 * Splits pasted input into individual entries, detects DOIs and BibTeX
 * (including BibLaTeX, which shares the same detection and backend),
 * and resolves them to CSL-JSON via citation-js.
 */

import { Cite } from '@citation-js/core';
import { __ } from '@wordpress/i18n';
import { MAX_ENTRIES_PER_PASTE } from './citation-limits';
import '@citation-js/plugin-doi';
import '@citation-js/plugin-bibtex';
import apiFetch from '@wordpress/api-fetch';
import { createCitationId } from './citation-id';
import { validateAndSanitizeCsl, KNOWN_CSL_TYPES } from './csl-sanitize';
import { normalizeBibtexCsl } from './bibtex-fields';
import { normalizeCslNameCase } from './normalize-author-names';
import { normalizeCslTitleCase } from './normalize-title-case';
import { DEFAULT_CITATION_STYLE } from './formatting';
import { parseFreeTextCitation } from './free-text-parser';
import { SUPPORTED_INPUT_MESSAGE } from './input-support';

const DOI_ONLY_REGEX =
	/^(?:(?:https?:\/\/)?(?:dx\.)?doi\.org\/|(?:https?:\/\/)?doi:)?10\.\d{4,}\/[^\s]+$/i;
const BIBTEX_REGEX = /@\w+\{/;
const PMID_REGEX = /^PMID:\s*(\d{1,8})$/i;
// PMCID: the `PMC` prefix is what distinguishes it from a PMID, so it is
// required; the `PMCID:` label is optional.
const PMCID_REGEX = /^(?:PMCID:\s*)?PMC(\d{1,9})$/i;
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
const EMBEDDED_ARXIV_REGEX = new RegExp(
	`(?:\\barxiv:\\s*|${ARXIV_URL_PREFIX_SOURCE})(${ARXIV_ID_SOURCE})`,
	'iu'
);
// arXiv's own DataCite DOIs (10.48550/arXiv.ID) are not in CrossRef, so they
// resolve through the arXiv backend instead of the DOI one.
const ARXIV_DOI_REGEX = new RegExp(
	`^(?:(?:https?:\\/\\/)?(?:dx\\.)?doi\\.org\\/|doi:)?10\\.48550\\/arxiv\\.(${ARXIV_ID_SOURCE})$`,
	'iu'
);
const NCBI_CSL_API =
	'https://api.ncbi.nlm.nih.gov/lit/ctxp/v1/pubmed/?format=csl&id=';
const NCBI_PMC_CSL_API =
	'https://api.ncbi.nlm.nih.gov/lit/ctxp/v1/pmc/?format=csl&id=';
const CROSSREF_CSL_API = 'https://api.crossref.org/works/';
const PMID_REST_ENDPOINT = '/bibliography/v1/pmid/';
const PMCID_REST_ENDPOINT = '/bibliography/v1/pmcid/';
const ARXIV_REST_ENDPOINT = '/bibliography/v1/arxiv';
const MAX_INPUT_SIZE = 1024 * 1024; // 1 MB
const PARSE_CONCURRENCY = 4;
const MAX_DOI_METADATA_CACHE_ENTRIES = 100;
const LATEX_DOCUMENT_PATTERN =
	/\\documentclass\b|\\begin\{document\}|\\printbibliography\b|\\addbibresource\b|\\(?:auto|foot|paren|text)?cite\w*\{/u;
const DOI_METADATA_CACHE = new Map();
const PENDING_DOI_RESOLUTIONS = new Map();
let DOI_RESOLUTION_QUEUE = Promise.resolve();
// arXiv asks API clients to space out requests, so arXiv lookups run one at a
// time even when a paste contains several.
let ARXIV_RESOLUTION_QUEUE = Promise.resolve();
export { validateAndSanitizeCsl };

function normalizePmidInput(value) {
	return value.replace(/^PMID:\s*/iu, '').trim();
}

function getDefaultFetchFn() {
	if (typeof window !== 'undefined' && typeof window.fetch === 'function') {
		return window.fetch.bind(window);
	}

	return undefined;
}

function normalizePmcidInput(value) {
	return value.replace(/^(?:PMCID:\s*)?PMC/iu, '').trim();
}

const NCBI_SOURCES = {
	pmid: {
		label: 'PMID',
		fetchUrl: (id) => `${NCBI_CSL_API}${id}`,
		restPath: (id) => `${PMID_REST_ENDPOINT}${encodeURIComponent(id)}`,
	},
	pmcid: {
		label: 'PMCID',
		// The PMC exporter rejects `id=PMC…` with HTTP 400; it takes digits.
		fetchUrl: (id) => `${NCBI_PMC_CSL_API}${id}`,
		restPath: (id) => `${PMCID_REST_ENDPOINT}PMC${encodeURIComponent(id)}`,
	},
};

async function resolveNcbiViaFetch(source, id, fetchFn) {
	const response = await fetchFn(source.fetchUrl(id));

	if (!response.ok) {
		throw new Error(
			`NCBI API returned ${response.status} for ${source.label} ${id}`
		);
	}

	return response.json();
}

/**
 * Resolve a PubMed or PubMed Central record to CSL-JSON.
 *
 * Prefers an injected fetch (tests, benchmarks), then the authenticated
 * WordPress REST proxy, then a direct browser fetch.
 *
 * @param {'pmid'|'pmcid'} sourceKey Which NCBI source to query.
 * @param {string}         id        Digits only (no `PMC` prefix).
 * @param {Function}       [fetchFn] Optional fetch implementation.
 * @return {Promise<Object>} CSL-JSON item.
 */
async function resolveNcbiCsl(sourceKey, id, fetchFn) {
	const source = NCBI_SOURCES[sourceKey];

	if (typeof fetchFn === 'function') {
		return resolveNcbiViaFetch(source, id, fetchFn);
	}

	if (typeof apiFetch === 'function') {
		return apiFetch({ path: source.restPath(id) });
	}

	const defaultFetchFn = getDefaultFetchFn();

	if (typeof defaultFetchFn === 'function') {
		return resolveNcbiViaFetch(source, id, defaultFetchFn);
	}

	throw new Error(
		__(
			'Fetch API unavailable for PMID resolution',
			'borges-bibliography-builder'
		)
	);
}

async function resolveDoiViaCrossRef(doi, fetchFn) {
	const response = await fetchFn(
		`${CROSSREF_CSL_API}${encodeURIComponent(
			doi
		)}/transform/application/vnd.citationstyles.csl+json`
	);

	if (!response.ok) {
		throw new Error(
			`CrossRef API returned ${response.status} for DOI ${doi}`
		);
	}

	return normalizeCrossRefCsl(await response.json());
}

function normalizeDoiInput(value) {
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
 * @return {{ format: 'doi'|'pmid'|'pmcid'|'arxiv', value: string, rawValue: string } | null} Extracted identifier result, or null if none found.
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

	return null;
}

function cloneCslItems(cslItems) {
	return cslItems.map((item) => JSON.parse(JSON.stringify(item)));
}

export function normalizeCrossRefCsl(csl) {
	const typeMap = {
		'journal-article': 'article-journal',
		'book-chapter': 'chapter',
		'book-part': 'chapter',
		'book-section': 'chapter',
		'proceedings-article': 'paper-conference',
		dissertation: 'thesis',
		'posted-content': 'manuscript',
		monograph: 'book',
		'edited-book': 'book',
		'reference-book': 'book',
		'reference-entry': 'entry-encyclopedia',
		'report-component': 'report',
	};

	const mappedType = typeMap[csl.type] || csl.type;

	return {
		...csl,
		// CrossRef emits types that aren't valid CSL types (e.g. "monograph"
		// for books). validateAndSanitizeCsl rejects unknown types and aborts
		// the whole import, so map the common ones above and fall any remaining
		// unknown type back to the generic "document" — a valid DOI should
		// never be unimportable just because of an unusual type label.
		type: KNOWN_CSL_TYPES.has(mappedType) ? mappedType : 'document',
	};
}

function getCachedDoiMetadata(cacheKey) {
	if (!DOI_METADATA_CACHE.has(cacheKey)) {
		return undefined;
	}

	const cslItems = DOI_METADATA_CACHE.get(cacheKey);
	DOI_METADATA_CACHE.delete(cacheKey);
	DOI_METADATA_CACHE.set(cacheKey, cslItems);

	return cloneCslItems(cslItems);
}

function setCachedDoiMetadata(cacheKey, cslItems) {
	if (DOI_METADATA_CACHE.has(cacheKey)) {
		DOI_METADATA_CACHE.delete(cacheKey);
	}

	while (DOI_METADATA_CACHE.size >= MAX_DOI_METADATA_CACHE_ENTRIES) {
		const leastRecentlyUsedKey = DOI_METADATA_CACHE.keys().next().value;

		if (!leastRecentlyUsedKey) {
			break;
		}

		DOI_METADATA_CACHE.delete(leastRecentlyUsedKey);
	}

	DOI_METADATA_CACHE.set(cacheKey, cloneCslItems(cslItems));
}

export function clearDoiMetadataCache() {
	DOI_METADATA_CACHE.clear();
	PENDING_DOI_RESOLUTIONS.clear();
	DOI_RESOLUTION_QUEUE = Promise.resolve();
	ARXIV_RESOLUTION_QUEUE = Promise.resolve();
}

/**
 * Extract a bare arXiv ID from an `arXiv:` label, arxiv.org URL, or arXiv DOI.
 *
 * @param {string} value Standalone identifier text.
 * @return {string|null} The arXiv ID, or null when the value is not one.
 */
function getArxivId(value) {
	const trimmed = value.trim();
	const match =
		trimmed.match(ARXIV_REGEX) ||
		normalizeDoiInput(trimmed).match(ARXIV_DOI_REGEX);

	return match ? match[1] : null;
}

function resolveArxivCsl(arxivId) {
	if (typeof apiFetch !== 'function') {
		return Promise.reject(
			new Error('WordPress REST transport unavailable for arXiv')
		);
	}

	const queuedResolution = ARXIV_RESOLUTION_QUEUE.catch(() => {}).then(() =>
		apiFetch({
			path: `${ARXIV_REST_ENDPOINT}?id=${encodeURIComponent(arxivId)}`,
		})
	);
	ARXIV_RESOLUTION_QUEUE = queuedResolution.catch(() => {});

	return queuedResolution;
}

function enqueueDoiResolution(resolve) {
	const queuedResolution = DOI_RESOLUTION_QUEUE.catch(() => {}).then(resolve);
	DOI_RESOLUTION_QUEUE = queuedResolution.catch(() => {});

	return queuedResolution;
}

async function resolveDoiCslItems(value, fetchFn) {
	const cacheKey = normalizeDoiValueForLookup(value);
	const cachedItems = getCachedDoiMetadata(cacheKey);

	if (cachedItems) {
		return cachedItems;
	}

	if (!PENDING_DOI_RESOLUTIONS.has(cacheKey)) {
		const normalizedDoi = normalizeDoiInput(value);
		const doiFetchFn =
			typeof fetchFn === 'function' ? fetchFn : getDefaultFetchFn();

		PENDING_DOI_RESOLUTIONS.set(
			cacheKey,
			enqueueDoiResolution(async () => {
				const cslItems =
					typeof doiFetchFn === 'function'
						? [await resolveDoiViaCrossRef(cacheKey, doiFetchFn)]
						: await Cite.async(normalizedDoi).then((cite) =>
								cite.get({ type: 'json' })
						  );
				setCachedDoiMetadata(cacheKey, cslItems);
				return cslItems;
			}).finally(() => {
				PENDING_DOI_RESOLUTIONS.delete(cacheKey);
			})
		);
	}

	return cloneCslItems(await PENDING_DOI_RESOLUTIONS.get(cacheKey));
}

function normalizeWhitespace(value) {
	return (value || '').trim().replace(/\s+/gu, ' ');
}

function stripTrailingReviewExtras(title) {
	return title
		.replace(
			/\.\s+[A-Z][^.]*,\s*\d{4}\.\s+\d+\s+pp\.\s+(?:[$£€]\s*)?\d+[^.]*\.?$/u,
			''
		)
		.replace(/\.\s+\d+\s+pp\.\s+(?:[$£€]\s*)?\d+[^.]*\.?$/u, '')
		.trim();
}

function stripRepeatedReviewTitle(title) {
	const words = title.split(/\s+/u).filter(Boolean);

	if (words.length < 6) {
		return title;
	}

	let secondIndex = -1;

	for (
		let probeLength = Math.min(10, words.length - 1);
		probeLength >= 4 && secondIndex === -1;
		probeLength--
	) {
		const probe = words.slice(0, probeLength).join(' ');
		secondIndex = title.indexOf(probe, probe.length);
	}

	if (secondIndex === -1) {
		return title;
	}

	return title
		.slice(0, secondIndex)
		.replace(/\s+[A-Z][a-z]+[A-Z][\s\S]*$/u, '')
		.trim();
}

function getReviewedAuthorFamilyNames(reviewedAuthors) {
	return reviewedAuthors
		.split(/\band\b|,/iu)
		.map((name) => name.trim().replace(/\.$/u, '').split(/\s+/u).pop())
		.filter(Boolean);
}

function escapeRegExp(value) {
	return String(value).replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function stripDuplicatedReviewAuthorMarkers(title, reviewedAuthors) {
	const familyNames = getReviewedAuthorFamilyNames(reviewedAuthors);

	for (const familyName of familyNames) {
		const duplicateMarkerMatch = title.match(
			new RegExp(`\\s+${escapeRegExp(familyName)}[A-Z]`, 'u')
		);

		if (duplicateMarkerMatch?.index) {
			return title.slice(0, duplicateMarkerMatch.index).trim();
		}
	}

	return title;
}

function normalizeReviewRecordTitle(title) {
	const normalizedTitle = normalizeWhitespace(title);
	const titleWithoutReviewExtras = stripTrailingReviewExtras(normalizedTitle);
	const sentenceMatch = titleWithoutReviewExtras.match(
		/^(?<reviewedAuthors>.+?\b[\p{Lu}][\p{L}'’.-]+)\.\s+(?<reviewedTitle>.+)$/u
	);

	if (!sentenceMatch?.groups) {
		return titleWithoutReviewExtras.replace(/\.$/u, '');
	}

	const cleanedReviewedTitle = stripDuplicatedReviewAuthorMarkers(
		stripRepeatedReviewTitle(sentenceMatch.groups.reviewedTitle),
		sentenceMatch.groups.reviewedAuthors
	);

	return `${sentenceMatch.groups.reviewedAuthors}. ${cleanedReviewedTitle}`
		.trim()
		.replace(/\.$/u, '');
}

function getReviewMetadataWarnings(inputFormat, originalCsl, normalizedCsl) {
	if (
		inputFormat === 'doi' &&
		normalizedCsl.type === 'article-journal' &&
		normalizedCsl['container-title'] &&
		typeof originalCsl.title === 'string' &&
		typeof normalizedCsl.title === 'string' &&
		originalCsl.title !== normalizedCsl.title &&
		!normalizedCsl.page
	) {
		return ['review-metadata-incomplete'];
	}

	return [];
}

function normalizeResolvedCsl(csl, inputFormat) {
	// Title-case ALL-CAPS personal names and titles returned by CrossRef /
	// PubMed before any further normalization or storage. Machine-resolved
	// sources only; manual entry intentionally bypasses this path.
	const normalizedCsl = normalizeCslTitleCase(
		normalizeCslNameCase({
			...csl,
		})
	);

	if (
		normalizedCsl.type === 'article-journal' &&
		typeof normalizedCsl.title === 'string' &&
		normalizedCsl['container-title'] &&
		(/\b\d+\s+pp\./u.test(normalizedCsl.title) ||
			/[$£€]\s*\d+/u.test(normalizedCsl.title) ||
			/[a-z][A-Z][a-z]/u.test(normalizedCsl.title))
	) {
		normalizedCsl.title = normalizeReviewRecordTitle(normalizedCsl.title);
	}

	return {
		csl: normalizedCsl,
		parseWarnings: getReviewMetadataWarnings(
			inputFormat,
			csl,
			normalizedCsl
		),
	};
}

/**
 * Detect the format of a single chunk of text.
 *
 * @param {string} chunk Trimmed text segment.
 * @return {{ format: string, value: string, rawValue?: string, fallbackValue?: string }} Detected format descriptor.
 */
function detectFormat(chunk) {
	if (PMID_REGEX.test(chunk)) {
		return { format: 'pmid', value: chunk };
	}

	if (PMCID_REGEX.test(chunk)) {
		return { format: 'pmcid', value: chunk };
	}

	// Before DOI: arXiv DOIs (10.48550/arXiv.ID) also match DOI_ONLY_REGEX.
	if (getArxivId(chunk)) {
		return { format: 'arxiv', value: chunk };
	}

	if (DOI_ONLY_REGEX.test(chunk)) {
		return { format: 'doi', value: chunk };
	}

	if (BIBTEX_REGEX.test(chunk)) {
		return { format: 'bibtex', value: chunk };
	}

	const embedded = extractEmbeddedIdentifier(chunk);
	if (embedded) {
		return { ...embedded, fallbackValue: chunk };
	}

	return { format: 'freetext', value: chunk };
}

function createDetectedItem(
	format,
	value,
	rawValue = value,
	fallbackValue = undefined
) {
	return {
		format,
		value,
		rawValue,
		...(fallbackValue !== undefined ? { fallbackValue } : {}),
	};
}

const IDENTIFIER_FORMATS = ['doi', 'pmid', 'pmcid', 'arxiv'];

function looksLikeStandaloneCitationLine(line) {
	const normalizedLine = line.trim();

	if (!normalizedLine) {
		return false;
	}

	const format = detectFormat(normalizedLine).format;

	if (IDENTIFIER_FORMATS.includes(format)) {
		return true;
	}

	return /(?:\.|[)!?]|https?:\/\/\S+)$/u.test(normalizedLine);
}

function splitChunkIntoDetectedItems(chunk) {
	if (BIBTEX_REGEX.test(chunk)) {
		return chunk
			.split(/(?=@\w+\{)/)
			.map((entry) => entry.trim())
			.filter(Boolean)
			.map((entry) => createDetectedItem('bibtex', entry, entry));
	}

	const lines = chunk
		.split(/\n/)
		.map((line) => line.trim())
		.filter(Boolean);

	if (!lines.length) {
		return [];
	}

	const allLinesAreIdentifiers =
		lines.length > 1 &&
		lines.every((line) =>
			IDENTIFIER_FORMATS.includes(detectFormat(line).format)
		);

	if (allLinesAreIdentifiers) {
		return lines.map((line) => {
			const detected = detectFormat(line);
			return createDetectedItem(detected.format, line, line);
		});
	}

	const allLinesLookStandalone =
		lines.length > 1 && lines.every(looksLikeStandaloneCitationLine);

	if (allLinesLookStandalone) {
		return lines.map((line) => {
			const detectedLine = detectFormat(line);
			return createDetectedItem(
				detectedLine.format,
				detectedLine.value,
				line,
				detectedLine.fallbackValue
			);
		});
	}

	const normalizedChunk = lines.join(' ');
	const detectedChunk = detectFormat(normalizedChunk);

	return [
		createDetectedItem(
			detectedChunk.format,
			detectedChunk.value,
			chunk.trim(),
			detectedChunk.fallbackValue
		),
	];
}

const PARSER_BACKENDS = {
	pmid: async (value, { fetchFn } = {}) => {
		const pmid = normalizePmidInput(value);
		const csl = await resolveNcbiCsl('pmid', pmid, fetchFn);

		return { cslItems: [csl] };
	},
	arxiv: async (value) => {
		const arxivId = getArxivId(value);

		if (!arxivId) {
			throw new Error('Invalid arXiv ID');
		}

		return { cslItems: [await resolveArxivCsl(arxivId)] };
	},
	pmcid: async (value, { fetchFn } = {}) => {
		const pmcid = normalizePmcidInput(value);
		const csl = await resolveNcbiCsl('pmcid', pmcid, fetchFn);

		return { cslItems: [csl] };
	},
	doi: async (value, { fetchFn } = {}) => {
		return {
			cslItems: await resolveDoiCslItems(value, fetchFn),
		};
	},
	bibtex: async (value) => {
		const cite = await Cite.async(normalizeBibtexInput(value));
		const cslItems = cite.get({ type: 'json' });
		// Raw-field recovery (arXiv eprints) is only unambiguous when the
		// segment produced exactly one item.
		const rawEntry = cslItems.length === 1 ? value : undefined;

		return {
			cslItems: cslItems.map((csl) => normalizeBibtexCsl(csl, rawEntry)),
		};
	},
	freetext: async (value) => {
		const parsedCitation = parseFreeTextCitation(value);

		if (!parsedCitation) {
			throw new Error(SUPPORTED_INPUT_MESSAGE);
		}

		return {
			cslItems: [parsedCitation.csl],
		};
	},
};

const BIBTEX_ENTRY_TYPE_ALIASES = {
	artikel: 'article',
	buch: 'book',
	inbuch: 'inbook',
	insammlung: 'incollection',
};

function normalizeBibtexInput(value) {
	return value.replace(
		/^(\s*)@([a-z-]+)\s*\{/iu,
		(match, leadingWhitespace, entryType) => {
			const normalizedEntryType =
				BIBTEX_ENTRY_TYPE_ALIASES[entryType.toLowerCase()] || entryType;

			return `${leadingWhitespace}@${normalizedEntryType}{`;
		}
	);
}

async function mapWithConcurrency(items, concurrency, mapper) {
	const results = new Array(items.length);
	let nextIndex = 0;

	async function worker() {
		while (nextIndex < items.length) {
			const currentIndex = nextIndex;
			nextIndex += 1;
			results[currentIndex] = await mapper(
				items[currentIndex],
				currentIndex
			);
		}
	}

	await Promise.all(
		Array.from({ length: Math.min(concurrency, items.length) }, () =>
			worker()
		)
	);

	return results;
}

function formatUnsupportedInputError() {
	return SUPPORTED_INPUT_MESSAGE;
}

function formatLatexDocumentError() {
	return __(
		'This looks like LaTeX, not a bibliography entry. Paste a DOI, PMID, PMCID, arXiv ID, BibTeX entry, or supported citation instead.',
		'borges-bibliography-builder'
	);
}

function formatBackendParseError(format, err) {
	if (
		err?.message &&
		/^(Invalid CSL|CSL item must|CSL root must)/u.test(err.message)
	) {
		return err.message;
	}

	if (format === 'pmid') {
		return __(
			"Couldn't resolve the PMID. Check the number and try again.",
			'borges-bibliography-builder'
		);
	}

	if (format === 'arxiv') {
		return __(
			"Couldn't resolve the arXiv ID. Check it and try again.",
			'borges-bibliography-builder'
		);
	}

	if (format === 'pmcid') {
		return __(
			"Couldn't resolve the PMCID. Check the number and try again.",
			'borges-bibliography-builder'
		);
	}

	if (format === 'doi') {
		return __(
			"Couldn't parse the DOI. Check it and try again.",
			'borges-bibliography-builder'
		);
	}

	if (format === 'bibtex') {
		return __(
			"Couldn't parse the BibTeX entry. Check it and try again.",
			'borges-bibliography-builder'
		);
	}

	return __(
		"Couldn't parse the citation. Check it and try again.",
		'borges-bibliography-builder'
	);
}

/**
 * Parse pasted input into an array of CSL-JSON citation objects.
 *
 * @param {string}   input                       Raw pasted text.
 * @param {string}   styleKey                    Style key for derived formatting.
 * @param {Object}   [options={}]                Parse options.
 * @param {boolean}  [options.deferFormatting]   When true (default), leave
 *                                               `formattedText` empty so callers
 *                                               can decide if and when to format.
 *                                               When false, format entries inside
 *                                               the parser for legacy/explicit
 *                                               call sites.
 * @param {Function} [options.fetchFn]           Fetch implementation for PMID
 *                                               resolution.
 * @param {Array}    [options.existingDoiValues] Existing normalized or raw DOI
 *                                               values already present in the
 *                                               bibliography.
 * @return {Promise<Object>} { entries: Array, errors: Array, truncated: boolean }
 *
 * @since 0.1.0
 */
export async function parsePastedInput(
	input,
	styleKey = DEFAULT_CITATION_STYLE,
	{ deferFormatting = true, existingDoiValues = [], fetchFn } = {}
) {
	const errors = [];
	let truncated = false;
	let skippedDuplicateCount = 0;

	if (!input || !input.trim()) {
		return {
			entries: [],
			errors: [],
			truncated: false,
			remainingInput: '',
		};
	}

	if (input.length > MAX_INPUT_SIZE) {
		return {
			entries: [],
			errors: [
				__(
					'The pasted input is too large. Maximum size is 1 MB.',
					'borges-bibliography-builder'
				),
			],
			truncated: false,
			remainingInput: input.trim(),
		};
	}

	if (LATEX_DOCUMENT_PATTERN.test(input)) {
		return {
			entries: [],
			errors: [formatLatexDocumentError()],
			truncated: false,
			remainingInput: input.trim(),
		};
	}

	// Split on blank lines first; for multi-line chunks, use conservative
	// line-based heuristics before falling back to a single normalized chunk.
	const chunks = input
		.split(/\n\s*\n/)
		.map((c) => c.trim())
		.filter(Boolean);

	let detected = chunks.flatMap(splitChunkIntoDetectedItems);
	let overflowItems = [];

	if (detected.length > MAX_ENTRIES_PER_PASTE) {
		truncated = true;
		overflowItems = detected.slice(MAX_ENTRIES_PER_PASTE);
		detected = detected.slice(0, MAX_ENTRIES_PER_PASTE);
	}

	const existingDoiSet = new Set(
		existingDoiValues
			.filter((value) => typeof value === 'string' && value.trim())
			.map(normalizeDoiValueForLookup)
	);
	detected = detected.filter((item) => {
		if (item.format !== 'doi') {
			return true;
		}

		const normalizedDoi = normalizeDoiValueForLookup(item.value);

		if (existingDoiSet.has(normalizedDoi)) {
			skippedDuplicateCount += 1;
			return false;
		}

		return true;
	});

	const entries = [];
	const remainingSegments = overflowItems.map((item) => item.rawValue);

	/**
	 * Map resolved CSL items to bibliography entry objects.
	 *
	 * @param {Array}  cslItems    Raw CSL items from a backend.
	 * @param {string} inputFormat The format key used to produce these items.
	 * @return {Array} Normalized entry objects.
	 */
	function mapCslToEntries(cslItems, inputFormat) {
		return cslItems.map((csl) => {
			const { csl: normalizedCsl, parseWarnings } = normalizeResolvedCsl(
				csl,
				inputFormat
			);
			const sanitizedCsl = validateAndSanitizeCsl(normalizedCsl);

			return {
				id: createCitationId(),
				csl: sanitizedCsl,
				formattedText: null,
				displayOverride: null,
				inputFormat,
				parseWarnings,
			};
		});
	}

	const resolvedItems = await mapWithConcurrency(
		detected,
		PARSE_CONCURRENCY,
		async (item) => {
			try {
				const { cslItems } = await PARSER_BACKENDS[item.format](
					item.value,
					{ fetchFn }
				);

				return {
					item,
					entries: mapCslToEntries(cslItems, item.format),
				};
			} catch (err) {
				// When an embedded identifier was extracted from free text, try
				// the freetext backend before surfacing any resolver error.
				if (item.fallbackValue !== undefined) {
					try {
						const { cslItems } = await PARSER_BACKENDS.freetext(
							item.fallbackValue
						);

						return {
							item,
							entries: mapCslToEntries(cslItems, 'freetext'),
						};
					} catch (_fallbackErr) {
						// Both resolver and freetext failed — report as
						// unsupported input so the user sees the guidance
						// message rather than a confusing DOI/PMID error.
						return {
							item,
							error: formatUnsupportedInputError(),
						};
					}
				}

				return {
					item,
					error:
						item.format === 'freetext'
							? formatUnsupportedInputError()
							: formatBackendParseError(item.format, err),
				};
			}
		}
	);

	for (const resolvedItem of resolvedItems) {
		if (resolvedItem.error) {
			errors.push(resolvedItem.error);
			remainingSegments.push(resolvedItem.item.rawValue);
			continue;
		}

		entries.push(...resolvedItem.entries);
	}

	if (!deferFormatting && entries.length) {
		const { formatBibliographyEntries } = await import('./formatting/csl');
		const formattedTexts = await formatBibliographyEntries(
			entries.map((entry) => entry.csl),
			styleKey
		);

		for (const [index, entry] of entries.entries()) {
			entry.formattedText = formattedTexts[index];
		}
	}

	return {
		entries,
		errors,
		truncated,
		remainingInput: remainingSegments.join('\n\n'),
		skippedDuplicateCount,
	};
}

/**
 * Maximum number of entries allowed per paste operation.
 *
 * @since 0.1.0
 */
export { MAX_ENTRIES_PER_PASTE };

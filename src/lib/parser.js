/**
 * Input format detection and citation-js orchestration.
 *
 * Splits pasted input into individual entries, detects DOIs, RIS records,
 * and BibTeX (including BibLaTeX, which shares the same detection and
 * backend), and resolves them to CSL-JSON via citation-js.
 */

import { normalizeBibtexCsl, renameBibtexCityField } from './bibtex-fields';
import { createCitationId } from './citation-id';
import { MAX_ENTRIES_PER_PASTE } from './citation-limits';
import { validateAndSanitizeCsl } from './csl-sanitize';
import { DEFAULT_CITATION_STYLE } from './formatting';
import { parseFreeTextCitation } from './free-text-parser';
import { SUPPORTED_INPUT_MESSAGE } from './input-support';
import { Cite } from '@citation-js/core';
import apiFetch from '@wordpress/api-fetch';
import { __ } from '@wordpress/i18n';
import '@citation-js/plugin-doi';
import '@citation-js/plugin-bibtex';
import '@citation-js/plugin-ris';
import { parseJsonDocument, readCslJsonDocument } from './parser-csl-json';
import {
	OPEN_LIBRARY_WORK_ERROR,
	OPEN_LIBRARY_WORK_REGEX,
	getArchiveId,
	getArxivId,
	getCatalogKey,
	getStandaloneIsbn,
	normalizeDoiValueForLookup,
	normalizeIsbn,
	normalizePmcidInput,
	normalizePmidInput,
} from './parser-identifiers';
import { normalizeResolvedCsl } from './parser-normalize';
import { normalizeRisCsl } from './ris-fields';
import {
	ARCHIVE_REST_ENDPOINT,
	CATALOG_REST_ENDPOINT,
	ISBN_REST_ENDPOINT,
	resolveArxivCsl,
	resolveDoiCslItems,
	resolveNcbiCsl,
	runSerially,
} from './parser-resolvers';
import {
	BIBTEX_MISSING_KEY,
	createDetectedItem,
	normalizeBibtexInput,
	segmentPastedInput,
	splitChunkIntoDetectedItems,
} from './parser-segment';

const MAX_INPUT_SIZE = 1024 * 1024; // 1 MB
const PARSE_CONCURRENCY = 4;
const LATEX_DOCUMENT_PATTERN =
	/\\documentclass\b|\\begin\{document\}|\\printbibliography\b|\\addbibresource\b|\\(?:auto|foot|paren|text)?cite\w*\{/u;
// EndNote XML, Word bibliography XML, and MODS exports. Without this they
// fall through to the free-text parser, which saves the markup as a citation.
const XML_DOCUMENT_PATTERN =
	/^\uFEFF?\s*<(?:\?xml\b|xml>|b:Sources\b|modsCollection\b|mods\b)/iu;
export { validateAndSanitizeCsl };

/**
 * Fill in formattedText for parsed entries.
 *
 * @param {Array}  entries  Parsed entries; updated in place.
 * @param {string} styleKey Citation style key.
 */
async function formatParsedEntries( entries, styleKey ) {
	const { formatBibliographyEntries } = await import( './formatting/csl' );
	const formattedTexts = await formatBibliographyEntries(
		entries.map( ( entry ) => entry.csl ),
		styleKey
	);

	for ( const [ index, entry ] of entries.entries() ) {
		entry.formattedText = formattedTexts[ index ];
	}
}

/**
 * Resolvers per input kind. Each takes the raw value, plus an optional
 * `fetchFn` for the backends that call the network directly.
 *
 * @type {Record<string, (value: string, options?: {fetchFn?: typeof fetch}) => Promise<Object>>}
 */
const PARSER_BACKENDS = {
	pmid: async ( value, { fetchFn } = {} ) => {
		const pmid = normalizePmidInput( value );
		const csl = await resolveNcbiCsl( 'pmid', pmid, fetchFn );

		return { cslItems: [ csl ] };
	},
	isbn: async ( value ) => {
		const isbn13 =
			getStandaloneIsbn( value ) ||
			normalizeIsbn( value.replace( /^ISBN(?:-1[03])?:?\s*/iu, '' ) );

		if ( ! isbn13 ) {
			throw new Error( 'Invalid ISBN' );
		}

		if ( typeof apiFetch !== 'function' ) {
			throw new Error( 'WordPress REST transport unavailable for ISBN' );
		}

		return {
			cslItems: [
				await runSerially( 'isbn', () =>
					apiFetch( { path: `${ ISBN_REST_ENDPOINT }${ isbn13 }` } )
				),
			],
		};
	},
	arxiv: async ( value ) => {
		const arxivId = getArxivId( value );

		if ( ! arxivId ) {
			throw new Error( 'Invalid arXiv ID' );
		}

		return { cslItems: [ await resolveArxivCsl( arxivId ) ] };
	},
	catalog: async ( value ) => {
		const key = getCatalogKey( value );

		if ( ! key ) {
			throw new Error(
				OPEN_LIBRARY_WORK_REGEX.test( value.trim() )
					? OPEN_LIBRARY_WORK_ERROR
					: 'Invalid library catalog number'
			);
		}

		if ( typeof apiFetch !== 'function' ) {
			throw new Error(
				'WordPress REST transport unavailable for catalog numbers'
			);
		}

		return {
			cslItems: [
				await runSerially( 'catalog', () =>
					apiFetch( {
						path: `${ CATALOG_REST_ENDPOINT }?id=${ encodeURIComponent(
							key
						) }`,
					} )
				),
			],
		};
	},
	archive: async ( value ) => {
		const archiveId = getArchiveId( value );

		if ( ! archiveId ) {
			throw new Error( 'Invalid Internet Archive identifier' );
		}

		if ( typeof apiFetch !== 'function' ) {
			throw new Error(
				'WordPress REST transport unavailable for the Internet Archive'
			);
		}

		return {
			cslItems: [
				await runSerially( 'archive', () =>
					apiFetch( {
						path: `${ ARCHIVE_REST_ENDPOINT }?id=${ encodeURIComponent(
							archiveId
						) }`,
					} )
				),
			],
		};
	},
	pmcid: async ( value, { fetchFn } = {} ) => {
		const pmcid = normalizePmcidInput( value );
		const csl = await resolveNcbiCsl( 'pmcid', pmcid, fetchFn );

		return { cslItems: [ csl ] };
	},
	doi: async ( value, { fetchFn } = {} ) => {
		return {
			cslItems: await resolveDoiCslItems( value, fetchFn ),
		};
	},
	bibtex: async ( value ) => {
		const cite = await Cite.async(
			renameBibtexCityField( normalizeBibtexInput( value ) )
		);
		const cslItems = cite.get( { type: 'json' } );
		// Raw-field recovery (arXiv eprints) is only unambiguous when the
		// segment produced exactly one item.
		const rawEntry = cslItems.length === 1 ? value : undefined;

		return {
			cslItems: cslItems.map( ( csl ) =>
				normalizeBibtexCsl( dropMissingBibtexKey( csl ), rawEntry )
			),
		};
	},
	ris: async ( value ) => {
		// One record per segment (see segmentPastedInput()), so the raw record
		// can be read back for the tags citation-js drops.
		const cite = await Cite.async( value, { forceType: '@ris/file' } );

		return {
			cslItems: cite
				.get( { type: 'json' } )
				.map( ( csl ) => normalizeRisCsl( csl, value ) ),
		};
	},
	freetext: async ( value ) => {
		const parsedCitation = parseFreeTextCitation( value );

		if ( ! parsedCitation ) {
			throw new Error( SUPPORTED_INPUT_MESSAGE );
		}

		return {
			cslItems: [ parsedCitation.csl ],
		};
	},
};

async function mapWithConcurrency( items, concurrency, mapper ) {
	const results = new Array( items.length );
	let nextIndex = 0;

	async function worker() {
		while ( nextIndex < items.length ) {
			const currentIndex = nextIndex;
			nextIndex += 1;
			results[ currentIndex ] = await mapper(
				items[ currentIndex ],
				currentIndex
			);
		}
	}

	await Promise.all(
		Array.from( { length: Math.min( concurrency, items.length ) }, () =>
			worker()
		)
	);

	return results;
}

/**
 * Remove the placeholder key `normalizeBibtexInput()` gave a keyless entry, so
 * export builds a key from the author and year instead of reusing it.
 *
 * @param {Object} csl CSL item produced by citation-js.
 * @return {Object} The item without the placeholder `id` and `citation-key`.
 */
function dropMissingBibtexKey( csl ) {
	if ( csl[ 'citation-key' ] !== BIBTEX_MISSING_KEY ) {
		return csl;
	}

	const { id, 'citation-key': citationKey, ...rest } = csl;

	return rest;
}

function formatUnsupportedInputError() {
	return SUPPORTED_INPUT_MESSAGE;
}

function formatLatexDocumentError() {
	return __(
		'This looks like LaTeX, not a bibliography entry. Paste a DOI, PMID, PMCID, arXiv ID, ISBN, BibTeX entry, RIS record, CSL-JSON, or supported citation instead.',
		'borges-bibliography-builder'
	);
}

function formatXmlDocumentError() {
	return __(
		"Borges can't read XML exports, such as EndNote XML. Export the references as BibTeX, RIS, or CSL JSON and paste that instead.",
		'borges-bibliography-builder'
	);
}

function formatBackendParseError( format, err ) {
	if (
		err?.message &&
		/^(Invalid CSL|CSL item must|CSL root must)/u.test( err.message )
	) {
		return err.message;
	}

	if ( format === 'pmid' ) {
		return __(
			"Couldn't resolve the PMID. Check the number and try again.",
			'borges-bibliography-builder'
		);
	}

	if ( format === 'isbn' ) {
		return __(
			"Couldn't resolve the ISBN. Check it and try again.",
			'borges-bibliography-builder'
		);
	}

	if ( format === 'arxiv' ) {
		return __(
			"Couldn't resolve the arXiv ID. Check it and try again.",
			'borges-bibliography-builder'
		);
	}

	if ( format === 'catalog' && err?.message === OPEN_LIBRARY_WORK_ERROR ) {
		return __(
			'That is an Open Library work ID, which covers every edition. Paste the edition ID (OL…M) or the book’s ISBN instead.',
			'borges-bibliography-builder'
		);
	}

	if ( format === 'catalog' ) {
		return __(
			'Open Library has no record for that catalog number. Check it, or paste the book’s ISBN instead.',
			'borges-bibliography-builder'
		);
	}

	if ( format === 'archive' ) {
		return __(
			"Couldn't resolve the Internet Archive item. Check the link and try again.",
			'borges-bibliography-builder'
		);
	}

	if ( format === 'pmcid' ) {
		return __(
			"Couldn't resolve the PMCID. Check the number and try again.",
			'borges-bibliography-builder'
		);
	}

	if ( format === 'doi' ) {
		return __(
			"Couldn't parse the DOI. Check it and try again.",
			'borges-bibliography-builder'
		);
	}

	if ( format === 'bibtex' ) {
		return __(
			"Couldn't parse the BibTeX entry. Check it and try again.",
			'borges-bibliography-builder'
		);
	}

	if ( format === 'ris' ) {
		return __(
			"Couldn't parse the RIS record. Check it and try again.",
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
 * @param {string}       input                       Raw pasted text.
 * @param {string}       styleKey                    Style key for derived formatting.
 * @param {Object}       [options={}]                Parse options.
 * @param {boolean}      [options.deferFormatting]   When true (default), leave
 *                                                   `formattedText` empty so callers
 *                                                   can decide if and when to format.
 *                                                   When false, format entries inside
 *                                                   the parser for legacy/explicit
 *                                                   call sites.
 * @param {typeof fetch} [options.fetchFn]           Fetch implementation for PMID
 *                                                   resolution.
 * @param {Array}        [options.existingDoiValues] Existing normalized or raw DOI
 *                                                   values already present in the
 *                                                   bibliography.
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

	if ( ! input || ! input.trim() ) {
		return {
			entries: [],
			errors: [],
			truncated: false,
			remainingInput: '',
		};
	}

	if ( input.length > MAX_INPUT_SIZE ) {
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

	if ( LATEX_DOCUMENT_PATTERN.test( input ) ) {
		return {
			entries: [],
			errors: [ formatLatexDocumentError() ],
			truncated: false,
			remainingInput: input.trim(),
		};
	}

	if ( XML_DOCUMENT_PATTERN.test( input ) ) {
		return {
			entries: [],
			errors: [ formatXmlDocumentError() ],
			truncated: false,
			remainingInput: input.trim(),
		};
	}

	const existingDoiSet = new Set(
		existingDoiValues
			.filter( ( value ) => typeof value === 'string' && value.trim() )
			.map( normalizeDoiValueForLookup )
	);
	const jsonDocument = parseJsonDocument( input );

	if ( jsonDocument ) {
		const result = readCslJsonDocument(
			jsonDocument,
			existingDoiSet,
			input
		);

		if ( ! deferFormatting && result.entries.length ) {
			await formatParsedEntries( result.entries, styleKey );
		}

		return result;
	}

	let detected = segmentPastedInput( input ).flatMap( ( segment ) => {
		if ( segment.bibtex ) {
			return [
				createDetectedItem( 'bibtex', segment.value, segment.raw ),
			];
		}

		if ( segment.ris ) {
			return [ createDetectedItem( 'ris', segment.value, segment.raw ) ];
		}

		// Split on blank lines first; for multi-line chunks, use conservative
		// line-based heuristics before falling back to a single normalized chunk.
		return segment.value
			.split( /\n\s*\n/ )
			.map( ( c ) => c.trim() )
			.filter( Boolean )
			.flatMap( splitChunkIntoDetectedItems );
	} );
	let overflowItems = [];

	if ( detected.length > MAX_ENTRIES_PER_PASTE ) {
		truncated = true;
		overflowItems = detected.slice( MAX_ENTRIES_PER_PASTE );
		detected = detected.slice( 0, MAX_ENTRIES_PER_PASTE );
	}

	detected = detected.filter( ( item ) => {
		if ( item.format !== 'doi' ) {
			return true;
		}

		const normalizedDoi = normalizeDoiValueForLookup( item.value );

		if ( existingDoiSet.has( normalizedDoi ) ) {
			skippedDuplicateCount += 1;
			return false;
		}

		return true;
	} );

	const entries = [];
	const remainingSegments = overflowItems.map( ( item ) => item.rawValue );

	/**
	 * Map resolved CSL items to bibliography entry objects.
	 *
	 * @param {Array}  cslItems    Raw CSL items from a backend.
	 * @param {string} inputFormat The format key used to produce these items.
	 * @return {Array} Normalized entry objects.
	 */
	function mapCslToEntries( cslItems, inputFormat ) {
		return cslItems.map( ( csl ) => {
			const { csl: normalizedCsl, parseWarnings } = normalizeResolvedCsl(
				csl,
				inputFormat
			);
			const sanitizedCsl = validateAndSanitizeCsl( normalizedCsl );

			return {
				id: createCitationId(),
				csl: sanitizedCsl,
				formattedText: null,
				displayOverride: null,
				inputFormat,
				parseWarnings,
			};
		} );
	}

	const resolvedItems = await mapWithConcurrency(
		detected,
		PARSE_CONCURRENCY,
		async ( item ) => {
			try {
				const { cslItems } = await PARSER_BACKENDS[ item.format ](
					item.value,
					{ fetchFn }
				);

				return {
					item,
					entries: mapCslToEntries( cslItems, item.format ),
				};
			} catch ( err ) {
				// When an embedded identifier was extracted from free text, try
				// the freetext backend before surfacing any resolver error.
				if ( item.fallbackValue !== undefined ) {
					try {
						const { cslItems } = await PARSER_BACKENDS.freetext(
							item.fallbackValue
						);

						return {
							item,
							entries: mapCslToEntries( cslItems, 'freetext' ),
						};
					} catch {
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
							: formatBackendParseError( item.format, err ),
				};
			}
		}
	);

	for ( const resolvedItem of resolvedItems ) {
		if ( resolvedItem.error ) {
			errors.push( resolvedItem.error );
			remainingSegments.push( resolvedItem.item.rawValue );
			continue;
		}

		entries.push( ...resolvedItem.entries );
	}

	if ( ! deferFormatting && entries.length ) {
		await formatParsedEntries( entries, styleKey );
	}

	return {
		entries,
		errors,
		truncated,
		remainingInput: remainingSegments.join( '\n\n' ),
		skippedDuplicateCount,
	};
}

/**
 * Maximum number of entries allowed per paste operation.
 *
 * @since 0.1.0
 */
export { MAX_ENTRIES_PER_PASTE };

export {
	normalizeDoiValueForLookup,
	extractEmbeddedIdentifier,
	normalizeIsbn,
	normalizeLccn,
	getCatalogKey,
	getArchiveId,
} from './parser-identifiers';
export {
	normalizeCrossRefCsl,
	clearDoiMetadataCache,
} from './parser-resolvers';

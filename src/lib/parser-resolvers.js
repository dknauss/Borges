/**
 * Network resolution for identifiers: NCBI (PMID, PMCID) through the plugin's
 * REST proxy or a direct fetch, CrossRef DOIs and the DOI cache, arXiv, and the
 * serial queues that keep lookups to one host at a time.
 *
 * Split from parser.js (refactor memo, Phase E); parser.js re-exports the
 * public names, so importers are unchanged.
 */

import { KNOWN_CSL_TYPES } from './csl-sanitize';
import { Cite } from '@citation-js/core';
import apiFetch from '@wordpress/api-fetch';
import { __ } from '@wordpress/i18n';
import {
	normalizeDoiInput,
	normalizeDoiValueForLookup,
} from './parser-identifiers';

const NCBI_CSL_API =
	'https://api.ncbi.nlm.nih.gov/lit/ctxp/v1/pubmed/?format=csl&id=';
const NCBI_PMC_CSL_API =
	'https://api.ncbi.nlm.nih.gov/lit/ctxp/v1/pmc/?format=csl&id=';
const CROSSREF_CSL_API = 'https://api.crossref.org/works/';
const PMID_REST_ENDPOINT = '/bibliography/v1/pmid/';
const PMCID_REST_ENDPOINT = '/bibliography/v1/pmcid/';
const ARXIV_REST_ENDPOINT = '/bibliography/v1/arxiv';
export const ISBN_REST_ENDPOINT = '/bibliography/v1/isbn/';
export const CATALOG_REST_ENDPOINT = '/bibliography/v1/catalog';
export const ARCHIVE_REST_ENDPOINT = '/bibliography/v1/archive';
const MAX_DOI_METADATA_CACHE_ENTRIES = 100;
const DOI_METADATA_CACHE = new Map();
const PENDING_DOI_RESOLUTIONS = new Map();
let DOI_RESOLUTION_QUEUE = Promise.resolve();
// arXiv and Open Library/Google Books ask API clients to space out requests,
// so lookups against each upstream run one at a time even when a paste
// contains several. One promise chain per queue name.
const SERIAL_QUEUES = new Map();

function getDefaultFetchFn() {
	if ( typeof window !== 'undefined' && typeof window.fetch === 'function' ) {
		return window.fetch.bind( window );
	}

	return undefined;
}

const NCBI_SOURCES = {
	pmid: {
		label: 'PMID',
		fetchUrl: ( id ) => `${ NCBI_CSL_API }${ id }`,
		restPath: ( id ) =>
			`${ PMID_REST_ENDPOINT }${ encodeURIComponent( id ) }`,
	},
	pmcid: {
		label: 'PMCID',
		// The PMC exporter rejects `id=PMC…` with HTTP 400; it takes digits.
		fetchUrl: ( id ) => `${ NCBI_PMC_CSL_API }${ id }`,
		restPath: ( id ) =>
			`${ PMCID_REST_ENDPOINT }PMC${ encodeURIComponent( id ) }`,
	},
};

async function resolveNcbiViaFetch( source, id, fetchFn ) {
	const response = await fetchFn( source.fetchUrl( id ) );

	if ( ! response.ok ) {
		throw new Error(
			`NCBI API returned ${ response.status } for ${ source.label } ${ id }`
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
 * @param {typeof fetch}   [fetchFn] Optional fetch implementation.
 * @return {Promise<Object>} CSL-JSON item.
 */
export async function resolveNcbiCsl( sourceKey, id, fetchFn ) {
	const source = NCBI_SOURCES[ sourceKey ];

	if ( typeof fetchFn === 'function' ) {
		return resolveNcbiViaFetch( source, id, fetchFn );
	}

	if ( typeof apiFetch === 'function' ) {
		return apiFetch( { path: source.restPath( id ) } );
	}

	const defaultFetchFn = getDefaultFetchFn();

	if ( typeof defaultFetchFn === 'function' ) {
		return resolveNcbiViaFetch( source, id, defaultFetchFn );
	}

	throw new Error(
		__(
			'Fetch API unavailable for PMID resolution',
			'borges-bibliography-builder'
		)
	);
}

async function resolveDoiViaCrossRef( doi, fetchFn ) {
	const response = await fetchFn(
		`${ CROSSREF_CSL_API }${ encodeURIComponent(
			doi
		) }/transform/application/vnd.citationstyles.csl+json`
	);

	if ( ! response.ok ) {
		throw new Error(
			`CrossRef API returned ${ response.status } for DOI ${ doi }`
		);
	}

	return normalizeCrossRefCsl( await response.json() );
}

function cloneCslItems( cslItems ) {
	return cslItems.map( ( item ) => JSON.parse( JSON.stringify( item ) ) );
}

export function normalizeCrossRefCsl( csl ) {
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

	const mappedType = typeMap[ csl.type ] || csl.type;
	const articleNumber =
		typeof csl[ 'article-number' ] === 'string'
			? csl[ 'article-number' ].trim()
			: '';

	return {
		...csl,
		// CrossRef sends a journal's article number as `article-number`, which
		// CSL processors do not read; CSL's own variable for it is `number`.
		...( mappedType === 'article-journal' && ! csl.number && articleNumber
			? { number: articleNumber, 'article-number': articleNumber }
			: {} ),
		// CrossRef emits types that aren't valid CSL types (e.g. "monograph"
		// for books). validateAndSanitizeCsl rejects unknown types and aborts
		// the whole import, so map the common ones above and fall any remaining
		// unknown type back to the generic "document" — a valid DOI should
		// never be unimportable just because of an unusual type label.
		type: KNOWN_CSL_TYPES.has( mappedType ) ? mappedType : 'document',
	};
}

function getCachedDoiMetadata( cacheKey ) {
	if ( ! DOI_METADATA_CACHE.has( cacheKey ) ) {
		return undefined;
	}

	const cslItems = DOI_METADATA_CACHE.get( cacheKey );
	DOI_METADATA_CACHE.delete( cacheKey );
	DOI_METADATA_CACHE.set( cacheKey, cslItems );

	return cloneCslItems( cslItems );
}

function setCachedDoiMetadata( cacheKey, cslItems ) {
	if ( DOI_METADATA_CACHE.has( cacheKey ) ) {
		DOI_METADATA_CACHE.delete( cacheKey );
	}

	while ( DOI_METADATA_CACHE.size >= MAX_DOI_METADATA_CACHE_ENTRIES ) {
		const leastRecentlyUsedKey = DOI_METADATA_CACHE.keys().next().value;

		if ( ! leastRecentlyUsedKey ) {
			break;
		}

		DOI_METADATA_CACHE.delete( leastRecentlyUsedKey );
	}

	DOI_METADATA_CACHE.set( cacheKey, cloneCslItems( cslItems ) );
}

export function clearDoiMetadataCache() {
	DOI_METADATA_CACHE.clear();
	PENDING_DOI_RESOLUTIONS.clear();
	DOI_RESOLUTION_QUEUE = Promise.resolve();
	SERIAL_QUEUES.clear();
}

/**
 * Run `task` after every earlier task on the same named queue has settled.
 *
 * A failed task does not block the queue; its rejection still reaches the
 * caller of that task.
 *
 * @template T
 * @param {string}           queueName Queue to serialize on, e.g. 'arxiv'.
 * @param {() => Promise<T>} task      Work to run.
 * @return {Promise<T>} The task's result.
 */
export function runSerially( queueName, task ) {
	const previous = SERIAL_QUEUES.get( queueName ) || Promise.resolve();
	const run = previous.catch( () => {} ).then( task );
	SERIAL_QUEUES.set(
		queueName,
		run.catch( () => {} )
	);

	return run;
}

export function resolveArxivCsl( arxivId ) {
	if ( typeof apiFetch !== 'function' ) {
		return Promise.reject(
			new Error( 'WordPress REST transport unavailable for arXiv' )
		);
	}

	return runSerially( 'arxiv', () =>
		apiFetch( {
			path: `${ ARXIV_REST_ENDPOINT }?id=${ encodeURIComponent( arxivId ) }`,
		} )
	);
}

function enqueueDoiResolution( resolve ) {
	const queuedResolution = DOI_RESOLUTION_QUEUE.catch( () => {} ).then(
		resolve
	);
	DOI_RESOLUTION_QUEUE = queuedResolution.catch( () => {} );

	return queuedResolution;
}

export async function resolveDoiCslItems( value, fetchFn ) {
	const cacheKey = normalizeDoiValueForLookup( value );
	const cachedItems = getCachedDoiMetadata( cacheKey );

	if ( cachedItems ) {
		return cachedItems;
	}

	if ( ! PENDING_DOI_RESOLUTIONS.has( cacheKey ) ) {
		const normalizedDoi = normalizeDoiInput( value );
		const doiFetchFn =
			typeof fetchFn === 'function' ? fetchFn : getDefaultFetchFn();

		PENDING_DOI_RESOLUTIONS.set(
			cacheKey,
			enqueueDoiResolution( async () => {
				const cslItems =
					typeof doiFetchFn === 'function'
						? [
								await resolveDoiViaCrossRef(
									cacheKey,
									doiFetchFn
								),
							]
						: await Cite.async( normalizedDoi ).then( ( cite ) =>
								cite.get( { type: 'json' } )
							);
				setCachedDoiMetadata( cacheKey, cslItems );
				return cslItems;
			} ).finally( () => {
				PENDING_DOI_RESOLUTIONS.delete( cacheKey );
			} )
		);
	}

	return cloneCslItems( await PENDING_DOI_RESOLUTIONS.get( cacheKey ) );
}

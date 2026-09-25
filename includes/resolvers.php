<?php
/**
 * Remote metadata resolvers behind the editor-only REST routes.
 *
 * Resolves PubMed (PMID), PubMed Central (PMCID), arXiv, and ISBN
 * identifiers to CSL-JSON through fixed upstream endpoints: NCBI's
 * Literature Citation Exporter, the arXiv API, Open Library, and Google
 * Books. Every request goes through `wp_safe_remote_get()` to a constant
 * host with an identifier already validated against a strict pattern, and
 * results are cached by outcome (success, not found, failure).
 *
 * Route registration and the `edit_posts` permission callbacks stay in the
 * main plugin file with the other `bibliography/v1` routes; this file only
 * defines the provider constants, cache helpers, and route callbacks.
 *
 * @package BibliographyBuilder
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * NCBI Literature Citation Export endpoint used for PMID resolution.
 */
const BIBLIOGRAPHY_BUILDER_PUBMED_CSL_API = 'https://pmc.ncbi.nlm.nih.gov/api/ctxp/v1/pubmed/';

/**
 * NCBI Literature Citation Export endpoint used for PMCID resolution.
 */
const BIBLIOGRAPHY_BUILDER_PMC_CSL_API = 'https://pmc.ncbi.nlm.nih.gov/api/ctxp/v1/pmc/';

/**
 * Query endpoint of the arXiv API, used for arXiv ID resolution (Atom XML).
 */
const BIBLIOGRAPHY_BUILDER_ARXIV_API = 'https://export.arxiv.org/api/query';

/**
 * Open Library host: the first provider tried for ISBNs. Uses the edition
 * endpoint (`/isbn/<isbn>.json`) for edition data and the search endpoint
 * (`/search.json`) for author names; the older `/api/books` endpoint now
 * answers HTTP 404.
 */
const BIBLIOGRAPHY_BUILDER_OPEN_LIBRARY_HOST = 'https://openlibrary.org';

/**
 * Google Books volumes endpoint: the ISBN fallback when Open Library fails.
 */
const BIBLIOGRAPHY_BUILDER_GOOGLE_BOOKS_API = 'https://www.googleapis.com/books/v1/volumes';

/**
 * Modern (2301.00001) and legacy (hep-th/9901001, math.GT/0309136) arXiv IDs,
 * with an optional version suffix.
 */
const BIBLIOGRAPHY_BUILDER_ARXIV_ID_PATTERN = '#^(?:\d{4}\.\d{4,5}|[a-z-]+(?:\.[a-z]{2})?/\d{7})(?:v\d+)?$#i';

/**
 * HTTP timeout for external PMID, PMCID, and arXiv resolution requests.
 */
const BIBLIOGRAPHY_BUILDER_PUBMED_TIMEOUT = 10;

/**
 * Cache TTL for successful PMID resolution responses.
 */
const BIBLIOGRAPHY_BUILDER_PUBMED_SUCCESS_CACHE_TTL = 86400;

/**
 * Cache TTL for PMID not-found responses.
 */
const BIBLIOGRAPHY_BUILDER_PUBMED_NOT_FOUND_CACHE_TTL = 3600;

/**
 * Cache TTL for transient PMID upstream failures.
 */
const BIBLIOGRAPHY_BUILDER_PUBMED_FAILURE_CACHE_TTL = 600;

/**
 * Build the cache key for one PMID resolution.
 *
 * @param string $pmid PubMed ID.
 * @return string
 */
function bibliography_builder_get_pmid_cache_key( $pmid ) {
	return 'pmid_' . preg_replace( '/\D/u', '', (string) $pmid );
}

/**
 * Build the cache key for one PMCID resolution.
 *
 * Shares the PMID cache group so uninstall's group flush covers it; the key
 * prefix keeps the two identifier spaces apart.
 *
 * @param string $pmcid PMCID digits, with or without the `PMC` prefix.
 * @return string
 */
function bibliography_builder_get_pmcid_cache_key( $pmcid ) {
	return 'pmcid_' . preg_replace( '/\D/u', '', (string) $pmcid );
}

/**
 * Build a WP_Error for PMID resolution.
 *
 * @param string $code    Error code.
 * @param string $message Error message.
 * @param array  $data    Error data.
 * @return WP_Error
 */
function bibliography_builder_pmid_error( $code, $message, $data ) {
	return new WP_Error( $code, $message, $data );
}

/**
 * Cache an NCBI resolution result.
 *
 * @param string $cache_key Cache key from the PMID or PMCID key builder.
 * @param array  $result    Cache payload.
 * @param int    $ttl       Cache TTL in seconds.
 * @return void
 */
function bibliography_builder_cache_ncbi_result( $cache_key, $result, $ttl ) {
	bibliography_builder_cache_set(
		$cache_key,
		$result,
		'bibliography_builder_pmid',
		$ttl
	);
}

/**
 * Read a cached NCBI resolution result.
 *
 * @param string $cache_key        Cache key from the PMID or PMCID key builder.
 * @param string $fallback_code    Error code when a cached error lacks one.
 * @param string $fallback_message Error message when a cached error lacks one.
 * @return WP_REST_Response|WP_Error|null
 */
function bibliography_builder_get_cached_ncbi_result( $cache_key, $fallback_code, $fallback_message ) {
	$cached = bibliography_builder_cache_get( $cache_key, 'bibliography_builder_pmid' );

	if ( ! $cached['hit'] || ! is_array( $cached['value'] ) ) {
		return null;
	}

	if ( isset( $cached['value']['type'] ) && 'success' === $cached['value']['type'] ) {
		return rest_ensure_response( isset( $cached['value']['data'] ) ? $cached['value']['data'] : array() );
	}

	if ( isset( $cached['value']['type'] ) && 'error' === $cached['value']['type'] ) {
		return bibliography_builder_pmid_error(
			isset( $cached['value']['code'] ) ? (string) $cached['value']['code'] : $fallback_code,
			isset( $cached['value']['message'] ) ? (string) $cached['value']['message'] : $fallback_message,
			isset( $cached['value']['data'] ) && is_array( $cached['value']['data'] )
				? $cached['value']['data']
				: array( 'status' => 502 )
		);
	}

	return null;
}

/**
 * Resolve one record through NCBI's Literature Citation Exporter.
 *
 * NCBI's CSL endpoint does not currently emit browser CORS headers, so editor
 * requests are proxied through WordPress. Callers pass a fixed endpoint
 * constant and an identifier already constrained to a digit pattern, so the
 * only request input that varies is a validated number.
 *
 * @param string $endpoint    One of the fixed BIBLIOGRAPHY_BUILDER_*_CSL_API constants.
 * @param string $id          Validated identifier sent as the `id` query arg.
 * @param string $cache_key   Cache key from the PMID or PMCID key builder.
 * @param string $code_prefix Error code prefix, e.g. `bibliography_builder_pmid`.
 * @param array  $messages    Error messages keyed `unreachable`, `not_found`,
 *                            `upstream`, and `invalid_response`.
 * @return WP_REST_Response|WP_Error
 */
function bibliography_builder_resolve_ncbi_csl( $endpoint, $id, $cache_key, $code_prefix, $messages ) {
	return bibliography_builder_resolve_remote_csl(
		add_query_arg(
			array(
				'format' => 'csl',
				'id'     => $id,
			),
			$endpoint
		),
		$cache_key,
		$code_prefix,
		$messages,
		static function ( $body ) {
			$decoded = json_decode( $body, true );

			return is_array( $decoded ) && ! empty( $decoded ) ? $decoded : null;
		}
	);
}

/**
 * Fetch, decode, and cache one record from a fixed citation-metadata host.
 *
 * Shared by the PMID, PMCID, and arXiv resolvers. Successes, not-found
 * answers, and failures are cached for different TTLs in the resolver cache
 * group (`bibliography_builder_pmid`, kept for uninstall-cleanup
 * compatibility).
 *
 * @param string   $url         Request URL built from a fixed host constant and a
 *                              validated identifier.
 * @param string   $cache_key   Resolver cache key.
 * @param string   $code_prefix Error code prefix, e.g. `bibliography_builder_pmid`.
 * @param array    $messages    Error messages keyed `unreachable`, `not_found`,
 *                              `upstream`, and `invalid_response`.
 * @param callable $decode      Maps a 2xx response body to a CSL array, to null for
 *                              an unusable response, or to the string `not_found`
 *                              when the upstream reports no such record in a 2xx.
 * @return WP_REST_Response|WP_Error
 */
function bibliography_builder_resolve_remote_csl( $url, $cache_key, $code_prefix, $messages, $decode ) {
	$cached = bibliography_builder_get_cached_ncbi_result(
		$cache_key,
		$code_prefix . '_upstream_error',
		$messages['upstream']
	);

	if ( null !== $cached ) {
		return $cached;
	}

	// wp_safe_remote_get, not wp_remote_get: the request follows up to three
	// redirects, and only the safe variant runs each hop through
	// wp_http_validate_url. The identifier is already constrained to digits and
	// the host is a fixed constant, so the redirect chain is the one part of
	// this request an upstream change could point somewhere unintended.
	$response = wp_safe_remote_get(
		$url,
		array(
			'timeout'     => BIBLIOGRAPHY_BUILDER_PUBMED_TIMEOUT,
			'redirection' => 3,
		)
	);

	$error = null;
	$ttl   = BIBLIOGRAPHY_BUILDER_PUBMED_FAILURE_CACHE_TTL;

	if ( is_wp_error( $response ) ) {
		$error = bibliography_builder_pmid_error(
			$code_prefix . '_upstream_error',
			$messages['unreachable'],
			array( 'status' => 502 )
		);
	} else {
		$status = (int) wp_remote_retrieve_response_code( $response );

		if ( 404 === $status ) {
			$error = bibliography_builder_pmid_error(
				$code_prefix . '_not_found',
				$messages['not_found'],
				array( 'status' => 404 )
			);
			$ttl   = BIBLIOGRAPHY_BUILDER_PUBMED_NOT_FOUND_CACHE_TTL;
		} elseif ( $status < 200 || $status >= 300 ) {
			$error = bibliography_builder_pmid_error(
				$code_prefix . '_upstream_error',
				$messages['upstream'],
				array(
					'status'          => 502,
					'upstream_status' => $status,
				)
			);
		} else {
			$decoded = call_user_func( $decode, (string) wp_remote_retrieve_body( $response ) );

			if ( 'not_found' === $decoded ) {
				$error = bibliography_builder_pmid_error(
					$code_prefix . '_not_found',
					$messages['not_found'],
					array( 'status' => 404 )
				);
				$ttl   = BIBLIOGRAPHY_BUILDER_PUBMED_NOT_FOUND_CACHE_TTL;
			} elseif ( ! is_array( $decoded ) || empty( $decoded ) ) {
				$error = bibliography_builder_pmid_error(
					$code_prefix . '_invalid_response',
					$messages['invalid_response'],
					array( 'status' => 502 )
				);
			}
		}
	}

	if ( null !== $error ) {
		bibliography_builder_cache_ncbi_result(
			$cache_key,
			array(
				'type'    => 'error',
				'code'    => $error->get_error_code(),
				'message' => $error->get_error_message(),
				'data'    => $error->get_error_data(),
			),
			$ttl
		);

		return $error;
	}

	bibliography_builder_cache_ncbi_result(
		$cache_key,
		array(
			'type' => 'success',
			'data' => $decoded,
		),
		BIBLIOGRAPHY_BUILDER_PUBMED_SUCCESS_CACHE_TTL
	);

	return rest_ensure_response( $decoded );
}

/**
 * REST callback that resolves a PubMed ID to CSL-JSON.
 *
 * @param WP_REST_Request $request REST request.
 * @return WP_REST_Response|WP_Error
 */
function bibliography_builder_rest_resolve_pmid( WP_REST_Request $request ) {
	$pmid = isset( $request['pmid'] ) ? (string) $request['pmid'] : '';

	if ( ! preg_match( '/^\d{1,8}$/', $pmid ) ) {
		return new WP_Error(
			'bibliography_builder_pmid_invalid',
			__( 'Invalid PubMed ID.', 'borges-bibliography-builder' ),
			array( 'status' => 400 )
		);
	}

	return bibliography_builder_resolve_ncbi_csl(
		BIBLIOGRAPHY_BUILDER_PUBMED_CSL_API,
		$pmid,
		bibliography_builder_get_pmid_cache_key( $pmid ),
		'bibliography_builder_pmid',
		array(
			'unreachable'      => __(
				'The PubMed citation service could not be reached.',
				'borges-bibliography-builder'
			),
			'not_found'        => __(
				'The PubMed ID could not be resolved.',
				'borges-bibliography-builder'
			),
			'upstream'         => __(
				'The PubMed citation service returned an error.',
				'borges-bibliography-builder'
			),
			'invalid_response' => __(
				'The PubMed citation service returned an invalid response.',
				'borges-bibliography-builder'
			),
		)
	);
}

/**
 * Reduce pasted arXiv input to a bare arXiv identifier.
 *
 * Accepts `arXiv:` prefixes and arxiv.org `/abs/` or `/pdf/` URLs.
 *
 * @param mixed $value Raw identifier.
 * @return string The identifier, or an empty string when it is not valid.
 */
function bibliography_builder_normalize_arxiv_id( $value ) {
	if ( ! is_scalar( $value ) ) {
		return '';
	}

	$id = trim( (string) $value );
	$id = (string) preg_replace( '#^(?:https?://)?(?:www\.|export\.)?arxiv\.org/(?:abs|pdf)/#i', '', $id );
	$id = (string) preg_replace( '#^arxiv:\s*#i', '', $id );
	$id = (string) preg_replace( '#\.pdf$#i', '', $id );

	return preg_match( BIBLIOGRAPHY_BUILDER_ARXIV_ID_PATTERN, $id ) ? $id : '';
}

/**
 * Split an author display string ("Given Middle Family") into a CSL name.
 *
 * Both arXiv and Open Library give each author as one display string. Lowercase
 * particles (van, de, von, ...) stay with the family name, a trailing
 * generational suffix is kept separately, and single-word or collaboration
 * names become literals.
 *
 * @param string $name Author display name.
 * @return array CSL name object, or an empty array for a blank name.
 */
function bibliography_builder_split_display_name( $name ) {
	$name = trim( (string) preg_replace( '/\s+/u', ' ', (string) $name ) );

	if ( '' === $name ) {
		return array();
	}

	$tokens = explode( ' ', $name );

	if ( count( $tokens ) < 2 || preg_match( '/\b(?:collaboration|consortium|group|team)\b/iu', $name ) ) {
		return array( 'literal' => $name );
	}

	$suffix = '';
	if ( preg_match( '/^(?:jr\.?|sr\.?|ii|iii|iv)$/iu', (string) end( $tokens ) ) && count( $tokens ) > 2 ) {
		$suffix = (string) array_pop( $tokens );
	}

	$family    = array( (string) array_pop( $tokens ) );
	$particles = array( 'da', 'de', 'del', 'della', 'der', 'di', 'dos', 'du', 'la', 'le', 'ten', 'ter', 'van', 'von' );

	// Keep at least one given-name token: `isset( $tokens[1] )` means two or more remain.
	while ( isset( $tokens[1] ) && in_array( end( $tokens ), $particles, true ) ) {
		array_unshift( $family, (string) array_pop( $tokens ) );
	}

	$csl_name = array(
		'family' => implode( ' ', $family ),
		'given'  => implode( ' ', $tokens ),
	);

	if ( '' !== $suffix ) {
		$csl_name['suffix'] = $suffix;
	}

	return $csl_name;
}

/**
 * Convert an arXiv API Atom response into a CSL-JSON preprint record.
 *
 * Follows the Zotero preprint convention: CSL type `article`, publisher
 * `arXiv`, number `arXiv:<id>`, the arXiv-assigned DataCite DOI, and the
 * abstract-page URL.
 *
 * @param string $body Atom XML response body.
 * @param string $id   The requested arXiv ID.
 * @return array|string|null CSL item, `not_found`, or null when unusable.
 */
function bibliography_builder_arxiv_atom_to_csl( $body, $id ) {
	if ( ! function_exists( 'simplexml_load_string' ) || '' === trim( (string) $body ) ) {
		return null;
	}

	// arXiv's Atom never declares a DOCTYPE. Refusing one outright closes off
	// entity expansion even on PHP 7.4 hosts with a pre-2.9 libxml, where
	// external entities were not yet disabled by default.
	if ( false !== stripos( (string) $body, '<!DOCTYPE' ) || false !== stripos( (string) $body, '<!ENTITY' ) ) {
		return null;
	}

	$previous_errors = libxml_use_internal_errors( true );
	// LIBXML_NONET blocks network access during parsing; external entities are
	// not substituted without LIBXML_NOENT, so the fixed-host response cannot
	// pull in other content.
	$feed = simplexml_load_string( (string) $body, 'SimpleXMLElement', LIBXML_NONET );
	libxml_clear_errors();
	libxml_use_internal_errors( $previous_errors );

	if ( false === $feed ) {
		return null;
	}

	$atom  = $feed->children( 'http://www.w3.org/2005/Atom' );
	$entry = isset( $atom->entry ) ? $atom->entry[0] : null;

	if ( null === $entry ) {
		return 'not_found';
	}

	$entry_id = trim( (string) $entry->id );

	// The API reports an unknown or malformed ID as a 200 with an error entry.
	if ( false !== strpos( $entry_id, '/api/errors' ) ) {
		return 'not_found';
	}

	$title = trim( (string) preg_replace( '/\s+/u', ' ', (string) $entry->title ) );

	if ( '' === $title ) {
		return null;
	}

	$authors = array();
	foreach ( $entry->author as $author ) {
		$csl_name = bibliography_builder_split_display_name( (string) $author->name );

		if ( ! empty( $csl_name ) ) {
			$authors[] = $csl_name;
		}
	}

	$base_id = (string) preg_replace( '/v\d+$/i', '', $id );
	$csl     = array(
		'type'      => 'article',
		'title'     => $title,
		'publisher' => 'arXiv',
		'number'    => 'arXiv:' . $base_id,
		'DOI'       => '10.48550/arXiv.' . $base_id,
		'URL'       => 'https://arxiv.org/abs/' . $id,
	);

	if ( ! empty( $authors ) ) {
		$csl['author'] = $authors;
	}

	if ( preg_match( '/^(\d{4})-(\d{2})-(\d{2})/', trim( (string) $entry->published ), $date ) ) {
		$csl['issued'] = array(
			'date-parts' => array( array( (int) $date[1], (int) $date[2], (int) $date[3] ) ),
		);
	}

	return $csl;
}

/**
 * Build the cache key for one arXiv resolution.
 *
 * @param string $arxiv_id Normalized arXiv ID.
 * @return string
 */
function bibliography_builder_get_arxiv_cache_key( $arxiv_id ) {
	return 'arxiv_' . strtolower( (string) $arxiv_id );
}

/**
 * REST callback that resolves an arXiv ID to CSL-JSON.
 *
 * The ID travels as a query argument rather than a path segment because
 * legacy IDs contain a slash (`hep-th/9901001`).
 *
 * @param WP_REST_Request $request REST request.
 * @return WP_REST_Response|WP_Error
 */
function bibliography_builder_rest_resolve_arxiv( WP_REST_Request $request ) {
	$arxiv_id = bibliography_builder_normalize_arxiv_id( isset( $request['id'] ) ? $request['id'] : '' );

	if ( '' === $arxiv_id ) {
		return new WP_Error(
			'bibliography_builder_arxiv_invalid',
			__( 'Invalid arXiv ID.', 'borges-bibliography-builder' ),
			array( 'status' => 400 )
		);
	}

	return bibliography_builder_resolve_remote_csl(
		add_query_arg( array( 'id_list' => rawurlencode( $arxiv_id ) ), BIBLIOGRAPHY_BUILDER_ARXIV_API ),
		bibliography_builder_get_arxiv_cache_key( $arxiv_id ),
		'bibliography_builder_arxiv',
		array(
			'unreachable'      => __(
				'The arXiv metadata service could not be reached.',
				'borges-bibliography-builder'
			),
			'not_found'        => __(
				'The arXiv ID could not be resolved.',
				'borges-bibliography-builder'
			),
			'upstream'         => __(
				'The arXiv metadata service returned an error.',
				'borges-bibliography-builder'
			),
			'invalid_response' => __(
				'The arXiv metadata service returned an invalid response.',
				'borges-bibliography-builder'
			),
		),
		static function ( $body ) use ( $arxiv_id ) {
			return bibliography_builder_arxiv_atom_to_csl( $body, $arxiv_id );
		}
	);
}

/**
 * Reduce pasted ISBN input to a checksum-valid ISBN-13.
 *
 * Accepts an optional `ISBN`, `ISBN-10`, or `ISBN-13` label and hyphens or
 * spaces. ISBN-10 values are converted to their 978-prefixed ISBN-13 form so
 * each book has one cache key.
 *
 * @param mixed $value Raw ISBN input.
 * @return string The ISBN-13, or an empty string when the input is not valid.
 */
function bibliography_builder_normalize_isbn( $value ) {
	if ( ! is_scalar( $value ) ) {
		return '';
	}

	$isbn = (string) preg_replace( '/^\s*ISBN(?:-1[03])?:?\s*/i', '', (string) $value );
	$isbn = strtoupper( (string) preg_replace( '/[\s-]/', '', $isbn ) );

	if ( preg_match( '/^\d{9}[\dX]$/', $isbn ) ) {
		$sum = 0;
		for ( $i = 0; $i < 10; $i++ ) {
			$digit = 'X' === $isbn[ $i ] ? 10 : (int) $isbn[ $i ];
			$sum  += $digit * ( 10 - $i );
		}

		if ( 0 !== $sum % 11 ) {
			return '';
		}

		$isbn = '978' . substr( $isbn, 0, 9 );

		return $isbn . bibliography_builder_isbn13_check_digit( $isbn );
	}

	if ( preg_match( '/^97[89]\d{10}$/', $isbn ) ) {
		return bibliography_builder_isbn13_check_digit( substr( $isbn, 0, 12 ) ) === $isbn[12] ? $isbn : '';
	}

	return '';
}

/**
 * Compute the ISBN-13 check digit for the first twelve digits.
 *
 * @param string $first_twelve Twelve digits.
 * @return string The check digit.
 */
function bibliography_builder_isbn13_check_digit( $first_twelve ) {
	$sum = 0;
	for ( $i = 0; $i < 12; $i++ ) {
		$sum += (int) $first_twelve[ $i ] * ( 0 === $i % 2 ? 1 : 3 );
	}

	return (string) ( ( 10 - $sum % 10 ) % 10 );
}

/**
 * Derive the ISBN-10 for a 978-prefixed ISBN-13.
 *
 * @param string $isbn13 Checksum-valid ISBN-13.
 * @return string The ISBN-10, or an empty string for 979-prefixed ISBNs.
 */
function bibliography_builder_isbn13_to_isbn10( $isbn13 ) {
	if ( 0 !== strpos( (string) $isbn13, '978' ) ) {
		return '';
	}

	$core = substr( $isbn13, 3, 9 );
	$sum  = 0;
	for ( $i = 0; $i < 9; $i++ ) {
		$sum += (int) $core[ $i ] * ( 10 - $i );
	}
	$check = ( 11 - $sum % 11 ) % 11;

	return $core . ( 10 === $check ? 'X' : (string) $check );
}

/**
 * Look up author display names for an ISBN through Open Library search.
 *
 * Open Library edition records reference authors by key only; the search
 * endpoint returns the names in one request. A failed lookup yields no names
 * rather than failing the whole resolution.
 *
 * @param string $isbn13 Checksum-valid ISBN-13.
 * @return string[] Author display names.
 */
function bibliography_builder_open_library_author_names( $isbn13 ) {
	$response = wp_safe_remote_get(
		add_query_arg(
			array(
				'isbn'   => $isbn13,
				'fields' => 'author_name',
				'limit'  => '1',
			),
			BIBLIOGRAPHY_BUILDER_OPEN_LIBRARY_HOST . '/search.json'
		),
		array(
			'timeout'     => BIBLIOGRAPHY_BUILDER_PUBMED_TIMEOUT,
			'redirection' => 3,
		)
	);

	if ( is_wp_error( $response ) || 200 !== (int) wp_remote_retrieve_response_code( $response ) ) {
		return array();
	}

	$decoded = json_decode( (string) wp_remote_retrieve_body( $response ), true );
	$names   = isset( $decoded['docs'][0]['author_name'] ) && is_array( $decoded['docs'][0]['author_name'] )
		? $decoded['docs'][0]['author_name']
		: array();

	return array_values( array_filter( $names, 'is_string' ) );
}

/**
 * Convert an Open Library edition record into a CSL-JSON book record.
 *
 * Authors are not included: edition records reference them by key only.
 * See bibliography_builder_open_library_author_names().
 *
 * @param string $body   Edition JSON (`/isbn/<isbn>.json`, after redirect).
 * @param string $isbn13 The requested ISBN-13.
 * @return array|null CSL item, or null when unusable.
 */
function bibliography_builder_open_library_edition_to_csl( $body, $isbn13 ) {
	$record = json_decode( (string) $body, true );

	if ( ! is_array( $record ) || empty( $record['title'] ) || ! is_string( $record['title'] ) ) {
		return null;
	}

	$title = trim( $record['title'] );
	if ( ! empty( $record['subtitle'] ) && is_string( $record['subtitle'] ) ) {
		$title .= ': ' . trim( $record['subtitle'] );
	}

	$csl = array(
		'type'  => 'book',
		'title' => $title,
		'ISBN'  => $isbn13,
	);

	foreach ( array(
		'publishers'     => 'publisher',
		'publish_places' => 'publisher-place',
	) as $source => $field ) {
		if ( isset( $record[ $source ][0] ) && is_string( $record[ $source ][0] ) ) {
			$csl[ $field ] = trim( $record[ $source ][0] );
		}
	}

	$publish_date = isset( $record['publish_date'] ) ? (string) $record['publish_date'] : '';
	if ( preg_match( '/\b(1\d{3}|20\d{2})\b/', $publish_date, $year ) ) {
		$csl['issued'] = array( 'date-parts' => array( array( (int) $year[1] ) ) );
	}

	$pages = isset( $record['number_of_pages'] ) ? $record['number_of_pages'] : null;
	if ( is_int( $pages ) && $pages > 0 ) {
		$csl['number-of-pages'] = (string) $pages;
	}

	return $csl;
}

/**
 * Convert a Google Books volumes search response into a CSL-JSON book record.
 *
 * `q=isbn:` is a search, so a volume is only accepted when its
 * industryIdentifiers contain the requested ISBN; anything else is treated
 * as not found rather than citing a different book.
 *
 * @param string $body   JSON response body.
 * @param string $isbn13 The requested ISBN-13.
 * @return array|string|null CSL item, `not_found`, or null when unusable.
 */
function bibliography_builder_google_books_to_csl( $body, $isbn13 ) {
	$decoded = json_decode( (string) $body, true );

	if ( ! is_array( $decoded ) ) {
		return null;
	}

	$items  = isset( $decoded['items'] ) && is_array( $decoded['items'] ) ? $decoded['items'] : array();
	$wanted = array_filter( array( $isbn13, bibliography_builder_isbn13_to_isbn10( $isbn13 ) ) );
	$volume = null;

	foreach ( $items as $item ) {
		$info = isset( $item['volumeInfo'] ) && is_array( $item['volumeInfo'] ) ? $item['volumeInfo'] : array();
		$ids  = isset( $info['industryIdentifiers'] ) && is_array( $info['industryIdentifiers'] )
			? $info['industryIdentifiers']
			: array();

		foreach ( $ids as $identifier ) {
			$value = isset( $identifier['identifier'] ) ? strtoupper( (string) $identifier['identifier'] ) : '';
			if ( in_array( $value, $wanted, true ) ) {
				$volume = $info;
				break 2;
			}
		}
	}

	if ( null === $volume ) {
		return 'not_found';
	}

	if ( empty( $volume['title'] ) || ! is_string( $volume['title'] ) ) {
		return null;
	}

	$title = trim( $volume['title'] );
	if ( ! empty( $volume['subtitle'] ) && is_string( $volume['subtitle'] ) ) {
		$title .= ': ' . trim( $volume['subtitle'] );
	}

	$csl = array(
		'type'  => 'book',
		'title' => $title,
		'ISBN'  => $isbn13,
	);

	$authors = array();
	foreach ( isset( $volume['authors'] ) && is_array( $volume['authors'] ) ? $volume['authors'] : array() as $name ) {
		$csl_name = is_string( $name ) ? bibliography_builder_split_display_name( $name ) : array();

		if ( ! empty( $csl_name ) ) {
			$authors[] = $csl_name;
		}
	}
	if ( ! empty( $authors ) ) {
		$csl['author'] = $authors;
	}

	if ( ! empty( $volume['publisher'] ) && is_string( $volume['publisher'] ) ) {
		$csl['publisher'] = trim( $volume['publisher'] );
	}

	$published = isset( $volume['publishedDate'] ) ? (string) $volume['publishedDate'] : '';
	if ( preg_match( '/^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?/', $published, $date ) ) {
		$csl['issued'] = array( 'date-parts' => array( array_map( 'intval', array_slice( $date, 1 ) ) ) );
	}

	$pages = isset( $volume['pageCount'] ) ? $volume['pageCount'] : null;
	if ( is_int( $pages ) && $pages > 0 ) {
		$csl['number-of-pages'] = (string) $pages;
	}

	return $csl;
}

/**
 * REST callback that resolves an ISBN to a CSL-JSON book record.
 *
 * @param WP_REST_Request $request REST request.
 * @return WP_REST_Response|WP_Error
 */
function bibliography_builder_rest_resolve_isbn( WP_REST_Request $request ) {
	$isbn13 = bibliography_builder_normalize_isbn( isset( $request['isbn'] ) ? $request['isbn'] : '' );

	if ( '' === $isbn13 ) {
		return new WP_Error(
			'bibliography_builder_isbn_invalid',
			__( 'Invalid ISBN.', 'borges-bibliography-builder' ),
			array( 'status' => 400 )
		);
	}

	$messages = array(
		'unreachable'      => __(
			'The book metadata service could not be reached.',
			'borges-bibliography-builder'
		),
		'not_found'        => __(
			'The ISBN could not be resolved.',
			'borges-bibliography-builder'
		),
		'upstream'         => __(
			'The book metadata service returned an error.',
			'borges-bibliography-builder'
		),
		'invalid_response' => __(
			'The book metadata service returned an invalid response.',
			'borges-bibliography-builder'
		),
	);

	// Open Library first: the edition endpoint resolves either ISBN form and
	// redirects to the edition record; author names come from search, since
	// edition records reference authors by key only. The combined record is
	// cached as one result.
	$open_library = bibliography_builder_resolve_remote_csl(
		BIBLIOGRAPHY_BUILDER_OPEN_LIBRARY_HOST . '/isbn/' . $isbn13 . '.json',
		'isbn_ol_' . $isbn13,
		'bibliography_builder_isbn',
		$messages,
		static function ( $body ) use ( $isbn13 ) {
			$csl = bibliography_builder_open_library_edition_to_csl( $body, $isbn13 );

			// Only spend the author lookup on a usable edition record.
			if ( is_array( $csl ) ) {
				$names   = bibliography_builder_open_library_author_names( $isbn13 );
				$authors = array_filter( array_map( 'bibliography_builder_split_display_name', $names ) );

				if ( ! empty( $authors ) ) {
					$csl['author'] = array_values( $authors );
				}
			}

			return $csl;
		}
	);

	if ( ! is_wp_error( $open_library ) ) {
		return $open_library;
	}

	// Google Books when Open Library has no record or is unavailable. Each
	// provider caches its own result, so a failing provider is not retried on
	// every lookup of the same ISBN.
	return bibliography_builder_resolve_remote_csl(
		add_query_arg(
			array( 'q' => rawurlencode( 'isbn:' . $isbn13 ) ),
			BIBLIOGRAPHY_BUILDER_GOOGLE_BOOKS_API
		),
		'isbn_gb_' . $isbn13,
		'bibliography_builder_isbn',
		$messages,
		static function ( $body ) use ( $isbn13 ) {
			return bibliography_builder_google_books_to_csl( $body, $isbn13 );
		}
	);
}

/**
 * REST callback that resolves a PubMed Central ID (PMCID) to CSL-JSON.
 *
 * Accepts the digits with or without the `PMC` prefix. NCBI's PMC exporter
 * wants the bare digits: it answers `id=PMC<digits>` with HTTP 400.
 *
 * @param WP_REST_Request $request REST request.
 * @return WP_REST_Response|WP_Error
 */
function bibliography_builder_rest_resolve_pmcid( WP_REST_Request $request ) {
	$pmcid = isset( $request['pmcid'] ) ? (string) $request['pmcid'] : '';

	if ( ! preg_match( '/^\d{1,9}$/', $pmcid ) ) {
		return new WP_Error(
			'bibliography_builder_pmcid_invalid',
			__( 'Invalid PubMed Central ID.', 'borges-bibliography-builder' ),
			array( 'status' => 400 )
		);
	}

	return bibliography_builder_resolve_ncbi_csl(
		BIBLIOGRAPHY_BUILDER_PMC_CSL_API,
		$pmcid,
		bibliography_builder_get_pmcid_cache_key( $pmcid ),
		'bibliography_builder_pmcid',
		array(
			'unreachable'      => __(
				'The PubMed Central citation service could not be reached.',
				'borges-bibliography-builder'
			),
			'not_found'        => __(
				'The PubMed Central ID could not be resolved.',
				'borges-bibliography-builder'
			),
			'upstream'         => __(
				'The PubMed Central citation service returned an error.',
				'borges-bibliography-builder'
			),
			'invalid_response' => __(
				'The PubMed Central citation service returned an invalid response.',
				'borges-bibliography-builder'
			),
		)
	);
}

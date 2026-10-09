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
 * Open Library host: the first provider tried for ISBNs, and the only one for
 * OCLC numbers, LCCNs, and Open Library edition IDs. ISBNs use the edition
 * endpoint (`/isbn/<isbn>.json`) and the search endpoint (`/search.json`) for
 * author names; the other identifiers use the Books API (`/api/books` with
 * `jscmd=data`), which takes `OCLC:`, `LCCN:`, and `OLID:` keys and includes
 * author names. A key Open Library does not know answers `{}`.
 */
const BIBLIOGRAPHY_BUILDER_OPEN_LIBRARY_HOST = 'https://openlibrary.org';

/**
 * Internet Archive host: item metadata (`/metadata/<identifier>`, `{}` for an
 * unknown item) and, for ARK lookups, the advanced search endpoint.
 */
const BIBLIOGRAPHY_BUILDER_INTERNET_ARCHIVE_HOST = 'https://archive.org';

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
 * Largest upstream response body the resolvers read, in bytes. Every record
 * they fetch is a few kilobytes; the cap keeps an unexpectedly large response
 * (an Internet Archive item lists its files, which can run to thousands) from
 * being buffered whole. A cut-off body fails to decode and is reported as an
 * invalid response.
 */
const BIBLIOGRAPHY_BUILDER_RESOLVER_MAX_RESPONSE_BYTES = 1048576;

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
			'timeout'             => BIBLIOGRAPHY_BUILDER_PUBMED_TIMEOUT,
			'redirection'         => 3,
			'limit_response_size' => BIBLIOGRAPHY_BUILDER_RESOLVER_MAX_RESPONSE_BYTES,
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
 * generational suffix is kept separately, a leading honorific (Dr., Prof.)
 * is dropped, and single-word, collaboration, CJK-script, and parenthetical
 * names become literals.
 *
 * @param string $name Author display name.
 * @return array CSL name object, or an empty array for a blank name.
 */
function bibliography_builder_split_display_name( $name ) {
	$name = trim( (string) preg_replace( '/\s+/u', ' ', (string) $name ) );

	// A leading honorific is not part of the name ("Dr. David G. Payne").
	// "Sir" stays: Chicago keeps it with the given name ("Scott, Sir Walter").
	$name = trim( (string) preg_replace( '/^(?:dr|prof|mr|mrs|ms|mx|rev)\.?\s+(?=\S+\s)/iu', '', $name ) );

	if ( '' === $name ) {
		return array();
	}

	// Chinese, Japanese, and Korean names do not split into given and family
	// at the last space, and a name with a parenthetical gloss
	// ("孙武 (Sun Tzu)") would be cut through it; both stay whole.
	if ( preg_match( '/[\p{Han}\p{Hiragana}\p{Katakana}\p{Hangul}()]/u', $name ) ) {
		return array( 'literal' => $name );
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
 * The first plausible publication year in a catalog date string.
 *
 * Catalog dates come as "1977", "October 1, 1988", "c1976", or "[1977?]";
 * the year is found without needing a word boundary, so "c1976" works.
 *
 * @param string $date Date text.
 * @return int|null The year, or null when there is none.
 */
function bibliography_builder_catalog_year( $date ) {
	return preg_match( '/(?<!\d)(1\d{3}|20\d{2})(?!\d)/', (string) $date, $year ) ? (int) $year[1] : null;
}

/**
 * Add the year and page count shared by Open Library's edition and Books API
 * records to a CSL item.
 *
 * @param array $csl    CSL item.
 * @param array $record Open Library record.
 * @return array The CSL item.
 */
function bibliography_builder_open_library_common_fields( array $csl, array $record ) {
	$year = bibliography_builder_catalog_year( isset( $record['publish_date'] ) ? $record['publish_date'] : '' );
	if ( null !== $year ) {
		$csl['issued'] = array( 'date-parts' => array( array( $year ) ) );
	}

	$pages = isset( $record['number_of_pages'] ) ? $record['number_of_pages'] : null;
	if ( is_int( $pages ) && $pages > 0 ) {
		$csl['number-of-pages'] = (string) $pages;
	}

	return $csl;
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

	$csl = bibliography_builder_open_library_common_fields( $csl, $record );

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

	return bibliography_builder_resolve_isbn_csl( $isbn13 );
}

/**
 * Resolve a checksum-valid ISBN-13 to a CSL-JSON book record.
 *
 * Open Library first, Google Books as the fallback.
 *
 * @param string $isbn13 Checksum-valid ISBN-13.
 * @return WP_REST_Response|WP_Error
 */
function bibliography_builder_resolve_isbn_csl( $isbn13 ) {
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

/**
 * Normalize an LCCN to Library of Congress's normalized form.
 *
 * Blanks are removed, anything from a slash on is dropped, and a hyphenated
 * serial is left-padded to six digits (`76-28766` becomes `76028766`).
 *
 * @param string $value Raw LCCN.
 * @return string Normalized LCCN, or an empty string when it is not one.
 */
function bibliography_builder_normalize_lccn( $value ) {
	$lccn = strtolower( (string) preg_replace( '/\s+/u', '', (string) $value ) );
	$lccn = (string) preg_replace( '#/.*$#', '', $lccn );

	if ( preg_match( '/^([a-z]{0,3}(?:\d{2}|\d{4}))-(\d{1,6})$/', $lccn, $parts ) ) {
		$lccn = $parts[1] . str_pad( $parts[2], 6, '0', STR_PAD_LEFT );
	}

	// A normalized LCCN is a two- or four-digit year plus a six-digit serial.
	return preg_match( '/^[a-z]{0,3}(?:\d{8}|\d{10})$/', $lccn ) ? $lccn : '';
}

/**
 * Reduce library catalog identifier input to an Open Library Books API key.
 *
 * Accepts an OCLC number (`OCLC 2121853`, `(OCoLC)ocm02121853`,
 * `urn:oclc:record:2121853`), an LCCN (`LCCN 76-28766`), or an Open Library
 * edition ID (`OL4288142M`, optionally `OLID:`-labelled). Mirrors
 * getCatalogKey() in src/lib/parser.js.
 *
 * @param mixed $value Raw identifier input.
 * @return string `OCLC:<digits>`, `LCCN:<lccn>`, or `OLID:OL<digits>M`; empty when invalid.
 */
function bibliography_builder_normalize_catalog_key( $value ) {
	if ( ! is_scalar( $value ) ) {
		return '';
	}

	$value = trim( (string) $value );

	$oclc_pattern = '/^(?:urn:oclc:record:|\(OCoLC\)\s*|OC(?:o)?LC\s*(?:#|no\.?|number)?\s*:?\s*)'
		. '(?:ocm|ocn|on)?0*([1-9]\d{0,11})$/i';

	if ( preg_match( $oclc_pattern, $value, $match ) ) {
		return 'OCLC:' . $match[1];
	}

	if ( preg_match( '/^LCCN\s*:?\s*(.+)$/i', $value, $match ) ) {
		$lccn = bibliography_builder_normalize_lccn( $match[1] );

		return '' === $lccn ? '' : 'LCCN:' . $lccn;
	}

	if ( preg_match( '/^(?:OLID\s*:?\s*)?(OL[1-9]\d{0,9}M)$/i', $value, $match ) ) {
		return 'OLID:' . strtoupper( $match[1] );
	}

	return '';
}

/**
 * Tidy a library-catalog title: ISBD's " : " before a subtitle becomes ": ",
 * and trailing separators go. A final period goes too unless it ends an
 * abbreviation ("Made in U.S.A."). A scan's title can carry its statement of
 * responsibility (" / by ..."), which is cut only when asked: Open Library
 * titles have none, and a slash in them is part of the title.
 *
 * @param string $title                 Raw title.
 * @param bool   $strip_responsibility  Cut a trailing " / ..." statement.
 * @return string
 */
function bibliography_builder_clean_catalog_title( $title, $strip_responsibility = false ) {
	$title = trim( (string) $title );

	if ( $strip_responsibility ) {
		$title = (string) preg_replace( '#\s+/\s+.*$#u', '', $title );
	}

	$title = (string) preg_replace( '/\s+:\s*/u', ': ', $title );
	$title = rtrim( $title, " ;,/:\t" );

	return (string) preg_replace( '/(?<![\p{Lu}.])\.$/u', '', $title );
}

/**
 * Convert an Open Library Books API (`jscmd=data`) response to a CSL book.
 *
 * @param string $body JSON response body.
 * @param string $key  The requested bibkey (`OCLC:...`, `LCCN:...`, `OLID:...`).
 * @return array|string|null CSL item, `not_found`, or null when unusable.
 */
function bibliography_builder_open_library_books_to_csl( $body, $key ) {
	$decoded = json_decode( (string) $body, true );

	if ( ! is_array( $decoded ) ) {
		return null;
	}

	if ( empty( $decoded ) ) {
		return 'not_found';
	}

	$record = isset( $decoded[ $key ] ) ? $decoded[ $key ] : null;

	if ( ! is_array( $record ) || empty( $record['title'] ) || ! is_string( $record['title'] ) ) {
		return null;
	}

	$title = trim( $record['title'] );
	if ( ! empty( $record['subtitle'] ) && is_string( $record['subtitle'] ) ) {
		$title .= ': ' . trim( $record['subtitle'] );
	}

	$csl = array(
		'type'  => 'book',
		'title' => bibliography_builder_clean_catalog_title( $title ),
	);

	$authors        = array();
	$record_authors = isset( $record['authors'] ) && is_array( $record['authors'] ) ? $record['authors'] : array();
	foreach ( $record_authors as $author ) {
		$name     = isset( $author['name'] ) && is_string( $author['name'] ) ? $author['name'] : '';
		$csl_name = bibliography_builder_split_display_name( $name );

		if ( ! empty( $csl_name ) ) {
			$authors[] = $csl_name;
		}
	}
	if ( ! empty( $authors ) ) {
		$csl['author'] = $authors;
	}

	foreach ( array(
		'publishers'     => 'publisher',
		'publish_places' => 'publisher-place',
	) as $source => $field ) {
		if ( isset( $record[ $source ][0]['name'] ) && is_string( $record[ $source ][0]['name'] ) ) {
			$csl[ $field ] = trim( $record[ $source ][0]['name'] );
		}
	}

	$csl = bibliography_builder_open_library_common_fields( $csl, $record );

	foreach ( array( 'isbn_13', 'isbn_10' ) as $isbn_field ) {
		$isbn = isset( $record['identifiers'][ $isbn_field ][0] )
			? bibliography_builder_normalize_isbn( $record['identifiers'][ $isbn_field ][0] )
			: '';

		if ( '' !== $isbn ) {
			$csl['ISBN'] = $isbn;
			break;
		}
	}

	return $csl;
}

/**
 * Resolve an Open Library Books API key to a CSL-JSON book record.
 *
 * @param string $key Normalized key from bibliography_builder_normalize_catalog_key().
 * @return WP_REST_Response|WP_Error
 */
function bibliography_builder_resolve_catalog_csl( $key ) {
	return bibliography_builder_resolve_remote_csl(
		add_query_arg(
			array(
				'bibkeys' => rawurlencode( $key ),
				'format'  => 'json',
				'jscmd'   => 'data',
			),
			BIBLIOGRAPHY_BUILDER_OPEN_LIBRARY_HOST . '/api/books'
		),
		'catalog_' . strtolower( str_replace( ':', '_', $key ) ),
		'bibliography_builder_catalog',
		array(
			'unreachable'      => __(
				'The book metadata service could not be reached.',
				'borges-bibliography-builder'
			),
			'not_found'        => __(
				'The library catalog number could not be resolved.',
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
		),
		static function ( $body ) use ( $key ) {
			return bibliography_builder_open_library_books_to_csl( $body, $key );
		}
	);
}

/**
 * REST callback that resolves an OCLC number, LCCN, or Open Library edition
 * ID to a CSL-JSON book record.
 *
 * @param WP_REST_Request $request REST request.
 * @return WP_REST_Response|WP_Error
 */
function bibliography_builder_rest_resolve_catalog( WP_REST_Request $request ) {
	$key = bibliography_builder_normalize_catalog_key( isset( $request['id'] ) ? $request['id'] : '' );

	if ( '' === $key ) {
		return new WP_Error(
			'bibliography_builder_catalog_invalid',
			__( 'Invalid library catalog number.', 'borges-bibliography-builder' ),
			array( 'status' => 400 )
		);
	}

	return bibliography_builder_resolve_catalog_csl( $key );
}

/**
 * Validate an Internet Archive item identifier or Internet Archive ARK.
 *
 * Item identifiers are letters, digits, `.`, `_`, and `-`, at most 100
 * characters, starting with a letter or digit. ARKs use the Internet
 * Archive's name assigning authority number, 13960.
 *
 * @param mixed $value Raw input.
 * @return string The identifier or lower-cased ARK; empty when invalid.
 */
function bibliography_builder_normalize_archive_id( $value ) {
	if ( ! is_scalar( $value ) ) {
		return '';
	}

	$value = trim( (string) $value );

	if ( preg_match( '#^ark:/?13960/([a-z0-9]{1,40})$#i', $value, $match ) ) {
		return 'ark:/13960/' . strtolower( $match[1] );
	}

	return preg_match( '/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/', $value ) ? $value : '';
}

/**
 * First non-empty string of an Internet Archive metadata field, whose value
 * may be a string or a list of strings.
 *
 * @param array  $metadata Item metadata.
 * @param string $field    Field name.
 * @return string
 */
function bibliography_builder_archive_first( $metadata, $field ) {
	$value = isset( $metadata[ $field ] ) ? $metadata[ $field ] : '';

	foreach ( is_array( $value ) ? $value : array( $value ) as $item ) {
		if ( is_string( $item ) && '' !== trim( $item ) ) {
			return trim( $item );
		}
	}

	return '';
}

/**
 * Every non-empty string of an Internet Archive metadata field.
 *
 * @param array  $metadata Item metadata.
 * @param string $field    Field name.
 * @return string[]
 */
function bibliography_builder_archive_all( $metadata, $field ) {
	$value = isset( $metadata[ $field ] ) ? $metadata[ $field ] : array();

	return array_values(
		array_filter(
			array_map( 'trim', array_filter( is_array( $value ) ? $value : array( $value ), 'is_string' ) ),
			'strlen'
		)
	);
}

/**
 * Convert an Internet Archive creator heading to a CSL name.
 *
 * Library headings carry life dates and sometimes a title
 * (`Illich, Ivan, 1926-2002. Medical nemesis`); both are dropped. An
 * inverted `Family, Given` heading is split there; anything else is kept
 * whole as a literal, since an uninverted creator is usually an organization.
 *
 * @param string $creator Creator heading.
 * @return array CSL name, or an empty array.
 */
function bibliography_builder_archive_creator_to_name( $creator ) {
	$name = (string) preg_replace( '/,\s*(?:(?:b|d|ca|fl)\.\s*)?\d{3,4}.*$/iu', '', trim( (string) $creator ) );
	$name = (string) preg_replace( '/,\s*(?:author|editor|translator|illustrator|compiler)\.?$/iu', '', $name );
	// A fuller form of the given name, "Lewis, C. S. (Clive Staples)".
	$name = (string) preg_replace( '/\s*\([^)]*\)/u', '', $name );
	$name = trim( $name, " ,;\t" );
	// A heading's closing period ("Medical nemesis.") goes; an initial's stays.
	$name = (string) preg_replace( '/(?<=\p{Ll}{2})\.$/u', '', $name );

	if ( '' === $name ) {
		return array();
	}

	$parts = array_map( 'trim', explode( ',', $name, 2 ) );

	if ( 2 === count( $parts ) && '' !== $parts[0] && '' !== $parts[1] ) {
		return array(
			'family' => $parts[0],
			'given'  => $parts[1],
		);
	}

	// An uninverted heading is usually an organization, but "Ivan Illich"
	// is a person: two to four capitalized words with no organizational
	// word are split as a personal name, so they match "Illich, Ivan".
	$organization_words = 'Academy|Association|Board|Bureau|College|Committee|Company|Corporation|Council|Department|'
		. 'Foundation|Inc|Institute|Library|Ltd|Ministry|Museum|Office|Press|Society|Studio|University';
	$is_person          = preg_match( '/^\p{Lu}[\p{L}.\'-]*(?:\s+\p{Lu}[\p{L}.\'-]*){1,3}$/u', $name )
		&& ! preg_match( '/\b(?:' . $organization_words . ')\b/iu', $name );

	return $is_person ? bibliography_builder_split_display_name( $name ) : array( 'literal' => $name );
}

/**
 * Split an ISBD publication statement (`Harmondsworth ; New York : Penguin`)
 * into its first place and first publisher.
 *
 * @param string $statement Publication statement.
 * @return array `publisher` and/or `publisher-place`.
 */
function bibliography_builder_split_publication_statement( $statement ) {
	$statement = trim( str_replace( array( '[', ']' ), '', (string) $statement ) );
	$fields    = array();

	if ( '' === $statement ) {
		return $fields;
	}

	$colon      = strpos( $statement, ':' );
	$places     = explode( ';', false === $colon ? '' : substr( $statement, 0, $colon ) );
	$publishers = explode( ';', false === $colon ? $statement : substr( $statement, $colon + 1 ) );
	$place      = bibliography_builder_catalog_imprint_value( $places[0] );
	$publisher  = bibliography_builder_catalog_imprint_value( $publishers[0] );

	if ( '' !== $place ) {
		$fields['publisher-place'] = $place;
	}
	if ( '' !== $publisher ) {
		$fields['publisher'] = $publisher;
	}

	return $fields;
}

/**
 * Clean one place or publisher from a catalog imprint.
 *
 * Library placeholders for an unknown place or publisher ("s.l.", "s.n.",
 * "n.p.") are not values, and a date that trails the publisher
 * ("Calder & Boyars, 1976") belongs to the date field.
 *
 * @param string $value Raw place or publisher.
 * @return string The value, or an empty string.
 */
function bibliography_builder_catalog_imprint_value( $value ) {
	$value = trim( str_replace( array( '[', ']' ), '', (string) $value ), " .,;\t" );
	$value = trim( (string) preg_replace( '/,?\s*(?:c|©|p)?(?:1\d{3}|20\d{2})\??$/u', '', $value ), " .,;\t" );

	return preg_match( '/^(?:s\.?\s*l|s\.?\s*n|n\.?\s*p|sine loco|sine nomine)\.?$/iu', $value ) ? '' : $value;
}

/**
 * Convert an Internet Archive item metadata response to a CSL record plus
 * the catalog identifiers the item lists.
 *
 * The identifiers are the edition's own (`openlibrary_edition`, `isbn`,
 * `lccn`), never `related-external-id` or the several `oclc-id` values, which
 * name other editions and records of the same work.
 *
 * @param string $body       JSON response body from `/metadata/<identifier>/metadata`.
 * @param string $identifier The item identifier.
 * @return array|string|null `array( 'csl' => ..., 'ids' => ... )`, `not_found`,
 *                           or null when unusable.
 */
function bibliography_builder_archive_metadata_to_record( $body, $identifier ) {
	$decoded = json_decode( (string) $body, true );

	if ( ! is_array( $decoded ) ) {
		return null;
	}

	// The metadata-only read answers {"result": {...}}; an unknown item
	// answers {}. A collection is a list of items, not something to cite.
	$metadata = isset( $decoded['result'] ) && is_array( $decoded['result'] ) ? $decoded['result'] : array();

	if ( empty( $metadata ) || 'collection' === bibliography_builder_archive_first( $metadata, 'mediatype' ) ) {
		return 'not_found';
	}

	$title = bibliography_builder_clean_catalog_title(
		bibliography_builder_archive_first( $metadata, 'title' ),
		true
	);

	if ( '' === $title ) {
		return null;
	}

	$types     = array(
		'texts'    => 'book',
		'movies'   => 'motion_picture',
		'audio'    => 'song',
		'etree'    => 'song',
		'image'    => 'graphic',
		'software' => 'software',
	);
	$mediatype = bibliography_builder_archive_first( $metadata, 'mediatype' );

	$csl = array(
		'type'  => isset( $types[ $mediatype ] ) ? $types[ $mediatype ] : 'document',
		'title' => $title,
		'URL'   => BIBLIOGRAPHY_BUILDER_INTERNET_ARCHIVE_HOST . '/details/' . rawurlencode( $identifier ),
	);

	$authors = array();
	$seen    = array();
	foreach ( bibliography_builder_archive_all( $metadata, 'creator' ) as $creator ) {
		$csl_name = bibliography_builder_archive_creator_to_name( $creator );
		$name_key = strtolower( implode( '|', $csl_name ) );

		if ( ! empty( $csl_name ) && ! isset( $seen[ $name_key ] ) ) {
			$seen[ $name_key ] = true;
			$authors[]         = $csl_name;
		}
	}
	if ( ! empty( $authors ) ) {
		$csl['author'] = $authors;
	}

	$csl += bibliography_builder_split_publication_statement(
		bibliography_builder_archive_first( $metadata, 'publisher' )
	);

	$city = bibliography_builder_catalog_imprint_value( bibliography_builder_archive_first( $metadata, 'city' ) );
	if ( '' !== $city ) {
		$csl['publisher-place'] = $city;
	}

	$date = bibliography_builder_archive_first( $metadata, 'date' );
	if ( preg_match( '/^(\d{4})-(\d{2})(?:-(\d{2}))?/', $date, $parts ) ) {
		$csl['issued'] = array( 'date-parts' => array( array_map( 'intval', array_slice( $parts, 1 ) ) ) );
	} elseif ( null !== bibliography_builder_catalog_year( $date ) ) {
		$csl['issued'] = array( 'date-parts' => array( array( bibliography_builder_catalog_year( $date ) ) ) );
	}

	$edition = bibliography_builder_archive_first( $metadata, 'edition' );
	$edition = (string) preg_replace( '/\.+$/', '.', trim( str_replace( array( '[', ']' ), '', $edition ) ) );
	if ( '' !== $edition && '.' !== $edition ) {
		$csl['edition'] = $edition;
	}

	$ids = array();

	$olid = bibliography_builder_archive_first( $metadata, 'openlibrary_edition' );
	if ( '' !== bibliography_builder_normalize_catalog_key( $olid ) ) {
		$ids['olid'] = bibliography_builder_normalize_catalog_key( $olid );
	}

	foreach ( bibliography_builder_archive_all( $metadata, 'isbn' ) as $isbn ) {
		$isbn13 = bibliography_builder_normalize_isbn( $isbn );

		if ( '' !== $isbn13 ) {
			$csl['ISBN'] = $isbn13;
			$ids['isbn'] = 'ISBN:' . $isbn13;
			break;
		}
	}

	$lccn = bibliography_builder_normalize_lccn( bibliography_builder_archive_first( $metadata, 'lccn' ) );
	if ( '' !== $lccn ) {
		$ids['lccn'] = 'LCCN:' . $lccn;
	}

	return array(
		'csl' => $csl,
		'ids' => $ids,
	);
}

/**
 * Error messages for Internet Archive lookups.
 *
 * @return array
 */
function bibliography_builder_archive_messages() {
	return array(
		'unreachable'      => __(
			'The Internet Archive could not be reached.',
			'borges-bibliography-builder'
		),
		'not_found'        => __(
			'The Internet Archive item could not be found.',
			'borges-bibliography-builder'
		),
		'upstream'         => __(
			'The Internet Archive returned an error.',
			'borges-bibliography-builder'
		),
		'invalid_response' => __(
			'The Internet Archive returned an invalid response.',
			'borges-bibliography-builder'
		),
	);
}

/**
 * Find the item identifier for an Internet Archive ARK.
 *
 * @param string $ark Normalized ARK (`ark:/13960/...`).
 * @return string|WP_Error
 */
function bibliography_builder_archive_identifier_for_ark( $ark ) {
	$result = bibliography_builder_resolve_remote_csl(
		add_query_arg(
			array(
				'q'      => rawurlencode( 'identifier-ark:"' . $ark . '"' ),
				'fl[]'   => 'identifier',
				'rows'   => '1',
				'output' => 'json',
			),
			BIBLIOGRAPHY_BUILDER_INTERNET_ARCHIVE_HOST . '/advancedsearch.php'
		),
		'ia_ark_' . md5( $ark ),
		'bibliography_builder_archive',
		bibliography_builder_archive_messages(),
		static function ( $body ) {
			$decoded = json_decode( (string) $body, true );

			$docs = isset( $decoded['response']['docs'] ) ? $decoded['response']['docs'] : null;

			if ( ! is_array( $docs ) ) {
				return null;
			}

			$found = isset( $docs[0]['identifier'] ) ? $docs[0]['identifier'] : '';
			$found = bibliography_builder_normalize_archive_id( $found );

			return '' === $found || 0 === strpos( $found, 'ark:' ) ? 'not_found' : array( 'identifier' => $found );
		}
	);

	if ( is_wp_error( $result ) ) {
		return $result;
	}

	$data = $result->get_data();

	return (string) $data['identifier'];
}

/**
 * REST callback that resolves an Internet Archive item (identifier or ARK)
 * to a CSL-JSON record.
 *
 * The item's most specific catalog identifier is looked up first, because
 * Open Library's edition records are cleaner than scan metadata: its Open
 * Library edition, else its ISBN, else its LCCN, through one Books API call.
 * When it resolves, it supplies the record, the scan's metadata fills any
 * field it lacks (the edition statement, say), and the URL is always the
 * item's archive.org page. Otherwise the scan's own metadata is the record.
 *
 * @param WP_REST_Request $request REST request.
 * @return WP_REST_Response|WP_Error
 */
function bibliography_builder_rest_resolve_archive( WP_REST_Request $request ) {
	$identifier = bibliography_builder_normalize_archive_id( isset( $request['id'] ) ? $request['id'] : '' );

	if ( '' === $identifier ) {
		return new WP_Error(
			'bibliography_builder_archive_invalid',
			__( 'Invalid Internet Archive identifier.', 'borges-bibliography-builder' ),
			array( 'status' => 400 )
		);
	}

	if ( 0 === strpos( $identifier, 'ark:' ) ) {
		$identifier = bibliography_builder_archive_identifier_for_ark( $identifier );

		if ( is_wp_error( $identifier ) ) {
			return $identifier;
		}
	}

	$item = bibliography_builder_resolve_remote_csl(
		// The metadata part only: the full record also lists every file in
		// the item, which can run to thousands of entries.
		BIBLIOGRAPHY_BUILDER_INTERNET_ARCHIVE_HOST . '/metadata/' . rawurlencode( $identifier ) . '/metadata',
		'ia_' . md5( $identifier ),
		'bibliography_builder_archive',
		bibliography_builder_archive_messages(),
		static function ( $body ) use ( $identifier ) {
			return bibliography_builder_archive_metadata_to_record( $body, $identifier );
		}
	);

	if ( is_wp_error( $item ) ) {
		return $item;
	}

	$record = $item->get_data();
	$csl    = isset( $record['csl'] ) && is_array( $record['csl'] ) ? $record['csl'] : array();
	$ids    = isset( $record['ids'] ) && is_array( $record['ids'] ) ? $record['ids'] : array();

	// One catalog lookup at most, for the item's most specific identifier:
	// an item lookup already costs up to two requests (an ARK search and the
	// metadata), and trying identifiers in turn could chain enough slow
	// upstream calls to outrun PHP's execution time limit.
	foreach ( array( 'olid', 'isbn', 'lccn' ) as $source ) {
		if ( empty( $ids[ $source ] ) ) {
			continue;
		}

		$resolved = bibliography_builder_resolve_catalog_csl( $ids[ $source ] );

		if ( ! is_wp_error( $resolved ) && is_array( $resolved->get_data() ) ) {
			$merged        = array_merge( $csl, $resolved->get_data() );
			$merged['URL'] = $csl['URL'];

			return rest_ensure_response( $merged );
		}

		break;
	}

	return rest_ensure_response( $csl );
}

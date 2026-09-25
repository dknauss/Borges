<?php
/**
 * Read-only review routes for stored bibliographies (Phase 05, Tier 1).
 *
 * Three editor-facing checks on one bibliography block, none of which writes
 * anything:
 *
 * - `GET /posts/{post_id}/bibliographies/{ref}/validate` reports problems with
 *   each entry's stored CSL-JSON.
 * - `GET /posts/{post_id}/bibliographies/{ref}/duplicates` reports pairs of
 *   entries the editor's own duplicate check would treat as the same work.
 * - `GET /posts/{post_id}/bibliographies/{ref}/preview?style=…` shows each
 *   entry reformatted in another citation style next to its current text.
 *
 * `{ref}` is the block's zero-based index or its stable `bibliographyId`. All
 * three need `edit_post` on the post: they describe the stored data in more
 * detail than a reader needs, and the preview runs the CSL formatter.
 *
 * @package BibliographyBuilder
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Pattern a `{ref}` segment must match: an index or a stable block ID.
 */
const BIBLIOGRAPHY_BUILDER_BLOCK_REF_PATTERN = '[A-Za-z0-9][A-Za-z0-9_-]{0,63}';

/**
 * CSL types whose entries normally name the work they appear in.
 */
const BIBLIOGRAPHY_BUILDER_CONTAINER_TYPES = array(
	'article-journal',
	'article-magazine',
	'article-newspaper',
	'chapter',
	'paper-conference',
);

/**
 * Find one bibliography by index or stable `bibliographyId`.
 *
 * An all-digit reference is an index. The editor only generates UUIDs, which
 * always contain hyphens, so a real `bibliographyId` never reads as one.
 *
 * @param array  $bibliographies Prepared bibliographies for a post.
 * @param mixed  $ref            Index or `bibliographyId`.
 * @return array|null
 */
function bibliography_builder_find_bibliography( $bibliographies, $ref ) {
	$ref = (string) $ref;

	if ( ctype_digit( $ref ) ) {
		$index = (int) $ref;

		return isset( $bibliographies[ $index ] ) ? $bibliographies[ $index ] : null;
	}

	foreach ( $bibliographies as $bibliography ) {
		if ( null !== $bibliography['bibliographyId'] && $bibliography['bibliographyId'] === $ref ) {
			return $bibliography;
		}
	}

	return null;
}

/**
 * Load the bibliography a review request names, or a 404.
 *
 * @param WP_REST_Request $request REST request.
 * @return array|WP_Error
 */
function bibliography_builder_get_requested_bibliography( WP_REST_Request $request ) {
	$post         = get_post( absint( $request['post_id'] ) );
	$bibliography = bibliography_builder_find_bibliography(
		bibliography_builder_get_bibliographies_for_post( $post ),
		$request['ref']
	);

	if ( null === $bibliography ) {
		return new WP_Error(
			'bibliography_builder_not_found',
			__( 'Bibliography block not found for the requested index or ID.', 'borges-bibliography-builder' ),
			array( 'status' => 404 )
		);
	}

	return $bibliography;
}

/**
 * Fields shared by every review response.
 *
 * @param WP_REST_Request $request      REST request.
 * @param array           $bibliography Bibliography record.
 * @return array
 */
function bibliography_builder_review_response_base( WP_REST_Request $request, $bibliography ) {
	return array(
		'postId'         => absint( $request['post_id'] ),
		'index'          => $bibliography['index'],
		'bibliographyId' => $bibliography['bibliographyId'],
		'entryCount'     => $bibliography['entryCount'],
	);
}

/**
 * A citation's own ID, or null when it has none usable.
 *
 * @param array $citation Citation record.
 * @return string|null
 */
function bibliography_builder_get_citation_id( $citation ) {
	return isset( $citation['id'] )
		&& is_string( $citation['id'] )
		&& 1 === preg_match( '/^\S{1,128}$/u', $citation['id'] )
		? $citation['id']
		: null;
}

/**
 * Permission callback for the review routes: `edit_post` on the post.
 *
 * @param WP_REST_Request $request REST request.
 * @return true|WP_Error
 */
function bibliography_builder_rest_review_permissions_check( WP_REST_Request $request ) {
	$post = get_post( absint( $request['post_id'] ) );

	if ( ! $post ) {
		return new WP_Error(
			'bibliography_builder_post_not_found',
			__( 'Post not found.', 'borges-bibliography-builder' ),
			array( 'status' => 404 )
		);
	}

	if ( current_user_can( 'edit_post', $post->ID ) ) {
		return true;
	}

	return new WP_Error(
		'bibliography_builder_review_forbidden',
		__( 'Sorry, you are not allowed to review this bibliography.', 'borges-bibliography-builder' ),
		array( 'status' => 403 )
	);
}

/**
 * Build one validation issue.
 *
 * @param string      $severity `error` or `warning`.
 * @param string      $code     Machine-readable issue code.
 * @param string|null $field    CSL field the issue concerns.
 * @param string      $message  Human-readable message.
 * @return array
 */
function bibliography_builder_validation_issue( $severity, $code, $field, $message ) {
	return array(
		'severity' => $severity,
		'code'     => $code,
		'field'    => $field,
		'message'  => $message,
	);
}

/**
 * Normalize a DOI the way the editor's duplicate check does.
 *
 * @param mixed $value Raw DOI.
 * @return string
 */
function bibliography_builder_normalize_review_doi( $value ) {
	if ( ! is_string( $value ) ) {
		return '';
	}

	$doi = strtolower( trim( (string) preg_replace( '/\s+/u', ' ', $value ) ) );
	$doi = (string) preg_replace( '#^(?:https?://)?(?:dx\.)?doi\.org/#u', '', $doi );

	return (string) preg_replace( '/[).,;:\s]+$/u', '', $doi );
}

/**
 * Whether a CSL name list holds at least one usable name.
 *
 * @param mixed $names CSL name list.
 * @return bool
 */
function bibliography_builder_has_csl_name( $names ) {
	if ( ! is_array( $names ) ) {
		return false;
	}

	foreach ( $names as $name ) {
		if ( ! is_array( $name ) ) {
			continue;
		}

		foreach ( array( 'family', 'literal', 'given' ) as $part ) {
			if ( isset( $name[ $part ] ) && is_string( $name[ $part ] ) && '' !== trim( $name[ $part ] ) ) {
				return true;
			}
		}
	}

	return false;
}

/**
 * Whether a CSL ISBN value contains at least one checksum-valid ISBN.
 *
 * CSL allows several ISBNs in one field, often with qualifiers such as
 * "(pbk.)", so each ISBN-shaped run is checked on its own.
 *
 * @param mixed $value CSL `ISBN` value (string or list of strings).
 * @return bool
 */
function bibliography_builder_has_valid_isbn( $value ) {
	foreach ( (array) $value as $candidate ) {
		if ( ! is_string( $candidate ) ) {
			continue;
		}

		preg_match_all( '/[0-9][0-9Xx -]{8,16}[0-9Xx]/', $candidate, $matches );

		foreach ( $matches[0] as $isbn ) {
			if ( '' !== bibliography_builder_normalize_isbn( $isbn ) ) {
				return true;
			}
		}
	}

	return false;
}

/**
 * Check one stored citation and list what is wrong with it.
 *
 * Errors mean the entry cannot be formatted as stored or is missing what a
 * reader needs to find the work. Warnings are gaps worth a look that some
 * works legitimately have.
 *
 * @param array $citation Citation record.
 * @return array List of issues.
 */
function bibliography_builder_validate_citation( $citation ) {
	$issues = array();

	if ( null === bibliography_builder_get_citation_id( $citation ) ) {
		$issues[] = bibliography_builder_validation_issue(
			'warning',
			'missing-id',
			null,
			__(
				'The entry has no stable ID. Opening the post in the editor assigns one.',
				'borges-bibliography-builder'
			)
		);
	}

	if ( ! isset( $citation['csl'] ) || ! is_array( $citation['csl'] ) || array() === $citation['csl'] ) {
		$issues[] = bibliography_builder_validation_issue(
			'error',
			'missing-csl',
			null,
			__( 'The entry has no CSL-JSON data.', 'borges-bibliography-builder' )
		);

		return $issues;
	}

	$csl = bibliography_builder_validate_and_sanitize_csl_item( $citation['csl'] );

	if ( is_wp_error( $csl ) ) {
		$issues[] = bibliography_builder_validation_issue( 'error', 'invalid-csl', null, $csl->get_error_message() );

		return $issues;
	}

	if ( ! isset( $csl['title'] ) || '' === trim( (string) $csl['title'] ) ) {
		$issues[] = bibliography_builder_validation_issue(
			'error',
			'missing-title',
			'title',
			__( 'The entry has no title.', 'borges-bibliography-builder' )
		);
	}

	if (
		! bibliography_builder_has_csl_name( isset( $csl['author'] ) ? $csl['author'] : null )
		&& ! bibliography_builder_has_csl_name( isset( $csl['editor'] ) ? $csl['editor'] : null )
	) {
		$issues[] = bibliography_builder_validation_issue(
			'warning',
			'missing-author',
			'author',
			__( 'The entry has no author or editor.', 'borges-bibliography-builder' )
		);
	}

	if ( empty( $csl['issued'] ) ) {
		$issues[] = bibliography_builder_validation_issue(
			'warning',
			'missing-issued',
			'issued',
			__( 'The entry has no publication date.', 'borges-bibliography-builder' )
		);
	}

	if (
		in_array( $csl['type'], BIBLIOGRAPHY_BUILDER_CONTAINER_TYPES, true )
		&& ( ! isset( $csl['container-title'] ) || '' === trim( (string) $csl['container-title'] ) )
	) {
		$issues[] = bibliography_builder_validation_issue(
			'warning',
			'missing-container-title',
			'container-title',
			__(
				'The entry does not name the journal, book, or proceedings it appears in.',
				'borges-bibliography-builder'
			)
		);
	}

	if (
		array_key_exists( 'DOI', $csl )
		&& 1 !== preg_match( '#^10\.\d{4,9}/\S+$#u', bibliography_builder_normalize_review_doi( $csl['DOI'] ) )
	) {
		$issues[] = bibliography_builder_validation_issue(
			'error',
			'malformed-doi',
			'DOI',
			__( 'The DOI is not in the form 10.prefix/suffix.', 'borges-bibliography-builder' )
		);
	}

	if ( array_key_exists( 'ISBN', $csl ) && ! bibliography_builder_has_valid_isbn( $csl['ISBN'] ) ) {
		$issues[] = bibliography_builder_validation_issue(
			'warning',
			'invalid-isbn',
			'ISBN',
			__( 'The ISBN field holds no checksum-valid ISBN.', 'borges-bibliography-builder' )
		);
	}

	return $issues;
}

/**
 * REST callback: validate every entry in one bibliography.
 *
 * @param WP_REST_Request $request REST request.
 * @return WP_REST_Response|WP_Error
 */
function bibliography_builder_rest_validate_bibliography( WP_REST_Request $request ) {
	$bibliography = bibliography_builder_get_requested_bibliography( $request );

	if ( is_wp_error( $bibliography ) ) {
		return $bibliography;
	}

	$entries       = array();
	$error_count   = 0;
	$warning_count = 0;

	foreach ( $bibliography['citations'] as $index => $citation ) {
		$issues = bibliography_builder_validate_citation( $citation );
		$errors = count(
			array_filter(
				$issues,
				static function ( $issue ) {
					return 'error' === $issue['severity'];
				}
			)
		);

		$error_count   += $errors;
		$warning_count += count( $issues ) - $errors;
		$entries[]      = array(
			'index'  => $index,
			'id'     => bibliography_builder_get_citation_id( $citation ),
			'valid'  => 0 === $errors,
			'issues' => $issues,
		);
	}

	return rest_ensure_response(
		array_merge(
			bibliography_builder_review_response_base( $request, $bibliography ),
			array(
				'valid'        => 0 === $error_count,
				'errorCount'   => $error_count,
				'warningCount' => $warning_count,
				'entries'      => $entries,
			)
		)
	);
}

/**
 * Normalize text the way the editor's duplicate check does.
 *
 * @param mixed $value Raw text.
 * @return string
 */
function bibliography_builder_normalize_review_text( $value ) {
	if ( ! is_string( $value ) ) {
		return '';
	}

	$text = trim( (string) preg_replace( '/\s+/u', ' ', $value ) );
	$text = function_exists( 'mb_strtolower' ) ? mb_strtolower( $text, 'UTF-8' ) : strtolower( $text );

	return (string) preg_replace( '/[^\p{L}\p{N}\s]/u', '', $text );
}

/**
 * The keys the duplicate check compares for one citation.
 *
 * @param array $citation Citation record.
 * @return array{doi: string, title: string, author: string, year: string}
 */
function bibliography_builder_get_duplicate_keys( $citation ) {
	$csl    = isset( $citation['csl'] ) && is_array( $citation['csl'] ) ? $citation['csl'] : array();
	$author = isset( $csl['author'][0] ) && is_array( $csl['author'][0] ) ? $csl['author'][0] : array();
	$family = '';

	if ( ! empty( $author['family'] ) ) {
		$family = $author['family'];
	} elseif ( ! empty( $author['literal'] ) ) {
		$family = $author['literal'];
	}

	$year = isset( $csl['issued']['date-parts'][0][0] ) ? $csl['issued']['date-parts'][0][0] : '';

	return array(
		'doi'    => isset( $csl['DOI'] ) ? bibliography_builder_normalize_review_doi( $csl['DOI'] ) : '',
		'title'  => isset( $csl['title'] ) ? bibliography_builder_normalize_review_text( $csl['title'] ) : '',
		'author' => bibliography_builder_normalize_review_text( $family ),
		'year'   => is_scalar( $year ) ? (string) $year : '',
	);
}

/**
 * Why two citations count as duplicates, or null when they do not.
 *
 * Mirrors `citationsMatch()` in `src/lib/deduplicate.js`, so the route flags
 * the same pairs the editor would have refused to add twice: a shared DOI, or
 * the same title with the same year, the same first author, or neither.
 *
 * @param array $first  Duplicate keys of the first citation.
 * @param array $second Duplicate keys of the second citation.
 * @return string|null `doi`, `title-year`, `title-author`, or `title`.
 */
function bibliography_builder_get_duplicate_reason( $first, $second ) {
	if ( '' !== $first['doi'] && $first['doi'] === $second['doi'] ) {
		return 'doi';
	}

	if ( '' === $first['title'] || $first['title'] !== $second['title'] ) {
		return null;
	}

	if ( '' !== $first['year'] && $first['year'] === $second['year'] ) {
		return 'title-year';
	}

	if ( '' !== $first['author'] && $first['author'] === $second['author'] ) {
		return 'title-author';
	}

	$all_missing = '' === $first['year'] && '' === $second['year']
		&& '' === $first['author'] && '' === $second['author'];

	return $all_missing ? 'title' : null;
}

/**
 * REST callback: list likely duplicate pairs in one bibliography.
 *
 * @param WP_REST_Request $request REST request.
 * @return WP_REST_Response|WP_Error
 */
function bibliography_builder_rest_get_bibliography_duplicates( WP_REST_Request $request ) {
	$bibliography = bibliography_builder_get_requested_bibliography( $request );

	if ( is_wp_error( $bibliography ) ) {
		return $bibliography;
	}

	$citations = $bibliography['citations'];
	$keys      = array_map( 'bibliography_builder_get_duplicate_keys', $citations );
	$pairs     = array();
	$count     = count( $citations );

	for ( $i = 0; $i < $count; $i++ ) {
		for ( $j = $i + 1; $j < $count; $j++ ) {
			$reason = bibliography_builder_get_duplicate_reason( $keys[ $i ], $keys[ $j ] );

			if ( null === $reason ) {
				continue;
			}

			$pairs[] = array(
				'reason' => $reason,
				'first'  => array(
					'index' => $i,
					'id'    => bibliography_builder_get_citation_id( $citations[ $i ] ),
				),
				'second' => array(
					'index' => $j,
					'id'    => bibliography_builder_get_citation_id( $citations[ $j ] ),
				),
			);
		}
	}

	return rest_ensure_response(
		array_merge(
			bibliography_builder_review_response_base( $request, $bibliography ),
			array( 'pairs' => $pairs )
		)
	);
}

/**
 * REST callback: preview one bibliography reformatted in another style.
 *
 * Nothing is saved. Entries whose stored CSL-JSON the formatter rejects get a
 * null preview and the reason, and the rest are still formatted.
 *
 * @param WP_REST_Request $request REST request.
 * @return WP_REST_Response|WP_Error
 */
function bibliography_builder_rest_preview_bibliography( WP_REST_Request $request ) {
	$bibliography = bibliography_builder_get_requested_bibliography( $request );

	if ( is_wp_error( $bibliography ) ) {
		return $bibliography;
	}

	if ( $bibliography['entryCount'] > BIBLIOGRAPHY_BUILDER_MAX_FORMAT_ITEMS ) {
		return new WP_Error(
			'bibliography_builder_too_many_items',
			sprintf(
				/* translators: %d: maximum number of entries. */
				__( 'Previews are limited to bibliographies of %d entries or fewer.', 'borges-bibliography-builder' ),
				BIBLIOGRAPHY_BUILDER_MAX_FORMAT_ITEMS
			),
			array( 'status' => 400 )
		);
	}

	$style_key = (string) $request['style'];
	$valid     = array();
	$errors    = array();

	foreach ( $bibliography['citations'] as $index => $citation ) {
		$csl = isset( $citation['csl'] ) && is_array( $citation['csl'] ) && array() !== $citation['csl']
			? bibliography_builder_validate_and_sanitize_csl_item( $citation['csl'] )
			: new WP_Error(
				'bibliography_builder_invalid_csl_item',
				__( 'The entry has no CSL-JSON data.', 'borges-bibliography-builder' )
			);

		if ( is_wp_error( $csl ) ) {
			$errors[ $index ] = $csl->get_error_message();
		} else {
			$valid[ $index ] = $csl;
		}
	}

	$formatted = array() === $valid
		? array()
		: bibliography_builder_format_csl_items( array_values( $valid ), $style_key );

	if ( is_wp_error( $formatted ) ) {
		return $formatted;
	}

	$previews = array() === $valid ? array() : array_combine( array_keys( $valid ), $formatted );
	$entries  = array();

	foreach ( $bibliography['citations'] as $index => $citation ) {
		$current = bibliography_builder_sanitize_formatted_text(
			bibliography_builder_get_citation_display_text( $citation )
		);
		$preview = isset( $previews[ $index ] ) ? $previews[ $index ] : null;

		$entries[] = array(
			'index'   => $index,
			'id'      => bibliography_builder_get_citation_id( $citation ),
			'current' => $current,
			'preview' => $preview,
			'changed' => null !== $preview && $preview !== $current,
			'error'   => isset( $errors[ $index ] ) ? $errors[ $index ] : null,
		);
	}

	return rest_ensure_response(
		array_merge(
			bibliography_builder_review_response_base( $request, $bibliography ),
			array(
				'currentStyle' => $bibliography['citationStyle'],
				'style'        => $style_key,
				'entries'      => $entries,
			)
		)
	);
}

/**
 * Register the review routes. Called from the main route registration, after
 * the existing routes, so their registration order is unchanged.
 */
function bibliography_builder_register_review_routes() {
	$base = '/posts/(?P<post_id>\d+)/bibliographies/(?P<ref>' . BIBLIOGRAPHY_BUILDER_BLOCK_REF_PATTERN . ')';
	$args = array(
		'post_id' => array(
			'description'       => __( 'Post ID to inspect for bibliography blocks.', 'borges-bibliography-builder' ),
			'type'              => 'integer',
			'sanitize_callback' => 'absint',
			'validate_callback' => static function ( $value ) {
				return is_numeric( $value ) && (int) $value > 0;
			},
		),
		'ref'     => array(
			'description'       => __(
				'Zero-based bibliography block index, or the block\'s bibliographyId.',
				'borges-bibliography-builder'
			),
			'type'              => 'string',
			'validate_callback' => static function ( $value ) {
				return is_string( $value )
					&& 1 === preg_match( '/^' . BIBLIOGRAPHY_BUILDER_BLOCK_REF_PATTERN . '$/', $value );
			},
		),
	);

	register_rest_route(
		'bibliography/v1',
		$base . '/validate',
		array(
			'methods'             => WP_REST_Server::READABLE,
			'callback'            => 'bibliography_builder_rest_validate_bibliography',
			'permission_callback' => 'bibliography_builder_rest_review_permissions_check',
			'args'                => $args,
		)
	);

	register_rest_route(
		'bibliography/v1',
		$base . '/duplicates',
		array(
			'methods'             => WP_REST_Server::READABLE,
			'callback'            => 'bibliography_builder_rest_get_bibliography_duplicates',
			'permission_callback' => 'bibliography_builder_rest_review_permissions_check',
			'args'                => $args,
		)
	);

	register_rest_route(
		'bibliography/v1',
		$base . '/preview',
		array(
			'methods'             => WP_REST_Server::READABLE,
			'callback'            => 'bibliography_builder_rest_preview_bibliography',
			'permission_callback' => 'bibliography_builder_rest_review_permissions_check',
			'args'                => array_merge(
				$args,
				array(
					'style' => array(
						'description'       => __( 'Citation style key to preview.', 'borges-bibliography-builder' ),
						'type'              => 'string',
						'required'          => true,
						'validate_callback' => static function ( $value ) {
							return is_string( $value )
								&& array_key_exists( $value, bibliography_builder_get_formatter_style_definitions() );
						},
					),
				)
			),
		)
	);
}

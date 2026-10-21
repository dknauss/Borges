<?php
/**
 * CSL-JSON validation and sanitization for the formatter and write paths.
 *
 * Moved unchanged from bibliography-builder.php (refactor memo, Phase B).
 * Keep the rules in step with src/lib/csl-sanitize.js.
 *
 * @package BibliographyBuilder
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Return the CSL item types accepted by the formatter endpoint.
 *
 * Keep this in sync with src/lib/csl-sanitize.js.
 *
 * @return array
 */
function bibliography_builder_get_known_csl_types() {
	return array(
		'article',
		'article-journal',
		'article-magazine',
		'article-newspaper',
		'bill',
		'book',
		'broadcast',
		'chapter',
		'classic',
		'collection',
		'dataset',
		'document',
		'entry',
		'entry-dictionary',
		'entry-encyclopedia',
		'event',
		'figure',
		'graphic',
		'hearing',
		'interview',
		'legal_case',
		'legislation',
		'magazine',
		'manuscript',
		'map',
		'motion_picture',
		'musical_score',
		'performance',
		'pamphlet',
		'paper-conference',
		'patent',
		'periodical',
		'post',
		'post-weblog',
		'personal_communication',
		'regulation',
		'report',
		'review',
		'review-book',
		'software',
		'song',
		'speech',
		'standard',
		'thesis',
		'treaty',
		'webpage',
	);
}

/**
 * Return CSL fields that must contain strings.
 *
 * @return array
 */
function bibliography_builder_get_csl_string_fields() {
	return array(
		'title',
		'container-title',
		'publisher',
		'page',
		'number',
		'volume',
		'issue',
		'DOI',
		'URL',
		'language',
		'edition',
		'medium',
		'genre',
		'publisher-place',
		'event-place',
		'reviewed-title',
	);
}

/**
 * Whether any string anywhere in a CSL value exceeds the per-field byte cap.
 *
 * Stripping is reached from five separate call sites — the flat string-field
 * loop, author name parts, date literal/raw, and both branches of the
 * string-or-array handler — and the strip is the expensive step. Capping at one
 * call site leaves the same cost reachable under a different key, so the check
 * lives here and runs once over the whole decoded item before any sanitization
 * begins. Any string field added to any of those paths later is bounded
 * automatically.
 *
 * Depth is bounded the same way bibliography_builder_sanitize_csl_value bounds
 * it; over-deep items are rejected separately by that function.
 *
 * @param mixed $value CSL value, of any shape.
 * @param int   $depth Current recursion depth.
 * @return bool True when some string exceeds the cap.
 */
function bibliography_builder_csl_has_oversized_string( $value, $depth = 0 ) {
	if ( $depth > 10 ) {
		return false;
	}

	if ( is_string( $value ) ) {
		return strlen( $value ) > BIBLIOGRAPHY_BUILDER_MAX_CSL_FIELD_BYTES;
	}

	if ( is_array( $value ) ) {
		foreach ( $value as $item ) {
			if ( bibliography_builder_csl_has_oversized_string( $item, $depth + 1 ) ) {
				return true;
			}
		}
	}

	return false;
}

/**
 * Strip tags from text that may be arbitrarily long, bounding the work first.
 *
 * The write path rejects oversized strings outright, but the read path cannot:
 * the text is already in post_content, and refusing to render a stored
 * bibliography would break a post that exists. Truncate to the same cap
 * instead, which bounds the regex cost while staying lossless for any real
 * citation — 64 KB is far beyond the longest plausible formatted entry.
 *
 * Without this, a single oversized string stored in a published post makes
 * every subsequent read of that bibliography pay ~12 seconds of CPU, on a route
 * that needs no authentication.
 *
 * @param string $text Possibly untrusted, possibly very long text.
 * @return string Stripped text.
 */
function bibliography_builder_strip_bounded( $text ) {
	$text = (string) $text;

	if ( strlen( $text ) > BIBLIOGRAPHY_BUILDER_MAX_CSL_FIELD_BYTES ) {
		$text = function_exists( 'mb_strcut' )
			? mb_strcut( $text, 0, BIBLIOGRAPHY_BUILDER_MAX_CSL_FIELD_BYTES, 'UTF-8' )
			: substr( $text, 0, BIBLIOGRAPHY_BUILDER_MAX_CSL_FIELD_BYTES );
	}

	return wp_strip_all_tags( $text, false );
}

/**
 * Strip HTML markup from CSL strings, including nested/broken tag payloads.
 *
 * Callers must bound the input first; see
 * bibliography_builder_csl_has_oversized_string().
 *
 * @param string $text String value.
 * @return string
 */
function bibliography_builder_strip_csl_html( $text ) {
	$result = (string) $text;

	do {
		$previous = $result;
		$result   = wp_strip_all_tags( $result );
	} while ( $result !== $previous );

	return $result;
}

/**
 * Whether a CSL key should be dropped before storage/formatting.
 *
 * @param string|int $key Array key.
 * @return bool
 */
function bibliography_builder_is_forbidden_csl_key( $key ) {
	return in_array( (string) $key, array( '__proto__', 'constructor', 'prototype' ), true );
}

/**
 * Recursively sanitize a CSL value and reject excessive nesting.
 *
 * @param mixed $value Value to sanitize.
 * @param int   $depth Current recursion depth.
 * @param bool  $valid Validity accumulator.
 * @return mixed
 */
function bibliography_builder_sanitize_csl_value( $value, $depth, &$valid ) {
	if ( $depth > 10 ) {
		$valid = false;
		return null;
	}

	if ( is_string( $value ) || is_int( $value ) || is_float( $value ) || is_bool( $value ) ) {
		return $value;
	}

	if ( is_array( $value ) ) {
		$sanitized = array();

		foreach ( $value as $key => $nested_value ) {
			if ( bibliography_builder_is_forbidden_csl_key( $key ) ) {
				continue;
			}

			$nested_valid    = true;
			$sanitized_value = bibliography_builder_sanitize_csl_value( $nested_value, $depth + 1, $nested_valid );

			if ( ! $nested_valid ) {
				$valid = false;
				continue;
			}

			if ( null !== $sanitized_value ) {
				$sanitized[ $key ] = $sanitized_value;
			}
		}

		return $sanitized;
	}

	if ( null !== $value ) {
		$valid = false;
	}

	return null;
}

/**
 * Normalize one CSL date part to an integer.
 *
 * @param mixed $part Date part.
 * @return int|null
 */
function bibliography_builder_normalize_csl_date_part( $part ) {
	if ( is_int( $part ) ) {
		return $part;
	}

	if ( is_float( $part ) && floor( $part ) === $part ) {
		return (int) $part;
	}

	if ( is_string( $part ) && preg_match( '/^\d+$/', $part ) ) {
		return (int) $part;
	}

	return null;
}

/**
 * Sanitize and validate CSL date structures.
 *
 * @param mixed $issued CSL issued/accessed value.
 * @return array|WP_Error
 */
function bibliography_builder_sanitize_csl_date( $issued ) {
	if ( ! is_array( $issued ) || bibliography_builder_is_list_array( $issued ) ) {
		return new WP_Error(
			'bibliography_builder_invalid_csl_item',
			__( 'Invalid CSL date value.', 'borges-bibliography-builder' ),
			array( 'status' => 400 )
		);
	}

	$valid            = true;
	$sanitized_issued = bibliography_builder_sanitize_csl_value( $issued, 0, $valid );

	if ( ! $valid || ! is_array( $sanitized_issued ) ) {
		return new WP_Error(
			'bibliography_builder_invalid_csl_item',
			__( 'Invalid CSL date value.', 'borges-bibliography-builder' ),
			array( 'status' => 400 )
		);
	}

	$has_valid_date = false;

	if ( array_key_exists( 'date-parts', $sanitized_issued ) ) {
		if ( ! is_array( $sanitized_issued['date-parts'] ) || empty( $sanitized_issued['date-parts'] ) ) {
			return new WP_Error(
				'bibliography_builder_invalid_csl_item',
				__( 'Invalid CSL date-parts.', 'borges-bibliography-builder' ),
				array( 'status' => 400 )
			);
		}

		$date_parts = array();

		foreach ( $sanitized_issued['date-parts'] as $date_part ) {
			if ( ! is_array( $date_part ) ) {
				continue;
			}

			$normalized_date_part = array();

			foreach ( $date_part as $part ) {
				$normalized_part = bibliography_builder_normalize_csl_date_part( $part );

				if ( null !== $normalized_part ) {
					$normalized_date_part[] = $normalized_part;
				}
			}

			if ( ! empty( $normalized_date_part ) ) {
				$date_parts[] = $normalized_date_part;
			}
		}

		if ( empty( $date_parts ) ) {
			return new WP_Error(
				'bibliography_builder_invalid_csl_item',
				__( 'Invalid CSL date-parts.', 'borges-bibliography-builder' ),
				array( 'status' => 400 )
			);
		}

		$sanitized_issued['date-parts'] = $date_parts;
		$has_valid_date                 = true;
	}

	foreach ( array( 'literal', 'raw' ) as $field ) {
		if ( ! array_key_exists( $field, $sanitized_issued ) ) {
			continue;
		}

		if ( ! is_string( $sanitized_issued[ $field ] ) ) {
			return new WP_Error(
				'bibliography_builder_invalid_csl_item',
				__( 'Invalid CSL date value.', 'borges-bibliography-builder' ),
				array( 'status' => 400 )
			);
		}

		$sanitized_issued[ $field ] = bibliography_builder_strip_csl_html( $sanitized_issued[ $field ] );
		$has_valid_date             = true;
	}

	if ( ! $has_valid_date ) {
		return new WP_Error(
			'bibliography_builder_invalid_csl_item',
			__( 'Invalid CSL date-parts.', 'borges-bibliography-builder' ),
			array( 'status' => 400 )
		);
	}

	return $sanitized_issued;
}

/**
 * Sanitize and validate one CSL name object.
 *
 * @param mixed $author CSL name object.
 * @return array|WP_Error
 */
function bibliography_builder_sanitize_csl_author( $author ) {
	if ( ! is_array( $author ) || bibliography_builder_is_list_array( $author ) ) {
		return new WP_Error(
			'bibliography_builder_invalid_csl_item',
			__( 'Invalid CSL author entry.', 'borges-bibliography-builder' ),
			array( 'status' => 400 )
		);
	}

	$valid            = true;
	$sanitized_author = bibliography_builder_sanitize_csl_value( $author, 0, $valid );

	if ( ! $valid || ! is_array( $sanitized_author ) ) {
		return new WP_Error(
			'bibliography_builder_invalid_csl_item',
			__( 'Invalid CSL author entry.', 'borges-bibliography-builder' ),
			array( 'status' => 400 )
		);
	}

	foreach ( array( 'family', 'given', 'literal', 'ORCID' ) as $key ) {
		if ( array_key_exists( $key, $sanitized_author ) && ! is_string( $sanitized_author[ $key ] ) ) {
			return new WP_Error(
				'bibliography_builder_invalid_csl_item',
				__( 'Invalid CSL author field.', 'borges-bibliography-builder' ),
				array( 'status' => 400 )
			);
		}

		if ( array_key_exists( $key, $sanitized_author ) ) {
			$sanitized_author[ $key ] = bibliography_builder_strip_csl_html( $sanitized_author[ $key ] );
		}
	}

	return $sanitized_author;
}

/**
 * Sanitize and validate CSL name lists.
 *
 * @param mixed  $names CSL name list.
 * @param string $field Field name.
 * @return array|WP_Error
 */
function bibliography_builder_sanitize_csl_name_list( $names, $field ) {
	if ( ! is_array( $names ) ) {
		return new WP_Error(
			'bibliography_builder_invalid_csl_item',
			sprintf(
				/* translators: %s: CSL field name. */
				__( 'Invalid CSL %s list.', 'borges-bibliography-builder' ),
				$field
			),
			array( 'status' => 400 )
		);
	}

	$sanitized = array();

	foreach ( $names as $author ) {
		$sanitized_author = bibliography_builder_sanitize_csl_author( $author );

		if ( is_wp_error( $sanitized_author ) ) {
			return $sanitized_author;
		}

		$sanitized[] = $sanitized_author;
	}

	return $sanitized;
}

/**
 * Sanitize and validate a string-or-string-array CSL field.
 *
 * @param mixed  $value Field value.
 * @param string $field Field name.
 * @return string|array|WP_Error
 */
function bibliography_builder_sanitize_csl_string_or_array_field( $value, $field ) {
	if ( is_string( $value ) ) {
		return bibliography_builder_strip_csl_html( $value );
	}

	if ( is_array( $value ) ) {
		$sanitized = array();

		foreach ( $value as $item ) {
			if ( ! is_string( $item ) ) {
				return new WP_Error(
					'bibliography_builder_invalid_csl_item',
					sprintf(
						/* translators: %s: CSL field name. */
						__( 'Invalid CSL %s.', 'borges-bibliography-builder' ),
						$field
					),
					array( 'status' => 400 )
				);
			}

			$sanitized[] = bibliography_builder_strip_csl_html( $item );
		}

		return $sanitized;
	}

	return new WP_Error(
		'bibliography_builder_invalid_csl_item',
		sprintf(
			/* translators: %s: CSL field name. */
			__( 'Invalid CSL %s.', 'borges-bibliography-builder' ),
			$field
		),
		array( 'status' => 400 )
	);
}

/**
 * Validate and sanitize one CSL-JSON item for the formatter endpoint.
 *
 * @param mixed $csl CSL-JSON item.
 * @return array|WP_Error
 */
function bibliography_builder_validate_and_sanitize_csl_item( $csl ) {
	if ( ! is_array( $csl ) || bibliography_builder_is_list_array( $csl ) ) {
		return new WP_Error(
			'bibliography_builder_invalid_csl_item',
			__( 'Invalid CSL object.', 'borges-bibliography-builder' ),
			array( 'status' => 400 )
		);
	}

	// Bound string length before anything strips HTML. Every strip path is
	// covered by this one check; see bibliography_builder_csl_has_oversized_string.
	if ( bibliography_builder_csl_has_oversized_string( $csl ) ) {
		return new WP_Error(
			'bibliography_builder_invalid_csl_item',
			sprintf(
				/* translators: %d: maximum length in bytes. */
				__( 'A CSL field exceeds the maximum length of %d bytes.', 'borges-bibliography-builder' ),
				BIBLIOGRAPHY_BUILDER_MAX_CSL_FIELD_BYTES
			),
			array( 'status' => 400 )
		);
	}

	$valid         = true;
	$sanitized_csl = bibliography_builder_sanitize_csl_value( $csl, 0, $valid );

	if ( ! $valid || ! is_array( $sanitized_csl ) ) {
		return new WP_Error(
			'bibliography_builder_invalid_csl_item',
			__( 'Invalid CSL object.', 'borges-bibliography-builder' ),
			array( 'status' => 400 )
		);
	}

	if (
		empty( $sanitized_csl['type'] ) ||
		! is_string( $sanitized_csl['type'] ) ||
		! in_array( $sanitized_csl['type'], bibliography_builder_get_known_csl_types(), true )
	) {
		return new WP_Error(
			'bibliography_builder_invalid_csl_item',
			__( 'Invalid CSL type.', 'borges-bibliography-builder' ),
			array( 'status' => 400 )
		);
	}

	foreach ( array( 'author', 'editor', 'reviewed-author' ) as $field ) {
		if ( array_key_exists( $field, $sanitized_csl ) ) {
			$sanitized_list = bibliography_builder_sanitize_csl_name_list( $sanitized_csl[ $field ], $field );

			if ( is_wp_error( $sanitized_list ) ) {
				return $sanitized_list;
			}

			$sanitized_csl[ $field ] = $sanitized_list;
		}
	}

	foreach ( array( 'issued', 'accessed' ) as $field ) {
		if ( array_key_exists( $field, $sanitized_csl ) ) {
			$sanitized_date = bibliography_builder_sanitize_csl_date( $sanitized_csl[ $field ] );

			if ( is_wp_error( $sanitized_date ) ) {
				return $sanitized_date;
			}

			$sanitized_csl[ $field ] = $sanitized_date;
		}
	}

	foreach ( bibliography_builder_get_csl_string_fields() as $field ) {
		if ( array_key_exists( $field, $sanitized_csl ) ) {
			if ( ! is_string( $sanitized_csl[ $field ] ) ) {
				if (
					'title' !== $field
					&& ( is_int( $sanitized_csl[ $field ] ) || is_float( $sanitized_csl[ $field ] ) )
				) {
					$sanitized_csl[ $field ] = (string) $sanitized_csl[ $field ];
				} else {
					return new WP_Error(
						'bibliography_builder_invalid_csl_item',
						sprintf(
							/* translators: %s: CSL field name. */
							__( 'Invalid CSL %s.', 'borges-bibliography-builder' ),
							$field
						),
						array( 'status' => 400 )
					);
				}
			}

			$sanitized_csl[ $field ] = bibliography_builder_strip_csl_html( $sanitized_csl[ $field ] );
		}
	}

	foreach ( array( 'ISBN', 'ISSN' ) as $field ) {
		if ( array_key_exists( $field, $sanitized_csl ) ) {
			$sanitized_identifier = bibliography_builder_sanitize_csl_string_or_array_field(
				$sanitized_csl[ $field ],
				$field
			);

			if ( is_wp_error( $sanitized_identifier ) ) {
				return $sanitized_identifier;
			}

			$sanitized_csl[ $field ] = $sanitized_identifier;
		}
	}

	return $sanitized_csl;
}

/**
 * Validate and sanitize a list of CSL-JSON items for the formatter endpoint.
 *
 * @param array $csl_items CSL-JSON items.
 * @return array|WP_Error
 */
function bibliography_builder_validate_and_sanitize_csl_items( $csl_items ) {
	$sanitized_items = array();

	foreach ( array_values( $csl_items ) as $index => $item ) {
		$sanitized_item = bibliography_builder_validate_and_sanitize_csl_item( $item );

		if ( is_wp_error( $sanitized_item ) ) {
			return new WP_Error(
				$sanitized_item->get_error_code(),
				sprintf(
					/* translators: %d: 1-based citation item number. */
					__( 'Invalid CSL citation item at position %d.', 'borges-bibliography-builder' ),
					$index + 1
				),
				$sanitized_item->get_error_data()
			);
		}

		$sanitized_items[] = $sanitized_item;
	}

	return $sanitized_items;
}

<?php
/**
 * Citation write routes (Phase 05, M2 / Tier 2).
 *
 * Off unless a site opts in:
 *
 *     add_filter( 'bibliography_builder_enable_write_routes', '__return_true' );
 *
 * (from a small companion plugin or an mu-plugin; see
 * docs/rest-write-routes.md). When on, under
 * /bibliography/v1/posts/{post_id}/bibliographies/{ref}/citations:
 *
 * - POST                  add CSL-JSON items
 * - PATCH  /{citation_id} change fields on one citation
 * - DELETE /{citation_id} remove one citation
 * - PUT    /order         reorder a numeric-style bibliography
 *
 * Every route needs `edit_post` on the post. Every route is a dry run unless
 * `dry_run=false`, and a real write needs an `If-Match` header carrying the
 * ETag of the content it was based on (412 when the post has changed since,
 * 428 when the header is missing). A write rebuilds the block's saved markup
 * with the PHP port of save(), splices just that block into post_content
 * (includes/block-locator.php), and saves through wp_update_post(), so it
 * lands as an ordinary revision.
 *
 * @package BibliographyBuilder
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Most citations one bibliography may hold; matches the editor's limit.
 */
const BIBLIOGRAPHY_BUILDER_MAX_CITATIONS_PER_BIBLIOGRAPHY = 200;

/**
 * Most items one add request may carry; matches the /format limit.
 */
const BIBLIOGRAPHY_BUILDER_MAX_ITEMS_PER_WRITE = 50;

/**
 * Whether the write routes are enabled on this site.
 *
 * @return bool
 */
function bibliography_builder_write_routes_enabled() {
	/**
	 * Filters whether Borges registers its citation write routes.
	 *
	 * @param bool $enabled Default false.
	 */
	return (bool) apply_filters( 'bibliography_builder_enable_write_routes', false );
}

/**
 * The ETag for a post's current content.
 *
 * A hash of post_content, not of post_modified_gmt: two saves in the same
 * second would share a modified time, but never content.
 *
 * @param object $post Post object.
 * @return string Quoted strong ETag.
 */
function bibliography_builder_post_etag( $post ) {
	return '"' . sha1( (string) $post->post_content ) . '"';
}

/**
 * Add the post's ETag to a read response when the write routes are on, so a
 * client can send it back as If-Match without a dry run first.
 *
 * @param WP_REST_Response $response Response.
 * @param object|null      $post     Post object.
 * @return WP_REST_Response
 */
function bibliography_builder_with_write_etag( $response, $post ) {
	if ( is_object( $post ) && bibliography_builder_write_routes_enabled() ) {
		$response->header( 'ETag', bibliography_builder_post_etag( $post ) );
	}

	return $response;
}

/**
 * Permission callback: `edit_post` on the post.
 *
 * @param WP_REST_Request $request REST request.
 * @return true|WP_Error
 */
function bibliography_builder_rest_write_permissions_check( WP_REST_Request $request ) {
	$post_id = absint( $request['post_id'] );
	$post    = 0 < $post_id ? get_post( $post_id ) : null;

	if ( ! is_object( $post ) ) {
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
		'bibliography_builder_write_forbidden',
		__( 'Sorry, you are not allowed to edit this bibliography.', 'borges-bibliography-builder' ),
		array( 'status' => 403 )
	);
}

/**
 * Attributes as plain arrays, for mutation code that reads them.
 *
 * The block's own attributes stay in their decoded form for rendering; this
 * copy only reads citation IDs and styles.
 *
 * @param mixed $value Decoded attribute value.
 * @return mixed
 */
function bibliography_builder_write_to_arrays( $value ) {
	return json_decode( wp_json_encode( $value ), true );
}

/**
 * A readable record of one block's attributes, as the read routes report it.
 *
 * @param array $attrs Block attributes.
 * @param int   $index Block index.
 * @return array
 */
function bibliography_builder_write_record( $attrs, $index ) {
	$records = bibliography_builder_prepare_bibliographies(
		bibliography_builder_collect_blocks(
			array(
				array(
					'blockName' => 'bibliography-builder/bibliography',
					'attrs'     => bibliography_builder_write_to_arrays( $attrs ),
				),
			)
		)
	);

	$record          = $records[0];
	$record['index'] = $index;

	return $record;
}

/**
 * Find a block's index from a `{ref}`: an index, or a stable bibliographyId.
 *
 * @param array  $ranges Located blocks.
 * @param string $ref    Reference.
 * @return int|WP_Error
 */
function bibliography_builder_write_resolve_index( $ranges, $ref ) {
	$ref = (string) $ref;

	if ( ctype_digit( $ref ) && isset( $ranges[ (int) $ref ] ) ) {
		return (int) $ref;
	}

	if ( bibliography_builder_is_block_id( $ref ) ) {
		foreach ( $ranges as $index => $range ) {
			$attrs = bibliography_builder_write_to_arrays( $range['attrs'] );

			if ( isset( $attrs['bibliographyId'] ) && $attrs['bibliographyId'] === $ref ) {
				return $index;
			}
		}
	}

	return new WP_Error(
		'bibliography_builder_not_found',
		__( 'Bibliography block not found for the requested index or ID.', 'borges-bibliography-builder' ),
		array( 'status' => 404 )
	);
}

/**
 * A block's citation style key.
 *
 * @param array $attrs Block attributes (arrays).
 * @return string
 */
function bibliography_builder_write_style( $attrs ) {
	return isset( $attrs['citationStyle'] ) ? (string) $attrs['citationStyle'] : 'chicago-notes-bibliography';
}

/**
 * A block's citations as a list.
 *
 * @param array $attrs Block attributes (arrays).
 * @return array
 */
function bibliography_builder_write_citations( $attrs ) {
	return isset( $attrs['citations'] ) && is_array( $attrs['citations'] )
		? array_values( $attrs['citations'] )
		: array();
}

/**
 * Find a citation's position by ID.
 *
 * @param array  $citations   Citations (arrays).
 * @param string $citation_id Citation ID.
 * @return int|WP_Error
 */
function bibliography_builder_write_find_citation( $citations, $citation_id ) {
	foreach ( $citations as $position => $citation ) {
		if ( bibliography_builder_get_citation_id( $citation ) === (string) $citation_id ) {
			return $position;
		}
	}

	return new WP_Error(
		'bibliography_builder_citation_not_found',
		__( 'Citation not found in this bibliography.', 'borges-bibliography-builder' ),
		array( 'status' => 404 )
	);
}

/**
 * Sanitize and format CSL items for storage.
 *
 * @param array  $items     CSL-JSON items.
 * @param string $style_key Citation style.
 * @return array|WP_Error List of `{ csl, formattedText }`.
 */
function bibliography_builder_write_prepare_entries( $items, $style_key ) {
	$sanitized = bibliography_builder_validate_and_sanitize_csl_items( $items );

	if ( is_wp_error( $sanitized ) ) {
		return $sanitized;
	}

	$formatted = bibliography_builder_format_csl_items( $sanitized, $style_key );

	if ( is_wp_error( $formatted ) ) {
		return $formatted;
	}

	$entries = array();

	foreach ( array_values( $sanitized ) as $position => $csl ) {
		$entries[] = array(
			'csl'           => $csl,
			'formattedText' => $formatted[ $position ],
		);
	}

	return $entries;
}

/**
 * A new citation ID, unique within the bibliography.
 *
 * @param array $citations Existing citations.
 * @return string
 */
function bibliography_builder_write_new_citation_id( $citations ) {
	$taken = array_flip( array_filter( array_map( 'bibliography_builder_get_citation_id', $citations ) ) );

	do {
		$id = wp_generate_uuid4();
	} while ( isset( $taken[ $id ] ) );

	return $id;
}

/**
 * Read one bibliography, apply a change, and either preview or save it.
 *
 * @param WP_REST_Request $request REST request (post_id, ref, dry_run).
 * @param callable        $mutate  function ( array $attrs ): array|WP_Error,
 *                                 returning `{ attrs, changes }` where attrs
 *                                 are plain arrays.
 * @return WP_REST_Response|WP_Error
 */
function bibliography_builder_write_bibliography( WP_REST_Request $request, $mutate ) {
	if ( ! bibliography_builder_can_render_save_markup() ) {
		return new WP_Error(
			'bibliography_builder_write_unavailable',
			__(
				'This server cannot rebuild bibliography markup: the PHP intl extension is required.',
				'borges-bibliography-builder'
			),
			array( 'status' => 501 )
		);
	}

	$post    = get_post( absint( $request['post_id'] ) );
	$content = (string) $post->post_content;
	$etag    = bibliography_builder_post_etag( $post );
	$dry_run = false !== rest_sanitize_boolean( $request['dry_run'] ?? true );
	$ranges  = bibliography_builder_locate_bibliography_blocks( $content );

	if ( is_wp_error( $ranges ) ) {
		return $ranges;
	}

	$index = bibliography_builder_write_resolve_index( $ranges, $request['ref'] );

	if ( is_wp_error( $index ) ) {
		return $index;
	}

	$before = bibliography_builder_write_to_arrays( $ranges[ $index ]['attrs'] );
	$result = call_user_func( $mutate, $before );

	if ( is_wp_error( $result ) ) {
		return $result;
	}

	// Render from the attributes exactly as the editor will parse them back.
	$attrs = bibliography_builder_decode_save_attributes( wp_json_encode( $result['attrs'] ) );
	$html  = bibliography_builder_render_save_markup( $attrs );
	$block = bibliography_builder_serialize_bibliography_block( $result['attrs'], $html );

	$updated = bibliography_builder_splice_bibliography_block( $content, $index, $block );

	if ( is_wp_error( $updated ) ) {
		return $updated;
	}

	$body = array(
		'postId'       => $post->ID,
		'dryRun'       => $dry_run,
		'changes'      => $result['changes'],
		'bibliography' => bibliography_builder_write_record( $result['attrs'], $index ),
	);

	if ( $dry_run ) {
		$body['etag'] = $etag;
		$response     = rest_ensure_response( $body );
		$response->header( 'ETag', $etag );

		return $response;
	}

	$if_match = trim( (string) $request->get_header( 'if_match' ) );

	if ( '' === $if_match ) {
		return new WP_Error(
			'bibliography_builder_precondition_required',
			__( 'Send an If-Match header with the ETag from a read or dry run.', 'borges-bibliography-builder' ),
			array( 'status' => 428 )
		);
	}

	if ( $if_match !== $etag && '*' !== $if_match ) {
		return new WP_Error(
			'bibliography_builder_precondition_failed',
			__(
				'The post has changed since that ETag was issued. Read it again and retry.',
				'borges-bibliography-builder'
			),
			array(
				'status' => 412,
				'etag'   => $etag,
			)
		);
	}

	$saved = wp_update_post(
		array(
			'ID'           => $post->ID,
			'post_content' => wp_slash( $updated ),
		),
		true
	);

	if ( is_wp_error( $saved ) ) {
		return $saved;
	}

	$new_etag     = bibliography_builder_post_etag( get_post( $post->ID ) );
	$body['etag'] = $new_etag;
	$response     = rest_ensure_response( $body );
	$response->header( 'ETag', $new_etag );

	return $response;
}

/**
 * POST …/citations: add CSL-JSON items.
 *
 * Body: `{ "items": [ …CSL-JSON… ] }`. Items that duplicate an existing
 * citation, or an earlier item, by the editor's duplicate rules are skipped
 * and reported, as the editor skips them on paste.
 *
 * @param WP_REST_Request $request REST request.
 * @return WP_REST_Response|WP_Error
 */
function bibliography_builder_rest_add_citations( WP_REST_Request $request ) {
	$params = $request->get_json_params();
	$items  = isset( $params['items'] ) && is_array( $params['items'] ) ? array_values( $params['items'] ) : null;

	if ( null === $items || array() === $items || count( $items ) > BIBLIOGRAPHY_BUILDER_MAX_ITEMS_PER_WRITE ) {
		return new WP_Error(
			'bibliography_builder_invalid_items',
			sprintf(
				/* translators: %d: maximum item count. */
				__(
					'Send "items": a list of 1 to %d CSL-JSON objects.',
					'borges-bibliography-builder'
				),
				BIBLIOGRAPHY_BUILDER_MAX_ITEMS_PER_WRITE
			),
			array( 'status' => 400 )
		);
	}

	return bibliography_builder_write_bibliography(
		$request,
		static function ( $attrs ) use ( $items ) {
			$style     = bibliography_builder_write_style( $attrs );
			$citations = bibliography_builder_write_citations( $attrs );
			$entries   = bibliography_builder_write_prepare_entries( $items, $style );

			if ( is_wp_error( $entries ) ) {
				return $entries;
			}

			$added   = array();
			$skipped = array();

			foreach ( $entries as $position => $entry ) {
				$duplicate_of = null;

				$keys = bibliography_builder_get_duplicate_keys( $entry );

				foreach ( $citations as $existing ) {
					$existing_keys = bibliography_builder_get_duplicate_keys( $existing );

					if ( null !== bibliography_builder_get_duplicate_reason( $existing_keys, $keys ) ) {
						$duplicate_of = bibliography_builder_get_citation_id( $existing );
						break;
					}
				}

				if ( null !== $duplicate_of ) {
					$skipped[] = array(
						'item'        => $position,
						'duplicateOf' => $duplicate_of,
					);
					continue;
				}

				$citation    = array_merge(
					array( 'id' => bibliography_builder_write_new_citation_id( $citations ) ),
					$entry
				);
				$citations[] = $citation;
				$added[]     = $citation['id'];
			}

			if ( count( $citations ) > BIBLIOGRAPHY_BUILDER_MAX_CITATIONS_PER_BIBLIOGRAPHY ) {
				return new WP_Error(
					'bibliography_builder_too_many_citations',
					sprintf(
						/* translators: %d: maximum citation count. */
						__(
							'A bibliography can hold at most %d citations.',
							'borges-bibliography-builder'
						),
						BIBLIOGRAPHY_BUILDER_MAX_CITATIONS_PER_BIBLIOGRAPHY
					),
					array( 'status' => 400 )
				);
			}

			$attrs['citations'] = bibliography_builder_sort_citations_for_save( $citations, $style );

			return array(
				'attrs'   => $attrs,
				'changes' => array(
					'added'   => $added,
					'skipped' => $skipped,
				),
			);
		}
	);
}

/**
 * PATCH …/citations/{citation_id}: change fields on one citation.
 *
 * Body: a partial CSL-JSON object. A field set to null is removed. `id` and
 * `type` cannot be changed. As in the editor's field editor, the entry is
 * reformatted and loses its manual display text and stale export strings.
 *
 * @param WP_REST_Request $request REST request.
 * @return WP_REST_Response|WP_Error
 */
function bibliography_builder_rest_update_citation( WP_REST_Request $request ) {
	$patch = $request->get_json_params();

	if ( ! is_array( $patch ) || array() === $patch || isset( $patch[0] ) ) {
		return new WP_Error(
			'bibliography_builder_invalid_patch',
			__( 'Send a JSON object of CSL-JSON fields to change.', 'borges-bibliography-builder' ),
			array( 'status' => 400 )
		);
	}

	foreach ( array( 'id', 'type' ) as $locked ) {
		if ( array_key_exists( $locked, $patch ) ) {
			return new WP_Error(
				'bibliography_builder_locked_field',
				/* translators: %s: CSL field name. */
				sprintf( __( 'The "%s" field cannot be changed.', 'borges-bibliography-builder' ), $locked ),
				array( 'status' => 400 )
			);
		}
	}

	$citation_id = (string) $request['citation_id'];

	return bibliography_builder_write_bibliography(
		$request,
		static function ( $attrs ) use ( $patch, $citation_id ) {
			$style     = bibliography_builder_write_style( $attrs );
			$citations = bibliography_builder_write_citations( $attrs );
			$position  = bibliography_builder_write_find_citation( $citations, $citation_id );

			if ( is_wp_error( $position ) ) {
				return $position;
			}

			$csl = isset( $citations[ $position ]['csl'] ) && is_array( $citations[ $position ]['csl'] )
				? $citations[ $position ]['csl']
				: array();

			foreach ( $patch as $field => $value ) {
				if ( null === $value ) {
					unset( $csl[ $field ] );
				} else {
					$csl[ $field ] = $value;
				}
			}

			$entries = bibliography_builder_write_prepare_entries( array( $csl ), $style );

			if ( is_wp_error( $entries ) ) {
				return $entries;
			}

			$citation = $citations[ $position ];
			unset(
				$citation['displayOverride'],
				$citation['parseWarnings'],
				$citation['exportBibtex'],
				$citation['exportBiblatex']
			);
			$citations[ $position ] = array_merge( $citation, $entries[0] );

			$attrs['citations'] = bibliography_builder_sort_citations_for_save( $citations, $style );

			return array(
				'attrs'   => $attrs,
				'changes' => array( 'updated' => array( $citation_id ) ),
			);
		}
	);
}

/**
 * DELETE …/citations/{citation_id}: remove one citation.
 *
 * The response's `changes.removed` carries the whole removed entry, so a
 * client can put it back.
 *
 * @param WP_REST_Request $request REST request.
 * @return WP_REST_Response|WP_Error
 */
function bibliography_builder_rest_delete_citation( WP_REST_Request $request ) {
	$citation_id = (string) $request['citation_id'];

	return bibliography_builder_write_bibliography(
		$request,
		static function ( $attrs ) use ( $citation_id ) {
			$citations = bibliography_builder_write_citations( $attrs );
			$position  = bibliography_builder_write_find_citation( $citations, $citation_id );

			if ( is_wp_error( $position ) ) {
				return $position;
			}

			$removed = array_splice( $citations, $position, 1 );

			$attrs['citations'] = $citations;

			return array(
				'attrs'   => $attrs,
				'changes' => array( 'removed' => $removed[0] ),
			);
		}
	);
}

/**
 * PUT …/citations/order: reorder a numeric-style bibliography.
 *
 * Body: `{ "ids": [ … ] }`, every citation ID exactly once. Other style
 * families sort themselves, so a new order would not show; they get a 409.
 *
 * @param WP_REST_Request $request REST request.
 * @return WP_REST_Response|WP_Error
 */
function bibliography_builder_rest_reorder_citations( WP_REST_Request $request ) {
	$params = $request->get_json_params();
	$ids    = isset( $params['ids'] ) && is_array( $params['ids'] ) ? array_values( $params['ids'] ) : null;

	if ( null === $ids ) {
		return new WP_Error(
			'bibliography_builder_invalid_order',
			__( 'Send "ids": every citation ID, in the new order.', 'borges-bibliography-builder' ),
			array( 'status' => 400 )
		);
	}

	return bibliography_builder_write_bibliography(
		$request,
		static function ( $attrs ) use ( $ids ) {
			$style      = bibliography_builder_write_style( $attrs );
			$definition = bibliography_builder_get_formatter_style_definition( $style );

			if ( 'numeric' !== $definition['family'] ) {
				return new WP_Error(
					'bibliography_builder_order_is_automatic',
					__(
						'This bibliography\'s style sorts its entries itself; only numeric styles can be reordered.',
						'borges-bibliography-builder'
					),
					array( 'status' => 409 )
				);
			}

			$citations = bibliography_builder_write_citations( $attrs );
			$by_id     = array();

			foreach ( $citations as $citation ) {
				$by_id[ (string) bibliography_builder_get_citation_id( $citation ) ] = $citation;
			}

			$strings = array_map( 'strval', array_filter( $ids, 'is_scalar' ) );

			if ( count( $strings ) !== count( $citations ) || count( array_unique( $strings ) ) !== count( $strings )
				|| array_diff( $strings, array_keys( $by_id ) ) ) {
				return new WP_Error(
					'bibliography_builder_invalid_order',
					__( 'The order must list every citation ID exactly once.', 'borges-bibliography-builder' ),
					array( 'status' => 400 )
				);
			}

			$attrs['citations'] = array_map(
				static function ( $id ) use ( $by_id ) {
					return $by_id[ $id ];
				},
				$strings
			);

			return array(
				'attrs'   => $attrs,
				'changes' => array( 'order' => $strings ),
			);
		}
	);
}

/**
 * Register the write routes when the site has enabled them.
 */
function bibliography_builder_register_write_routes() {
	if ( ! bibliography_builder_write_routes_enabled() ) {
		return;
	}

	$base = '/posts/(?P<post_id>\d+)/bibliographies/(?P<ref>' . BIBLIOGRAPHY_BUILDER_BLOCK_REF_PATTERN . ')/citations';
	$args = array(
		'post_id' => array(
			'type'              => 'integer',
			'sanitize_callback' => 'absint',
		),
		'ref'     => array(
			'type'              => array( 'string', 'integer' ),
			'validate_callback' => 'bibliography_builder_is_block_ref',
		),
		'dry_run' => array(
			'description' => __(
				'Preview the change without saving. Defaults to true; pass false to write.',
				'borges-bibliography-builder'
			),
			'type'        => 'boolean',
			'default'     => true,
		),
	);

	register_rest_route(
		'bibliography/v1',
		$base . '/order',
		array(
			'methods'             => 'PUT',
			'callback'            => 'bibliography_builder_rest_reorder_citations',
			'permission_callback' => 'bibliography_builder_rest_write_permissions_check',
			'args'                => $args,
		)
	);

	register_rest_route(
		'bibliography/v1',
		$base,
		array(
			'methods'             => 'POST',
			'callback'            => 'bibliography_builder_rest_add_citations',
			'permission_callback' => 'bibliography_builder_rest_write_permissions_check',
			'args'                => $args,
		)
	);

	register_rest_route(
		'bibliography/v1',
		$base . '/(?P<citation_id>[^/\s]{1,128})',
		array(
			array(
				'methods'             => 'PATCH',
				'callback'            => 'bibliography_builder_rest_update_citation',
				'permission_callback' => 'bibliography_builder_rest_write_permissions_check',
				'args'                => $args,
			),
			array(
				'methods'             => 'DELETE',
				'callback'            => 'bibliography_builder_rest_delete_citation',
				'permission_callback' => 'bibliography_builder_rest_write_permissions_check',
				'args'                => $args,
			),
		)
	);
}

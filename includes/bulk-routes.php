<?php
/**
 * Bulk write routes (Phase 05, M4 / Tier 4).
 *
 * POST /bibliography/v1/bulk/reformat switches every bibliography in up to
 * 25 posts to one citation style, and POST /bibliography/v1/bulk/deduplicate
 * removes repeated citations from them. Like the other write routes they are
 * off unless the `bibliography_builder_enable_write_routes` filter returns
 * true, dry runs unless `dry_run=false`, and refuse to save a post whose ETag
 * has changed. They need `edit_others_posts`, and `edit_post` on each post.
 *
 * They work in synchronous batches rather than background jobs, so the
 * plugin stores no job records and schedules no cron events. A request does
 * the posts it can within its batch cap, its caller's budget, and a time
 * budget, and returns the rest as `remaining`; the client sends those next.
 * Each post commits on its own, through the same mutate, splice, and verify
 * path (bibliography_builder_bulk_write_post()), so a failure on one post
 * never undoes another. Both routes share one budget and the site-wide lock,
 * in includes/rate-limit.php.
 *
 * Request:
 *
 *     POST /wp-json/bibliography/v1/bulk/reformat?dry_run=false
 *     { "style": "mla-9", "posts": [ { "id": 12, "etag": "\"…\"" }, … ] }
 *
 * Response (200, whatever happened to each post):
 *
 *     { "dryRun": false, "style": "mla-9",
 *       "results": [ { "postId": 12, "status": "changed", "etag": "\"…\"",
 *                      "bibliographies": [ { "index": 0, "bibliographyId": "…", "changes": { … } } ] } ],
 *       "remaining": [ { "id": 13, "etag": "\"…\"" } ],
 *       "rateLimit": { "limit": 250, "remaining": 224, "reset": 611 } }
 *
 * Deduplicate takes the same body without `style`. Each bibliography keeps
 * the first copy of a work and drops later ones, by the editor's duplicate
 * rules; each changed block's `changes.removed` lists what went, which
 * citation it duplicated, and the `mergedFields` copied from it into that
 * citation because the kept copy lacked them (a DOI, say). Duplicates across two blocks of one post are only
 * reported, in the post's `crossBlockDuplicates`.
 *
 * A post's status is `preview` (dry run), `changed`, `unchanged` (nothing to
 * change, nothing to save), `skipped` (missing, not editable, or no
 * bibliography), or `failed` (an entry could not be formatted, a missing or
 * stale ETag, or a failed save); the last two carry an `error`.
 *
 * @package BibliographyBuilder
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Permission callback: `edit_others_posts`, as the design memo's capability
 * matrix sets for bulk operations. Each post's `edit_post` is checked as the
 * request reaches it.
 *
 * @return true|WP_Error
 */
function bibliography_builder_rest_bulk_permissions_check() {
	if ( current_user_can( 'edit_others_posts' ) ) {
		return true;
	}

	return new WP_Error(
		'bibliography_builder_bulk_forbidden',
		__( 'Sorry, you are not allowed to edit bibliographies across posts.', 'borges-bibliography-builder' ),
		array( 'status' => 403 )
	);
}

/**
 * Validate the `posts` list of a bulk request.
 *
 * @param mixed $posts Decoded `posts` value.
 * @param int   $max   Most posts allowed.
 * @return array<int, array{id:int,etag:string}>|WP_Error
 */
function bibliography_builder_bulk_posts_param( $posts, $max ) {
	$invalid = new WP_Error(
		'bibliography_builder_invalid_bulk_posts',
		sprintf(
			/* translators: %d: most posts one request may name. */
			__(
				'Send "posts": 1 to %d objects, each with a post "id" and, to save, the "etag" from a dry run or read.',
				'borges-bibliography-builder'
			),
			$max
		),
		array( 'status' => 400 )
	);

	if (
		! is_array( $posts )
		|| array() === $posts
		|| count( $posts ) > $max
		|| ! bibliography_builder_is_list_array( $posts )
	) {
		return $invalid;
	}

	$list = array();
	$seen = array();

	foreach ( $posts as $entry ) {
		if ( ! is_array( $entry ) || ! isset( $entry['id'] ) || ! is_int( $entry['id'] ) || 0 >= $entry['id'] ) {
			return $invalid;
		}

		if ( isset( $entry['etag'] ) && ! is_string( $entry['etag'] ) ) {
			return $invalid;
		}

		if ( isset( $seen[ $entry['id'] ] ) ) {
			return new WP_Error(
				'bibliography_builder_duplicate_bulk_post',
				/* translators: %d: post ID. */
				sprintf( __( 'Post %d is listed more than once.', 'borges-bibliography-builder' ), $entry['id'] ),
				array( 'status' => 400 )
			);
		}

		$seen[ $entry['id'] ] = true;
		$list[]               = array(
			'id'   => $entry['id'],
			'etag' => isset( $entry['etag'] ) ? trim( $entry['etag'] ) : '',
		);
	}

	return $list;
}

/**
 * A per-post error as response data.
 *
 * @param WP_Error $error Error.
 * @return array{code:string,message:string,status:int,entries?:mixed}
 */
function bibliography_builder_bulk_error_data( WP_Error $error ) {
	$data  = $error->get_error_data();
	$entry = array(
		'code'    => (string) $error->get_error_code(),
		'message' => $error->get_error_message(),
		'status'  => is_array( $data ) && isset( $data['status'] ) ? (int) $data['status'] : 500,
	);

	if ( is_array( $data ) && isset( $data['entries'] ) ) {
		$entry['entries'] = $data['entries'];
	}

	return $entry;
}

/**
 * Apply one change to every bibliography in a post, and save it unless dry running.
 *
 * Every block the change touches is rebuilt and spliced into the content in
 * turn, and the post is saved once, so it gains a single revision. If any
 * block fails, nothing is saved for that post.
 *
 * The shared per-post path of the bulk routes and their WP-CLI commands.
 *
 * @param int      $post_id Post ID.
 * @param callable $mutate  Called with each block's attributes (as plain
 *                          arrays) and its index; returns `{ attrs, changes }`,
 *                          null to leave that block as it is, or a WP_Error.
 * @param bool     $dry_run Preview without saving.
 * @param string   $etag    The ETag the caller based the change on; needed to save.
 * @return array Result: `postId`, `status`, and `etag`, `bibliographies`, or `error`.
 */
function bibliography_builder_bulk_write_post( $post_id, $mutate, $dry_run, $etag = '' ) {
	$result = array( 'postId' => $post_id );
	$post   = get_post( $post_id );

	if ( ! is_object( $post ) ) {
		return $result + array(
			'status' => 'skipped',
			'error'  => bibliography_builder_bulk_error_data(
				new WP_Error(
					'bibliography_builder_post_not_found',
					__( 'Post not found.', 'borges-bibliography-builder' ),
					array( 'status' => 404 )
				)
			),
		);
	}

	if ( ! current_user_can( 'edit_post', $post->ID ) ) {
		return $result + array(
			'status' => 'skipped',
			'error'  => bibliography_builder_bulk_error_data(
				new WP_Error(
					'bibliography_builder_write_forbidden',
					__( 'Sorry, you are not allowed to edit this bibliography.', 'borges-bibliography-builder' ),
					array( 'status' => 403 )
				)
			),
		);
	}

	$content = (string) $post->post_content;
	$current = bibliography_builder_post_etag( $post );
	$ranges  = bibliography_builder_locate_bibliography_blocks( $content );

	if ( is_wp_error( $ranges ) ) {
		return $result + array(
			'status' => 'failed',
			'error'  => bibliography_builder_bulk_error_data( $ranges ),
		);
	}

	if ( array() === $ranges ) {
		return $result + array(
			'status' => 'skipped',
			'error'  => bibliography_builder_bulk_error_data(
				new WP_Error(
					'bibliography_builder_bibliography_not_found',
					__( 'The post has no bibliography.', 'borges-bibliography-builder' ),
					array( 'status' => 404 )
				)
			),
		);
	}

	$updated        = $content;
	$bibliographies = array();

	foreach ( $ranges as $index => $range ) {
		// Splicing earlier blocks moves later ones but never changes their
		// attributes, so the first location's attributes stay current.
		$change = call_user_func( $mutate, bibliography_builder_write_to_arrays( $range['attrs'] ), $index );

		if ( null === $change ) {
			continue;
		}

		if ( is_wp_error( $change ) ) {
			return $result + array(
				'status' => 'failed',
				'error'  => array( 'index' => $index ) + bibliography_builder_bulk_error_data( $change ),
			);
		}

		$attrs  = bibliography_builder_decode_save_attributes( (string) wp_json_encode( $change['attrs'] ) );
		$block  = bibliography_builder_serialize_bibliography_block(
			$change['attrs'],
			bibliography_builder_render_save_markup( $attrs )
		);
		$splice = bibliography_builder_splice_bibliography_block( $updated, $index, $block );

		if ( is_wp_error( $splice ) ) {
			return $result + array(
				'status' => 'failed',
				'error'  => array( 'index' => $index ) + bibliography_builder_bulk_error_data( $splice ),
			);
		}

		$id               = $change['attrs']['bibliographyId'] ?? null;
		$updated          = $splice;
		$bibliographies[] = array(
			'index'          => $index,
			'bibliographyId' => null === $id ? null : (string) $id,
			'changes'        => $change['changes'],
		);
	}

	$result['bibliographies'] = $bibliographies;

	if ( $updated === $content ) {
		return $result + array(
			'status' => 'unchanged',
			'etag'   => $current,
		);
	}

	if ( $dry_run ) {
		return $result + array(
			'status' => 'preview',
			'etag'   => $current,
		);
	}

	if ( '' === $etag ) {
		$precondition = new WP_Error(
			'bibliography_builder_precondition_required',
			__( 'Send the ETag from a read or dry run to save this post.', 'borges-bibliography-builder' ),
			array( 'status' => 428 )
		);
	} elseif ( $etag !== $current && '*' !== $etag ) {
		$precondition = new WP_Error(
			'bibliography_builder_precondition_failed',
			__(
				'The post has changed since that ETag was issued. Read it again and retry.',
				'borges-bibliography-builder'
			),
			array( 'status' => 412 )
		);
	}

	if ( isset( $precondition ) ) {
		return $result + array(
			'status' => 'failed',
			'etag'   => $current,
			'error'  => bibliography_builder_bulk_error_data( $precondition ),
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
		return $result + array(
			'status' => 'failed',
			'error'  => bibliography_builder_bulk_error_data( $saved ),
		);
	}

	return $result + array(
		'status' => 'changed',
		'etag'   => bibliography_builder_post_etag( get_post( $post->ID ) ),
	);
}

/**
 * Reformat every bibliography in one post, and save it unless dry running.
 *
 * Shared by POST /bulk/reformat and `wp borges reformat`.
 *
 * @param int    $post_id Post ID.
 * @param string $style   Supported style key.
 * @param bool   $dry_run Preview without saving.
 * @param string $etag    The ETag the caller based the change on; needed to save.
 * @return array Result: `postId`, `status`, and `etag`, `bibliographies`, or `error`.
 */
function bibliography_builder_bulk_reformat_post( $post_id, $style, $dry_run, $etag = '' ) {
	return bibliography_builder_bulk_write_post(
		$post_id,
		/**
		 * Reformat one block.
		 *
		 * @param array $attrs Block attributes as plain arrays.
		 * @return array|WP_Error `{ attrs, changes }`, or an error.
		 */
		static function ( $attrs ) use ( $style ) {
			return bibliography_builder_write_reformat_attrs( $attrs, $style );
		},
		$dry_run,
		$etag
	);
}

/**
 * Whether a CSL value counts as present: not null, '', or an empty list.
 *
 * @param mixed $value CSL value.
 * @return bool
 */
function bibliography_builder_bulk_has_value( $value ) {
	return null !== $value && '' !== $value && array() !== $value;
}

/**
 * The CSL fields a later copy of a work has and the kept copy lacks.
 *
 * Only whole top-level fields move, and only into gaps: a field the kept
 * copy has, even with a different value, is never overwritten, so the kept
 * copy stays the record of truth. `id` never moves.
 *
 * @param array $kept  The kept copy's CSL-JSON.
 * @param array $later The later copy's CSL-JSON.
 * @return array Fields to add to the kept copy, by name.
 */
function bibliography_builder_bulk_missing_fields( $kept, $later ) {
	return array_diff_key(
		array_filter( $later, 'bibliography_builder_bulk_has_value' ),
		array_filter( $kept, 'bibliography_builder_bulk_has_value' ),
		array( 'id' => true )
	);
}

/**
 * Fold a later copy of a work into a kept copy, for the split.
 *
 * Copies the fields the kept copy lacks (bibliography_builder_bulk_missing_fields())
 * and records the later copy as removed, pointing at the kept one.
 *
 * @param array $state    Split state: `kept` (records of `citation`, `index`,
 *                        `original`, `before`) and `removed`.
 * @param int   $position The kept copy's position in `kept`.
 * @param array $later    The later copy's record.
 * @param array $pair     `{ id, reason }`: the kept copy's ID and why they match.
 * @return bool Whether the kept copy gained fields.
 */
function bibliography_builder_bulk_absorb_duplicate( &$state, $position, $later, $pair ) {
	$csl  = bibliography_builder_citation_csl( $state['kept'][ $position ]['citation'] );
	$fill = bibliography_builder_bulk_missing_fields( $csl, bibliography_builder_citation_csl( $later['citation'] ) );

	if ( array() !== $fill ) {
		$state['kept'][ $position ]['before']        ??= $csl;
		$state['kept'][ $position ]['citation']['csl'] = array_replace( $csl, $fill );
	}

	$state['removed'][] = array(
		'index'        => $later['index'],
		'id'           => bibliography_builder_get_citation_id( $later['original'] ),
		'duplicateOf'  => $pair['id'],
		'reason'       => $pair['reason'],
		'mergedFields' => array_keys( $fill ),
		'citation'     => $later['original'],
	);

	return array() !== $fill;
}

/**
 * Split citations into the ones to keep and later copies of them.
 *
 * Walks the list in order and keeps a citation unless it matches one already
 * kept, by the editor's duplicate rules (`citationsMatch()` in
 * `src/lib/deduplicate.js`, ported in bibliography_builder_get_duplicate_reason()).
 * So the first copy of a work always stays, with its display text and export
 * strings, and the editor's own paste check would have made the same calls.
 *
 * A later copy's fields that the kept copy lacks, such as a DOI, are copied
 * into the kept copy first (bibliography_builder_bulk_missing_fields()), so
 * removing a copy never loses data. The kept copy's CSL changes, but not its
 * `formattedText`: the caller formats it again (see `merged`).
 *
 * A gained field can make the kept copy match another kept citation (an
 * author fills in, and now title and author agree), so after each fill the
 * kept copy is checked again until nothing matches: the later of the two in
 * stored order folds into the earlier, which may gain fields in turn. Every
 * fold removes one citation, so this ends, and one run leaves nothing for a
 * second run to remove.
 *
 * @param array $citations Citation records, in stored order.
 * @return array{kept: array, removed: array, merged: array} `removed` entries,
 *         in stored order, are `{ index, id, duplicateOf, reason,
 *         mergedFields, citation }`, where `index` is the position in
 *         `$citations`, `duplicateOf` the kept copy's ID, `mergedFields` the
 *         field names copied into it, and `citation` the record as stored.
 *         `merged` maps each position in `kept` that gained fields to its CSL
 *         before the first fill.
 */
function bibliography_builder_bulk_split_duplicates( $citations ) {
	$state = array(
		'kept'    => array(),
		'removed' => array(),
	);

	foreach ( array_values( $citations ) as $index => $citation ) {
		$record = array(
			'citation' => $citation,
			'index'    => $index,
			'original' => $citation,
			'before'   => null,
		);
		$match  = bibliography_builder_find_duplicate_citation(
			$citation,
			array_column( $state['kept'], 'citation' )
		);

		if ( null === $match ) {
			$state['kept'][] = $record;
			continue;
		}

		$position = (int) $match['index'];

		if ( ! bibliography_builder_bulk_absorb_duplicate( $state, $position, $record, $match ) ) {
			continue;
		}

		// The kept copy changed: fold any kept citation it now matches.
		do {
			$match = bibliography_builder_find_duplicate_citation(
				$state['kept'][ $position ]['citation'],
				array_diff_key( array_column( $state['kept'], 'citation' ), array( $position => true ) )
			);

			if ( null === $match ) {
				break;
			}

			$other = (int) $match['index'];
			$first = min( $position, $other );
			$last  = max( $position, $other );
			$later = $state['kept'][ $last ];
			$id    = bibliography_builder_get_citation_id( $state['kept'][ $first ]['citation'] );
			$gone  = bibliography_builder_get_citation_id( $later['citation'] );

			array_splice( $state['kept'], $last, 1 );

			// Copies already folded into the one going now point at its keeper.
			foreach ( $state['removed'] as &$removed ) {
				if ( null !== $gone && $gone === $removed['duplicateOf'] ) {
					$removed['duplicateOf'] = $id;
				}
			}
			unset( $removed );

			bibliography_builder_bulk_absorb_duplicate(
				$state,
				$first,
				$later,
				array(
					'id'     => $id,
					'reason' => $match['reason'],
				)
			);
			$position = $first;
		} while ( true );
	}

	usort(
		$state['removed'],
		static function ( array $a, array $b ): int {
			return $a['index'] <=> $b['index'];
		}
	);

	$merged = array();

	foreach ( $state['kept'] as $position => $record ) {
		if ( null !== $record['before'] ) {
			$merged[ $position ] = $record['before'];
		}
	}

	return array(
		'kept'    => array_column( $state['kept'], 'citation' ),
		'removed' => $state['removed'],
		'merged'  => $merged,
	);
}

/**
 * Format the kept copies that gained fields from a removed copy.
 *
 * Each is sanitized and formatted again, as an edit through PATCH
 * …/citations/{id} is, and loses the parse warnings and BibTeX/BibLaTeX
 * export strings that described the old record; a display override, the
 * person's own text, stays.
 *
 * @param array  $kept   Kept citations, from bibliography_builder_bulk_split_duplicates().
 * @param array  $merged Its `merged` map: position in `$kept` => CSL before the merge.
 * @param string $style  Citation style.
 * @return array|WP_Error Kept citations with fresh `csl` and `formattedText`.
 */
function bibliography_builder_bulk_format_merged( $kept, $merged, $style ) {
	$positions = array_keys( $merged );
	$entries   = bibliography_builder_write_prepare_entries(
		array_map(
			static function ( $position ) use ( $kept ) {
				return bibliography_builder_citation_csl( $kept[ $position ] );
			},
			$positions
		),
		$style
	);

	if ( is_wp_error( $entries ) ) {
		return $entries;
	}

	foreach ( $positions as $offset => $position ) {
		$citation = $kept[ $position ];
		unset( $citation['parseWarnings'], $citation['exportBibtex'], $citation['exportBiblatex'] );
		$kept[ $position ] = array_merge( $citation, $entries[ $offset ] );
	}

	return $kept;
}

/**
 * Duplicates that span two bibliographies in one post, for the report.
 *
 * Bulk deduplicate never removes these: a post with one bibliography per
 * chapter or section is meant to list a work in each. They are reported so a
 * person can decide.
 *
 * @param array<int, array{bibliographyId: string|null, citations: array}> $blocks Each block's
 *        kept citations, by block index.
 * @return array[] Pairs as `{ reason, first, second }`, each side
 *         `{ index, bibliographyId, citationId }`.
 */
function bibliography_builder_bulk_cross_block_duplicates( $blocks ) {
	$entries = array();

	foreach ( $blocks as $index => $block ) {
		foreach ( $block['citations'] as $citation ) {
			$entries[] = array(
				'side' => array(
					'index'          => $index,
					'bibliographyId' => $block['bibliographyId'],
					'citationId'     => bibliography_builder_get_citation_id( $citation ),
				),
				'keys' => bibliography_builder_get_duplicate_keys( $citation ),
			);
		}
	}

	$pairs = array();
	$count = count( $entries );

	for ( $i = 0; $i < $count; $i++ ) {
		for ( $j = $i + 1; $j < $count; $j++ ) {
			if ( $entries[ $i ]['side']['index'] === $entries[ $j ]['side']['index'] ) {
				continue;
			}

			$reason = bibliography_builder_get_duplicate_reason( $entries[ $i ]['keys'], $entries[ $j ]['keys'] );

			if ( null !== $reason ) {
				$pairs[] = array(
					'reason' => $reason,
					'first'  => $entries[ $i ]['side'],
					'second' => $entries[ $j ]['side'],
				);
			}
		}
	}

	return $pairs;
}

/**
 * Remove repeated citations from every bibliography in one post, and save it
 * unless dry running.
 *
 * Each block keeps the first copy of a work and drops later copies, after
 * copying any fields the kept copy lacks from them (formatting it again, and
 * sorting the block when that happened), then refreshes the year suffixes the
 * change touched, as DELETE …/citations does. Duplicates across two blocks in the post are left in place and
 * listed in `crossBlockDuplicates`. A post with nothing to remove comes back
 * `unchanged`, and its `bibliographies` list only the blocks that changed.
 *
 * Shared by POST /bulk/deduplicate and `wp borges deduplicate`.
 *
 * @param int    $post_id Post ID.
 * @param bool   $dry_run Preview without saving.
 * @param string $etag    The ETag the caller based the change on; needed to save.
 * @return array Result: `postId`, `status`, `crossBlockDuplicates`, and `etag`,
 *               `bibliographies`, or `error`.
 */
function bibliography_builder_bulk_deduplicate_post( $post_id, $dry_run, $etag = '' ) {
	$blocks = array();
	$result = bibliography_builder_bulk_write_post(
		$post_id,
		/**
		 * Drop later copies within one block.
		 *
		 * @param array $attrs Block attributes as plain arrays.
		 * @param int   $index Block index in the post.
		 * @return array|WP_Error|null `{ attrs, changes }`, null when the block
		 *                             has no duplicates, or an error.
		 */
		static function ( $attrs, $index ) use ( &$blocks ) {
			$split = bibliography_builder_bulk_split_duplicates( bibliography_builder_write_citations( $attrs ) );
			$id    = $attrs['bibliographyId'] ?? null;

			$blocks[ $index ] = array(
				'bibliographyId' => null === $id ? null : (string) $id,
				'citations'      => $split['kept'],
			);

			if ( array() === $split['removed'] ) {
				return null;
			}

			$style     = bibliography_builder_write_style( $attrs );
			$citations = $split['kept'];
			$touched   = array_map(
				static function ( $removed ) {
					return bibliography_builder_citation_csl( $removed['citation'] );
				},
				$split['removed']
			);

			if ( array() !== $split['merged'] ) {
				$citations = bibliography_builder_bulk_format_merged( $citations, $split['merged'], $style );

				if ( is_wp_error( $citations ) ) {
					return $citations;
				}

				// A gained author or date can move an entry and its year-suffix group.
				foreach ( $split['merged'] as $position => $before ) {
					$touched[] = $before;
					$touched[] = bibliography_builder_citation_csl( $citations[ $position ] );
				}
			}

			$citations = bibliography_builder_write_refresh_year_suffixes( $citations, $style, $touched );

			if ( is_wp_error( $citations ) ) {
				return $citations;
			}

			$attrs['citations'] = array() === $split['merged']
				? $citations
				: bibliography_builder_sort_citations_for_save( $citations, $style );

			return array(
				'attrs'   => $attrs,
				'changes' => array( 'removed' => $split['removed'] ),
			);
		},
		$dry_run,
		$etag
	);

	// Report only when every block was read; a failed post has nothing to
	// decide yet.
	if ( in_array( $result['status'], array( 'preview', 'changed', 'unchanged' ), true ) ) {
		$result['crossBlockDuplicates'] = bibliography_builder_bulk_cross_block_duplicates( $blocks );
	}

	return $result;
}

/**
 * An error response that can carry headers, which a WP_Error cannot.
 *
 * The body has the same shape WordPress gives a WP_Error.
 *
 * @param WP_Error   $error      Error, with `status` in its data.
 * @param array|null $rate_limit Rate-limit state for the headers, or null.
 * @param int|null   $retry      Seconds for Retry-After, or null.
 * @return WP_REST_Response
 */
function bibliography_builder_bulk_error_response( WP_Error $error, $rate_limit = null, $retry = null ) {
	$data     = (array) $error->get_error_data();
	$response = new WP_REST_Response(
		array(
			'code'    => $error->get_error_code(),
			'message' => $error->get_error_message(),
			'data'    => $data,
		),
		isset( $data['status'] ) ? (int) $data['status'] : 500
	);

	if ( null !== $retry ) {
		$response->header( 'Retry-After', (string) $retry );
	}

	return bibliography_builder_with_rate_limit_headers( $response, $rate_limit );
}

/**
 * Refuse a bulk write when this server cannot rebuild markup.
 *
 * @return WP_Error|null
 */
function bibliography_builder_bulk_unavailable() {
	if ( bibliography_builder_can_render_save_markup() ) {
		return null;
	}

	return new WP_Error(
		'bibliography_builder_write_unavailable',
		__(
			'This server cannot rebuild bibliography markup: the PHP intl extension is required.',
			'borges-bibliography-builder'
		),
		array( 'status' => 501 )
	);
}

/**
 * Run a bulk request's posts through one per-post function, within the
 * caller's budget, the site-wide lock, and the time budget.
 *
 * Checks run cheapest first, so a refused request does no work: the post
 * list, then the caller's budget, then (for a real write) the site-wide
 * lock; the per-post function checks each post's own `edit_post` and ETag.
 * The route's own body fields are checked before this is called.
 *
 * @param WP_REST_Request $request  REST request.
 * @param array           $params   Decoded JSON body.
 * @param callable        $per_post Called with a post ID, the dry-run flag, and
 *                                  the ETag; returns that post's result.
 * @param array           $extra    Fields to add to the response after `dryRun`.
 * @return WP_REST_Response|WP_Error
 */
function bibliography_builder_rest_bulk_run( WP_REST_Request $request, $params, $per_post, $extra = array() ) {
	$posts = bibliography_builder_bulk_posts_param(
		$params['posts'] ?? null,
		bibliography_builder_bulk_max_posts_per_request()
	);

	if ( is_wp_error( $posts ) ) {
		return $posts;
	}

	$dry_run_arg = $request['dry_run'];
	$dry_run     = null === $dry_run_arg || false !== rest_sanitize_boolean( $dry_run_arg );
	$user_id     = get_current_user_id();
	$limit       = bibliography_builder_bulk_rate_limit( $user_id );
	$key         = bibliography_builder_bulk_rate_limit_key( $user_id, $request );
	$allowed     = count( $posts );
	$reserved    = 0;
	$state       = null;

	if ( null !== $limit ) {
		// Reserve the whole batch up front: with a persistent object cache the
		// increment is atomic, so parallel requests cannot both spend the
		// same posts. Whatever is over the budget, or never reached, is
		// given back below.
		$used     = bibliography_builder_rate_limit_spend( $key, $limit, $allowed );
		$over     = max( 0, $used - $limit['posts'] );
		$reserved = $allowed;
		$allowed  = max( 0, $allowed - $over );

		if ( 0 === $allowed ) {
			$used  = bibliography_builder_rate_limit_spend( $key, $limit, -$reserved );
			$state = bibliography_builder_rate_limit_state( $limit, $used );

			return bibliography_builder_bulk_error_response(
				new WP_Error(
					'bibliography_builder_rate_limited',
					__(
						'Bulk edit limit reached. Wait until the limit resets, then send the remaining posts.',
						'borges-bibliography-builder'
					),
					array(
						'status' => 429,
						'reset'  => $state['reset'],
					)
				),
				$state,
				$state['reset']
			);
		}
	}

	$budget = bibliography_builder_bulk_time_budget();
	$lock   = $dry_run ? null : bibliography_builder_bulk_lock_acquire( $budget );

	if ( false === $lock ) {
		if ( null !== $limit ) {
			$used  = bibliography_builder_rate_limit_spend( $key, $limit, -$reserved );
			$state = bibliography_builder_rate_limit_state( $limit, $used );
		}

		return bibliography_builder_bulk_error_response(
			new WP_Error(
				'bibliography_builder_bulk_busy',
				__( 'Another bulk edit is saving on this site. Try again shortly.', 'borges-bibliography-builder' ),
				array( 'status' => 429 )
			),
			$state,
			BIBLIOGRAPHY_BUILDER_BULK_LOCK_RETRY_AFTER
		);
	}

	$started = microtime( true );
	$results = array();

	try {
		foreach ( array_slice( $posts, 0, $allowed ) as $position => $entry ) {
			// Always do at least one post, then stop starting new ones once
			// the time budget is spent.
			if ( 0 < $position && microtime( true ) - $started >= $budget ) {
				break;
			}

			$results[] = call_user_func( $per_post, $entry['id'], $dry_run, $entry['etag'] );
		}
	} finally {
		if ( is_string( $lock ) ) {
			bibliography_builder_bulk_lock_release( $lock );
		}
	}

	if ( null !== $limit ) {
		$unused = $reserved - count( $results );
		$used   = 0 < $unused
			? bibliography_builder_rate_limit_spend( $key, $limit, -$unused )
			: bibliography_builder_rate_limit_used( $key, $limit );
		$state  = bibliography_builder_rate_limit_state( $limit, $used );
	}

	$response = rest_ensure_response(
		array( 'dryRun' => $dry_run )
		+ $extra
		+ array(
			'results'   => $results,
			'remaining' => array_slice( $posts, count( $results ) ),
			'rateLimit' => $state,
		)
	);

	return bibliography_builder_with_rate_limit_headers( $response, $state );
}

/**
 * POST /bulk/reformat: switch every bibliography in a batch of posts to one style.
 *
 * @param WP_REST_Request $request REST request.
 * @return WP_REST_Response|WP_Error
 */
function bibliography_builder_rest_bulk_reformat( WP_REST_Request $request ) {
	$unavailable = bibliography_builder_bulk_unavailable();

	if ( null !== $unavailable ) {
		return $unavailable;
	}

	/**
	 * WordPress documents an array, but returns null for an absent or invalid body.
	 *
	 * @var mixed $params
	 */
	$params = $request->get_json_params();
	$params = is_array( $params ) ? $params : array();
	$style  = isset( $params['style'] ) && is_string( $params['style'] ) ? $params['style'] : '';
	$styles = array_keys( bibliography_builder_get_formatter_style_definitions() );

	if ( ! in_array( $style, $styles, true ) ) {
		return new WP_Error(
			'bibliography_builder_invalid_style',
			sprintf(
				/* translators: %s: comma-separated style keys. */
				__( 'Send "style": one of %s.', 'borges-bibliography-builder' ),
				implode( ', ', $styles )
			),
			array( 'status' => 400 )
		);
	}

	return bibliography_builder_rest_bulk_run(
		$request,
		$params,
		/**
		 * Reformat one post.
		 *
		 * @param int    $post_id Post ID.
		 * @param bool   $dry_run Preview without saving.
		 * @param string $etag    ETag sent for the post.
		 * @return array
		 */
		static function ( $post_id, $dry_run, $etag ) use ( $style ) {
			return bibliography_builder_bulk_reformat_post( $post_id, $style, $dry_run, $etag );
		},
		array( 'style' => $style )
	);
}

/**
 * POST /bulk/deduplicate: remove repeated citations from every bibliography
 * in a batch of posts.
 *
 * Body: `{ "posts": [ { "id": 12, "etag": "…" } ] }`. Each bibliography keeps
 * the first copy of each work; see bibliography_builder_bulk_deduplicate_post().
 *
 * @param WP_REST_Request $request REST request.
 * @return WP_REST_Response|WP_Error
 */
function bibliography_builder_rest_bulk_deduplicate( WP_REST_Request $request ) {
	$unavailable = bibliography_builder_bulk_unavailable();

	if ( null !== $unavailable ) {
		return $unavailable;
	}

	/**
	 * WordPress documents an array, but returns null for an absent or invalid body.
	 *
	 * @var mixed $params
	 */
	$params = $request->get_json_params();

	return bibliography_builder_rest_bulk_run(
		$request,
		is_array( $params ) ? $params : array(),
		'bibliography_builder_bulk_deduplicate_post'
	);
}

/**
 * Register the bulk routes. Called from
 * bibliography_builder_register_write_routes(), so they follow its filter.
 *
 * @return void
 */
function bibliography_builder_register_bulk_routes() {
	register_rest_route(
		'bibliography/v1',
		'/bulk/reformat',
		array(
			'methods'             => 'POST',
			'callback'            => 'bibliography_builder_rest_bulk_reformat',
			'permission_callback' => 'bibliography_builder_rest_bulk_permissions_check',
			'args'                => array(
				'dry_run' => array(
					'description' => __(
						'Preview the change without saving. Defaults to true; pass false to write.',
						'borges-bibliography-builder'
					),
					'type'        => 'boolean',
					'default'     => true,
				),
			),
		)
	);

	register_rest_route(
		'bibliography/v1',
		'/bulk/deduplicate',
		array(
			'methods'             => 'POST',
			'callback'            => 'bibliography_builder_rest_bulk_deduplicate',
			'permission_callback' => 'bibliography_builder_rest_bulk_permissions_check',
			'args'                => array(
				'dry_run' => array(
					'description' => __(
						'Preview the change without saving. Defaults to true; pass false to write.',
						'borges-bibliography-builder'
					),
					'type'        => 'boolean',
					'default'     => true,
				),
			),
		)
	);
}

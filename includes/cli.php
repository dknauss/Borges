<?php
/**
 * WP-CLI commands: the read-only `wp borges list`, `export`, and `validate`,
 * and the bulk writes `wp borges reformat` and `wp borges deduplicate`.
 *
 * Each command calls the same read model as the REST routes and abilities
 * (`bibliography_builder_get_bibliographies_for_post()`, the export builders,
 * and `bibliography_builder_get_validation_report()`), so their output matches.
 * None of them writes anything.
 *
 * `wp borges reformat` and `wp borges deduplicate` write, so they always
 * check, with or without the rule below: they need `--user`, the write-routes
 * filter, `edit_others_posts`, and `edit_post` on each post, as the bulk
 * routes do. Each works through the same per-post function as its route, in
 * batches, but spends
 * no rate-limit budget and takes no lock: someone with a shell is the site's
 * operator, and the budget exists to stop runaway HTTP loops.
 *
 * Permissions: run as no one (no `--user`), the commands check no
 * capabilities, like core's own commands: anyone who can run WP-CLI on the
 * server can already read every post. Run with `--user=<user>`, they enforce
 * that user's capabilities exactly as the REST routes and abilities do:
 * `list` and `export` need the read route's access (a published, publicly
 * viewable post, or `edit_post`), and `validate` needs `edit_post`, as the
 * validate route does. Pass `--url=` to choose a site on Multisite.
 *
 * Loaded from the main plugin file only when WP-CLI is running. The command
 * class itself is in `class-bibliography-builder-cli-command.php`.
 *
 * @package BibliographyBuilder
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Columns `wp borges list` prints by default.
 */
const BIBLIOGRAPHY_BUILDER_CLI_LIST_FIELDS = array(
	'index',
	'bibliographyId',
	'citationStyle',
	'entryCount',
	'headingText',
);

/**
 * Columns `wp borges validate` prints, one row per issue.
 */
const BIBLIOGRAPHY_BUILDER_CLI_ISSUE_FIELDS = array(
	'bibliography',
	'entry',
	'id',
	'severity',
	'code',
	'field',
	'message',
);

/**
 * Columns `wp borges reformat` prints, one row per post.
 */
const BIBLIOGRAPHY_BUILDER_CLI_REFORMAT_FIELDS = array(
	'postId',
	'status',
	'bibliographies',
	'message',
);

/**
 * Columns `wp borges deduplicate` prints, one row per post.
 */
const BIBLIOGRAPHY_BUILDER_CLI_DEDUPLICATE_FIELDS = array(
	'postId',
	'status',
	'removed',
	'crossBlock',
	'message',
);

/**
 * Load a post for a command, or an error naming the ID or refusing access.
 *
 * With no current user (no `--user`), every post is readable. With one, the
 * same checks as the REST routes and abilities apply.
 *
 * @param mixed  $post_id Post ID from the command line.
 * @param string $access  `read` (list, export) or `review` (validate).
 * @return WP_Post|WP_Error
 */
function bibliography_builder_cli_get_post( $post_id, $access = 'read' ) {
	/**
	 * Get_post() returns a WP_Post or null for an ID with the default output.
	 *
	 * @var WP_Post|null $post
	 */
	$post = ctype_digit( (string) $post_id ) && 0 < (int) $post_id ? get_post( (int) $post_id ) : null;

	if ( ! is_object( $post ) ) {
		return new WP_Error(
			'bibliography_builder_post_not_found',
			/* translators: %s: post ID given on the command line. */
			sprintf( __( 'Post %s not found.', 'borges-bibliography-builder' ), (string) $post_id )
		);
	}

	if ( 0 === get_current_user_id() ) {
		return $post;
	}

	if ( 'review' === $access ) {
		$allowed = bibliography_builder_can_review_post( $post->ID );

		return is_wp_error( $allowed ) ? $allowed : $post;
	}

	if ( bibliography_builder_can_read_post( $post ) ) {
		return $post;
	}

	return new WP_Error(
		'bibliography_builder_forbidden',
		__( 'Sorry, you are not allowed to read this bibliography.', 'borges-bibliography-builder' )
	);
}

/**
 * Table rows for `wp borges list`: one per bibliography block in the post.
 *
 * @param WP_Post $post Post.
 * @return array<int, array<string, mixed>>
 */
function bibliography_builder_cli_list_rows( $post ) {
	return array_map(
		static function ( $bibliography ) {
			return array(
				'index'          => $bibliography['index'],
				'bibliographyId' => $bibliography['bibliographyId'],
				'citationStyle'  => $bibliography['citationStyle'],
				'entryCount'     => $bibliography['entryCount'],
				'headingText'    => $bibliography['headingText'],
				'headingLevel'   => $bibliography['headingLevel'],
				'outputJsonLd'   => $bibliography['outputJsonLd'],
				'outputCoins'    => $bibliography['outputCoins'],
				'outputCslJson'  => $bibliography['outputCslJson'],
			);
		},
		bibliography_builder_get_bibliographies_for_post( $post )
	);
}

/**
 * The block `--bibliography-id` or `--index` names, as the abilities read it.
 *
 * @param array $assoc_args Command options.
 * @return array{0: int|string, 1: string} The reference and its kind.
 */
function bibliography_builder_cli_block_ref( $assoc_args ) {
	$input = array();

	if ( isset( $assoc_args['bibliography-id'] ) ) {
		$input['bibliography_id'] = (string) $assoc_args['bibliography-id'];
	}

	if ( isset( $assoc_args['index'] ) ) {
		$input['index'] = $assoc_args['index'];
	}

	return array(
		bibliography_builder_ability_block_ref( $input ),
		bibliography_builder_ability_block_kind( $input ),
	);
}

/**
 * What `wp borges export` prints: one bibliography as CSL-JSON, plain text,
 * or its whole read-model record as JSON.
 *
 * @param int   $post_id    Post ID.
 * @param array $assoc_args Command options: `index`, `bibliography-id`, `format`.
 * @return string|WP_Error
 */
function bibliography_builder_cli_export( $post_id, $assoc_args ) {
	$format = isset( $assoc_args['format'] ) ? (string) $assoc_args['format'] : 'csl-json';

	if ( ! in_array( $format, array( 'csl-json', 'text', 'json' ), true ) ) {
		return new WP_Error(
			'bibliography_builder_invalid_format',
			__( 'Unsupported format. Use csl-json, text, or json.', 'borges-bibliography-builder' )
		);
	}

	list( $ref, $kind ) = bibliography_builder_cli_block_ref( $assoc_args );
	$bibliography       = bibliography_builder_resolve_bibliography( $post_id, $ref, $kind );

	if ( is_wp_error( $bibliography ) ) {
		return $bibliography;
	}

	if ( 'text' === $format ) {
		return bibliography_builder_build_plain_text( $bibliography );
	}

	return (string) wp_json_encode(
		'json' === $format ? $bibliography : bibliography_builder_build_csl_json( $bibliography ),
		JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE
	);
}

/**
 * Validation reports for `wp borges validate`: the one bibliography the
 * options name, or every bibliography in the post when they name none.
 *
 * @param WP_Post $post       Post.
 * @param array   $assoc_args Command options: `index`, `bibliography-id`.
 * @return array[]|WP_Error
 */
function bibliography_builder_cli_validation_reports( $post, $assoc_args ) {
	if ( isset( $assoc_args['index'] ) || isset( $assoc_args['bibliography-id'] ) ) {
		list( $ref, $kind ) = bibliography_builder_cli_block_ref( $assoc_args );
		$report             = bibliography_builder_get_validation_report( $post->ID, $ref, $kind );

		return is_wp_error( $report ) ? $report : array( $report );
	}

	$reports = array();

	foreach ( bibliography_builder_get_bibliographies_for_post( $post ) as $bibliography ) {
		$report = bibliography_builder_get_validation_report( $post->ID, $bibliography['index'], 'index' );

		if ( ! is_wp_error( $report ) ) {
			$reports[] = $report;
		}
	}

	return $reports;
}

/**
 * Table rows for `wp borges validate`: one per issue, across all reports.
 *
 * @param array[] $reports Validation reports.
 * @return array<int, array<string, mixed>>
 */
function bibliography_builder_cli_issue_rows( $reports ) {
	$rows = array();

	foreach ( $reports as $report ) {
		foreach ( $report['entries'] as $entry ) {
			foreach ( $entry['issues'] as $issue ) {
				$rows[] = array(
					'bibliography' => $report['index'],
					'entry'        => $entry['index'],
					'id'           => $entry['id'],
					'severity'     => $issue['severity'],
					'code'         => $issue['code'],
					'field'        => $issue['field'],
					'message'      => $issue['message'],
				);
			}
		}
	}

	return $rows;
}

/**
 * Check that a bulk write command may run: the write-routes filter, a
 * `--user`, and that user's `edit_others_posts`.
 *
 * @return true|WP_Error
 */
function bibliography_builder_cli_bulk_write_check() {
	if ( ! bibliography_builder_write_routes_enabled() ) {
		return new WP_Error(
			'bibliography_builder_writes_disabled',
			__(
				'Writes are off on this site. Turn on the bibliography_builder_enable_write_routes filter first.',
				'borges-bibliography-builder'
			)
		);
	}

	if ( 0 === get_current_user_id() ) {
		return new WP_Error(
			'bibliography_builder_user_required',
			__( 'Pass --user=<user>: writes check that user\'s capabilities.', 'borges-bibliography-builder' )
		);
	}

	return bibliography_builder_rest_bulk_permissions_check();
}

/**
 * Check that `wp borges reformat` may run, and read its style.
 *
 * @param array $assoc_args Command options: `style`.
 * @return string|WP_Error The style key.
 */
function bibliography_builder_cli_reformat_style( $assoc_args ) {
	$allowed = bibliography_builder_cli_bulk_write_check();

	if ( is_wp_error( $allowed ) ) {
		return $allowed;
	}

	$style  = isset( $assoc_args['style'] ) ? (string) $assoc_args['style'] : '';
	$styles = array_keys( bibliography_builder_get_formatter_style_definitions() );

	if ( ! in_array( $style, $styles, true ) ) {
		return new WP_Error(
			'bibliography_builder_invalid_style',
			sprintf(
				/* translators: %s: comma-separated style keys. */
				__( 'Pass --style: one of %s.', 'borges-bibliography-builder' ),
				implode( ', ', $styles )
			)
		);
	}

	return $style;
}

/**
 * Run posts through a bulk per-post function, a batch at a time.
 *
 * A commit reads each post's ETag just before changing it, so a post
 * someone edits during the run is saved from their latest content, and the
 * splice still proves nothing else in the post changed. Between batches the
 * in-memory object cache is flushed, so memory stays flat on large runs.
 *
 * @param int[]    $post_ids   Post IDs.
 * @param callable $per_post   Called with a post ID, the dry-run flag, and the ETag.
 * @param bool     $commit     Save, rather than preview.
 * @param int      $batch_size Posts per batch.
 * @param int      $sleep      Seconds to wait between batches.
 * @return array[] The per-post results.
 */
function bibliography_builder_cli_bulk_posts( $post_ids, $per_post, $commit, $batch_size, $sleep ) {
	$results = array();
	$batches = array_chunk( $post_ids, max( 1, $batch_size ) );

	foreach ( $batches as $number => $batch ) {
		if ( 0 < $number ) {
			if ( function_exists( 'wp_cache_flush_runtime' ) ) {
				wp_cache_flush_runtime();
			}

			if ( 0 < $sleep ) {
				sleep( $sleep );
			}
		}

		foreach ( $batch as $post_id ) {
			$post      = get_post( $post_id );
			$etag      = $commit && is_object( $post ) ? bibliography_builder_post_etag( $post ) : '';
			$results[] = call_user_func( $per_post, $post_id, ! $commit, $etag );
		}
	}

	return $results;
}

/**
 * Reformat posts for `wp borges reformat`, a batch at a time.
 *
 * @param int[]  $post_ids   Post IDs.
 * @param string $style      Style key.
 * @param bool   $commit     Save, rather than preview.
 * @param int    $batch_size Posts per batch.
 * @param int    $sleep      Seconds to wait between batches.
 * @return array[] Results of bibliography_builder_bulk_reformat_post().
 */
function bibliography_builder_cli_reformat_posts( $post_ids, $style, $commit, $batch_size, $sleep ) {
	return bibliography_builder_cli_bulk_posts(
		$post_ids,
		/**
		 * Reformat one post.
		 *
		 * @param int    $post_id Post ID.
		 * @param bool   $dry_run Preview without saving.
		 * @param string $etag    The post's current ETag, or '' for a preview.
		 * @return array
		 */
		static function ( $post_id, $dry_run, $etag ) use ( $style ) {
			return bibliography_builder_bulk_reformat_post( $post_id, $style, $dry_run, $etag );
		},
		$commit,
		$batch_size,
		$sleep
	);
}

/**
 * Table rows for `wp borges reformat`.
 *
 * @param array[] $results Results of bibliography_builder_bulk_reformat_post().
 * @return array<int, array<string, mixed>>
 */
function bibliography_builder_cli_reformat_rows( $results ) {
	return array_map(
		static function ( $result ) {
			if ( isset( $result['error'] ) ) {
				$message = $result['error']['message'];
			} else {
				$styles = array_unique(
					array_map(
						/**
						 * One bibliography's style change, as `from → to`.
						 *
						 * @param array $bibliography Result entry for one bibliography.
						 * @return string
						 */
						static function ( $bibliography ) {
							$change = $bibliography['changes']['citationStyle'];

							return $change['from'] . ' → ' . $change['to'];
						},
						$result['bibliographies']
					)
				);
				$message = implode( ', ', $styles );
			}

			return array(
				'postId'         => $result['postId'],
				'status'         => $result['status'],
				'bibliographies' => isset( $result['bibliographies'] ) ? count( $result['bibliographies'] ) : 0,
				'message'        => $message,
			);
		},
		$results
	);
}

/**
 * Table rows for `wp borges deduplicate`.
 *
 * @param array[] $results Results of bibliography_builder_bulk_deduplicate_post().
 * @return array<int, array<string, mixed>>
 */
function bibliography_builder_cli_deduplicate_rows( $results ) {
	return array_map(
		static function ( $result ) {
			$removed = 0;

			foreach ( $result['bibliographies'] ?? array() as $bibliography ) {
				$removed += count( $bibliography['changes']['removed'] );
			}

			$cross = isset( $result['crossBlockDuplicates'] ) ? count( $result['crossBlockDuplicates'] ) : 0;

			if ( isset( $result['error'] ) ) {
				$message = $result['error']['message'];
			} elseif ( 0 < $cross ) {
				$message = __(
					'Some works repeat across bibliographies; those are left in place.',
					'borges-bibliography-builder'
				);
			} else {
				$message = '';
			}

			return array(
				'postId'     => $result['postId'],
				'status'     => $result['status'],
				'removed'    => $removed,
				'crossBlock' => $cross,
				'message'    => $message,
			);
		},
		$results
	);
}

require_once __DIR__ . '/class-bibliography-builder-cli-command.php';

WP_CLI::add_command( 'borges', 'Bibliography_Builder_CLI_Command' );

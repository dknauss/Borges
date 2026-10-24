<?php
/**
 * The `wp borges` command class. Each subcommand loads its data through the
 * helpers in `includes/cli.php` and only prints here.
 *
 * @package BibliographyBuilder
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Read, check, restyle, and deduplicate Borges bibliographies.
 *
 * ## EXAMPLES
 *
 *     # List the bibliography blocks in post 42.
 *     $ wp borges list 42
 *
 *     # Export the first bibliography as CSL-JSON for a reference manager.
 *     $ wp borges export 42 > references.json
 *
 *     # Check every bibliography in a post; exits 1 when any entry has an error.
 *     $ wp borges validate 42
 *
 *     # Preview switching three posts to MLA, then save it.
 *     $ wp borges reformat 42 43 44 --style=mla-9 --user=editor
 *     $ wp borges reformat 42 43 44 --style=mla-9 --user=editor --commit
 *
 *     # Remove repeated citations from two posts.
 *     $ wp borges deduplicate 42 43 --user=editor --commit
 *
 *     # Run a check on every site in a network.
 *     $ wp site list --field=url | xargs -I % wp borges validate 42 --url=%
 *
 * ## PERMISSIONS
 *
 * Without --user, the commands read any post, as core's commands do. With
 * --user, they apply that user's capabilities as the REST routes do: list and
 * export need a published public post or edit_post, and validate needs
 * edit_post.
 *
 * reformat and deduplicate write, so they always need --user, the
 * write-routes filter, edit_others_posts, and edit_post on each post.
 */
final class Bibliography_Builder_CLI_Command {

	/**
	 * Lists the bibliography blocks in a post.
	 *
	 * ## OPTIONS
	 *
	 * <post-id>
	 * : Post ID.
	 *
	 * [--fields=<fields>]
	 * : Columns to show. Also available: headingLevel, outputJsonLd, outputCoins, outputCslJson.
	 *
	 * [--format=<format>]
	 * : Output format.
	 * ---
	 * default: table
	 * options:
	 *   - table
	 *   - json
	 *   - csv
	 *   - yaml
	 *   - count
	 * ---
	 *
	 * ## EXAMPLES
	 *
	 *     $ wp borges list 42
	 *     $ wp borges list 42 --format=json
	 *
	 * @subcommand list
	 *
	 * @param array $args       Positional arguments.
	 * @param array $assoc_args Options.
	 * @return void
	 */
	public function list_( $args, $assoc_args ) {
		$post = bibliography_builder_cli_get_post( $args[0] );

		if ( is_wp_error( $post ) ) {
			WP_CLI::error( $post );
			return;
		}

		WP_CLI\Utils\format_items(
			isset( $assoc_args['format'] ) ? (string) $assoc_args['format'] : 'table',
			bibliography_builder_cli_list_rows( $post ),
			isset( $assoc_args['fields'] ) ? (string) $assoc_args['fields'] : BIBLIOGRAPHY_BUILDER_CLI_LIST_FIELDS
		);
	}

	/**
	 * Exports one bibliography.
	 *
	 * ## OPTIONS
	 *
	 * <post-id>
	 * : Post ID.
	 *
	 * [--index=<index>]
	 * : Zero-based position of the bibliography block in the post. Defaults to the first.
	 *
	 * [--bibliography-id=<id>]
	 * : The block's stable bibliographyId. Takes precedence over --index.
	 *
	 * [--format=<format>]
	 * : csl-json is a CSL-JSON array; text is one citation per line; json is the
	 * whole record the REST API returns.
	 * ---
	 * default: csl-json
	 * options:
	 *   - csl-json
	 *   - text
	 *   - json
	 * ---
	 *
	 * ## EXAMPLES
	 *
	 *     $ wp borges export 42 > references.json
	 *     $ wp borges export 42 --index=1 --format=text
	 *
	 * @param array $args       Positional arguments.
	 * @param array $assoc_args Options.
	 * @return void
	 */
	public function export( $args, $assoc_args ) {
		$post = bibliography_builder_cli_get_post( $args[0] );

		if ( is_wp_error( $post ) ) {
			WP_CLI::error( $post );
			return;
		}

		$output = bibliography_builder_cli_export( $post->ID, $assoc_args );

		if ( is_wp_error( $output ) ) {
			WP_CLI::error( $output );
			return;
		}

		WP_CLI::line( $output );
	}

	/**
	 * Reports errors and warnings for each entry in a post's bibliographies.
	 *
	 * Exits with status 1 when any entry has an error, so scripts can stop on
	 * it. Warnings alone exit 0.
	 *
	 * ## OPTIONS
	 *
	 * <post-id>
	 * : Post ID.
	 *
	 * [--index=<index>]
	 * : Check only the bibliography block at this zero-based position.
	 *
	 * [--bibliography-id=<id>]
	 * : Check only the block with this stable bibliographyId.
	 *
	 * [--format=<format>]
	 * : table, csv, and yaml list one row per issue; json prints the full reports.
	 * ---
	 * default: table
	 * options:
	 *   - table
	 *   - json
	 *   - csv
	 *   - yaml
	 * ---
	 *
	 * ## EXAMPLES
	 *
	 *     $ wp borges validate 42
	 *     $ wp borges validate 42 --bibliography-id=reading-list --format=json
	 *
	 * @param array $args       Positional arguments.
	 * @param array $assoc_args Options.
	 * @return void
	 */
	public function validate( $args, $assoc_args ) {
		$post = bibliography_builder_cli_get_post( $args[0], 'review' );

		if ( is_wp_error( $post ) ) {
			WP_CLI::error( $post );
			return;
		}

		$reports = bibliography_builder_cli_validation_reports( $post, $assoc_args );

		if ( is_wp_error( $reports ) ) {
			WP_CLI::error( $reports );
			return;
		}

		$format   = isset( $assoc_args['format'] ) ? (string) $assoc_args['format'] : 'table';
		$errors   = (int) array_sum( array_column( $reports, 'errorCount' ) );
		$warnings = (int) array_sum( array_column( $reports, 'warningCount' ) );

		if ( 'json' === $format ) {
			WP_CLI::line(
				(string) wp_json_encode( $reports, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE )
			);
		} else {
			$rows = bibliography_builder_cli_issue_rows( $reports );

			if ( array() !== $rows ) {
				WP_CLI\Utils\format_items( $format, $rows, BIBLIOGRAPHY_BUILDER_CLI_ISSUE_FIELDS );
			}

			$summary = sprintf(
				/* translators: 1: number of errors, 2: number of warnings, 3: number of bibliographies checked. */
				__( 'Errors: %1$d. Warnings: %2$d. Bibliographies checked: %3$d.', 'borges-bibliography-builder' ),
				$errors,
				$warnings,
				count( $reports )
			);

			if ( 0 < $errors ) {
				WP_CLI::warning( $summary );
			} else {
				WP_CLI::success( $summary );
			}
		}

		if ( 0 < $errors ) {
			WP_CLI::halt( 1 );
		}
	}

	/**
	 * Switches every bibliography in the given posts to one citation style.
	 *
	 * Previews unless --commit is passed. Posts are saved one at a time, each
	 * as a single revision; a post that fails is reported and skipped, and the
	 * run goes on. Exits with status 1 when any post failed.
	 *
	 * Needs --user, the bibliography_builder_enable_write_routes filter,
	 * edit_others_posts, and edit_post on each post. Unlike POST
	 * /bulk/reformat, it spends no rate-limit budget.
	 *
	 * ## OPTIONS
	 *
	 * <post-id>...
	 * : One or more post IDs. Posts without a bibliography are skipped.
	 *
	 * --style=<style>
	 * : Citation style key, such as apa-7 or chicago-notes-bibliography.
	 *
	 * [--commit]
	 * : Save the change. Without it, the command only previews.
	 *
	 * [--batch-size=<number>]
	 * : Posts per batch. The object cache's memory is freed between batches.
	 * ---
	 * default: 25
	 * ---
	 *
	 * [--sleep=<seconds>]
	 * : Seconds to wait between batches, to go easy on a busy server.
	 * ---
	 * default: 0
	 * ---
	 *
	 * [--format=<format>]
	 * : table, csv, and yaml list one row per post; json prints the full results.
	 * ---
	 * default: table
	 * options:
	 *   - table
	 *   - json
	 *   - csv
	 *   - yaml
	 * ---
	 *
	 * ## EXAMPLES
	 *
	 *     $ wp borges reformat 42 43 --style=mla-9 --user=editor
	 *     $ wp borges reformat $(wp post list --post_type=post,page --s=wp:bibliography-builder --format=ids) \\
	 *         --style=apa-7 --user=editor --commit --sleep=1
	 *
	 * @param array $args       Positional arguments.
	 * @param array $assoc_args Options.
	 * @return void
	 */
	public function reformat( $args, $assoc_args ) {
		$style = bibliography_builder_cli_reformat_style( $assoc_args );

		if ( is_wp_error( $style ) ) {
			WP_CLI::error( $style );
			return;
		}

		$post_ids = self::post_ids( $args );
		$commit   = ! empty( $assoc_args['commit'] );
		$results  = bibliography_builder_cli_reformat_posts(
			$post_ids,
			$style,
			$commit,
			self::batch_size( $assoc_args ),
			self::sleep_seconds( $assoc_args )
		);

		self::print_bulk_results(
			$results,
			$assoc_args,
			$commit,
			bibliography_builder_cli_reformat_rows( $results ),
			BIBLIOGRAPHY_BUILDER_CLI_REFORMAT_FIELDS
		);
	}

	/**
	 * Removes repeated citations from every bibliography in the given posts.
	 *
	 * Each bibliography keeps the first copy of a work and drops later
	 * copies, by the editor's duplicate rules: the same DOI, or the same title
	 * with the same year or first author. A work repeated across two
	 * bibliographies in one post is reported in the crossBlock column and
	 * left in place.
	 *
	 * Previews unless --commit is passed. Posts are saved one at a time, each
	 * as a single revision that keeps the removed citations; a post that
	 * fails is reported and skipped, and the run goes on. Exits with status 1
	 * when any post failed.
	 *
	 * Needs --user, the bibliography_builder_enable_write_routes filter,
	 * edit_others_posts, and edit_post on each post. Unlike POST
	 * /bulk/deduplicate, it spends no rate-limit budget.
	 *
	 * ## OPTIONS
	 *
	 * <post-id>...
	 * : One or more post IDs. Posts without a bibliography are skipped.
	 *
	 * [--commit]
	 * : Save the change. Without it, the command only previews.
	 *
	 * [--batch-size=<number>]
	 * : Posts per batch. The object cache's memory is freed between batches.
	 * ---
	 * default: 25
	 * ---
	 *
	 * [--sleep=<seconds>]
	 * : Seconds to wait between batches, to go easy on a busy server.
	 * ---
	 * default: 0
	 * ---
	 *
	 * [--format=<format>]
	 * : table, csv, and yaml list one row per post; json prints the full results, removed citations included.
	 * ---
	 * default: table
	 * options:
	 *   - table
	 *   - json
	 *   - csv
	 *   - yaml
	 * ---
	 *
	 * ## EXAMPLES
	 *
	 *     $ wp borges deduplicate 42 43 --user=editor
	 *     $ wp borges deduplicate $(wp post list --post_type=post,page --s=wp:bibliography-builder --format=ids) \\
	 *         --user=editor --commit --sleep=1
	 *
	 * @param array $args       Positional arguments.
	 * @param array $assoc_args Options.
	 * @return void
	 */
	public function deduplicate( $args, $assoc_args ) {
		$allowed = bibliography_builder_cli_bulk_write_check();

		if ( is_wp_error( $allowed ) ) {
			WP_CLI::error( $allowed );
			return;
		}

		$post_ids = self::post_ids( $args );
		$commit   = ! empty( $assoc_args['commit'] );
		$results  = bibliography_builder_cli_bulk_posts(
			$post_ids,
			'bibliography_builder_bulk_deduplicate_post',
			$commit,
			self::batch_size( $assoc_args ),
			self::sleep_seconds( $assoc_args )
		);

		self::print_bulk_results(
			$results,
			$assoc_args,
			$commit,
			bibliography_builder_cli_deduplicate_rows( $results ),
			BIBLIOGRAPHY_BUILDER_CLI_DEDUPLICATE_FIELDS
		);
	}

	/**
	 * Read post IDs from a bulk command's arguments, or stop with an error.
	 *
	 * @param array $args Positional arguments.
	 * @return int[] Unique post IDs, in the order given.
	 */
	private static function post_ids( $args ) {
		$post_ids = array();

		foreach ( $args as $arg ) {
			if ( ! ctype_digit( (string) $arg ) || 0 === (int) $arg ) {
				/* translators: %s: value given on the command line. */
				WP_CLI::error( sprintf( __( 'Not a post ID: %s', 'borges-bibliography-builder' ), (string) $arg ) );
				return array();
			}

			$post_ids[] = (int) $arg;
		}

		return array_values( array_unique( $post_ids ) );
	}

	/**
	 * A bulk command's --batch-size, at least 1.
	 *
	 * @param array $assoc_args Options.
	 * @return int
	 */
	private static function batch_size( $assoc_args ) {
		return isset( $assoc_args['batch-size'] ) ? max( 1, (int) $assoc_args['batch-size'] ) : 25;
	}

	/**
	 * A bulk command's --sleep, at least 0.
	 *
	 * @param array $assoc_args Options.
	 * @return int
	 */
	private static function sleep_seconds( $assoc_args ) {
		return isset( $assoc_args['sleep'] ) ? max( 0, (int) $assoc_args['sleep'] ) : 0;
	}

	/**
	 * Print a bulk command's results and summary, and exit 1 if any post failed.
	 *
	 * @param array[]  $results    Per-post results.
	 * @param array    $assoc_args Options: `format`.
	 * @param bool     $commit     Whether the run saved.
	 * @param array[]  $rows       Table rows for the results.
	 * @param string[] $fields     Table columns.
	 * @return void
	 */
	private static function print_bulk_results( $results, $assoc_args, $commit, $rows, $fields ) {
		$format = isset( $assoc_args['format'] ) ? (string) $assoc_args['format'] : 'table';
		$counts = array_count_values( array_column( $results, 'status' ) );
		$failed = $counts['failed'] ?? 0;

		if ( 'json' === $format ) {
			WP_CLI::line(
				(string) wp_json_encode( $results, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE )
			);
		} else {
			WP_CLI\Utils\format_items( $format, $rows, $fields );

			$summary = $commit
				? sprintf(
					/* translators: 1: posts saved, 2: posts unchanged, 3: posts skipped, 4: posts failed. */
					__( 'Saved: %1$d. Unchanged: %2$d. Skipped: %3$d. Failed: %4$d.', 'borges-bibliography-builder' ),
					$counts['changed'] ?? 0,
					$counts['unchanged'] ?? 0,
					$counts['skipped'] ?? 0,
					$failed
				)
				: sprintf(
					/* translators: 1: posts that would change, 2: posts unchanged, 3: skipped, 4: failed. */
					__(
						'Would change: %1$d. Unchanged: %2$d. Skipped: %3$d. Failed: %4$d. Dry run; use --commit.',
						'borges-bibliography-builder'
					),
					$counts['preview'] ?? 0,
					$counts['unchanged'] ?? 0,
					$counts['skipped'] ?? 0,
					$failed
				);

			if ( 0 < $failed ) {
				WP_CLI::warning( $summary );
			} else {
				WP_CLI::success( $summary );
			}
		}

		if ( 0 < $failed ) {
			WP_CLI::halt( 1 );
		}
	}
}

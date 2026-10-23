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
 * Read and check Borges bibliographies.
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
 *     # Run a check on every site in a network.
 *     $ wp site list --field=url | xargs -I % wp borges validate 42 --url=%
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
		$post = bibliography_builder_cli_get_post( $args[0] );

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
}

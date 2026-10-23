<?php
/**
 * Read-only WP-CLI commands: `wp borges list`, `export`, and `validate`.
 *
 * Each command calls the same read model as the REST routes and abilities
 * (`bibliography_builder_get_bibliographies_for_post()`, the export builders,
 * and `bibliography_builder_get_validation_report()`), so their output matches.
 * None of them writes anything.
 *
 * Like core's own commands, these check no capabilities: anyone who can run
 * WP-CLI on the server can already read every post. Pass `--url=` to choose a
 * site on Multisite.
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
 * Load a post for a command, or an error naming the ID.
 *
 * @param mixed $post_id Post ID from the command line.
 * @return WP_Post|WP_Error
 */
function bibliography_builder_cli_get_post( $post_id ) {
	$post = ctype_digit( (string) $post_id ) && 0 < (int) $post_id ? get_post( (int) $post_id ) : null;

	if ( ! is_object( $post ) ) {
		return new WP_Error(
			'bibliography_builder_post_not_found',
			/* translators: %s: post ID given on the command line. */
			sprintf( __( 'Post %s not found.', 'borges-bibliography-builder' ), (string) $post_id )
		);
	}

	return $post;
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

require_once __DIR__ . '/class-bibliography-builder-cli-command.php';

WP_CLI::add_command( 'borges', 'Bibliography_Builder_CLI_Command' );

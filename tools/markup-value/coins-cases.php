<?php
/**
 * Prints, as JSON, the COinS `title` each coins-cases.json case renders with.
 *
 * Each case's citation is saved by the plugin's PHP port of save() with COinS
 * on, then run through the render-time COinS enrichment, as a live site
 * would. zotero-coins.mjs reads the output and imports every span with
 * Zotero's own OpenURL reader.
 *
 * Runs on the PHPUnit bootstrap's WordPress stubs, so it needs no WordPress
 * install: `php coins-cases.php`.
 *
 * @package BibliographyBuilder
 */

require_once dirname( __DIR__, 2 ) . '/tests/phpunit/bootstrap.php';

$borges_mv_cases  = json_decode( (string) file_get_contents( __DIR__ . '/coins-cases.json' ), true );
$borges_mv_titles = array();

foreach ( $borges_mv_cases['cases'] as $borges_mv_index => $borges_mv_case ) {
	$borges_mv_id  = 'case-' . $borges_mv_index;
	$borges_mv_csl = array(
		'id'     => $borges_mv_id,
		'type'   => 'article-journal',
		'title'  => $borges_mv_case['name'],
		'author' => $borges_mv_case['author'],
	);
	$borges_mv_li  = '<ul><li id="ref-' . $borges_mv_id . '"><span class="Z3988" aria-hidden="true" title="'
		. bibliography_builder_escape_save_attribute( bibliography_builder_save_build_coins( $borges_mv_csl ) )
		. '"></span></li></ul>';
	$borges_mv_out = bibliography_builder_enrich_rendered_coins(
		$borges_mv_li,
		array(
			'attrs' => array(
				'citations' => array(
					array(
						'id'  => $borges_mv_id,
						'csl' => $borges_mv_csl,
					),
				),
			),
		)
	);

	preg_match( '#title="([^"]*)"#', $borges_mv_out, $borges_mv_match );
	$borges_mv_titles[] = html_entity_decode( $borges_mv_match[1], ENT_QUOTES, 'UTF-8' );
}

echo wp_json_encode( $borges_mv_titles ), "\n";

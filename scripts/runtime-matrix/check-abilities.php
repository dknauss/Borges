<?php
/**
 * Runtime smoke: the Abilities API (WordPress 6.9+) runs Borges abilities.
 *
 * Runs `borges/get-bibliographies`, then a `borges/add-citations` dry run, as
 * the admin user (`wp eval-file ... --user=admin`), and checks the dry run
 * leaves the post untouched. Needs the write-routes mu-plugin, like the HTTP
 * write checks.
 *
 * Usage: wp eval-file /smoke/check-abilities.php <post_id> --user=admin
 * Prints "abilities-ok <entryCount>", "abilities-skip" (no Abilities API), or
 * "abilities-fail <reason>".
 * PHP 7.4-compatible on purpose.
 *
 * @package BibliographyBuilder
 */

if ( ! function_exists( 'wp_get_ability' ) ) {
	echo "abilities-skip\n";
	return;
}

$post_id = isset( $args[0] ) ? (int) $args[0] : 0;
$fail    = function ( $reason ) {
	echo 'abilities-fail ' . $reason . "\n";
};

$read = wp_get_ability( 'borges/get-bibliographies' );
$add  = wp_get_ability( 'borges/add-citations' );

if ( ! $read || ! $add ) {
	$fail( 'ability-not-registered' );
	return;
}

$listed = $read->execute( array( 'post_id' => $post_id ) );

if ( is_wp_error( $listed ) ) {
	$fail( 'get-bibliographies ' . $listed->get_error_code() );
	return;
}

if ( empty( $listed['bibliographies'][0]['entryCount'] ) ) {
	$fail( 'get-bibliographies-empty' );
	return;
}

$before_count   = (int) $listed['bibliographies'][0]['entryCount'];
$before_content = get_post( $post_id )->post_content;

$result = $add->execute(
	array(
		'post_id' => $post_id,
		'index'   => 0,
		'dry_run' => true,
		'items'   => array(
			array(
				'type'   => 'book',
				'title'  => 'Gamma Ability Book',
				'author' => array(
					array(
						'family' => 'Gamma',
						'given'  => 'Gus',
					),
				),
				'issued' => array( 'date-parts' => array( array( 2022 ) ) ),
			),
		),
	)
);

if ( is_wp_error( $result ) ) {
	$fail( 'add-citations ' . $result->get_error_code() );
	return;
}

if ( true !== ( $result['dryRun'] ?? null ) ) {
	$fail( 'not-a-dry-run' );
	return;
}

if ( empty( $result['etag'] ) ) {
	$fail( 'no-etag' );
	return;
}

$after_count = (int) ( $result['bibliography']['entryCount'] ?? -1 );

if ( $after_count !== $before_count + 1 ) {
	$fail( 'entry-count ' . $before_count . ' -> ' . $after_count );
	return;
}

if ( get_post( $post_id )->post_content !== $before_content ) {
	$fail( 'dry-run-changed-post' );
	return;
}

echo 'abilities-ok ' . $before_count . "\n";

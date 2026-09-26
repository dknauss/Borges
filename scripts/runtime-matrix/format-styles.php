<?php
/**
 * Runtime smoke: every bundled style renders the reviewed golden output.
 *
 * Run inside the WordPress container with `wp eval-file`. Formats
 * tests/fixtures/csl-styles/items.json (mounted at /smoke-fixtures) in every
 * style and compares each line with /smoke-fixtures/<style-key>.txt, so the
 * formatter and the styles are checked on each PHP version of the matrix,
 * from the release package's own vendor/.
 *
 * Prints "styles-ok <count>" or the first differences, one per line.
 * PHP 7.4-compatible on purpose.
 *
 * @package BibliographyBuilder
 */

$fixtures = '/smoke-fixtures';
$items    = json_decode( (string) file_get_contents( $fixtures . '/items.json' ), true );
$failures = array();
$checked  = 0;

foreach ( array_keys( bibliography_builder_get_formatter_style_definitions() ) as $style_key ) {
	$formatted = bibliography_builder_format_csl_items( $items, $style_key );

	if ( is_wp_error( $formatted ) ) {
		$failures[] = $style_key . ': ' . $formatted->get_error_code() . ' ' . $formatted->get_error_message();
		continue;
	}

	$expected = file( $fixtures . '/' . $style_key . '.txt', FILE_IGNORE_NEW_LINES );

	foreach ( $items as $index => $item ) {
		$actual = $item['id'] . "\t" . $formatted[ $index ];
		++$checked;

		if ( ! isset( $expected[ $index ] ) || $expected[ $index ] !== $actual ) {
			$failures[] = $style_key . "\n  expected: " . ( isset( $expected[ $index ] ) ? $expected[ $index ] : '(none)' ) . "\n  actual:   " . $actual;
		}
	}
}

if ( array() === $failures ) {
	echo 'styles-ok ' . $checked . "\n";
	return;
}

echo implode( "\n", array_slice( $failures, 0, 20 ) ) . "\n";

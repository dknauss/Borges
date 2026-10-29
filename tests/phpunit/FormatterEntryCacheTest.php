<?php
/**
 * The formatter's per-entry cache: a request renders only the entries no
 * earlier request in the same style formatted.
 *
 * @package BibliographyBuilder
 */

use PHPUnit\Framework\TestCase;

final class FormatterEntryCacheTest extends TestCase {

	protected function setUp(): void {
		bibliography_builder_test_reset_state();
	}

	private static function item( $family, $title ) {
		return array(
			'type'   => 'book',
			'title'  => $title,
			'author' => array(
				array(
					'family' => $family,
					'given'  => 'Ada',
				),
			),
			'issued' => array( 'date-parts' => array( array( 2020 ) ) ),
		);
	}

	private static function entry_map( $style_key ) {
		$style  = bibliography_builder_get_formatter_style_definition( $style_key );
		$cached = bibliography_builder_cache_get(
			bibliography_builder_get_formatter_entry_map_key( $style_key, $style ),
			'bibliography_builder_formatter'
		);

		return $cached['hit'] ? $cached['value'] : array();
	}

	public function test_a_changed_list_reuses_the_entries_it_shares() {
		$alpha = self::item( 'Alpha', 'First Book' );
		$beta  = self::item( 'Beta', 'Second Book' );

		$first = bibliography_builder_format_csl_items( array( $alpha ), 'apa-7' );

		// Mark Alpha's cached entry so a reuse is visible in the output.
		$style = bibliography_builder_get_formatter_style_definition( 'apa-7' );
		$key   = bibliography_builder_get_formatter_entry_map_key( 'apa-7', $style );
		$map   = self::entry_map( 'apa-7' );

		$this->assertSame( array( bibliography_builder_get_formatter_entry_hash( $alpha ) => $first[0] ), $map );

		$map[ bibliography_builder_get_formatter_entry_hash( $alpha ) ] = 'Reused Alpha.';
		bibliography_builder_cache_set( $key, $map, 'bibliography_builder_formatter', BIBLIOGRAPHY_BUILDER_FORMAT_CACHE_TTL );

		$second = bibliography_builder_format_csl_items( array( $beta, $alpha ), 'apa-7' );

		$this->assertSame( 'Reused Alpha.', $second[1] );
		$this->assertStringContainsString( 'Second book', $second[0] );
		$this->assertSame(
			array(
				bibliography_builder_get_formatter_entry_hash( $beta ),
				bibliography_builder_get_formatter_entry_hash( $alpha ),
			),
			array_keys( self::entry_map( 'apa-7' ) )
		);
	}

	public function test_cached_entries_match_a_cold_render() {
		$items = array(
			self::item( 'Gamma', 'Third Book' ),
			self::item( 'Delta', 'Fourth Book' ),
			self::item( 'Epsilon', 'Fifth Book' ),
		);

		$cold = bibliography_builder_format_csl_items( $items, 'chicago-author-date' );

		bibliography_builder_test_reset_state();
		bibliography_builder_format_csl_items( array( $items[1] ), 'chicago-author-date' );
		bibliography_builder_format_csl_items( array( $items[2], $items[0] ), 'chicago-author-date' );

		$this->assertSame( $cold, bibliography_builder_format_csl_items( $items, 'chicago-author-date' ) );
	}

	public function test_each_style_has_its_own_entry_map() {
		$items = array( self::item( 'Zeta', 'Sixth Book' ) );

		bibliography_builder_format_csl_items( $items, 'apa-7' );

		$this->assertCount( 1, self::entry_map( 'apa-7' ) );
		$this->assertSame( array(), self::entry_map( 'mla-9' ) );
	}

	public function test_the_entry_map_drops_the_least_recently_used_entries() {
		$map = array();

		for ( $i = 0; $i < BIBLIOGRAPHY_BUILDER_FORMAT_ENTRY_CACHE_LIMIT; $i++ ) {
			$map[ 'old' . $i ] = 'Entry ' . $i;
		}

		$updated = bibliography_builder_update_formatter_entry_map(
			$map,
			array(
				'old0' => 'Entry 0',
				'new'  => 'New entry',
			)
		);

		$this->assertCount( BIBLIOGRAPHY_BUILDER_FORMAT_ENTRY_CACHE_LIMIT, $updated );
		$this->assertArrayNotHasKey( 'old1', $updated );
		$this->assertSame( array( 'old0', 'new' ), array_slice( array_keys( $updated ), -2 ) );
	}
}

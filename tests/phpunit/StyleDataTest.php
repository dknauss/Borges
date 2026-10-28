<?php
/**
 * The shared style table and name particles, `includes/styles.json`.
 *
 * `src/lib/formatting/style-registry.js` and `src/lib/name-particles.js`
 * import the same file, so these checks cover both languages: the JSON is
 * complete and well formed, matches `block.json` and the bundled CSL files,
 * and the PHP readers return it.
 *
 * @package BibliographyBuilder
 */

use PHPUnit\Framework\TestCase;

final class StyleDataTest extends TestCase {

	const FIELDS = array(
		'label'                     => null,
		'enabled'                   => null,
		'backend'                   => array( 'csl' ),
		'cslTemplate'               => null,
		'demoteNonDroppingParticle' => array( 'display-and-sort', 'sort-only', 'never' ),
		'listType'                  => array( 'ul', 'ol' ),
		'family'                    => array( 'notes', 'author-date', 'numeric' ),
		'yearSuffix'                => null,
		'locale'                    => null,
		'inlineCitationMode'        => array( 'note', 'parenthetical', 'numeric' ),
		'headingPlaceholder'        => null,
	);

	private static function root() {
		return dirname( __DIR__, 2 );
	}

	public function test_every_style_has_every_field() {
		$styles = bibliography_builder_get_style_data()['styles'];

		$this->assertNotEmpty( $styles );

		foreach ( $styles as $key => $style ) {
			// `groups` is the one optional field; test_groups_are_well_formed() checks it.
			unset( $style['groups'] );

			$this->assertSame( array_keys( self::FIELDS ), array_keys( $style ), $key );
			$this->assertIsBool( $style['enabled'], $key );
			$this->assertIsBool( $style['yearSuffix'], $key );

			foreach ( self::FIELDS as $field => $allowed ) {
				if ( 'enabled' === $field || 'yearSuffix' === $field ) {
					continue;
				}

				$this->assertIsString( $style[ $field ], "$key.$field" );
				$this->assertNotSame( '', $style[ $field ], "$key.$field" );

				if ( null !== $allowed ) {
					$this->assertContains( $style[ $field ], $allowed, "$key.$field" );
				}
			}
		}
	}

	/**
	 * Source-type groups (OSCOLA's tables): each has a unique key and a label,
	 * lists known CSL types that no other group lists, and exactly one, the
	 * last, takes every other type ("*"), so every entry lands in one group.
	 */
	public function test_groups_are_well_formed() {
		$known  = bibliography_builder_get_known_csl_types();
		$styled = 0;

		foreach ( bibliography_builder_get_style_data()['styles'] as $key => $style ) {
			if ( ! isset( $style['groups'] ) ) {
				$this->assertNull( bibliography_builder_save_style_groups( $key ), $key );
				continue;
			}

			++$styled;
			$groups = $style['groups'];
			$seen   = array();

			$this->assertIsArray( $groups, $key );
			$this->assertNotSame( 'numeric', $style['family'], $key );
			$this->assertSame( '*', end( $groups )['types'], "$key: the last group takes the rest" );
			$this->assertCount( 1, array_filter( $groups, static fn( $group ) => '*' === $group['types'] ), $key );
			$this->assertSame( array_column( $groups, 'key' ), array_values( array_unique( array_column( $groups, 'key' ) ) ), $key );

			foreach ( $groups as $group ) {
				$this->assertSame( array( 'key', 'label', 'types' ), array_values( array_diff( array_keys( $group ), array( 'romanTitles' ) ) ), $key );
				$this->assertMatchesRegularExpression( '/^[a-z]+$/', $group['key'], $key );
				$this->assertNotSame( '', $group['label'], $key );

				if ( isset( $group['romanTitles'] ) ) {
					$this->assertIsBool( $group['romanTitles'], $key );
				}

				if ( '*' === $group['types'] ) {
					continue;
				}

				foreach ( $group['types'] as $type ) {
					$this->assertContains( $type, $known, "$key.{$group['key']}" );
					$this->assertNotContains( $type, $seen, "$key: $type is in two groups" );
					$seen[] = $type;
				}
			}

			$this->assertSame( count( $groups ), count( (array) bibliography_builder_save_style_groups( $key ) ), $key );
		}

		$this->assertSame( 1, $styled, 'Only OSCOLA declares groups' );
	}

	public function test_name_particles_are_unique_lowercase_words() {
		$particles = bibliography_builder_name_particles();

		$this->assertNotEmpty( $particles );
		$this->assertSame( bibliography_builder_get_style_data()['nameParticles'], $particles );
		$this->assertSame( array_values( array_unique( $particles ) ), $particles );

		foreach ( $particles as $particle ) {
			$this->assertMatchesRegularExpression( '/^\p{Ll}+$/u', $particle );
		}
	}

	public function test_default_style_matches_block_json() {
		// phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents
		$block = json_decode( file_get_contents( self::root() . '/block.json' ), true );

		$this->assertSame( $block['attributes']['citationStyle']['default'], bibliography_builder_default_style_key() );
		$this->assertArrayHasKey( bibliography_builder_default_style_key(), bibliography_builder_get_style_data()['styles'] );
	}

	public function test_templates_and_locales_are_bundled() {
		foreach ( bibliography_builder_get_style_data()['styles'] as $key => $style ) {
			$this->assertFileExists( self::root() . '/packages/citation-style-language-styles/' . $style['cslTemplate'] . '.csl', $key );
			$this->assertFileExists( self::root() . '/packages/citation-style-language-locales/locales-' . $style['locale'] . '.xml', $key );
		}
	}

	/**
	 * A style prints year suffixes only where styles.json turns them on: its
	 * CSL template has the `year-suffix` slot after the year, and the others
	 * have none, so a stray letter can never reach a style that does not use it.
	 */
	public function test_year_suffix_flag_matches_the_templates() {
		foreach ( bibliography_builder_get_style_data()['styles'] as $key => $style ) {
			// phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents
			$template = file_get_contents( self::root() . '/packages/citation-style-language-styles/' . $style['cslTemplate'] . '.csl' );

			$this->assertSame(
				$style['yearSuffix'],
				false !== strpos( (string) $template, 'variable="year-suffix"' ),
				$key
			);

			if ( $style['yearSuffix'] ) {
				$this->assertSame( 'author-date', $style['family'], $key );
			}
		}
	}

	public function test_php_readers_return_the_json() {
		$styles = bibliography_builder_get_style_data()['styles'];

		$this->assertSame( array_keys( $styles ), array_keys( bibliography_builder_get_formatter_style_definitions() ) );

		foreach ( $styles as $key => $style ) {
			$this->assertSame(
				array(
					'template'   => $style['cslTemplate'],
					'locale'     => $style['locale'],
					'family'     => $style['family'],
					'yearSuffix' => $style['yearSuffix'],
				),
				bibliography_builder_get_formatter_style_definition( $key ),
				$key
			);
			$this->assertSame(
				array(
					'key'                       => $key,
					'listType'                  => $style['listType'],
					'family'                    => $style['family'],
					'locale'                    => $style['locale'],
					'demoteNonDroppingParticle' => $style['demoteNonDroppingParticle'],
				),
				bibliography_builder_get_save_style_definition( $key ),
				$key
			);
			$this->assertSame( $style['headingPlaceholder'], bibliography_builder_write_default_heading( $key ), $key );
		}
	}

	public function test_unknown_styles_fall_back_to_the_default() {
		$default = bibliography_builder_default_style_key();

		$this->assertSame( bibliography_builder_get_formatter_style_definition( $default ), bibliography_builder_get_formatter_style_definition( 'nope' ) );
		$this->assertSame( $default, bibliography_builder_get_save_style_definition( 'nope' )['key'] );
		$this->assertSame( $default, bibliography_builder_get_save_style_definition( null )['key'] );
		$this->assertSame( 'Bibliography', bibliography_builder_write_default_heading( 'nope' ) );
	}
}

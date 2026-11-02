<?php

use PHPUnit\Framework\TestCase;

/**
 * Site-wide output toggle defaults (includes/output-defaults.php).
 */
final class OutputDefaultsTest extends TestCase {
	protected function tearDown(): void {
		remove_all_filters( 'bibliography_builder_output_defaults' );
		remove_all_filters( 'bibliography_builder_new_block_heading_level' );
	}

	public function test_defaults_match_block_json(): void {
		$metadata = json_decode( (string) file_get_contents( __DIR__ . '/../../block.json' ), true );
		$expected = array();

		foreach ( $metadata['attributes'] as $key => $attribute ) {
			if ( 0 === strpos( $key, 'output' ) ) {
				$expected[ $key ] = $attribute['default'];
			}
		}

		$this->assertSame( $expected, bibliography_builder_block_output_defaults() );
		$this->assertSame( $expected, bibliography_builder_get_output_defaults() );
	}

	public function test_filter_sets_only_known_boolean_keys(): void {
		add_filter(
			'bibliography_builder_output_defaults',
			static function ( $defaults ) {
				return array_merge(
					$defaults,
					array(
						'outputCoins'   => true,
						'outputCslJson' => 'yes',
						'somethingElse' => true,
					)
				);
			}
		);

		$defaults = bibliography_builder_get_output_defaults();

		$this->assertTrue( $defaults['outputCoins'] );
		$this->assertFalse( $defaults['outputCslJson'] );
		$this->assertArrayNotHasKey( 'somethingElse', $defaults );
	}

	public function test_a_non_array_filter_result_keeps_the_defaults(): void {
		add_filter( 'bibliography_builder_output_defaults', '__return_true' );

		$this->assertSame( bibliography_builder_block_output_defaults(), bibliography_builder_get_output_defaults() );
	}

	public function test_editor_settings_carry_the_defaults(): void {
		$settings = bibliography_builder_editor_output_defaults( array( 'other' => 1 ) );

		$this->assertSame( 1, $settings['other'] );
		$this->assertSame(
			bibliography_builder_get_output_defaults() + array( 'headingLevel' => 2 ),
			$settings['bibliographyBuilderOutputDefaults']
		);
	}

	public function test_new_blocks_start_with_an_h2_unless_the_site_says_otherwise(): void {
		$this->assertSame( 2, bibliography_builder_get_new_block_heading_level() );

		foreach ( array( 0, 3, 6 ) as $level ) {
			add_filter(
				'bibliography_builder_new_block_heading_level',
				static function () use ( $level ) {
					return $level;
				}
			);
			$this->assertSame( $level, bibliography_builder_get_new_block_heading_level() );
			remove_all_filters( 'bibliography_builder_new_block_heading_level' );
		}

		foreach ( array( 1, 7, '3', null ) as $invalid ) {
			add_filter(
				'bibliography_builder_new_block_heading_level',
				static function () use ( $invalid ) {
					return $invalid;
				}
			);
			$this->assertSame( 2, bibliography_builder_get_new_block_heading_level() );
			remove_all_filters( 'bibliography_builder_new_block_heading_level' );
		}
	}
}

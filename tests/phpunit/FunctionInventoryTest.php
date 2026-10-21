<?php
/**
 * Guards the root-file split (refactor memo, Phase B): every plugin function
 * keeps its name, stays loaded, and is defined in exactly one file.
 *
 * tests/fixtures/function-inventory.txt lists the `bibliography_builder_*`
 * functions as they stood before any code moved out of
 * bibliography-builder.php. Functions added later need not be listed. Remove
 * a name only when its function is deliberately deleted: these names are
 * effectively public, because tests and other plugins call them.
 *
 * @package BibliographyBuilder
 */

use PHPUnit\Framework\TestCase;

final class FunctionInventoryTest extends TestCase {
	/**
	 * Listed function names.
	 *
	 * @return string[]
	 */
	private static function inventory(): array {
		$names = file( __DIR__ . '/../fixtures/function-inventory.txt', FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES );

		return is_array( $names ) ? $names : array();
	}

	/**
	 * Plugin source files that may define functions.
	 *
	 * @return string[]
	 */
	private static function sources(): array {
		$root = dirname( __DIR__, 2 );

		return array_merge(
			array( $root . '/bibliography-builder.php' ),
			glob( $root . '/includes/*.php' ) ?: array()
		);
	}

	public function test_inventory_is_not_empty(): void {
		$this->assertGreaterThan( 200, count( self::inventory() ) );
	}

	public function test_every_listed_function_is_loaded(): void {
		$missing = array_values( array_filter( self::inventory(), static fn( $name ) => ! function_exists( $name ) ) );

		$this->assertSame( array(), $missing );
	}

	public function test_every_plugin_function_is_defined_in_exactly_one_file(): void {
		$counts = array();

		foreach ( self::sources() as $file ) {
			preg_match_all( '/^function (bibliography_builder_\w+)\s*\(/m', (string) file_get_contents( $file ), $matches );

			foreach ( $matches[1] as $name ) {
				$counts[ $name ] = ( $counts[ $name ] ?? 0 ) + 1;
			}
		}

		$this->assertSame( array(), array_keys( array_filter( $counts, static fn( $count ) => $count > 1 ) ) );

		$unlisted = array_diff( self::inventory(), array_keys( $counts ) );
		$this->assertSame( array(), array_values( $unlisted ), 'Listed but not defined in any plugin file.' );
	}
}

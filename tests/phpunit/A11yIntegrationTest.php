<?php

use PHPUnit\Framework\TestCase;

final class A11yIntegrationTest extends TestCase {

	protected function setUp(): void {
		parent::setUp();
		bibliography_builder_test_reset_state();
	}

	// -------------------------------------------------------------------------
	// PHP registration
	// -------------------------------------------------------------------------

	public function test_register_a11y_checks_registers_all_four_checks(): void {
		bibliography_builder_register_a11y_checks();

		$calls = $GLOBALS['bibliography_builder_test_bac_register_calls'] ?? array();

		$this->assertCount( 4, $calls );

		$ids = array_column( array_column( $calls, 'args' ), 'name' );
		$this->assertContains( 'empty_bibliography', $ids );
		$this->assertContains( 'heading_missing', $ids );
		$this->assertContains( 'raw_url_link_text', $ids );
		$this->assertContains( 'all_metadata_disabled', $ids );
	}

	public function test_register_a11y_checks_uses_correct_block_type(): void {
		bibliography_builder_register_a11y_checks();

		$calls = $GLOBALS['bibliography_builder_test_bac_register_calls'] ?? array();

		foreach ( $calls as $call ) {
			$this->assertSame( 'bibliography-builder/bibliography', $call['block_type'] );
		}
	}

	public function test_register_a11y_checks_uses_v4_args_shape(): void {
		bibliography_builder_register_a11y_checks();

		$calls = $GLOBALS['bibliography_builder_test_bac_register_calls'] ?? array();

		foreach ( $calls as $call ) {
			$args = $call['args'];
			$this->assertArrayHasKey( 'namespace', $args, 'namespace key required in v4' );
			$this->assertSame( 'borges-bibliography-builder', $args['namespace'] );
			$this->assertArrayHasKey( 'level', $args, 'level key required in v4' );
			$this->assertArrayNotHasKey( 'type', $args, 'type key removed in v4' );
			$this->assertNotEmpty( $args['error_msg'] );
		}
	}

	public function test_empty_bibliography_check_is_error(): void {
		bibliography_builder_register_a11y_checks();

		$calls = $GLOBALS['bibliography_builder_test_bac_register_calls'] ?? array();
		$check = $this->findCheck( $calls, 'empty_bibliography' );

		$this->assertSame( 'error', $check['args']['level'] );
	}

	public function test_heading_missing_check_is_warning(): void {
		bibliography_builder_register_a11y_checks();

		$calls = $GLOBALS['bibliography_builder_test_bac_register_calls'] ?? array();
		$check = $this->findCheck( $calls, 'heading_missing' );

		$this->assertSame( 'warning', $check['args']['level'] );
		$this->assertNotEmpty( $check['args']['error_msg'] );
		$this->assertSame( $check['args']['error_msg'], $check['args']['warning_msg'] );
	}

	public function test_bac_ready_action_passes_no_arguments(): void {
		$matching_actions = array_filter(
			$GLOBALS['bibliography_builder_test_added_actions'],
			static function ( $action ) {
				return 'ba11yc_ready' === $action['hook_name']
					&& 'bibliography_builder_register_a11y_checks' === $action['callback'];
			}
		);

		$this->assertNotEmpty( $matching_actions );

		$action = array_values( $matching_actions )[0];

		$this->assertSame( 0, $action['accepted_args'] );
	}

	// -------------------------------------------------------------------------
	// Enqueue behaviour (unchanged from v3 — handle already correct)
	// -------------------------------------------------------------------------

	public function test_enqueue_a11y_validation_is_noop_when_bac_script_is_absent(): void {
		bibliography_builder_enqueue_a11y_validation();

		$this->assertSame( array(), $GLOBALS['bibliography_builder_test_enqueued_scripts'] );
	}

	public function test_enqueue_a11y_validation_runs_after_bac_enqueues_assets(): void {
		$matching_actions = array_filter(
			$GLOBALS['bibliography_builder_test_added_actions'],
			static function ( $action ) {
				return 'enqueue_block_editor_assets' === $action['hook_name']
					&& 'bibliography_builder_enqueue_a11y_validation' === $action['callback'];
			}
		);

		$this->assertNotEmpty( $matching_actions );

		$action = array_values( $matching_actions )[0];

		$this->assertGreaterThan( 10, $action['priority'] );
	}

	public function test_enqueue_a11y_validation_is_noop_when_asset_file_is_missing(): void {
		$asset_file     = BIBLIOGRAPHY_BUILDER_PLUGIN_DIR . 'build/validation.asset.php';
		$had_asset_file = file_exists( $asset_file );
		$original_asset = $had_asset_file ? file_get_contents( $asset_file ) : null;

		if ( $had_asset_file ) {
			unlink( $asset_file );
		}

		try {
			$GLOBALS['bibliography_builder_test_registered_scripts']['block-accessibility-script']['registered'] = true;

			bibliography_builder_enqueue_a11y_validation();

			$this->assertSame( array(), $GLOBALS['bibliography_builder_test_enqueued_scripts'] );
		} finally {
			if ( $had_asset_file ) {
				file_put_contents( $asset_file, $original_asset );
			}
		}
	}

	public function test_enqueue_a11y_validation_enqueues_when_bac_script_is_registered(): void {
		$asset_file     = BIBLIOGRAPHY_BUILDER_PLUGIN_DIR . 'build/validation.asset.php';
		$asset_dir      = dirname( $asset_file );
		$had_asset_file = file_exists( $asset_file );
		$original_asset = $had_asset_file ? file_get_contents( $asset_file ) : null;

		if ( ! is_dir( $asset_dir ) ) {
			mkdir( $asset_dir, 0777, true );
		}

		file_put_contents(
			$asset_file,
			"<?php\nreturn array( 'dependencies' => array( 'wp-hooks' ), 'version' => 'test-version' );\n"
		);

		try {
			$GLOBALS['bibliography_builder_test_registered_scripts']['block-accessibility-script']['registered'] = true;

			bibliography_builder_enqueue_a11y_validation();

			$this->assertArrayHasKey(
				'borges-bibliography-builder-a11y-validation',
				$GLOBALS['bibliography_builder_test_enqueued_scripts']
			);

			$script = $GLOBALS['bibliography_builder_test_enqueued_scripts']['borges-bibliography-builder-a11y-validation'];

			$this->assertStringEndsWith( '/build/validation.js', $script['src'] );
			$this->assertSame( 'test-version', $script['ver'] );
			$this->assertContains( 'wp-hooks', $script['deps'] );
			$this->assertContains( 'block-accessibility-script', $script['deps'] );
			$this->assertTrue( $script['args'] );
		} finally {
			if ( $had_asset_file ) {
				file_put_contents( $asset_file, $original_asset );
			} elseif ( file_exists( $asset_file ) ) {
				unlink( $asset_file );
			}
		}
	}

	public function test_block_init_registers_block_metadata_directory(): void {
		bibliography_builder_block_init();

		$this->assertSame(
			array( rtrim( BIBLIOGRAPHY_BUILDER_PLUGIN_DIR, '/' ) ),
			$GLOBALS['bibliography_builder_test_registered_block_types']
		);
	}

	// -------------------------------------------------------------------------
	// Helpers
	// -------------------------------------------------------------------------

	private function findCheck( array $calls, string $name ): array {
		foreach ( $calls as $call ) {
			if ( ( $call['args']['name'] ?? '' ) === $name ) {
				return $call;
			}
		}
		$this->fail( "Check '{$name}' was not registered." );
	}
}

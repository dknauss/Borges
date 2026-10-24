<?php
/**
 * `wp borges reformat`: the bulk write command.
 *
 * It shares bibliography_builder_bulk_reformat_post() with POST
 * /bulk/reformat (BulkRoutesTest); these tests cover what the command adds:
 * its checks, batching, and output.
 *
 * @package BibliographyBuilder
 */

use PHPUnit\Framework\TestCase;

require_once __DIR__ . '/stubs/wp-cli.php';
require_once dirname( __DIR__, 2 ) . '/includes/cli.php';

final class CliReformatCommandTest extends TestCase {

	const USER_ID = 7;

	/**
	 * @var Bibliography_Builder_CLI_Command
	 */
	private $command;

	protected function setUp(): void {
		parent::setUp();
		bibliography_builder_test_reset_state();
		WP_CLI::$log   = array();
		$this->command = new Bibliography_Builder_CLI_Command();

		if ( ! bibliography_builder_can_render_save_markup() || ! class_exists( '\\Seboettg\\CiteProc\\CiteProc' ) ) {
			$this->markTestSkipped( 'intl and citeproc-php are required.' );
		}

		foreach ( array( 201, 202, 203 ) as $post_id ) {
			$attrs   = array(
				'citationStyle' => 'ieee',
				'citations'     => array(
					array(
						'id'            => 'c-' . $post_id,
						'csl'           => array(
							'type'   => 'book',
							'title'  => 'Book ' . $post_id,
							'author' => array(
								array(
									'family' => 'Jones',
									'given'  => 'Taylor',
								),
							),
							'issued' => array( 'date-parts' => array( array( 2020 ) ) ),
						),
						'formattedText' => 'Jones. Book.',
					),
				),
			);
			$content = bibliography_builder_serialize_bibliography_block(
				$attrs,
				bibliography_builder_render_save_markup( bibliography_builder_decode_save_attributes( wp_json_encode( $attrs ) ) )
			);

			bibliography_builder_test_set_post( $post_id, 'publish', $content );
			bibliography_builder_test_grant_cap( self::USER_ID, 'edit_post', $post_id );
		}

		add_filter( 'bibliography_builder_enable_write_routes', '__return_true' );
		bibliography_builder_test_set_current_user( self::USER_ID );
		bibliography_builder_test_grant_cap( self::USER_ID, 'edit_others_posts', 0 );
	}

	private function run_command( $args, $assoc_args ) {
		try {
			$this->command->reformat( $args, $assoc_args );
		} catch ( Bibliography_Builder_Test_CLI_Exit $exit ) {
			return $exit->getMessage();
		}

		return null;
	}

	private static function log_of( $kind ) {
		return array_values(
			array_map(
				static function ( $entry ) {
					return $entry[1];
				},
				array_filter(
					WP_CLI::$log,
					static function ( $entry ) use ( $kind ) {
						return $kind === $entry[0];
					}
				)
			)
		);
	}

	public function test_it_always_checks_the_user_and_the_filter() {
		bibliography_builder_test_set_current_user( 0 );
		$this->assertSame( 'error', $this->run_command( array( '201' ), array( 'style' => 'apa-7' ) ) );
		$this->assertStringContainsString( '--user', self::log_of( 'error' )[0] );

		bibliography_builder_test_set_current_user( 99 );
		$this->assertSame( 'error', $this->run_command( array( '201' ), array( 'style' => 'apa-7' ) ) );

		bibliography_builder_test_set_current_user( self::USER_ID );
		$this->assertSame( 'error', $this->run_command( array( '201' ), array( 'style' => 'apa' ) ) );
		$this->assertSame( 'error', $this->run_command( array( 'abc' ), array( 'style' => 'apa-7' ) ) );

		remove_all_filters( 'bibliography_builder_enable_write_routes' );
		$this->assertSame( 'error', $this->run_command( array( '201' ), array( 'style' => 'apa-7' ) ) );
		$this->assertSame( array(), $GLOBALS['bibliography_builder_test_post_updates'] );
	}

	public function test_it_previews_unless_commit_is_passed() {
		$this->assertNull( $this->run_command( array( '201', '202' ), array( 'style' => 'apa-7' ) ) );

		$rows = self::log_of( 'items' )[0]['items'];
		$this->assertSame( array( 'preview', 'preview' ), array_column( $rows, 'status' ) );
		$this->assertSame( 'ieee → apa-7', $rows[0]['message'] );
		$this->assertStringContainsString( 'Dry run; use --commit.', self::log_of( 'success' )[0] );
		$this->assertSame( array(), $GLOBALS['bibliography_builder_test_post_updates'] );
	}

	public function test_it_commits_in_batches_without_spending_the_budget() {
		$this->assertNull(
			$this->run_command(
				array( '201', '202', '203', '202' ),
				array(
					'style'      => 'apa-7',
					'commit'     => true,
					'batch-size' => '2',
				)
			)
		);

		$this->assertSame( array( 201, 202, 203 ), array_column( $GLOBALS['bibliography_builder_test_post_updates'], 'ID' ) );
		$this->assertSame( 'Saved: 3. Unchanged: 0. Skipped: 0. Failed: 0.', self::log_of( 'success' )[0] );
		$this->assertSame( 0, bibliography_builder_rate_limit_used( 'user:' . self::USER_ID, bibliography_builder_bulk_rate_limit( self::USER_ID ) ) );
	}

	public function test_a_failed_post_exits_one_and_the_rest_still_run() {
		$GLOBALS['bibliography_builder_test_update_error'] = new WP_Error( 'db', 'Database error.', array( 'status' => 500 ) );

		$this->assertSame(
			'halt',
			$this->run_command(
				array( '201', '999' ),
				array(
					'style'  => 'apa-7',
					'commit' => true,
					'format' => 'json',
				)
			)
		);

		$results = json_decode( self::log_of( 'line' )[0], true );
		$this->assertSame( array( 'failed', 'skipped' ), array_column( $results, 'status' ) );
		$this->assertSame( array( 1 ), self::log_of( 'halt' ) );
	}
}

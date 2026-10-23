<?php
/**
 * The read-only WP-CLI commands: `wp borges list`, `export`, and `validate`.
 *
 * @package BibliographyBuilder
 */

use PHPUnit\Framework\TestCase;

require_once __DIR__ . '/stubs/wp-cli.php';
require_once dirname( __DIR__, 2 ) . '/includes/cli.php';

final class CliCommandTest extends TestCase {

	const POST_ID = 301;

	/**
	 * @var Bibliography_Builder_CLI_Command
	 */
	private $command;

	protected function setUp(): void {
		parent::setUp();
		bibliography_builder_test_reset_state();
		WP_CLI::$log   = array();
		$this->command = new Bibliography_Builder_CLI_Command();

		$content = '<!-- wp:bibliography-builder/bibliography {"cli":true} /-->';

		// A draft with no logged-in user: the commands check no capabilities.
		bibliography_builder_test_set_post( self::POST_ID, 'draft', $content );
		bibliography_builder_test_set_parsed_blocks(
			$content,
			array(
				array(
					'blockName' => 'bibliography-builder/bibliography',
					'attrs'     => array(
						'bibliographyId' => 'reading-list',
						'citationStyle'  => 'apa-7',
						'headingText'    => 'Reading list',
						'citations'      => array(
							array(
								'id'            => 'good',
								'csl'           => array(
									'type'   => 'book',
									'title'  => 'A Good Book',
									'author' => array( array( 'family' => 'Jones', 'given' => 'Taylor' ) ),
									'issued' => array( 'date-parts' => array( array( 2020 ) ) ),
								),
								'formattedText' => 'Jones, T. (2020). <i>A Good Book</i>.',
							),
						),
					),
				),
				array(
					'blockName' => 'bibliography-builder/bibliography',
					'attrs'     => array(
						'citations' => array(
							array(
								'id'            => 'untitled',
								'csl'           => array( 'type' => 'book' ),
								'formattedText' => 'Untitled.',
							),
						),
					),
				),
			)
		);
	}

	/**
	 * Run a command method, returning its log and whether it stopped early.
	 *
	 * @param string $method     Method name.
	 * @param array  $args       Positional arguments.
	 * @param array  $assoc_args Options.
	 * @return array{log: array, exit: string|null}
	 */
	private function run_command( $method, $args, $assoc_args = array() ) {
		$exit = null;

		try {
			$this->command->$method( $args, $assoc_args );
		} catch ( Bibliography_Builder_Test_CLI_Exit $e ) {
			$exit = $e->getMessage();
		}

		return array(
			'log'  => WP_CLI::$log,
			'exit' => $exit,
		);
	}

	public function test_the_command_group_is_registered() {
		$this->assertSame( 'Bibliography_Builder_CLI_Command', WP_CLI::$commands['borges'] );
	}

	public function test_list_prints_one_row_per_block() {
		$result = $this->run_command( 'list_', array( (string) self::POST_ID ) );
		$items  = $result['log'][0][1];

		$this->assertNull( $result['exit'] );
		$this->assertSame( 'table', $items['format'] );
		$this->assertSame( BIBLIOGRAPHY_BUILDER_CLI_LIST_FIELDS, $items['fields'] );
		$this->assertSame( array( 0, 1 ), array_column( $items['items'], 'index' ) );
		$this->assertSame( array( 'reading-list', null ), array_column( $items['items'], 'bibliographyId' ) );
		$this->assertSame( 'apa-7', $items['items'][0]['citationStyle'] );
		$this->assertSame( 1, $items['items'][0]['entryCount'] );
		$this->assertSame( 'Reading list', $items['items'][0]['headingText'] );
	}

	public function test_list_passes_format_and_fields_through() {
		$items = $this->run_command( 'list_', array( (string) self::POST_ID ), array( 'format' => 'json', 'fields' => 'index,outputJsonLd' ) )['log'][0][1];

		$this->assertSame( 'json', $items['format'] );
		$this->assertSame( array( 'index', 'outputJsonLd' ), $items['fields'] );
	}

	public function test_a_missing_or_malformed_post_id_is_an_error() {
		foreach ( array( '999', 'abc', '0', '-3' ) as $post_id ) {
			WP_CLI::$log = array();
			$result      = $this->run_command( 'list_', array( $post_id ) );

			$this->assertSame( 'error', $result['exit'], $post_id );
			$this->assertSame( array( 'error', "Post {$post_id} not found." ), $result['log'][0], $post_id );
		}
	}

	public function test_export_defaults_to_the_first_block_as_csl_json() {
		$result = $this->run_command( 'export', array( (string) self::POST_ID ) );
		$data   = json_decode( $result['log'][0][1], true );

		$this->assertSame( 'line', $result['log'][0][0] );
		$this->assertSame( 'A Good Book', $data[0]['title'] );
		$this->assertSame( bibliography_builder_build_csl_json( bibliography_builder_resolve_bibliography( self::POST_ID, 0 ) ), $data );
	}

	public function test_export_text_matches_the_rest_text_export() {
		$result = $this->run_command( 'export', array( (string) self::POST_ID ), array( 'bibliography-id' => 'reading-list', 'format' => 'text' ) );

		$this->assertSame(
			array( 'line', bibliography_builder_build_plain_text( bibliography_builder_resolve_bibliography( self::POST_ID, 'reading-list', 'id' ) ) ),
			$result['log'][0]
		);
	}

	public function test_export_json_prints_the_whole_record_and_index_selects_the_block() {
		$data = json_decode( $this->run_command( 'export', array( (string) self::POST_ID ), array( 'index' => '1', 'format' => 'json' ) )['log'][0][1], true );

		$this->assertSame( 1, $data['index'] );
		$this->assertSame( 'untitled', $data['citations'][0]['id'] );
	}

	public function test_export_rejects_an_unknown_block_or_format() {
		$this->assertSame( 'error', $this->run_command( 'export', array( (string) self::POST_ID ), array( 'index' => '5' ) )['exit'] );
		$this->assertSame( 'error', $this->run_command( 'export', array( (string) self::POST_ID ), array( 'bibliography-id' => 'nope' ) )['exit'] );
		$this->assertSame( 'error', $this->run_command( 'export', array( (string) self::POST_ID ), array( 'format' => 'ris' ) )['exit'] );
	}

	public function test_validate_checks_every_block_and_exits_1_on_errors() {
		$result = $this->run_command( 'validate', array( (string) self::POST_ID ) );
		$log    = $result['log'];

		$this->assertSame( 'halt', $result['exit'] );
		$this->assertSame( 'items', $log[0][0] );
		$this->assertSame( BIBLIOGRAPHY_BUILDER_CLI_ISSUE_FIELDS, $log[0][1]['fields'] );
		$this->assertContains(
			array(
				'bibliography' => 1,
				'entry'        => 0,
				'id'           => 'untitled',
				'severity'     => 'error',
				'code'         => 'missing-title',
				'field'        => 'title',
				'message'      => 'The entry has no title.',
			),
			$log[0][1]['items']
		);
		$this->assertSame( 'warning', $log[1][0] );
		$this->assertStringContainsString( 'Bibliographies checked: 2.', $log[1][1] );
		$this->assertSame( array( 'halt', 1 ), $log[2] );
	}

	public function test_validate_one_clean_block_succeeds() {
		$result = $this->run_command( 'validate', array( (string) self::POST_ID ), array( 'bibliography-id' => 'reading-list' ) );
		$last   = end( $result['log'] );

		$this->assertNull( $result['exit'] );
		$this->assertSame( 'success', $last[0] );
		$this->assertStringStartsWith( 'Errors: 0.', $last[1] );
	}

	public function test_validate_json_prints_the_same_reports_as_the_review_route() {
		$result  = $this->run_command( 'validate', array( (string) self::POST_ID ), array( 'format' => 'json' ) );
		$reports = json_decode( $result['log'][0][1], true );

		$this->assertSame( 'halt', $result['exit'] );
		$this->assertCount( 2, $reports );
		$this->assertSame(
			json_decode( (string) wp_json_encode( bibliography_builder_get_validation_report( self::POST_ID, 1, 'index' ) ), true ),
			$reports[1]
		);
	}

	public function test_validate_an_unknown_block_is_an_error() {
		$this->assertSame( 'error', $this->run_command( 'validate', array( (string) self::POST_ID ), array( 'index' => '7' ) )['exit'] );
	}
}

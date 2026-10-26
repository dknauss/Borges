<?php
/**
 * Bulk deduplicate route, its ability, and `wp borges deduplicate`
 * (Phase 05, M4 / Tier 4).
 *
 * The batching, budget, lock, and time budget the route shares with bulk
 * reformat are BulkRoutesTest's job; these tests cover what deduplicate
 * decides: which copy stays, what the response reports, that duplicates
 * across two blocks are only reported, and that removals keep year
 * suffixes current.
 *
 * @package BibliographyBuilder
 */

use PHPUnit\Framework\TestCase;

require_once __DIR__ . '/stubs/wp-cli.php';
require_once dirname( __DIR__, 2 ) . '/includes/cli.php';

final class BulkDeduplicateTest extends TestCase {

	const USER_ID = 7;

	protected function setUp(): void {
		bibliography_builder_test_reset_state();

		if ( ! bibliography_builder_can_render_save_markup() || ! class_exists( '\\Seboettg\\CiteProc\\CiteProc' ) ) {
			$this->markTestSkipped( 'intl and citeproc-php are required.' );
		}

		bibliography_builder_test_set_current_user( self::USER_ID );
		bibliography_builder_test_grant_cap( self::USER_ID, 'edit_others_posts', 0 );

		// Post 201: one block with a DOI duplicate and a title-year duplicate,
		// and a second block that repeats a work from the first.
		self::set_post(
			201,
			"<!-- wp:paragraph -->\n<p>Post 201</p>\n<!-- /wp:paragraph -->\n\n"
			. self::block(
				array(
					'bibliographyId' => 'chapter-1',
					'citationStyle'  => 'ieee',
					'citations'      => array(
						self::citation( 'knuth', 'Literate Programming', 'Knuth', 1984, '10.1093/comjnl/27.2.97' ),
						self::citation( 'hoare', 'Communicating Sequential Processes', 'Hoare', 1978 ),
						self::citation( 'knuth-doi', 'Literate programming (reprint)', 'Knuth', 1992, 'https://doi.org/10.1093/COMJNL/27.2.97' ),
						self::citation( 'hoare-copy', 'Communicating sequential processes.', 'Hoare', 1978 ),
					),
				)
			)
			. "\n\n"
			. self::block(
				array(
					'bibliographyId' => 'chapter-2',
					'citationStyle'  => 'ieee',
					'citations'      => array(
						self::citation( 'dijkstra', 'Go To Statement Considered Harmful', 'Dijkstra', 1968 ),
						self::citation( 'hoare-2', 'Communicating Sequential Processes', 'Hoare', 1978 ),
					),
				)
			)
			. "\n"
		);

		// Post 202: nothing to remove.
		self::set_post(
			202,
			self::block(
				array(
					'bibliographyId' => 'clean',
					'citationStyle'  => 'ieee',
					'citations'      => array(
						self::citation( 'one', 'First Paper', 'Zed', 2001 ),
						self::citation( 'two', 'Second Paper', 'Abel', 2002 ),
					),
				)
			) . "\n"
		);

		bibliography_builder_test_grant_cap( self::USER_ID, 'edit_post', 201 );
		bibliography_builder_test_grant_cap( self::USER_ID, 'edit_post', 202 );
	}

	protected function tearDown(): void {
		unset( $GLOBALS['wpdb'] );
		remove_all_filters( 'bibliography_builder_enable_write_routes' );
		remove_all_filters( 'bibliography_builder_bulk_rate_limit' );
	}

	private static function set_post( $post_id, $content ) {
		bibliography_builder_test_set_post( $post_id, 'publish', $content );
		bibliography_builder_test_set_parsed_blocks( $content, ( new WP_Block_Parser() )->parse( $content ) );
	}

	private static function citation( $id, $title, $family, $year, $doi = null ) {
		$csl = array(
			'type'   => 'article-journal',
			'title'  => $title,
			'author' => array(
				array(
					'family' => $family,
					'given'  => 'A.',
				),
			),
			'issued' => array( 'date-parts' => array( array( $year ) ) ),
		);

		if ( null !== $doi ) {
			$csl['DOI'] = $doi;
		}

		return array(
			'id'            => $id,
			'csl'           => $csl,
			'formattedText' => $family . '. ' . $title . '.',
		);
	}

	private static function block( $attrs ) {
		$html = bibliography_builder_render_save_markup( bibliography_builder_decode_save_attributes( wp_json_encode( $attrs ) ) );

		return bibliography_builder_serialize_bibliography_block( $attrs, $html );
	}

	private static function etag( $post_id ) {
		return bibliography_builder_post_etag( get_post( $post_id ) );
	}

	/**
	 * A bulk deduplicate request; `$posts` maps post IDs to ETags (null for none).
	 */
	private static function request( $posts, $dry_run = true ) {
		$list = array();

		foreach ( $posts as $post_id => $etag ) {
			$list[] = null === $etag ? array( 'id' => $post_id ) : array(
				'id'   => $post_id,
				'etag' => $etag,
			);
		}

		$request = new WP_REST_Request( 'POST', '/bibliography/v1/bulk/deduplicate' );
		$request->set_query_params( array( 'dry_run' => $dry_run ) );
		$request->set_body( (string) wp_json_encode( array( 'posts' => $list ) ) );

		return $request;
	}

	/**
	 * Each bibliography block's citation IDs in a post.
	 */
	private static function citation_ids( $post_id ) {
		$ids = array();

		foreach ( ( new WP_Block_Parser() )->parse( get_post( $post_id )->post_content ) as $block ) {
			if ( 'bibliography-builder/bibliography' === $block['blockName'] ) {
				$ids[ $block['attrs']['bibliographyId'] ] = array_column( $block['attrs']['citations'], 'id' );
			}
		}

		return $ids;
	}

	public function test_route_is_registered_after_bulk_reformat() {
		add_filter( 'bibliography_builder_enable_write_routes', '__return_true' );
		bibliography_builder_register_write_routes();

		$routes = array_column( $GLOBALS['bibliography_builder_test_rest_routes'], 'route' );
		$this->assertSame( array( '/bulk/reformat', '/bulk/deduplicate' ), array_slice( $routes, -2 ) );

		$route = end( $GLOBALS['bibliography_builder_test_rest_routes'] );
		$this->assertSame( 'bibliography_builder_rest_bulk_permissions_check', $route['args']['permission_callback'] );
		$this->assertSame( 'bibliography_builder_rest_bulk_deduplicate', $route['args']['callback'] );
	}

	public function test_a_dry_run_reports_later_copies_and_saves_nothing() {
		$before = get_post( 201 )->post_content;
		$data   = bibliography_builder_rest_bulk_deduplicate( self::request( array( 201 => null, 202 => null ) ) )->get_data();

		$this->assertTrue( $data['dryRun'] );
		$this->assertArrayNotHasKey( 'style', $data );
		$this->assertSame( array( 'preview', 'unchanged' ), array_column( $data['results'], 'status' ) );
		$this->assertSame( $before, get_post( 201 )->post_content );
		$this->assertSame( array(), $GLOBALS['bibliography_builder_test_post_updates'] );

		// Only the block that changes is listed, and the first copy stays.
		$bibliographies = $data['results'][0]['bibliographies'];
		$this->assertSame( array( 'chapter-1' ), array_column( $bibliographies, 'bibliographyId' ) );

		$removed = $bibliographies[0]['changes']['removed'];
		$this->assertSame( array( 'knuth-doi', 'hoare-copy' ), array_column( $removed, 'id' ) );
		$this->assertSame( array( 'knuth', 'hoare' ), array_column( $removed, 'duplicateOf' ) );
		$this->assertSame( array( 'doi', 'title-year' ), array_column( $removed, 'reason' ) );
		$this->assertSame( array( 2, 3 ), array_column( $removed, 'index' ) );
		$this->assertSame( 'Literate programming (reprint)', $removed[0]['citation']['csl']['title'] );

		$this->assertSame( array(), $data['results'][1]['bibliographies'] );
		$this->assertSame( array(), $data['results'][1]['crossBlockDuplicates'] );
		$this->assertSame( 248, $data['rateLimit']['remaining'] );
	}

	public function test_duplicates_across_blocks_are_reported_not_removed() {
		$data = bibliography_builder_rest_bulk_deduplicate( self::request( array( 201 => self::etag( 201 ) ), false ) )->get_data();

		$this->assertSame( 'changed', $data['results'][0]['status'] );
		$this->assertSame(
			array(
				array(
					'reason' => 'title-year',
					'first'  => array(
						'index'          => 0,
						'bibliographyId' => 'chapter-1',
						'citationId'     => 'hoare',
					),
					'second' => array(
						'index'          => 1,
						'bibliographyId' => 'chapter-2',
						'citationId'     => 'hoare-2',
					),
				),
			),
			$data['results'][0]['crossBlockDuplicates']
		);
		$this->assertSame(
			array(
				'chapter-1' => array( 'knuth', 'hoare' ),
				'chapter-2' => array( 'dijkstra', 'hoare-2' ),
			),
			self::citation_ids( 201 )
		);
	}

	public function test_a_commit_saves_once_and_rebuilds_valid_markup() {
		$data = bibliography_builder_rest_bulk_deduplicate(
			self::request(
				array(
					201 => self::etag( 201 ),
					202 => self::etag( 202 ),
				),
				false
			)
		)->get_data();

		$this->assertSame( array( 'changed', 'unchanged' ), array_column( $data['results'], 'status' ) );
		$this->assertSame( array( 201 ), array_column( $GLOBALS['bibliography_builder_test_post_updates'], 'ID' ) );
		$this->assertSame( self::etag( 201 ), $data['results'][0]['etag'] );
		$this->assertStringContainsString( '<p>Post 201</p>', get_post( 201 )->post_content );

		foreach ( ( new WP_Block_Parser() )->parse( get_post( 201 )->post_content ) as $block ) {
			if ( 'bibliography-builder/bibliography' !== $block['blockName'] ) {
				continue;
			}

			$attrs = bibliography_builder_decode_save_attributes( wp_json_encode( $block['attrs'] ) );
			$this->assertSame( bibliography_builder_render_save_markup( $attrs ), $block['innerHTML'] );
		}

		// Running it again finds nothing, even with the old ETag.
		$GLOBALS['bibliography_builder_test_post_updates'] = array();
		$again = bibliography_builder_rest_bulk_deduplicate( self::request( array( 201 => '"stale"' ), false ) )->get_data();
		$this->assertSame( 'unchanged', $again['results'][0]['status'] );
		$this->assertSame( array(), $GLOBALS['bibliography_builder_test_post_updates'] );
	}

	public function test_a_stale_etag_fails_the_post() {
		$data = bibliography_builder_rest_bulk_deduplicate( self::request( array( 201 => '"stale"' ), false ) )->get_data();

		$this->assertSame( 'failed', $data['results'][0]['status'] );
		$this->assertSame( 412, $data['results'][0]['error']['status'] );
		$this->assertArrayNotHasKey( 'crossBlockDuplicates', $data['results'][0] );
		$this->assertSame( array(), $GLOBALS['bibliography_builder_test_post_updates'] );
	}

	public function test_bad_posts_lists_are_refused() {
		$request = new WP_REST_Request( 'POST', '/bibliography/v1/bulk/deduplicate' );
		$request->set_body( '{"posts":[]}' );

		$error = bibliography_builder_rest_bulk_deduplicate( $request );
		$this->assertInstanceOf( WP_Error::class, $error );
		$this->assertSame( 400, $error->get_error_data()['status'] );
	}

	public function test_removing_a_copy_refreshes_year_suffixes() {
		$marker = static function ( $id, $title ) {
			$citation                  = self::citation( $id, $title, 'Jones', 2020 );
			$citation['formattedText'] = 'MARKER ' . $id;

			return $citation;
		};

		self::set_post(
			203,
			self::block(
				array(
					'bibliographyId' => 'apa',
					'citationStyle'  => 'apa-7',
					'citations'      => array(
						$marker( 'alpha', 'Alpha Study' ),
						$marker( 'alpha-copy', 'Alpha study' ),
						$marker( 'beta', 'Beta Study' ),
					),
				)
			) . "\n"
		);
		bibliography_builder_test_grant_cap( self::USER_ID, 'edit_post', 203 );

		bibliography_builder_rest_bulk_deduplicate( self::request( array( 203 => self::etag( 203 ) ), false ) );

		$texts = array();

		foreach ( ( new WP_Block_Parser() )->parse( get_post( 203 )->post_content ) as $block ) {
			if ( 'bibliography-builder/bibliography' === $block['blockName'] ) {
				$texts = array_column( $block['attrs']['citations'], 'formattedText', 'id' );
			}
		}

		$this->assertSame( array( 'alpha', 'beta' ), array_keys( $texts ) );
		$this->assertStringContainsString( '2020a', $texts['alpha'] );
		$this->assertStringContainsString( '2020b', $texts['beta'] );
	}

	public function test_split_keeps_the_first_copy_of_each_work() {
		$split = bibliography_builder_bulk_split_duplicates(
			array(
				self::citation( 'a', 'Same Title', 'Lee', 2001 ),
				self::citation( 'b', 'Same title', 'Lee', 2002 ),
				self::citation( 'c', 'Same Title', 'Kim', 2001 ),
				self::citation( 'd', 'Other', 'Lee', 2001 ),
			)
		);

		// b matches a by title and first author; c matches a by title and year.
		$this->assertSame( array( 'a', 'd' ), array_column( $split['kept'], 'id' ) );
		$this->assertSame( array( 'title-author', 'title-year' ), array_column( $split['removed'], 'reason' ) );
		$this->assertSame( array( 'a', 'a' ), array_column( $split['removed'], 'duplicateOf' ) );
	}

	public function test_split_fills_the_kept_copy_from_later_ones() {
		$kept                   = self::citation( 'a', 'Same Title', 'Lee', 2001 );
		$kept['csl']['page']    = '';
		$later                  = self::citation( 'b', 'Same title', 'Lee', 2001, '10.1000/xyz' );
		$later['csl']['page']   = '1-10';
		$later['csl']['type']   = 'book';
		$later['csl']['id']     = 'b';
		$third                  = self::citation( 'c', 'Same Title', 'Lee', 2001 );
		$third['csl']['volume'] = '3';

		$split = bibliography_builder_bulk_split_duplicates( array( $kept, $later, $third ) );
		$csl   = $split['kept'][0]['csl'];

		// Gaps are filled, even an empty string; a field the kept copy has
		// (type) is never overwritten, and `id` never moves.
		$this->assertSame( '10.1000/xyz', $csl['DOI'] );
		$this->assertSame( '1-10', $csl['page'] );
		$this->assertSame( '3', $csl['volume'] );
		$this->assertSame( 'article-journal', $csl['type'] );
		$this->assertArrayNotHasKey( 'id', $csl );
		$this->assertSame( array( array( 'DOI', 'page' ), array( 'volume' ) ), array_column( $split['removed'], 'mergedFields' ) );

		// `merged` holds the CSL from before the first merge.
		$this->assertSame( array( 0 ), array_keys( $split['merged'] ) );
		$this->assertSame( $kept['csl'], $split['merged'][0] );
		$this->assertSame( $kept['formattedText'], $split['kept'][0]['formattedText'] );
	}

	public function test_split_folds_kept_citations_a_fill_makes_match() {
		// A has no author; B is another year; C fills A's author, and then A
		// and B match by title and author.
		$a = self::citation( 'a', 'Shared Title', 'Lee', 2000 );
		unset( $a['csl']['author'] );
		$b = self::citation( 'b', 'Shared title', 'Lee', 2001 );
		$c = self::citation( 'c', 'Shared Title', 'Lee', 2000 );

		$split = bibliography_builder_bulk_split_duplicates( array( $a, $b, $c ) );

		$this->assertSame( array( 'a' ), array_column( $split['kept'], 'id' ) );
		$this->assertSame( array( 'b', 'c' ), array_column( $split['removed'], 'id' ) );
		$this->assertSame( array( 'a', 'a' ), array_column( $split['removed'], 'duplicateOf' ) );
		$this->assertSame( array( 'title-author', 'title-year' ), array_column( $split['removed'], 'reason' ) );
		$this->assertSame( array( array(), array( 'author' ) ), array_column( $split['removed'], 'mergedFields' ) );
		$this->assertSame( $b, $split['removed'][0]['citation'], 'a removed entry is the record as stored' );
		$this->assertSame( array( 0 => $a['csl'] ), $split['merged'] );

		// A second run finds nothing.
		$this->assertSame( array(), bibliography_builder_bulk_split_duplicates( $split['kept'] )['removed'] );
	}

	public function test_split_points_copies_at_the_citation_that_stays() {
		// C folds into B by year. D then fills A's author, so B folds into A,
		// and C's duplicateOf follows B to A.
		$a = self::citation( 'a', 'Shared Title', 'Lee', 2000 );
		unset( $a['csl']['author'] );
		$b = self::citation( 'b', 'Shared title', 'Lee', 2001 );
		$c = self::citation( 'c', 'Shared Title', 'Kim', 2001, '10.1000/c' );
		$d = self::citation( 'd', 'Shared Title', 'Lee', 2000 );

		$split = bibliography_builder_bulk_split_duplicates( array( $a, $b, $c, $d ) );

		$this->assertSame( array( 'a' ), array_column( $split['kept'], 'id' ) );
		$this->assertSame( array( 'b', 'c', 'd' ), array_column( $split['removed'], 'id' ) );
		$this->assertSame( array( 'a', 'a', 'a' ), array_column( $split['removed'], 'duplicateOf' ) );

		// The DOI C gave B moves on to A.
		$this->assertSame( '10.1000/c', $split['kept'][0]['csl']['DOI'] );
		$this->assertSame( 'Lee', $split['kept'][0]['csl']['author'][0]['family'] );
		$this->assertSame( array(), bibliography_builder_bulk_split_duplicates( $split['kept'] )['removed'] );
	}

	public function test_a_second_commit_removes_nothing() {
		$a = self::citation( 'a', 'Shared Title', 'Lee', 2000 );
		unset( $a['csl']['author'] );

		self::set_post(
			205,
			self::block(
				array(
					'bibliographyId' => 'settle',
					'citationStyle'  => 'apa-7',
					'citations'      => array(
						$a,
						self::citation( 'b', 'Shared title', 'Lee', 2001 ),
						self::citation( 'c', 'Shared Title', 'Lee', 2000 ),
					),
				)
			) . "\n"
		);
		bibliography_builder_test_grant_cap( self::USER_ID, 'edit_post', 205 );

		$first = bibliography_builder_rest_bulk_deduplicate( self::request( array( 205 => self::etag( 205 ) ), false ) )->get_data();
		$this->assertSame( 'changed', $first['results'][0]['status'] );
		$this->assertSame( array( 'settle' => array( 'a' ) ), self::citation_ids( 205 ) );

		$again = bibliography_builder_rest_bulk_deduplicate( self::request( array( 205 => self::etag( 205 ) ), false ) )->get_data();
		$this->assertSame( 'unchanged', $again['results'][0]['status'] );

		bibliography_builder_test_set_current_user( 0 );
		$this->assertSame( array(), self::run_duplicates( array( '205' ) )['rows'] );
	}

	public function test_a_commit_formats_the_filled_copy_again() {
		$kept                    = self::citation( 'kept', 'Structured Programming', 'Dahl', 1972 );
		$kept['displayOverride'] = 'My own text';
		$kept['exportBibtex']    = '@article{old}';
		$kept['parseWarnings']   = array( 'old warning' );

		self::set_post(
			204,
			self::block(
				array(
					'bibliographyId' => 'filled',
					'citationStyle'  => 'apa-7',
					'citations'      => array(
						$kept,
						self::citation( 'copy', 'Structured programming', 'Dahl', 1972, '10.5555/1243380' ),
					),
				)
			) . "\n"
		);
		bibliography_builder_test_grant_cap( self::USER_ID, 'edit_post', 204 );

		$data = bibliography_builder_rest_bulk_deduplicate( self::request( array( 204 => self::etag( 204 ) ), false ) )->get_data();

		$this->assertSame( 'changed', $data['results'][0]['status'] );
		$this->assertSame( array( 'DOI' ), $data['results'][0]['bibliographies'][0]['changes']['removed'][0]['mergedFields'] );

		foreach ( ( new WP_Block_Parser() )->parse( get_post( 204 )->post_content ) as $block ) {
			if ( 'bibliography-builder/bibliography' !== $block['blockName'] ) {
				continue;
			}

			$this->assertCount( 1, $block['attrs']['citations'] );
			$citation = $block['attrs']['citations'][0];
			$this->assertSame( 'kept', $citation['id'] );
			$this->assertSame( '10.5555/1243380', $citation['csl']['DOI'] );
			$this->assertStringContainsString( '10.5555/1243380', $citation['formattedText'] );
			$this->assertSame( 'My own text', $citation['displayOverride'] );
			$this->assertArrayNotHasKey( 'exportBibtex', $citation );
			$this->assertArrayNotHasKey( 'parseWarnings', $citation );

			$attrs = bibliography_builder_decode_save_attributes( wp_json_encode( $block['attrs'] ) );
			$this->assertSame( bibliography_builder_render_save_markup( $attrs ), $block['innerHTML'] );
		}
	}

	public function test_the_ability_wraps_the_route() {
		add_filter( 'bibliography_builder_enable_write_routes', '__return_true' );
		bibliography_builder_register_write_abilities();

		$ability = $GLOBALS['bibliography_builder_test_abilities']['borges/bulk-deduplicate'];
		$this->assertSame( 'bibliography_builder_rest_bulk_permissions_check', $ability['permission_callback'] );
		$this->assertSame( array( 'posts' ), $ability['input_schema']['required'] );
		$this->assertTrue( $ability['meta']['annotations']['destructive'] );

		$data = bibliography_builder_ability_bulk_deduplicate(
			array(
				'posts'   => array(
					array(
						'id'   => 201,
						'etag' => self::etag( 201 ),
					),
				),
				'dry_run' => false,
			)
		);
		$this->assertSame( 'changed', $data['results'][0]['status'] );

		add_filter(
			'bibliography_builder_bulk_rate_limit',
			static function () {
				return array(
					'posts'  => 1,
					'window' => 900,
				);
			}
		);
		$error = bibliography_builder_ability_bulk_deduplicate( array( 'posts' => array( array( 'id' => 202 ) ) ) );
		$this->assertInstanceOf( WP_Error::class, $error );
		$this->assertSame( 'bibliography_builder_rate_limited', $error->get_error_code() );
	}

	private static function run_cli( $args, $assoc_args ) {
		WP_CLI::$log = array();

		try {
			( new Bibliography_Builder_CLI_Command() )->deduplicate( $args, $assoc_args );
		} catch ( Bibliography_Builder_Test_CLI_Exit $exit ) {
			return $exit->getMessage();
		}

		return null;
	}

	private static function run_duplicates( $args, $assoc_args = array() ) {
		WP_CLI::$log = array();
		( new Bibliography_Builder_CLI_Command() )->duplicates( $args, $assoc_args );

		return array(
			'rows'    => self::cli_log( 'items' )[0]['items'],
			'success' => self::cli_log( 'success' ),
			'warning' => self::cli_log( 'warning' ),
		);
	}

	public function test_the_duplicates_command_reports_and_changes_nothing() {
		bibliography_builder_test_set_current_user( 0 );
		$before = get_post( 201 )->post_content;
		$result = self::run_duplicates( array( '201', '202' ) );

		$this->assertSame(
			array(
				array(
					'postId' => 201,
					'scope'  => 'bibliography',
					'first'  => '0:knuth',
					'second' => '0:knuth-doi',
					'reason' => 'doi',
				),
				array(
					'postId' => 201,
					'scope'  => 'bibliography',
					'first'  => '0:hoare',
					'second' => '0:hoare-copy',
					'reason' => 'title-year',
				),
				array(
					'postId' => 201,
					'scope'  => 'post',
					'first'  => '0:hoare',
					'second' => '1:hoare-2',
					'reason' => 'title-year',
				),
			),
			$result['rows']
		);
		$this->assertSame(
			array( 'Within a bibliography: 2. Across bibliographies: 1. Posts checked: 2. Skipped: 0.' ),
			$result['success']
		);
		$this->assertSame( $before, get_post( 201 )->post_content );
		$this->assertSame( array(), $GLOBALS['bibliography_builder_test_post_updates'] );

		// Machine formats print rows only.
		$this->assertSame( array(), self::run_duplicates( array( '201' ), array( 'format' => 'csv' ) )['success'] );
	}

	public function test_the_duplicates_command_scans_the_site_and_skips_what_the_user_cannot_review() {
		$GLOBALS['wpdb'] = new class() {
			public $posts = 'wp_posts';
			public $query = '';

			public function esc_like( $text ) {
				return addcslashes( $text, '_%\\' );
			}

			public function prepare( $query, $arg ) {
				return str_replace( '%s', "'" . $arg . "'", $query );
			}

			public function get_col( $query ) {
				$this->query = $query;

				return array( '201', '202' );
			}
		};

		// --user without edit_post on 202: skipped and counted, without a
		// warning, since no post was named.
		unset( $GLOBALS['bibliography_builder_test_user_caps'][ self::USER_ID ]['edit_post'][202] );
		$result = self::run_duplicates( array() );

		$this->assertStringContainsString( "post_content LIKE '%<!-- wp:bibliography-builder/bibliography%'", $GLOBALS['wpdb']->query );
		$this->assertStringContainsString( "post_type <> 'revision'", $GLOBALS['wpdb']->query );
		$this->assertSame( array( 201 ), array_unique( array_column( $result['rows'], 'postId' ) ) );
		$this->assertStringEndsWith( 'Posts checked: 1. Skipped: 1.', $result['success'][0] );
		$this->assertSame( array(), $result['warning'] );

		// A named post the user cannot review is a warning.
		$this->assertCount( 1, self::run_duplicates( array( '202' ) )['warning'] );
	}

	private static function cli_log( $kind ) {
		$entries = array();

		foreach ( WP_CLI::$log as $entry ) {
			if ( $kind === $entry[0] ) {
				$entries[] = $entry[1];
			}
		}

		return $entries;
	}

	public function test_the_cli_command_checks_previews_and_commits() {
		bibliography_builder_test_set_current_user( 0 );
		$this->assertSame( 'error', self::run_cli( array( '201' ), array() ) );

		bibliography_builder_test_set_current_user( self::USER_ID );
		$this->assertSame( 'error', self::run_cli( array( '201' ), array() ), 'the write-routes filter is off' );

		add_filter( 'bibliography_builder_enable_write_routes', '__return_true' );
		$this->assertNull( self::run_cli( array( '201', '202' ), array() ) );
		$this->assertSame(
			array(
				array(
					'postId'     => 201,
					'status'     => 'preview',
					'removed'    => 2,
					'merged'     => 0,
					'crossBlock' => 1,
					'message'    => 'Some works repeat across bibliographies; those are left in place.',
				),
				array(
					'postId'     => 202,
					'status'     => 'unchanged',
					'removed'    => 0,
					'merged'     => 0,
					'crossBlock' => 0,
					'message'    => '',
				),
			),
			self::cli_log( 'items' )[0]['items']
		);
		$this->assertStringContainsString( 'Dry run; use --commit.', self::cli_log( 'success' )[0] );
		$this->assertSame( array(), $GLOBALS['bibliography_builder_test_post_updates'] );

		$this->assertNull( self::run_cli( array( '201' ), array( 'commit' => true ) ) );
		$this->assertSame( 'Saved: 1. Unchanged: 0. Skipped: 0. Failed: 0.', self::cli_log( 'success' )[0] );
		$this->assertSame( array( 'knuth', 'hoare' ), self::citation_ids( 201 )['chapter-1'] );
		$this->assertSame( 0, bibliography_builder_rate_limit_used( 'user:' . self::USER_ID, bibliography_builder_bulk_rate_limit( self::USER_ID ) ) );
	}
}

<?php
/**
 * Bulk reformat route, its rate limit and lock, and the bulk ability
 * (Phase 05, M4 / Tier 4).
 *
 * The per-block reformat itself is WriteRoutesTest's job; these tests cover
 * what bulk adds: many posts per request, one save per post, the per-post
 * outcomes, the budget, the site-wide lock, and the time budget.
 *
 * @package BibliographyBuilder
 */

use PHPUnit\Framework\TestCase;

final class BulkRoutesTest extends TestCase {

	const USER_ID = 7;

	/**
	 * Post IDs with one or two bibliographies.
	 */
	const POSTS = array( 101, 102, 103, 104, 105 );

	protected function setUp(): void {
		bibliography_builder_test_reset_state();

		if ( ! bibliography_builder_can_render_save_markup() || ! class_exists( '\\Seboettg\\CiteProc\\CiteProc' ) ) {
			$this->markTestSkipped( 'intl and citeproc-php are required.' );
		}

		bibliography_builder_test_set_current_user( self::USER_ID );
		bibliography_builder_test_grant_cap( self::USER_ID, 'edit_others_posts', 0 );

		foreach ( self::POSTS as $post_id ) {
			$content = "<!-- wp:paragraph -->\n<p>Post {$post_id}</p>\n<!-- /wp:paragraph -->\n\n"
				. self::block(
					array(
						'bibliographyId' => 'ieee-' . $post_id,
						'citationStyle'  => 'ieee',
						'citations'      => array(
							self::citation( 'one-' . $post_id, 'First Paper', 'Zed', 'Ann', 2001 ),
							self::citation( 'two-' . $post_id, 'Second Paper', 'Abel', 'Bo', 2002 ),
						),
					)
				)
				. "\n";

			// The first post holds a second bibliography, so a post with
			// several blocks is covered too.
			if ( 101 === $post_id ) {
				$content .= "\n" . self::block(
					array(
						'bibliographyId' => 'notes-101',
						'citationStyle'  => 'chicago-notes-bibliography',
						'citations'      => array(
							self::citation( 'knuth', 'Literate Programming', 'Knuth', 'Donald E.', 1984 ),
						),
					)
				) . "\n";
			}

			self::set_post( $post_id, $content );
			bibliography_builder_test_grant_cap( self::USER_ID, 'edit_post', $post_id );
		}
	}

	protected function tearDown(): void {
		remove_all_filters( 'bibliography_builder_enable_write_routes' );
		remove_all_filters( 'bibliography_builder_bulk_rate_limit' );
		remove_all_filters( 'bibliography_builder_bulk_rate_limit_key' );
		remove_all_filters( 'bibliography_builder_bulk_time_budget' );
		remove_all_filters( 'bibliography_builder_bulk_max_posts_per_request' );
	}

	private static function set_post( $post_id, $content ) {
		bibliography_builder_test_set_post( $post_id, 'publish', $content );
		bibliography_builder_test_set_parsed_blocks( $content, ( new WP_Block_Parser() )->parse( $content ) );
	}

	private static function citation( $id, $title, $family, $given, $year ) {
		return array(
			'id'            => $id,
			'csl'           => array(
				'type'   => 'article-journal',
				'title'  => $title,
				'author' => array(
					array(
						'family' => $family,
						'given'  => $given,
					),
				),
				'issued' => array( 'date-parts' => array( array( $year ) ) ),
			),
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
	 * A bulk request; `$posts` maps post IDs to ETags (null for none).
	 */
	private static function request( $posts, $style = 'apa-7', $dry_run = true ) {
		$list = array();

		foreach ( $posts as $post_id => $etag ) {
			$list[] = null === $etag ? array( 'id' => $post_id ) : array(
				'id'   => $post_id,
				'etag' => $etag,
			);
		}

		$request = new WP_REST_Request( 'POST', '/bibliography/v1/bulk/reformat' );
		$request->set_query_params( array( 'dry_run' => $dry_run ) );
		$request->set_body(
			(string) wp_json_encode(
				array(
					'style' => $style,
					'posts' => $list,
				)
			)
		);

		return $request;
	}

	/**
	 * A commit for posts at their current ETags.
	 */
	private static function commit( $post_ids, $style = 'apa-7' ) {
		$posts = array();

		foreach ( $post_ids as $post_id ) {
			$posts[ $post_id ] = self::etag( $post_id );
		}

		return self::request( $posts, $style, false );
	}

	private static function limit( $posts, $window = 900 ) {
		add_filter(
			'bibliography_builder_bulk_rate_limit',
			static function () use ( $posts, $window ) {
				return array(
					'posts'  => $posts,
					'window' => $window,
				);
			}
		);
	}

	private function assert_post_is_valid( $post_id ) {
		foreach ( ( new WP_Block_Parser() )->parse( get_post( $post_id )->post_content ) as $block ) {
			if ( 'bibliography-builder/bibliography' !== $block['blockName'] ) {
				continue;
			}

			$attrs = bibliography_builder_decode_save_attributes( wp_json_encode( $block['attrs'] ) );
			$this->assertSame( 'apa-7', $block['attrs']['citationStyle'] );
			$this->assertSame( bibliography_builder_render_save_markup( $attrs ), $block['innerHTML'] );
		}
	}

	public function test_route_follows_the_write_routes_filter() {
		bibliography_builder_register_write_routes();
		$this->assertSame( array(), $GLOBALS['bibliography_builder_test_rest_routes'] );

		add_filter( 'bibliography_builder_enable_write_routes', '__return_true' );
		bibliography_builder_register_write_routes();

		$route = end( $GLOBALS['bibliography_builder_test_rest_routes'] );
		$this->assertSame( '/bulk/reformat', $route['route'] );
		$this->assertSame( 'bibliography_builder_rest_bulk_permissions_check', $route['args']['permission_callback'] );
	}

	public function test_permission_needs_edit_others_posts() {
		$this->assertTrue( bibliography_builder_rest_bulk_permissions_check() );

		bibliography_builder_test_set_current_user( 99 );
		$this->assertSame( 403, bibliography_builder_rest_bulk_permissions_check()->get_error_data()['status'] );
	}

	public function test_a_dry_run_previews_every_bibliography_and_saves_nothing() {
		$before   = get_post( 101 )->post_content;
		$response = bibliography_builder_rest_bulk_reformat( self::request( array( 101 => null, 102 => null ) ) );
		$data     = $response->get_data();

		$this->assertTrue( $data['dryRun'] );
		$this->assertSame( array( 'preview', 'preview' ), array_column( $data['results'], 'status' ) );
		$this->assertSame( self::etag( 101 ), $data['results'][0]['etag'] );
		$this->assertSame( array( 'ieee-101', 'notes-101' ), array_column( $data['results'][0]['bibliographies'], 'bibliographyId' ) );
		$this->assertSame(
			array(
				'from' => 'chicago-notes-bibliography',
				'to'   => 'apa-7',
			),
			$data['results'][0]['bibliographies'][1]['changes']['citationStyle']
		);
		$this->assertSame( array(), $data['remaining'] );
		$this->assertSame( $before, get_post( 101 )->post_content );
		$this->assertSame( array(), $GLOBALS['bibliography_builder_test_post_updates'] );

		// Dry runs spend the budget like writes, and report it.
		$this->assertSame( 248, $data['rateLimit']['remaining'] );
		$this->assertSame( '250', $response->get_headers()['RateLimit-Limit'] );
		$this->assertSame( '248', $response->get_headers()['RateLimit-Remaining'] );
	}

	public function test_a_commit_saves_each_post_once() {
		$data = bibliography_builder_rest_bulk_reformat( self::commit( array( 101, 102 ) ) )->get_data();

		$this->assertFalse( $data['dryRun'] );
		$this->assertSame( array( 'changed', 'changed' ), array_column( $data['results'], 'status' ) );
		$this->assertSame( array( 101, 102 ), array_column( $GLOBALS['bibliography_builder_test_post_updates'], 'ID' ) );
		$this->assertSame( self::etag( 101 ), $data['results'][0]['etag'] );
		$this->assert_post_is_valid( 101 );
		$this->assert_post_is_valid( 102 );
		$this->assertStringContainsString( '<p>Post 101</p>', get_post( 101 )->post_content );

		// The lock is released afterwards.
		$this->assertIsString( bibliography_builder_bulk_lock_acquire( 15 ) );
	}

	public function test_posts_already_in_the_style_are_unchanged_even_with_a_stale_etag() {
		bibliography_builder_rest_bulk_reformat( self::commit( array( 101 ) ) );
		$GLOBALS['bibliography_builder_test_post_updates'] = array();

		// A retried batch: the ETag is the one from before the first save.
		$data = bibliography_builder_rest_bulk_reformat( self::request( array( 101 => '"stale"' ), 'apa-7', false ) )->get_data();

		$this->assertSame( 'unchanged', $data['results'][0]['status'] );
		$this->assertSame( array(), $GLOBALS['bibliography_builder_test_post_updates'] );
	}

	public function test_a_missing_or_stale_etag_fails_only_that_post() {
		$data = bibliography_builder_rest_bulk_reformat(
			self::request(
				array(
					101 => null,
					102 => '"stale"',
					103 => self::etag( 103 ),
				),
				'apa-7',
				false
			)
		)->get_data();

		$this->assertSame( array( 'failed', 'failed', 'changed' ), array_column( $data['results'], 'status' ) );
		$this->assertSame( 428, $data['results'][0]['error']['status'] );
		$this->assertSame( 412, $data['results'][1]['error']['status'] );
		$this->assertSame( self::etag( 102 ), $data['results'][1]['etag'] );
		$this->assertSame( array( 103 ), array_column( $GLOBALS['bibliography_builder_test_post_updates'], 'ID' ) );
	}

	public function test_missing_forbidden_and_empty_posts_are_skipped() {
		self::set_post( 104, "<!-- wp:paragraph -->\n<p>No bibliography</p>\n<!-- /wp:paragraph -->\n" );
		bibliography_builder_test_grant_cap( 99, 'edit_others_posts', 0 );
		$GLOBALS['bibliography_builder_test_user_caps'][ self::USER_ID ]['edit_post'][105] = false;

		$data = bibliography_builder_rest_bulk_reformat( self::request( array( 999 => null, 104 => null, 105 => null, 102 => null ) ) )->get_data();

		$this->assertSame( array( 'skipped', 'skipped', 'skipped', 'preview' ), array_column( $data['results'], 'status' ) );
		$this->assertSame( array( 404, 404, 403 ), array_column( array_column( array_slice( $data['results'], 0, 3 ), 'error' ), 'status' ) );
	}

	public function test_an_unformattable_entry_fails_the_whole_post() {
		$content = self::block(
			array(
				'citationStyle' => 'ieee',
				'citations'     => array(
					array(
						'id'            => 'broken',
						'csl'           => array(),
						'formattedText' => 'Broken.',
					),
				),
			)
		);
		self::set_post( 104, $content );

		$data = bibliography_builder_rest_bulk_reformat( self::commit( array( 104, 105 ) ) )->get_data();

		$this->assertSame( array( 'failed', 'changed' ), array_column( $data['results'], 'status' ) );
		$this->assertSame( 409, $data['results'][0]['error']['status'] );
		$this->assertSame( 0, $data['results'][0]['error']['index'] );
		$this->assertSame( $content, get_post( 104 )->post_content );
	}

	public function test_bad_requests_are_refused_before_any_work() {
		$cases = array(
			'unknown style'  => self::request( array( 101 => null ), 'apa' ),
			'no posts'       => self::request( array() ),
			'too many posts' => self::request( array_fill_keys( range( 1, 26 ), null ) ),
		);

		$string_id = new WP_REST_Request( 'POST', '/bibliography/v1/bulk/reformat' );
		$string_id->set_body( '{"style":"apa-7","posts":[{"id":"101"}]}' );
		$cases['string id'] = $string_id;

		$duplicate = new WP_REST_Request( 'POST', '/bibliography/v1/bulk/reformat' );
		$duplicate->set_body( '{"style":"apa-7","posts":[{"id":101},{"id":101}]}' );
		$cases['duplicate'] = $duplicate;

		foreach ( $cases as $name => $request ) {
			$error = bibliography_builder_rest_bulk_reformat( $request );
			$this->assertInstanceOf( WP_Error::class, $error, $name );
			$this->assertSame( 400, $error->get_error_data()['status'], $name );
		}

		$this->assertSame( array(), $GLOBALS['bibliography_builder_test_transients'] );
	}

	public function test_a_request_over_the_budget_is_clipped_then_refused() {
		self::limit( 3 );

		$response = bibliography_builder_rest_bulk_reformat( self::request( array_fill_keys( self::POSTS, null ) ) );
		$data     = $response->get_data();

		$this->assertCount( 3, $data['results'] );
		$this->assertSame( array( 104, 105 ), array_column( $data['remaining'], 'id' ) );
		$this->assertSame( 0, $data['rateLimit']['remaining'] );
		$this->assertSame( '0', $response->get_headers()['RateLimit-Remaining'] );

		$refused = bibliography_builder_rest_bulk_reformat( self::request( array( 104 => null ) ) );

		$this->assertSame( 429, $refused->get_status() );
		$this->assertSame( 'bibliography_builder_rate_limited', $refused->get_data()['code'] );
		$this->assertSame( (string) $refused->get_data()['data']['reset'], $refused->get_headers()['Retry-After'] );
		$this->assertSame( '0', $refused->get_headers()['RateLimit-Remaining'] );
	}

	public function test_the_budget_works_through_a_persistent_object_cache() {
		bibliography_builder_test_use_ext_object_cache( true );
		self::limit( 3 );

		bibliography_builder_rest_bulk_reformat( self::request( array( 101 => null, 102 => null ) ) );
		$data = bibliography_builder_rest_bulk_reformat( self::request( array( 103 => null, 104 => null ) ) )->get_data();

		$this->assertCount( 1, $data['results'] );
		$this->assertSame( 0, $data['rateLimit']['remaining'] );
		// The counter is in the object cache, not a transient.
		$window  = bibliography_builder_rate_limit_window( 900 );
		$counter = bibliography_builder_rate_limit_counter_key( 'user:' . self::USER_ID, $window['start'] );
		$this->assertSame( 3, wp_cache_get( $counter, BIBLIOGRAPHY_BUILDER_RATE_LIMIT_GROUP ) );
		$this->assertArrayNotHasKey(
			bibliography_builder_get_transient_cache_key( BIBLIOGRAPHY_BUILDER_RATE_LIMIT_GROUP, $counter ),
			$GLOBALS['bibliography_builder_test_transients']
		);
		$this->assertNotEmpty( $GLOBALS['bibliography_builder_test_object_cache'][ BIBLIOGRAPHY_BUILDER_RATE_LIMIT_GROUP ] );
	}

	public function test_budgets_are_per_user_unless_a_key_filter_shares_them() {
		self::limit( 2 );
		bibliography_builder_rest_bulk_reformat( self::request( array( 101 => null, 102 => null ) ) );

		bibliography_builder_test_set_current_user( 8 );
		bibliography_builder_test_grant_cap( 8, 'edit_post', 103 );
		$other = bibliography_builder_rest_bulk_reformat( self::request( array( 103 => null ) ) )->get_data();
		$this->assertSame( 'preview', $other['results'][0]['status'] );

		add_filter(
			'bibliography_builder_bulk_rate_limit_key',
			static function () {
				return 'site';
			}
		);
		bibliography_builder_test_set_current_user( self::USER_ID );
		bibliography_builder_rest_bulk_reformat( self::request( array( 101 => null, 102 => null ) ) );
		bibliography_builder_test_set_current_user( 8 );
		$this->assertSame( 429, bibliography_builder_rest_bulk_reformat( self::request( array( 103 => null ) ) )->get_status() );
	}

	public function test_the_budget_can_be_turned_off() {
		add_filter( 'bibliography_builder_bulk_rate_limit', '__return_false' );

		$response = bibliography_builder_rest_bulk_reformat( self::request( array( 101 => null ) ) );

		$this->assertNull( $response->get_data()['rateLimit'] );
		$this->assertArrayNotHasKey( 'RateLimit-Limit', $response->get_headers() );
	}

	public function test_a_commit_waits_for_another_bulk_write_and_gets_its_budget_back() {
		$lock = bibliography_builder_bulk_lock_acquire( 15 );

		$busy = bibliography_builder_rest_bulk_reformat( self::commit( array( 101, 102 ) ) );
		$this->assertSame( 429, $busy->get_status() );
		$this->assertSame( 'bibliography_builder_bulk_busy', $busy->get_data()['code'] );
		$this->assertSame( (string) BIBLIOGRAPHY_BUILDER_BULK_LOCK_RETRY_AFTER, $busy->get_headers()['Retry-After'] );
		$this->assertSame( '250', $busy->get_headers()['RateLimit-Remaining'] );
		$this->assertSame( array(), $GLOBALS['bibliography_builder_test_post_updates'] );

		// Dry runs do not need the lock.
		$preview = bibliography_builder_rest_bulk_reformat( self::request( array( 101 => null ) ) )->get_data();
		$this->assertSame( 'preview', $preview['results'][0]['status'] );

		bibliography_builder_bulk_lock_release( $lock );
		$this->assertSame( 'changed', bibliography_builder_rest_bulk_reformat( self::commit( array( 101 ) ) )->get_data()['results'][0]['status'] );
	}

	public function test_the_lock_is_atomic_through_a_persistent_object_cache() {
		bibliography_builder_test_use_ext_object_cache( true );

		$first = bibliography_builder_bulk_lock_acquire( 15 );
		$this->assertIsString( $first );
		$this->assertFalse( bibliography_builder_bulk_lock_acquire( 15 ) );

		// Only the holder can release it.
		bibliography_builder_bulk_lock_release( 'someone-else' );
		$this->assertFalse( bibliography_builder_bulk_lock_acquire( 15 ) );

		bibliography_builder_bulk_lock_release( $first );
		$this->assertIsString( bibliography_builder_bulk_lock_acquire( 15 ) );
	}

	public function test_the_time_budget_returns_the_rest_and_refunds_it() {
		add_filter(
			'bibliography_builder_bulk_time_budget',
			static function () {
				return 0;
			}
		);

		$data = bibliography_builder_rest_bulk_reformat( self::request( array( 101 => null, 102 => '"x"', 103 => null ) ) )->get_data();

		// A request always does one post.
		$this->assertCount( 1, $data['results'] );
		$this->assertSame(
			array(
				array(
					'id'   => 102,
					'etag' => '"x"',
				),
				array(
					'id'   => 103,
					'etag' => '',
				),
			),
			$data['remaining']
		);
		$this->assertSame( 249, $data['rateLimit']['remaining'] );
	}

	public function test_the_batch_cap_is_a_clamped_filter() {
		add_filter(
			'bibliography_builder_bulk_max_posts_per_request',
			static function () {
				return 500;
			}
		);
		$this->assertSame( 100, bibliography_builder_bulk_max_posts_per_request() );

		remove_all_filters( 'bibliography_builder_bulk_max_posts_per_request' );
		add_filter(
			'bibliography_builder_bulk_max_posts_per_request',
			static function () {
				return 2;
			}
		);
		$this->assertSame( 400, bibliography_builder_rest_bulk_reformat( self::request( array( 101 => null, 102 => null, 103 => null ) ) )->get_error_data()['status'] );
	}

	public function test_windows_align_to_their_length() {
		$this->assertSame(
			array(
				'start' => 1800,
				'reset' => 2700,
			),
			bibliography_builder_rate_limit_window( 900, 2000 )
		);
	}

	public function test_the_bulk_ability_wraps_the_route() {
		add_filter( 'bibliography_builder_enable_write_routes', '__return_true' );
		bibliography_builder_register_write_abilities();

		$ability = $GLOBALS['bibliography_builder_test_abilities']['borges/bulk-reformat'];
		$this->assertSame( 'bibliography_builder_rest_bulk_permissions_check', $ability['permission_callback'] );
		$this->assertSame( 25, $ability['input_schema']['properties']['posts']['maxItems'] );

		$data = bibliography_builder_ability_bulk_reformat(
			array(
				'style' => 'apa-7',
				'posts' => array(
					array(
						'id'   => 101,
						'etag' => self::etag( 101 ),
					),
				),
				'dry_run' => false,
			)
		);
		$this->assertSame( 'changed', $data['results'][0]['status'] );

		self::limit( 1 );
		$error = bibliography_builder_ability_bulk_reformat(
			array(
				'style' => 'apa-7',
				'posts' => array( array( 'id' => 102 ) ),
			)
		);
		$this->assertInstanceOf( WP_Error::class, $error );
		$this->assertSame( 'bibliography_builder_rate_limited', $error->get_error_code() );
		$this->assertSame( 429, $error->get_error_data()['status'] );
	}
}

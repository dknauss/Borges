<?php

use PHPUnit\Framework\TestCase;

final class ReviewRoutesTest extends TestCase {
	private $post_id = 201;
	private $block_id = '3f1c2b7e-9a4d-4c1e-8f2a-5b6c7d8e9f01';

	protected function setUp(): void {
		parent::setUp();
		bibliography_builder_test_reset_state();

		$content = '<!-- wp:bibliography-builder/bibliography {"review":true} /-->';

		bibliography_builder_test_set_post( $this->post_id, 'draft', $content );
		bibliography_builder_test_set_parsed_blocks(
			$content,
			array(
				array(
					'blockName' => 'bibliography-builder/bibliography',
					'attrs'     => array(
						'bibliographyId' => $this->block_id,
						'citationStyle'  => 'chicago-notes-bibliography',
						'citations'      => $this->citations(),
					),
				),
				array(
					'blockName' => 'bibliography-builder/bibliography',
					'attrs'     => array( 'citations' => array() ),
				),
			)
		);

		bibliography_builder_test_grant_cap( 7, 'edit_post', $this->post_id );
		bibliography_builder_test_set_current_user( 7 );
	}

	private function citations(): array {
		return array(
			array(
				'id'            => 'good-1',
				'formattedText' => 'LeCun, Yann. "Deep Learning." Nature 521 (2015).',
				'csl'           => array(
					'type'            => 'article-journal',
					'title'           => 'Deep Learning',
					'container-title' => 'Nature',
					'DOI'             => '10.1038/nature14539',
					'author'          => array( array( 'family' => 'LeCun', 'given' => 'Yann' ) ),
					'issued'          => array( 'date-parts' => array( array( 2015 ) ) ),
				),
			),
			array(
				'id'  => 'dup-doi',
				'csl' => array(
					'type'   => 'book',
					'title'  => 'Another Title',
					'DOI'    => 'https://doi.org/10.1038/NATURE14539',
					'ISBN'   => '978-0-14-032872-1 (pbk.)',
					'author' => array( array( 'family' => 'Other' ) ),
					'issued' => array( 'date-parts' => array( array( 2015 ) ) ),
				),
			),
			array(
				'csl' => array(
					'type'  => 'article-journal',
					'title' => '',
					'DOI'   => 'not-a-doi',
				),
			),
			array(
				'id'  => 'bad-type',
				'csl' => array(
					'type'  => 'nonsense',
					'title' => 'Bad Type',
				),
			),
			array(
				'id'            => 'no-csl',
				'formattedText' => 'Hand-written entry.',
			),
			array(
				'id'  => 'title-a',
				'csl' => array(
					'type'   => 'book',
					'title'  => 'Same Title!',
					'author' => array( array( 'family' => 'Smith' ) ),
				),
			),
			array(
				'id'  => 'title-b',
				'csl' => array(
					'type'   => 'book',
					'title'  => 'same   title',
					'author' => array( array( 'family' => 'smith' ) ),
					'issued' => array( 'date-parts' => array( array( 2020 ) ) ),
				),
			),
			array(
				'id'  => 'isbn-bad',
				'csl' => array(
					'type'   => 'book',
					'title'  => 'Checksum',
					'ISBN'   => '1234567890',
					'author' => array( array( 'literal' => 'Committee' ) ),
					'issued' => array( 'date-parts' => array( array( 2001 ) ) ),
				),
			),
		);
	}

	private function request( $ref, $params = array() ): WP_REST_Request {
		$request            = new WP_REST_Request( 'GET', '/bibliography/v1/posts/201/bibliographies/' . $ref );
		$request['post_id'] = $this->post_id;
		$request['ref']     = (string) $ref;

		foreach ( $params as $key => $value ) {
			$request[ $key ] = $value;
		}

		return $request;
	}

	private function codes( array $entry ): array {
		return array_map(
			static function ( $issue ) {
				return $issue['severity'] . ':' . $issue['code'];
			},
			$entry['issues']
		);
	}

	public function test_review_routes_are_registered_after_the_existing_routes(): void {
		bibliography_builder_register_rest_routes();
		$routes = $GLOBALS['bibliography_builder_test_rest_routes'];
		$base   = '/posts/(?P<post_id>\d+)/bibliographies/(?P<ref>[A-Za-z0-9][A-Za-z0-9_-]{0,63})';

		$this->assertSame( $base . '/validate', $routes[7]['route'] );
		$this->assertSame( 'bibliography_builder_rest_validate_bibliography', $routes[7]['args']['callback'] );
		$this->assertSame( $base . '/duplicates', $routes[8]['route'] );
		$this->assertSame( 'bibliography_builder_rest_get_bibliography_duplicates', $routes[8]['args']['callback'] );
		$this->assertSame( $base . '/preview', $routes[9]['route'] );
		$this->assertSame( 'bibliography_builder_rest_preview_bibliography', $routes[9]['args']['callback'] );

		foreach ( array( 7, 8, 9 ) as $route_index ) {
			$this->assertSame(
				'bibliography_builder_rest_review_permissions_check',
				$routes[ $route_index ]['args']['permission_callback']
			);
		}

		$ref_arg = $routes[7]['args']['args']['ref'];
		$this->assertTrue( $ref_arg['validate_callback']( '0' ) );
		$this->assertTrue( $ref_arg['validate_callback']( $this->block_id ) );
		$this->assertFalse( $ref_arg['validate_callback']( '../0' ) );
		$this->assertFalse( $ref_arg['validate_callback']( array( '0' ) ) );

		// Reading one bibliography by ID is its own route, after the review
		// routes, so the numeric route keeps its `index` parameter.
		$this->assertSame( '/posts/(?P<post_id>\d+)/bibliographies/(?P<index>\d+)', $routes[3]['route'] );
		$this->assertSame(
			'/posts/(?P<post_id>\d+)/bibliographies/(?P<id>(?=[A-Za-z0-9_-]*[A-Za-z_-])[A-Za-z0-9][A-Za-z0-9_-]{0,63})',
			$routes[10]['route']
		);
		$this->assertSame( 'bibliography_builder_rest_get_bibliography', $routes[10]['args']['callback'] );
		$this->assertSame( 'bibliography_builder_rest_permissions_check', $routes[10]['args']['permission_callback'] );

		foreach ( array( '0', '12', '12a', $this->block_id, 'abc' ) as $path ) {
			$this->assertSame(
				1 !== preg_match( '/^\d+$/', $path ),
				1 === preg_match( '@^' . $routes[10]['route'] . '$@i', '/posts/1/bibliographies/' . $path ),
				$path
			);
		}

		$style_arg = $routes[9]['args']['args']['style'];
		$this->assertTrue( $style_arg['required'] );
		$this->assertTrue( $style_arg['validate_callback']( 'apa-7' ) );
		$this->assertFalse( $style_arg['validate_callback']( 'apa' ) );
		$this->assertFalse( $style_arg['validate_callback']( array( 'apa-7' ) ) );
	}

	public function test_review_routes_require_edit_post(): void {
		$this->assertTrue( bibliography_builder_rest_review_permissions_check( $this->request( 0 ) ) );

		bibliography_builder_test_set_current_user( 8 );
		$forbidden = bibliography_builder_rest_review_permissions_check( $this->request( 0 ) );
		$this->assertInstanceOf( WP_Error::class, $forbidden );
		$this->assertSame( 403, $forbidden->get_error_data()['status'] );

		// Being able to read a published post is not enough.
		bibliography_builder_test_set_post( 202, 'publish', '' );
		$published            = $this->request( 0 );
		$published['post_id'] = 202;
		$this->assertInstanceOf( WP_Error::class, bibliography_builder_rest_review_permissions_check( $published ) );

		$missing            = $this->request( 0 );
		$missing['post_id'] = 999;
		$this->assertSame(
			404,
			bibliography_builder_rest_review_permissions_check( $missing )->get_error_data()['status']
		);
	}

	public function test_bibliography_is_found_by_index_or_stable_id(): void {
		$by_index = bibliography_builder_rest_validate_bibliography( $this->request( 0 ) )->get_data();
		$by_id    = bibliography_builder_rest_validate_bibliography( $this->request( $this->block_id ) )->get_data();

		$this->assertSame( $by_index, $by_id );
		$this->assertSame( 0, $by_id['index'] );
		$this->assertSame( $this->block_id, $by_id['bibliographyId'] );
		$this->assertSame( 8, $by_id['entryCount'] );

		foreach ( array( 2, 'no-such-block' ) as $ref ) {
			$missing = bibliography_builder_rest_validate_bibliography( $this->request( $ref ) );
			$this->assertInstanceOf( WP_Error::class, $missing );
			$this->assertSame( 404, $missing->get_error_data()['status'] );
		}

		foreach ( array( 'bibliography_builder_rest_get_bibliography_duplicates', 'bibliography_builder_rest_preview_bibliography' ) as $callback ) {
			$this->assertInstanceOf( WP_Error::class, $callback( $this->request( 'no-such-block', array( 'style' => 'apa-7' ) ) ) );
		}
	}

	public function test_validate_reports_errors_and_warnings_per_entry(): void {
		$data    = bibliography_builder_rest_validate_bibliography( $this->request( 0 ) )->get_data();
		$entries = $data['entries'];

		$this->assertFalse( $data['valid'] );
		$this->assertSame( array(), $entries[0]['issues'] );
		$this->assertTrue( $entries[0]['valid'] );
		$this->assertSame( 'good-1', $entries[0]['id'] );

		// A URL-form DOI with a qualified ISBN is still well formed.
		$this->assertSame( array(), $entries[1]['issues'] );

		$this->assertNull( $entries[2]['id'] );
		$this->assertFalse( $entries[2]['valid'] );
		$this->assertSame(
			array(
				'warning:missing-id',
				'error:missing-title',
				'warning:missing-author',
				'warning:missing-issued',
				'warning:missing-container-title',
				'error:malformed-doi',
			),
			$this->codes( $entries[2] )
		);

		$this->assertSame( array( 'error:invalid-csl' ), $this->codes( $entries[3] ) );
		$this->assertSame( 'Invalid CSL type.', $entries[3]['issues'][0]['message'] );
		$this->assertSame( array( 'error:missing-csl' ), $this->codes( $entries[4] ) );
		$this->assertSame( array( 'warning:missing-issued' ), $this->codes( $entries[5] ) );
		$this->assertTrue( $entries[5]['valid'] );
		$this->assertSame( array( 'warning:invalid-isbn' ), $this->codes( $entries[7] ) );
		$this->assertSame( 'ISBN', $entries[7]['issues'][0]['field'] );

		$this->assertSame( 4, $data['errorCount'] );
		$this->assertSame( 6, $data['warningCount'] );
	}

	public function test_validate_reports_an_empty_bibliography_as_valid(): void {
		$data = bibliography_builder_rest_validate_bibliography( $this->request( 1 ) )->get_data();

		$this->assertTrue( $data['valid'] );
		$this->assertNull( $data['bibliographyId'] );
		$this->assertSame( array(), $data['entries'] );
	}

	public function test_duplicates_lists_pairs_the_editor_would_treat_as_one_work(): void {
		$data = bibliography_builder_rest_get_bibliography_duplicates( $this->request( 0 ) )->get_data();

		$this->assertSame(
			array(
				array(
					'reason' => 'doi',
					'first'  => array( 'index' => 0, 'id' => 'good-1' ),
					'second' => array( 'index' => 1, 'id' => 'dup-doi' ),
				),
				array(
					'reason' => 'title-author',
					'first'  => array( 'index' => 5, 'id' => 'title-a' ),
					'second' => array( 'index' => 6, 'id' => 'title-b' ),
				),
			),
			$data['pairs']
		);
	}

	public function test_duplicate_reason_mirrors_the_editor_rules(): void {
		$keys = static function ( $title, $author = '', $year = null, $doi = '' ) {
			return compact( 'doi', 'title', 'author', 'year' );
		};

		$this->assertSame( 'title-year', bibliography_builder_get_duplicate_reason( $keys( 'a', 'x', '2020' ), $keys( 'a', 'y', '2020' ) ) );
		$this->assertSame( 'title', bibliography_builder_get_duplicate_reason( $keys( 'a' ), $keys( 'a' ) ) );
		$this->assertNull( bibliography_builder_get_duplicate_reason( $keys( 'a', 'x', '2020' ), $keys( 'a', 'y', '2021' ) ) );
		$this->assertNull( bibliography_builder_get_duplicate_reason( $keys( 'a', 'x' ), $keys( 'a' ) ) );
		$this->assertNull( bibliography_builder_get_duplicate_reason( $keys( 'a' ), $keys( 'b' ) ) );
		$this->assertNull( bibliography_builder_get_duplicate_reason( $keys( '' ), $keys( '' ) ) );
		$this->assertSame(
			'doi',
			bibliography_builder_get_duplicate_reason( $keys( 'a', '', null, '10.1/x' ), $keys( 'b', '', null, '10.1/x' ) )
		);
	}

	public function test_preview_formats_each_entry_in_the_requested_style_without_saving(): void {
		$before = $GLOBALS['bibliography_builder_test_posts'][ $this->post_id ]->post_content;
		$data   = bibliography_builder_rest_preview_bibliography( $this->request( 0, array( 'style' => 'apa-7' ) ) )->get_data();

		$this->assertSame( 'chicago-notes-bibliography', $data['currentStyle'] );
		$this->assertSame( 'apa-7', $data['style'] );
		$this->assertCount( 8, $data['entries'] );

		$first = $data['entries'][0];
		$this->assertSame( 'good-1', $first['id'] );
		$this->assertSame( 'LeCun, Yann. "Deep Learning." Nature 521 (2015).', $first['current'] );
		$this->assertStringContainsString( 'LeCun', $first['preview'] );
		$this->assertStringContainsString( 'Deep Learning', $first['preview'] );
		$this->assertStringContainsString( '10.1038/nature14539', $first['preview'] );
		$this->assertTrue( $first['changed'] );
		$this->assertNull( $first['error'] );

		// Entries the formatter rejects keep their current text and say why.
		$this->assertNull( $data['entries'][3]['preview'] );
		$this->assertFalse( $data['entries'][3]['changed'] );
		$this->assertSame( 'Invalid CSL type.', $data['entries'][3]['error'] );
		$this->assertNull( $data['entries'][4]['preview'] );
		$this->assertSame( 'Hand-written entry.', $data['entries'][4]['current'] );
		$this->assertNotNull( $data['entries'][4]['error'] );

		$this->assertSame( $before, $GLOBALS['bibliography_builder_test_posts'][ $this->post_id ]->post_content );
	}

	public function test_preview_of_an_empty_bibliography_skips_the_formatter(): void {
		$data = bibliography_builder_rest_preview_bibliography( $this->request( 1, array( 'style' => 'ieee' ) ) )->get_data();

		$this->assertSame( array(), $data['entries'] );
	}

	public function test_preview_refuses_bibliographies_over_the_format_limit(): void {
		$content = '<!-- wp:bibliography-builder/bibliography {"big":true} /-->';

		bibliography_builder_test_set_post( $this->post_id, 'draft', $content );
		bibliography_builder_test_set_parsed_blocks(
			$content,
			array(
				array(
					'blockName' => 'bibliography-builder/bibliography',
					'attrs'     => array(
						'citations' => array_fill(
							0,
							BIBLIOGRAPHY_BUILDER_MAX_FORMAT_ITEMS + 1,
							array( 'csl' => array( 'type' => 'book', 'title' => 'Filler' ) )
						),
					),
				),
			)
		);

		$result = bibliography_builder_rest_preview_bibliography( $this->request( 0, array( 'style' => 'apa-7' ) ) );

		$this->assertInstanceOf( WP_Error::class, $result );
		$this->assertSame( 'bibliography_builder_too_many_items', $result->get_error_code() );
		$this->assertSame( 400, $result->get_error_data()['status'] );
	}

	public function test_single_bibliography_route_accepts_a_bibliography_id(): void {
		$request            = new WP_REST_Request( 'GET', '/bibliography/v1/posts/201/bibliographies/' . $this->block_id );
		$request['post_id'] = $this->post_id;
		$request['id']      = $this->block_id;

		$data = bibliography_builder_rest_get_bibliography( $request )->get_data();
		$this->assertSame( 0, $data['index'] );
		$this->assertSame( $this->block_id, $data['bibliographyId'] );

		$request['format'] = 'csl-json';
		$this->assertSame( 'Deep Learning', bibliography_builder_rest_get_bibliography( $request )->get_data()[0]['title'] );

		$request['id'] = 'no-such-block';
		$this->assertSame( 404, bibliography_builder_rest_get_bibliography( $request )->get_error_data()['status'] );
	}

	public function test_block_ref_validator(): void {
		foreach ( array( '0', '12', 0, 3, $this->block_id, 'citation-lx2k9-4f8a1b2c' ) as $valid ) {
			$this->assertTrue( bibliography_builder_is_block_ref( $valid ), var_export( $valid, true ) );
		}

		foreach ( array( -1, '', '-1', '../0', 'has space', str_repeat( 'a', 65 ), array( '0' ), null, 1.5 ) as $invalid ) {
			$this->assertFalse( bibliography_builder_is_block_ref( $invalid ), var_export( $invalid, true ) );
		}
	}

	public function test_all_digit_bibliography_ids_are_not_advertised(): void {
		$this->assertNull( bibliography_builder_get_stable_block_id( array( 'bibliographyId' => '1' ) ) );
		$this->assertNull( bibliography_builder_get_stable_block_id( array( 'bibliographyId' => "abc\n" ) ) );
		$this->assertSame( '1a', bibliography_builder_get_stable_block_id( array( 'bibliographyId' => '1a' ) ) );
		$this->assertFalse( bibliography_builder_is_block_ref( "abc\n" ) );
		$this->assertTrue( bibliography_builder_is_block_ref( 2 ) );
	}

	public function test_duplicate_years_compare_like_strict_javascript_equality(): void {
		$keys = static function ( array $csl ) {
			return bibliography_builder_get_duplicate_keys( array( 'csl' => $csl ) );
		};
		$book = static function ( $year, $family ) {
			$csl = array(
				'title'  => 'Same',
				'author' => array( array( 'family' => $family ) ),
			);

			if ( null !== $year ) {
				$csl['issued'] = array( 'date-parts' => array( array( $year ) ) );
			}

			return $csl;
		};

		// 2020 === "2020" is false in JS, so different first authors mean no match.
		$this->assertNull( bibliography_builder_get_duplicate_reason( $keys( $book( 2020, 'A' ) ), $keys( $book( '2020', 'B' ) ) ) );
		// A number decoded as int or float is still the same number.
		$this->assertSame( 'title-year', bibliography_builder_get_duplicate_reason( $keys( $book( 2020, 'A' ) ), $keys( $book( 2020.0, 'B' ) ) ) );
		// A year of 0 counts as missing (`|| null`).
		$this->assertSame(
			'title',
			bibliography_builder_get_duplicate_reason(
				$keys( array( 'title' => 'Same', 'issued' => array( 'date-parts' => array( array( 0 ) ) ) ) ),
				$keys( array( 'title' => 'Same' ) )
			)
		);
		// A family name of "0" is truthy in JS and is used.
		$this->assertSame( 'title-author', bibliography_builder_get_duplicate_reason( $keys( $book( 1999, '0' ) ), $keys( $book( 2001, '0' ) ) ) );
	}

	public function test_isbn_check_accepts_lists_and_spaced_isbns(): void {
		foreach ( array( '9780306406157 0306406152', '0-306-40615-2 978-0-306-40615-7', 'ISBN 978 0 306 40615 7', '978-0-306-40615-7 (pbk.); 0306406152', array( 'bad', '0306406152' ) ) as $value ) {
			$this->assertTrue( bibliography_builder_has_valid_isbn( $value ), var_export( $value, true ) );
		}

		foreach ( array( '1234567890', '978 1234', '', array() ) as $value ) {
			$this->assertFalse( bibliography_builder_has_valid_isbn( $value ), var_export( $value, true ) );
		}
	}

	public function test_doi_check_accepts_common_prefixes_and_dotted_registrants(): void {
		$codes = static function ( $doi ) {
			$issues = bibliography_builder_validate_citation(
				array(
					'id'  => 'x',
					'csl' => array(
						'type'   => 'book',
						'title'  => 'T',
						'DOI'    => $doi,
						'author' => array( array( 'family' => 'F' ) ),
						'issued' => array( 'date-parts' => array( array( 2000 ) ) ),
					),
				)
			);

			return array_column( $issues, 'code' );
		};

		foreach ( array( '10.1000/xyz', 'doi:10.1000/xyz', 'DOI: 10.1000/xyz', 'https://www.doi.org/10.1000/xyz', 'https://dx.doi.org/10.1000/xyz', '10.1000.10/abc' ) as $doi ) {
			$this->assertSame( array(), $codes( $doi ), $doi );
		}

		$this->assertSame( array( 'empty-doi' ), $codes( '' ) );
		$this->assertSame( array( 'malformed-doi' ), $codes( '10.12/short-prefix' ) );
		$this->assertSame( array( 'malformed-doi' ), $codes( 'not a doi' ) );
	}

	public function test_blank_literal_and_raw_dates_count_as_missing(): void {
		foreach ( array( array( 'literal' => '' ), array( 'raw' => '   ' ) ) as $issued ) {
			$issues = bibliography_builder_validate_citation(
				array(
					'id'  => 'x',
					'csl' => array(
						'type'   => 'book',
						'title'  => 'T',
						'author' => array( array( 'family' => 'F' ) ),
						'issued' => $issued,
					),
				)
			);

			$this->assertContains( 'missing-issued', array_column( $issues, 'code' ), wp_json_encode( $issued ) );
		}

		$this->assertTrue( bibliography_builder_has_usable_date( array( 'literal' => 'c. 1850' ) ) );
		$this->assertTrue( bibliography_builder_has_usable_date( array( 'date-parts' => array( array( 2001 ) ) ) ) );
	}
}

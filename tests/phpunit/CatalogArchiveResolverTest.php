<?php

use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

/**
 * Library catalog (OCLC, LCCN, Open Library edition) and Internet Archive
 * resolvers in includes/resolvers.php.
 *
 * The Internet Archive fixture is the real metadata of
 * https://archive.org/details/limitstomedicine00illi, trimmed to the fields
 * the mapping reads plus the ones it must ignore (`oclc-id`,
 * `related-external-id`, which name other editions).
 */
final class CatalogArchiveResolverTest extends TestCase {
	protected function setUp(): void {
		parent::setUp();
		bibliography_builder_test_reset_state();
	}

	private static function json_ok( $data ): array {
		return array(
			'response' => array( 'code' => 200 ),
			'body'     => is_string( $data ) ? $data : wp_json_encode( $data ),
		);
	}

	private static function archive_metadata( array $overrides = array() ): array {
		return array(
			'metadata' => array_merge(
				array(
					'identifier'          => 'limitstomedicine00illi',
					'mediatype'           => 'texts',
					'title'               => 'Limits to medicine : medical nemesis : the expropriation of health',
					'creator'             => array(
						'Illich, Ivan, 1926-2002',
						'Illich, Ivan, 1926-2002. Medical nemesis',
					),
					'publisher'           => 'Harmondsworth ; New York : Penguin',
					'date'                => '1977',
					'city'                => 'Harmondsworth',
					'edition'             => '[New ed.].',
					'isbn'                => array( '0140220097', '9780140220094' ),
					'lccn'                => '78315129',
					'openlibrary_edition' => 'OL4288142M',
					'oclc-id'             => array( '4134656', '466870724' ),
					'related-external-id' => array( 'urn:isbn:0714525138', 'urn:oclc:223287242' ),
					'identifier-ark'      => 'ark:/13960/t6k09s648',
				),
				$overrides
			),
		);
	}

	private static function books_api_record( $key ): array {
		return array(
			$key => array(
				'key'             => '/books/OL4288142M',
				'title'           => 'Limits to medicine',
				'subtitle'        => 'medical nemesis : the expropriation of health',
				'authors'         => array(
					array(
						'url'  => 'http://openlibrary.org/authors/OL428194A/Ivan_Illich',
						'name' => 'Ivan Illich',
					),
				),
				'publishers'      => array( array( 'name' => 'Penguin' ) ),
				'publish_places'  => array( array( 'name' => 'Harmondsworth' ), array( 'name' => 'New York' ) ),
				'publish_date'    => '1977',
				'number_of_pages' => 296,
				'identifiers'     => array(
					'isbn_10'     => array( '0140220097' ),
					'lccn'        => array( '78315129' ),
					'openlibrary' => array( 'OL4288142M' ),
				),
			),
		);
	}

	private static function request( $route, $id ): WP_REST_Request {
		$request       = new WP_REST_Request( 'GET', '/bibliography/v1/' . $route );
		$request['id'] = $id;

		return $request;
	}

	#[DataProvider( 'catalog_key_cases' )]
	public function test_catalog_keys_are_normalized( $input, $expected ): void {
		$this->assertSame( $expected, bibliography_builder_normalize_catalog_key( $input ) );
	}

	public static function catalog_key_cases(): array {
		return array(
			'OCLC label'             => array( 'OCLC 2121853', 'OCLC:2121853' ),
			'OCLC colon'             => array( 'oclc:2121853', 'OCLC:2121853' ),
			'OCLC number label'      => array( 'OCLC no. 2121853', 'OCLC:2121853' ),
			'OCoLC MARC prefix'      => array( '(OCoLC)ocm02121853', 'OCLC:2121853' ),
			'OCLC URN'               => array( 'urn:oclc:record:1035892241', 'OCLC:1035892241' ),
			'LCCN hyphenated'        => array( 'LCCN 76-28766', 'LCCN:76028766' ),
			'LCCN normalized'        => array( 'LCCN:78315129', 'LCCN:78315129' ),
			'LCCN with prefix'       => array( 'LCCN n 78-890351', 'LCCN:n78890351' ),
			'LCCN with revision'     => array( 'LCCN 76028766/r85', 'LCCN:76028766' ),
			'Open Library edition'   => array( 'OL4288142M', 'OLID:OL4288142M' ),
			'labelled edition'       => array( 'olid:ol4288142m', 'OLID:OL4288142M' ),
			'Open Library work'      => array( 'OL2848897W', '' ),
			'bare number'            => array( '2121853', '' ),
			'zero OCLC'              => array( 'OCLC 0', '' ),
			'short LCCN'             => array( 'LCCN 12', '' ),
			'array'                  => array( array( 'OCLC 1' ), '' ),
			'injected path'          => array( 'OCLC:1/../../x', '' ),
		);
	}

	public function test_catalog_route_maps_the_books_api_record_to_a_csl_book(): void {
		bibliography_builder_test_set_http_response_for(
			'openlibrary.org/api/books',
			self::json_ok( self::books_api_record( 'LCCN:78315129' ) )
		);

		$data = bibliography_builder_rest_resolve_catalog( self::request( 'catalog', 'LCCN 78315129' ) )->get_data();

		$this->assertSame(
			array(
				'type'            => 'book',
				'title'           => 'Limits to medicine: medical nemesis: the expropriation of health',
				'author'          => array(
					array(
						'family' => 'Illich',
						'given'  => 'Ivan',
					),
				),
				'publisher'       => 'Penguin',
				'publisher-place' => 'Harmondsworth',
				'issued'          => array( 'date-parts' => array( array( 1977 ) ) ),
				'number-of-pages' => '296',
				'ISBN'            => '9780140220094',
			),
			$data
		);

		$requests = bibliography_builder_test_get_http_requests();
		$this->assertCount( 1, $requests );
		$this->assertSame( 'wp_safe_remote_get', $requests[0]['function'] );
		$this->assertSame(
			BIBLIOGRAPHY_BUILDER_OPEN_LIBRARY_HOST . '/api/books?bibkeys=LCCN%3A78315129&format=json&jscmd=data',
			$requests[0]['url']
		);

		bibliography_builder_rest_resolve_catalog( self::request( 'catalog', 'LCCN 78-315129' ) );
		$this->assertCount( 1, bibliography_builder_test_get_http_requests(), 'Equivalent LCCN forms share one cached result.' );
	}

	public function test_catalog_route_reports_an_unknown_key_as_not_found(): void {
		bibliography_builder_test_set_http_response_for( 'openlibrary.org/api/books', self::json_ok( '{}' ) );

		$result = bibliography_builder_rest_resolve_catalog( self::request( 'catalog', 'OCLC 2121853' ) );

		$this->assertInstanceOf( WP_Error::class, $result );
		$this->assertSame( 'bibliography_builder_catalog_not_found', $result->get_error_code() );
		$this->assertSame( 404, $result->get_error_data()['status'] );
	}

	public function test_catalog_route_rejects_invalid_input_without_a_request(): void {
		$result = bibliography_builder_rest_resolve_catalog( self::request( 'catalog', 'OL2848897W' ) );

		$this->assertInstanceOf( WP_Error::class, $result );
		$this->assertSame( 'bibliography_builder_catalog_invalid', $result->get_error_code() );
		$this->assertSame( array(), bibliography_builder_test_get_http_requests() );
	}

	#[DataProvider( 'archive_id_cases' )]
	public function test_archive_ids_are_validated( $input, $expected ): void {
		$this->assertSame( $expected, bibliography_builder_normalize_archive_id( $input ) );
	}

	public static function archive_id_cases(): array {
		return array(
			'identifier'      => array( 'limitstomedicine00illi', 'limitstomedicine00illi' ),
			'dots and dashes' => array( 'gov.uscourts.dcd.223205', 'gov.uscourts.dcd.223205' ),
			'ARK'             => array( 'ark:/13960/t6k09s648', 'ark:/13960/t6k09s648' ),
			'ARK upper case'  => array( 'ARK:/13960/T6K09S648', 'ark:/13960/t6k09s648' ),
			'other NAAN'      => array( 'ark:/12345/t6k09s648', '' ),
			'traversal'       => array( '../metadata', '' ),
			'slash'           => array( 'a/b', '' ),
			'too long'        => array( str_repeat( 'a', 101 ), '' ),
			'empty'           => array( '', '' ),
			'array'           => array( array( 'abc' ), '' ),
		);
	}

	public function test_archive_item_prefers_its_open_library_edition_and_keeps_the_archive_url(): void {
		bibliography_builder_test_set_http_response_for( 'archive.org/metadata/', self::json_ok( self::archive_metadata() ) );
		bibliography_builder_test_set_http_response_for(
			'openlibrary.org/api/books',
			self::json_ok( self::books_api_record( 'OLID:OL4288142M' ) )
		);

		$data = bibliography_builder_rest_resolve_archive( self::request( 'archive', 'limitstomedicine00illi' ) )->get_data();

		$this->assertSame( 'Limits to medicine: medical nemesis: the expropriation of health', $data['title'] );
		$this->assertSame(
			array(
				array(
					'family' => 'Illich',
					'given'  => 'Ivan',
				),
			),
			$data['author']
		);
		$this->assertSame( 'Penguin', $data['publisher'] );
		$this->assertSame( 'Harmondsworth', $data['publisher-place'] );
		$this->assertSame( '296', $data['number-of-pages'] );
		$this->assertSame( 'New ed.', $data['edition'], 'The scan supplies the edition statement Open Library leaves out.' );
		$this->assertSame( 'https://archive.org/details/limitstomedicine00illi', $data['URL'] );

		$requests = bibliography_builder_test_get_http_requests();
		$this->assertCount( 2, $requests );
		$this->assertSame( BIBLIOGRAPHY_BUILDER_INTERNET_ARCHIVE_HOST . '/metadata/limitstomedicine00illi', $requests[0]['url'] );
		$this->assertStringContainsString( 'bibkeys=OLID%3AOL4288142M', $requests[1]['url'] );
	}

	public function test_archive_item_falls_back_to_its_isbn_when_open_library_lacks_the_edition(): void {
		bibliography_builder_test_set_http_response_for( 'archive.org/metadata/', self::json_ok( self::archive_metadata() ) );
		bibliography_builder_test_set_http_response_for( 'openlibrary.org/api/books', self::json_ok( '{}' ) );
		bibliography_builder_test_set_http_response_for(
			'openlibrary.org/isbn/',
			self::json_ok(
				array(
					'title'          => 'Limits to medicine',
					'publishers'     => array( 'Penguin' ),
					'publish_places' => array( 'Harmondsworth' ),
					'publish_date'   => '1977',
				)
			)
		);
		bibliography_builder_test_set_http_response_for(
			'openlibrary.org/search.json',
			self::json_ok( array( 'docs' => array( array( 'author_name' => array( 'Ivan Illich' ) ) ) ) )
		);

		$data = bibliography_builder_rest_resolve_archive( self::request( 'archive', 'limitstomedicine00illi' ) )->get_data();

		$this->assertSame( 'Limits to medicine', $data['title'] );
		$this->assertSame( '9780140220094', $data['ISBN'] );
		$this->assertSame( 'https://archive.org/details/limitstomedicine00illi', $data['URL'] );

		$urls = array_column( bibliography_builder_test_get_http_requests(), 'url' );
		$this->assertStringContainsString( 'bibkeys=OLID%3AOL4288142M', $urls[1] );
		$this->assertSame( BIBLIOGRAPHY_BUILDER_OPEN_LIBRARY_HOST . '/isbn/9780140220094.json', $urls[2] );
		$this->assertCount( 4, $urls, 'The LCCN is not tried once the ISBN resolves.' );
	}

	public function test_archive_item_without_catalog_ids_maps_its_own_metadata(): void {
		bibliography_builder_test_set_http_response_for(
			'archive.org/metadata/',
			self::json_ok(
				self::archive_metadata(
					array(
						'isbn'                => array(),
						'lccn'                => '',
						'openlibrary_edition' => '',
					)
				)
			)
		);

		$data = bibliography_builder_rest_resolve_archive( self::request( 'archive', 'limitstomedicine00illi' ) )->get_data();

		$this->assertSame(
			array(
				'type'            => 'book',
				'title'           => 'Limits to medicine: medical nemesis: the expropriation of health',
				'URL'             => 'https://archive.org/details/limitstomedicine00illi',
				'author'          => array(
					array(
						'family' => 'Illich',
						'given'  => 'Ivan',
					),
				),
				'publisher-place' => 'Harmondsworth',
				'publisher'       => 'Penguin',
				'issued'          => array( 'date-parts' => array( array( 1977 ) ) ),
				'edition'         => 'New ed.',
			),
			$data
		);
		$this->assertCount( 1, bibliography_builder_test_get_http_requests(), 'Other editions\' OCLC numbers are never looked up.' );
	}

	public function test_archive_item_keeps_its_own_metadata_when_every_catalog_lookup_fails(): void {
		bibliography_builder_test_set_http_response_for( 'archive.org/metadata/', self::json_ok( self::archive_metadata() ) );
		bibliography_builder_test_set_http_response_for(
			'openlibrary.org',
			array(
				'response' => array( 'code' => 503 ),
				'body'     => '',
			)
		);
		bibliography_builder_test_set_http_response_for(
			'googleapis.com',
			array(
				'response' => array( 'code' => 503 ),
				'body'     => '',
			)
		);

		$data = bibliography_builder_rest_resolve_archive( self::request( 'archive', 'limitstomedicine00illi' ) )->get_data();

		$this->assertSame( 'Penguin', $data['publisher'] );
		$this->assertSame( '9780140220094', $data['ISBN'] );
		$this->assertSame( 'https://archive.org/details/limitstomedicine00illi', $data['URL'] );
	}

	public function test_archive_creator_headings_and_publication_statements(): void {
		$this->assertSame(
			array(
				'family' => 'Illich',
				'given'  => 'Ivan',
			),
			bibliography_builder_archive_creator_to_name( 'Illich, Ivan, 1926-2002. Medical nemesis' )
		);
		$this->assertSame(
			array(
				'family' => 'Woolf',
				'given'  => 'Virginia',
			),
			bibliography_builder_archive_creator_to_name( 'Woolf, Virginia, b. 1882, author.' )
		);
		$this->assertSame(
			array( 'literal' => 'Royal Society of London' ),
			bibliography_builder_archive_creator_to_name( 'Royal Society of London' )
		);
		$this->assertSame(
			array(
				'publisher-place' => 'London',
				'publisher'       => 'Calder & Boyars',
			),
			bibliography_builder_split_publication_statement( '[London] : Calder & Boyars ; New York : Pantheon' )
		);
		$this->assertSame(
			array( 'publisher' => 'Penguin' ),
			bibliography_builder_split_publication_statement( 'Penguin.' )
		);
	}

	public function test_archive_ark_is_resolved_to_the_item_through_advanced_search(): void {
		bibliography_builder_test_set_http_response_for(
			'archive.org/advancedsearch.php',
			self::json_ok(
				array(
					'response' => array(
						'numFound' => 1,
						'docs'     => array( array( 'identifier' => 'limitstomedicine00illi' ) ),
					),
				)
			)
		);
		bibliography_builder_test_set_http_response_for(
			'archive.org/metadata/',
			self::json_ok(
				self::archive_metadata(
					array(
						'isbn'                => array(),
						'lccn'                => '',
						'openlibrary_edition' => '',
					)
				)
			)
		);

		$data = bibliography_builder_rest_resolve_archive( self::request( 'archive', 'ark:/13960/t6k09s648' ) )->get_data();

		$this->assertSame( 'https://archive.org/details/limitstomedicine00illi', $data['URL'] );

		$urls = array_column( bibliography_builder_test_get_http_requests(), 'url' );
		$this->assertStringContainsString( 'q=identifier-ark%3A%22ark%3A%2F13960%2Ft6k09s648%22', $urls[0] );
		$this->assertSame( BIBLIOGRAPHY_BUILDER_INTERNET_ARCHIVE_HOST . '/metadata/limitstomedicine00illi', $urls[1] );
	}

	public function test_unknown_archive_item_and_ark_are_not_found(): void {
		bibliography_builder_test_set_http_response_for( 'archive.org/metadata/', self::json_ok( '{}' ) );
		bibliography_builder_test_set_http_response_for(
			'archive.org/advancedsearch.php',
			self::json_ok( array( 'response' => array( 'numFound' => 0, 'docs' => array() ) ) )
		);

		foreach ( array( 'no-such-item-here', 'ark:/13960/t0000000' ) as $id ) {
			$result = bibliography_builder_rest_resolve_archive( self::request( 'archive', $id ) );

			$this->assertInstanceOf( WP_Error::class, $result, $id );
			$this->assertSame( 'bibliography_builder_archive_not_found', $result->get_error_code(), $id );
			$this->assertSame( 404, $result->get_error_data()['status'], $id );
		}
	}

	public function test_archive_route_rejects_invalid_input_without_a_request(): void {
		$result = bibliography_builder_rest_resolve_archive( self::request( 'archive', '../../wp-config' ) );

		$this->assertInstanceOf( WP_Error::class, $result );
		$this->assertSame( 'bibliography_builder_archive_invalid', $result->get_error_code() );
		$this->assertSame( array(), bibliography_builder_test_get_http_requests() );
	}

	public function test_archive_resolver_requires_editor_capability(): void {
		$forbidden = bibliography_builder_rest_archive_permissions_check();

		$this->assertInstanceOf( WP_Error::class, $forbidden );
		$this->assertSame( 'bibliography_builder_archive_forbidden', $forbidden->get_error_code() );

		bibliography_builder_test_grant_cap( 7, 'edit_posts', 0 );
		bibliography_builder_test_set_current_user( 7 );

		$this->assertTrue( bibliography_builder_rest_archive_permissions_check() );
	}
}

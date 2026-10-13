<?php

use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\Attributes\PreserveGlobalState;
use PHPUnit\Framework\Attributes\RunInSeparateProcess;
use PHPUnit\Framework\TestCase;

/**
 * Optional Google Books API key for the ISBN fallback.
 *
 * @package BibliographyBuilder
 */
class GoogleBooksKeyTest extends TestCase {
	protected function setUp(): void {
		parent::setUp();
		bibliography_builder_test_reset_state();
	}

	/**
	 * Resolve an ISBN that Open Library lacks, so the lookup reaches Google Books.
	 *
	 * @return string[] Every requested URL, in order.
	 */
	private static function resolve_through_google_books(): array {
		bibliography_builder_test_set_http_response_for(
			'openlibrary.org',
			array(
				'response' => array( 'code' => 404 ),
				'body'     => '',
			)
		);
		bibliography_builder_test_set_http_response_for(
			'googleapis.com',
			array(
				'response' => array( 'code' => 200 ),
				'body'     => '{"totalItems":0}',
			)
		);

		$request         = new WP_REST_Request( 'GET', '/bibliography/v1/isbn/9780140328721' );
		$request['isbn'] = '9780140328721';
		bibliography_builder_rest_resolve_isbn( $request );

		return array_column( bibliography_builder_test_get_http_requests(), 'url' );
	}

	public function test_google_books_is_called_without_a_key_by_default(): void {
		$urls = self::resolve_through_google_books();
		$last = (string) end( $urls );

		$this->assertStringStartsWith( BIBLIOGRAPHY_BUILDER_GOOGLE_BOOKS_API, $last );
		$this->assertStringNotContainsString( 'key=', $last );
	}

	public function test_a_filtered_key_is_sent_to_google_books_only(): void {
		add_filter(
			'bibliography_builder_google_books_api_key',
			static function () {
				return 'AIzaSyExample_Key-123';
			}
		);

		$urls = self::resolve_through_google_books();

		$this->assertStringEndsWith( '&key=AIzaSyExample_Key-123', (string) end( $urls ) );
		foreach ( $urls as $url ) {
			if ( false === strpos( $url, 'googleapis.com' ) ) {
				$this->assertStringNotContainsString( 'AIzaSyExample', $url );
			}
		}
	}

	#[DataProvider( 'sanitize_cases' )]
	public function test_keys_are_reduced_to_api_key_characters( $input, string $expected ): void {
		$this->assertSame( $expected, bibliography_builder_sanitize_google_books_api_key( $input ) );
	}

	public static function sanitize_cases(): array {
		return array(
			'plain key'         => array( 'AIzaSyA-b_C123', 'AIzaSyA-b_C123' ),
			'pasted whitespace' => array( "  AIzaSy123 \n", 'AIzaSy123' ),
			'injected query'    => array( 'abc&q=evil#x', 'abcqevilx' ),
			'non-string'        => array( array( 'abc' ), '' ),
			'too long'          => array( str_repeat( 'a', 150 ), str_repeat( 'a', 100 ) ),
		);
	}

	#[RunInSeparateProcess]
	#[PreserveGlobalState( false )]
	public function test_the_constant_supplies_the_key_and_the_filter_sees_it(): void {
		define( 'BIBLIOGRAPHY_BUILDER_GOOGLE_BOOKS_API_KEY', ' from-constant ' );

		$this->assertSame( 'from-constant', bibliography_builder_google_books_api_key() );

		add_filter(
			'bibliography_builder_google_books_api_key',
			static function ( $key ) {
				return ' from-constant ' === $key ? 'replaced' : 'unexpected';
			}
		);

		$this->assertSame( 'replaced', bibliography_builder_google_books_api_key() );
	}
}

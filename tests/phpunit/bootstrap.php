<?php

if ( ! defined( 'ABSPATH' ) ) {
	define( 'ABSPATH', __DIR__ . '/../../' );
}

$GLOBALS['bibliography_builder_test_posts']           = array();
$GLOBALS['bibliography_builder_test_parsed_blocks']   = array();
$GLOBALS['bibliography_builder_test_current_user_id'] = 0;
$GLOBALS['bibliography_builder_test_user_caps']       = array();
$GLOBALS['bibliography_builder_test_rest_routes']     = array();
$GLOBALS['bibliography_builder_test_password_posts']  = array();
$GLOBALS['bibliography_builder_test_registered_block_types'] = array();
$GLOBALS['bibliography_builder_test_registered_scripts'] = array();
$GLOBALS['bibliography_builder_test_enqueued_scripts']   = array();
$GLOBALS['bibliography_builder_test_added_actions']      = array();
$GLOBALS['bibliography_builder_test_http_response']      = null;
$GLOBALS['bibliography_builder_test_http_requests']      = array();
$GLOBALS['bibliography_builder_test_transients']          = array();
$GLOBALS['bibliography_builder_test_object_cache']        = array();
$GLOBALS['bibliography_builder_test_using_ext_object_cache'] = false;
$GLOBALS['bibliography_builder_test_bac_register_calls']  = array();

function bibliography_builder_test_reset_state() {
	$GLOBALS['bibliography_builder_test_posts']           = array();
	$GLOBALS['bibliography_builder_test_parsed_blocks']   = array();
	$GLOBALS['bibliography_builder_test_current_user_id'] = 0;
	$GLOBALS['bibliography_builder_test_user_caps']       = array();
	$GLOBALS['bibliography_builder_test_rest_routes']     = array();
	$GLOBALS['bibliography_builder_test_password_posts']  = array();
	$GLOBALS['bibliography_builder_test_registered_block_types'] = array();
	$GLOBALS['bibliography_builder_test_registered_scripts'] = array();
	$GLOBALS['bibliography_builder_test_enqueued_scripts']   = array();
	$GLOBALS['bibliography_builder_test_http_response']      = null;
	$GLOBALS['bibliography_builder_test_http_requests']      = array();
	$GLOBALS['bibliography_builder_test_transients']          = array();
	$GLOBALS['bibliography_builder_test_object_cache']        = array();
	$GLOBALS['bibliography_builder_test_using_ext_object_cache'] = false;
	$GLOBALS['bibliography_builder_test_bac_register_calls']  = array();
}

function bibliography_builder_test_set_post( $post_id, $status, $content, $password_required = false ) {
	$GLOBALS['bibliography_builder_test_posts'][ $post_id ] = (object) array(
		'ID'           => $post_id,
		'post_status'  => $status,
		'post_content' => $content,
	);

	if ( $password_required ) {
		$GLOBALS['bibliography_builder_test_password_posts'][ $post_id ] = true;
	}
}

function bibliography_builder_test_set_parsed_blocks( $content, $blocks ) {
	$GLOBALS['bibliography_builder_test_parsed_blocks'][ $content ] = $blocks;
}

function bibliography_builder_test_grant_cap( $user_id, $capability, $object_id ) {
	$GLOBALS['bibliography_builder_test_user_caps'][ $user_id ][ $capability ][ $object_id ] = true;
}

function bibliography_builder_test_set_current_user( $user_id ) {
	$GLOBALS['bibliography_builder_test_current_user_id'] = $user_id;
}

function bibliography_builder_test_set_http_response( $response ) {
	$GLOBALS['bibliography_builder_test_http_response'] = $response;
}

function bibliography_builder_test_get_http_requests() {
	return $GLOBALS['bibliography_builder_test_http_requests'];
}

function get_transient( $key ) {
	return $GLOBALS['bibliography_builder_test_transients'][ $key ]['value'] ?? false;
}

function set_transient( $key, $value, $expiration = 0 ) {
	$GLOBALS['bibliography_builder_test_transients'][ $key ] = array(
		'value'      => $value,
		'expiration' => $expiration,
	);

	return true;
}

function bibliography_builder_test_use_ext_object_cache( $enabled ) {
	$GLOBALS['bibliography_builder_test_using_ext_object_cache'] = (bool) $enabled;
}

function wp_using_ext_object_cache() {
	return $GLOBALS['bibliography_builder_test_using_ext_object_cache'];
}

function wp_cache_get( $key, $group = '', $force = false, &$found = null ) {
	if ( isset( $GLOBALS['bibliography_builder_test_object_cache'][ $group ][ $key ] ) ) {
		$found = true;
		return $GLOBALS['bibliography_builder_test_object_cache'][ $group ][ $key ]['value'];
	}

	$found = false;
	return false;
}

function wp_cache_set( $key, $value, $group = '', $expiration = 0 ) {
	$GLOBALS['bibliography_builder_test_object_cache'][ $group ][ $key ] = array(
		'value'      => $value,
		'expiration' => $expiration,
	);

	return true;
}

function add_action( $hook_name = '', $callback = null, $priority = 10, $accepted_args = 1 ) {
	$GLOBALS['bibliography_builder_test_added_actions'][] = array(
		'hook_name'     => $hook_name,
		'callback'      => $callback,
		'priority'      => $priority,
		'accepted_args' => $accepted_args,
	);

	return true;
}

function add_filter() {}

function ba11yc_register_block_check( $block_type, $args ) {
	$GLOBALS['bibliography_builder_test_bac_register_calls'][] = array(
		'block_type' => $block_type,
		'args'       => $args,
	);
}

function register_block_type( $block_type ) {
	$GLOBALS['bibliography_builder_test_registered_block_types'][] = $block_type;
}

function wp_script_is( $handle, $status = 'enqueued' ) {
	return ! empty( $GLOBALS['bibliography_builder_test_registered_scripts'][ $handle ][ $status ] );
}

function wp_enqueue_script( $handle, $src = '', $deps = array(), $ver = false, $args = array() ) {
	$GLOBALS['bibliography_builder_test_enqueued_scripts'][ $handle ] = array(
		'src'  => $src,
		'deps' => $deps,
		'ver'  => $ver,
		'args' => $args,
	);
}

function plugins_url( $path = '', $plugin = '' ) {
	return 'https://example.org/wp-content/plugins/borges-bibliography-builder/' . ltrim( $path, '/' );
}

function register_rest_route( $namespace, $route, $args ) {
	$GLOBALS['bibliography_builder_test_rest_routes'][] = array(
		'namespace' => $namespace,
		'route'     => $route,
		'args'      => $args,
	);
}

function parse_blocks( $content ) {
	return $GLOBALS['bibliography_builder_test_parsed_blocks'][ $content ] ?? array();
}

function get_post( $post_id ) {
	return $GLOBALS['bibliography_builder_test_posts'][ $post_id ] ?? null;
}

function get_post_status( $post ) {
	return is_object( $post ) ? $post->post_status : null;
}

function current_user_can( $capability, $object_id = 0 ) {
	$user_id = $GLOBALS['bibliography_builder_test_current_user_id'];
	return ! empty( $GLOBALS['bibliography_builder_test_user_caps'][ $user_id ][ $capability ][ $object_id ] );
}

function post_password_required( $post = null ) {
	$post_id = is_object( $post ) ? $post->ID : (int) $post;
	return ! empty( $GLOBALS['bibliography_builder_test_password_posts'][ $post_id ] );
}

function is_wp_error( $thing ) {
	return $thing instanceof WP_Error;
}

function absint( $value ) {
	return abs( (int) $value );
}

function sanitize_key( $value ) {
	return strtolower( preg_replace( '/[^a-z0-9_\-]/', '', (string) $value ) );
}

function __( $text ) {
	return $text;
}

function wp_strip_all_tags( $text ) {
	return strip_tags( (string) $text );
}

function wp_json_encode( $data, $flags = 0, $depth = 512 ) {
	return json_encode( $data, $flags, $depth );
}

function add_query_arg( $args, $url ) {
	$separator = false === strpos( $url, '?' ) ? '?' : '&';
	return $url . $separator . http_build_query( $args, '', '&', PHP_QUERY_RFC3986 );
}

function wp_remote_get( $url, $args = array() ) {
	$GLOBALS['bibliography_builder_test_http_requests'][] = array(
		'url'  => $url,
		'args' => $args,
	);

	if ( null === $GLOBALS['bibliography_builder_test_http_response'] ) {
		return new WP_Error( 'http_request_failed', 'No test HTTP response configured.' );
	}

	return $GLOBALS['bibliography_builder_test_http_response'];
}

function wp_remote_retrieve_response_code( $response ) {
	return isset( $response['response']['code'] ) ? (int) $response['response']['code'] : 0;
}

function wp_remote_retrieve_body( $response ) {
	return isset( $response['body'] ) ? (string) $response['body'] : '';
}

function rest_ensure_response( $response ) {
	if ( $response instanceof WP_REST_Response ) {
		return $response;
	}

	return new WP_REST_Response( $response, 200 );
}

class WP_Error {
	public $errors = array();
	public $error_data = array();

	public function __construct( $code = '', $message = '', $data = null ) {
		if ( $code ) {
			$this->errors[ $code ]   = array( $message );
			$this->error_data[ $code ] = $data;
		}
	}

	public function get_error_code() {
		return array_key_first( $this->errors );
	}

	public function get_error_message() {
		$code = $this->get_error_code();
		return $code ? $this->errors[ $code ][0] : '';
	}

	public function get_error_data() {
		$code = $this->get_error_code();
		return $code ? $this->error_data[ $code ] : null;
	}
}

class WP_REST_Request implements ArrayAccess {
	private $method;
	private $route;
	private $params = array();
	private $json_params = array();
	private $body = '';

	public function __construct( $method = 'GET', $route = '/' ) {
		$this->method = $method;
		$this->route  = $route;
	}

	public function set_query_params( $params ) {
		$this->params = array_merge( $this->params, $params );
	}

	public function get_param( $key ) {
		return $this->params[ $key ] ?? null;
	}

	public function set_body_params( $params ) {
		$this->json_params = $params;
		$this->params      = array_merge( $this->params, $params );
		$this->body        = json_encode( $params );
	}

	public function get_json_params() {
		return $this->json_params;
	}

	public function get_body() {
		return $this->body;
	}

	public function get_route() {
		return $this->route;
	}

	public function offsetExists( $offset ): bool {
		return isset( $this->params[ $offset ] );
	}

	#[\ReturnTypeWillChange]
	public function offsetGet( $offset ) {
		return $this->params[ $offset ] ?? null;
	}

	public function offsetSet( $offset, $value ): void {
		$this->params[ $offset ] = $value;
	}

	public function offsetUnset( $offset ): void {
		unset( $this->params[ $offset ] );
	}
}

class WP_REST_Response {
	private $data;
	private $status;
	private $headers = array();

	public function __construct( $data = null, $status = 200 ) {
		$this->data   = $data;
		$this->status = $status;
	}

	public function get_data() {
		return $this->data;
	}

	public function get_status() {
		return $this->status;
	}

	public function header( $key, $value ) {
		$this->headers[ $key ] = $value;
	}

	public function get_headers() {
		return $this->headers;
	}
}

class WP_REST_Server {
	const READABLE = 'GET';
	const CREATABLE = 'POST';

	public $sent_headers = array();

	public function send_header( $key, $value ) {
		$this->sent_headers[ $key ] = $value;
	}
}

require_once dirname( __DIR__, 2 ) . '/bibliography-builder.php';

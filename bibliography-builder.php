<?php
/**
 * Plugin Name:       Borges Bibliography Builder
 * Plugin URI:        https://github.com/dknauss/Borges/
 * Description:       Create accessible bibliographies from DOI, PubMed, BibTeX, CSL-JSON, and free text; export RIS.
 * Version:           1.17.0
 * Requires at least: 6.4
 * Tested up to:      7.1
 * Requires PHP:      7.4
 * Author:            Dan Knauss
 * Author URI:        https://dan.knauss.ca/
 * License:           GPL-2.0-or-later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       borges-bibliography-builder
 * Domain Path:       /languages
 *
 * @package BibliographyBuilder
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

if ( ! defined( 'BIBLIOGRAPHY_BUILDER_PLUGIN_DIR' ) ) {
	define( 'BIBLIOGRAPHY_BUILDER_PLUGIN_DIR', __DIR__ . '/' );
}

/**
 * Maximum number of citations that may be formatted in one request.
 *
 * Matches the editor's per-bibliography hard cap (MAX_CITATIONS_PER_BIBLIOGRAPHY
 * in src/lib/citation-limits.js). The editor formats the whole bibliography in
 * one request, since disambiguation depends on every entry, so a lower cap here
 * sends larger bibliographies to the raw-text fallback. citeproc-php formats
 * 200 entries in about 35 ms p95 on one core with a 128 MB memory limit; see
 * docs/planning/large-bibliography-benchmark-results.md.
 */
const BIBLIOGRAPHY_BUILDER_MAX_FORMAT_ITEMS = 200;

/**
 * Maximum formatter request payload size.
 */
const BIBLIOGRAPHY_BUILDER_MAX_FORMAT_BYTES = 1048576;

/**
 * Maximum length of any single CSL string field.
 *
 * Every CSL string field is run through a looped wp_strip_all_tags, and core's
 * lazy script/style-stripping regex degrades to catastrophic backtracking past
 * roughly 600 KB: measured at ~2.4s for 600 KB and ~12.9s for 950 KB of
 * unclosed script tokens. BIBLIOGRAPHY_BUILDER_MAX_FORMAT_BYTES bounds the
 * whole request body, so without a per-field limit a single field can carry the
 * entire megabyte into that regex and pin a CPU core. 64 KB sits an order of
 * magnitude below the cliff while staying far above any real bibliographic
 * value, including long abstracts.
 */
const BIBLIOGRAPHY_BUILDER_MAX_CSL_FIELD_BYTES = 65536;

/**
 * Cache TTL for repeated formatter responses.
 */
const BIBLIOGRAPHY_BUILDER_FORMAT_CACHE_TTL = 3600;

/**
 * Most formatted entries the formatter keeps per citation style, across all
 * lists: two and a half bibliographies at the 200-item `/format` cap.
 */
const BIBLIOGRAPHY_BUILDER_FORMAT_ENTRY_CACHE_LIMIT = 500;

/**
 * Whether the current request may read bibliography data for a post.
 *
 * @param WP_Post $post Post object.
 * @return bool
 */
function bibliography_builder_can_read_post( $post ) {
	$status = get_post_status( $post );

	if ( function_exists( 'post_password_required' ) && post_password_required( $post ) ) {
		return current_user_can( 'edit_post', $post->ID );
	}

	// `publish` alone is not enough: a post type can be registered non-public,
	// in which case core's own REST controllers refuse to expose its content.
	// Without the visibility check, bibliography data stored in such a type was
	// readable by anyone. Fall through to the capability check instead, so an
	// editor still reaches it.
	if ( 'publish' === $status && bibliography_builder_is_post_type_viewable( $post ) ) {
		return true;
	}

	return current_user_can( 'edit_post', $post->ID );
}

/**
 * Whether a post's type is publicly viewable.
 *
 * Wrapped so the check degrades to the previous behaviour rather than fatalling
 * if `is_post_type_viewable()` is unavailable, and so an unregistered type is
 * treated as viewable — matching how ordinary posts behaved before this check
 * existed.
 *
 * @param WP_Post $post Post object.
 * @return bool
 */
function bibliography_builder_is_post_type_viewable( $post ) {
	if ( ! function_exists( 'is_post_type_viewable' ) || ! function_exists( 'get_post_type' ) ) {
		return true;
	}

	$post_type = get_post_type( $post );

	if ( false === $post_type || '' === $post_type || '0' === $post_type ) {
		return true;
	}

	return is_post_type_viewable( $post_type );
}

/**
 * REST permission callback for bibliography access.
 *
 * @param WP_REST_Request $request REST request.
 * @return true|WP_Error
 */
function bibliography_builder_rest_permissions_check( WP_REST_Request $request ) {
	$post_id = absint( $request['post_id'] );
	$post    = get_post( $post_id );

	if ( ! $post ) {
		return new WP_Error(
			'bibliography_builder_post_not_found',
			__( 'Post not found.', 'borges-bibliography-builder' ),
			array( 'status' => 404 )
		);
	}

	if ( bibliography_builder_can_read_post( $post ) ) {
		return true;
	}

	return new WP_Error(
		'bibliography_builder_forbidden',
		__( 'Sorry, you are not allowed to read this bibliography.', 'borges-bibliography-builder' ),
		array( 'status' => 403 )
	);
}

/**
 * Permission callback for editor-only formatter requests.
 *
 * @return true|WP_Error
 */
function bibliography_builder_rest_format_permissions_check() {
	if ( current_user_can( 'edit_posts' ) ) {
		return true;
	}

	return new WP_Error(
		'bibliography_builder_formatter_forbidden',
		__( 'Sorry, you are not allowed to format bibliographies.', 'borges-bibliography-builder' ),
		array( 'status' => 403 )
	);
}

/**
 * Permission callback for editor-only PMID resolver requests.
 *
 * @return true|WP_Error
 */
function bibliography_builder_rest_pmid_permissions_check() {
	if ( current_user_can( 'edit_posts' ) ) {
		return true;
	}

	return new WP_Error(
		'bibliography_builder_pmid_forbidden',
		__( 'Sorry, you are not allowed to resolve PubMed citations.', 'borges-bibliography-builder' ),
		array( 'status' => 403 )
	);
}

/**
 * Permission callback for editor-only arXiv resolver requests.
 *
 * @return true|WP_Error
 */
function bibliography_builder_rest_arxiv_permissions_check() {
	if ( current_user_can( 'edit_posts' ) ) {
		return true;
	}

	return new WP_Error(
		'bibliography_builder_arxiv_forbidden',
		__( 'Sorry, you are not allowed to resolve arXiv citations.', 'borges-bibliography-builder' ),
		array( 'status' => 403 )
	);
}

/**
 * Permission callback for editor-only ISBN resolver requests.
 *
 * @return true|WP_Error
 */
function bibliography_builder_rest_isbn_permissions_check() {
	if ( current_user_can( 'edit_posts' ) ) {
		return true;
	}

	return new WP_Error(
		'bibliography_builder_isbn_forbidden',
		__( 'Sorry, you are not allowed to resolve book citations.', 'borges-bibliography-builder' ),
		array( 'status' => 403 )
	);
}

/**
 * Permission callback for editor-only Internet Archive resolver requests.
 *
 * @return true|WP_Error
 */
function bibliography_builder_rest_archive_permissions_check() {
	if ( current_user_can( 'edit_posts' ) ) {
		return true;
	}

	return new WP_Error(
		'bibliography_builder_archive_forbidden',
		__( 'Sorry, you are not allowed to resolve Internet Archive citations.', 'borges-bibliography-builder' ),
		array( 'status' => 403 )
	);
}

/**
 * Register REST routes.
 *
 * @return void
 */
function bibliography_builder_register_rest_routes() {
	register_rest_route(
		'bibliography/v1',
		'/format',
		array(
			'methods'             => WP_REST_Server::CREATABLE,
			'callback'            => 'bibliography_builder_rest_format_citations',
			'permission_callback' => 'bibliography_builder_rest_format_permissions_check',
		)
	);

	register_rest_route(
		'bibliography/v1',
		'/pmid/(?P<pmid>\d{1,8})',
		array(
			'methods'             => WP_REST_Server::READABLE,
			'callback'            => 'bibliography_builder_rest_resolve_pmid',
			'permission_callback' => 'bibliography_builder_rest_pmid_permissions_check',
			'args'                => array(
				'pmid' => array(
					'description'       => __( 'PubMed ID to resolve to CSL-JSON.', 'borges-bibliography-builder' ),
					'type'              => 'string',
					'required'          => true,
					'sanitize_callback' =>
						/**
						 * Strips non-digits from the PMID parameter.
						 *
						 * @param mixed $value Value to check.
						 * @return string|null
						 */
						static function ( $value ) {
							return preg_replace( '/\D/u', '', (string) $value );
						},
					'validate_callback' =>
						/**
						 * Validates the PMID parameter.
						 *
						 * @param mixed $value Value to check.
						 * @return bool
						 */
						static function ( $value ) {
							return is_scalar( $value ) && (bool) preg_match( '/^\d{1,8}$/', (string) $value );
						},
				),
			),
		)
	);

	$common_args = array(
		'post_id' => array(
			'description'       => __( 'Post ID to inspect for bibliography blocks.', 'borges-bibliography-builder' ),
			'type'              => 'integer',
			'sanitize_callback' => 'absint',
			'validate_callback' =>
				/**
				 * Validates the post ID parameter.
				 *
				 * @param mixed $value Value to check.
				 * @return bool
				 */
				static function ( $value ): bool {
					return is_numeric( $value ) && (int) $value > 0;
				},
		),
	);

	register_rest_route(
		'bibliography/v1',
		'/posts/(?P<post_id>\d+)/bibliographies',
		array(
			'methods'             => WP_REST_Server::READABLE,
			'callback'            => 'bibliography_builder_rest_get_bibliographies',
			'permission_callback' => 'bibliography_builder_rest_permissions_check',
			'args'                => $common_args,
		)
	);

	$format_arg = array(
		'description'       => __(
			'Response format: json, text, or csl-json.',
			'borges-bibliography-builder'
		),
		'type'              => 'string',
		'default'           => 'json',
		'sanitize_callback' =>
			/**
			 * Sanitizes the format parameter.
			 *
			 * @param mixed $value Value to check.
			 * @return string
			 */
			static function ( $value ): string {
				return sanitize_key( $value );
			},
		'validate_callback' =>
			/**
			 * Validates the format parameter.
			 *
			 * @param mixed $value Value to check.
			 * @return bool
			 */
			static function ( $value ): bool {
				return in_array(
					$value,
					array( 'json', 'text', 'csl-json' ),
					true
				);
			},
	);

	register_rest_route(
		'bibliography/v1',
		'/posts/(?P<post_id>\d+)/bibliographies/(?P<index>\d+)',
		array(
			'methods'             => WP_REST_Server::READABLE,
			'callback'            => 'bibliography_builder_rest_get_bibliography',
			'permission_callback' => 'bibliography_builder_rest_permissions_check',
			'args'                => array_merge(
				$common_args,
				array(
					'index'  => array(
						'description'       => __(
							'Zero-based bibliography block index within the post.',
							'borges-bibliography-builder'
						),
						'type'              => 'integer',
						'sanitize_callback' => 'absint',
						'validate_callback' =>
							/**
							 * Validates the bibliography index parameter.
							 *
							 * @param mixed $value Value to check.
							 * @return bool
							 */
							static function ( $value ) {
								return is_numeric( $value ) && (int) $value >= 0;
							},
					),
					'format' => $format_arg,
				)
			),
		)
	);

	register_rest_route(
		'bibliography/v1',
		'/pmcid/(?P<pmcid>(?:PMC)?\d{1,9})',
		array(
			'methods'             => WP_REST_Server::READABLE,
			'callback'            => 'bibliography_builder_rest_resolve_pmcid',
			'permission_callback' => 'bibliography_builder_rest_pmid_permissions_check',
			'args'                => array(
				'pmcid' => array(
					'description'       => __(
						'PubMed Central ID (PMCID) to resolve to CSL-JSON.',
						'borges-bibliography-builder'
					),
					'type'              => 'string',
					'required'          => true,
					'sanitize_callback' =>
						/**
						 * Strips non-digits from the PMCID parameter.
						 *
						 * @param mixed $value Value to check.
						 * @return string|null
						 */
						static function ( $value ) {
							return preg_replace( '/\D/u', '', (string) $value );
						},
					'validate_callback' =>
						/**
						 * Validates the PMCID parameter.
						 *
						 * @param mixed $value Value to check.
						 * @return bool
						 */
						static function ( $value ) {
							return is_scalar( $value ) && (bool) preg_match( '/^(?:PMC)?\d{1,9}$/i', (string) $value );
						},
				),
			),
		)
	);

	register_rest_route(
		'bibliography/v1',
		'/arxiv',
		array(
			'methods'             => WP_REST_Server::READABLE,
			'callback'            => 'bibliography_builder_rest_resolve_arxiv',
			'permission_callback' => 'bibliography_builder_rest_arxiv_permissions_check',
			'args'                => array(
				'id' => array(
					'description'       => __(
						'arXiv ID (modern or legacy, optional version) to resolve to CSL-JSON.',
						'borges-bibliography-builder'
					),
					'type'              => 'string',
					'required'          => true,
					'validate_callback' =>
						/**
						 * Validates the arXiv ID parameter.
						 *
						 * @param mixed $value Value to check.
						 * @return bool
						 */
						static function ( $value ) {
							return '' !== bibliography_builder_normalize_arxiv_id( $value );
						},
				),
			),
		)
	);

	register_rest_route(
		'bibliography/v1',
		'/isbn/(?P<isbn>[0-9]{9}[0-9Xx]|97[89][0-9]{10})',
		array(
			'methods'             => WP_REST_Server::READABLE,
			'callback'            => 'bibliography_builder_rest_resolve_isbn',
			'permission_callback' => 'bibliography_builder_rest_isbn_permissions_check',
			'args'                => array(
				'isbn' => array(
					'description'       => __(
						'ISBN-10 or ISBN-13, without hyphens, to resolve to CSL-JSON.',
						'borges-bibliography-builder'
					),
					'type'              => 'string',
					'required'          => true,
					'validate_callback' =>
						/**
						 * Validates the ISBN parameter.
						 *
						 * @param mixed $value Value to check.
						 * @return bool
						 */
						static function ( $value ) {
							return '' !== bibliography_builder_normalize_isbn( $value );
						},
				),
			),
		)
	);

	bibliography_builder_register_review_routes();
	bibliography_builder_register_write_routes();

	// The same read by stable ID, registered as its own route so numeric
	// requests keep the `index` parameter they have always had.
	register_rest_route(
		'bibliography/v1',
		'/posts/(?P<post_id>\d+)/bibliographies/(?P<id>' . BIBLIOGRAPHY_BUILDER_BLOCK_ID_PATTERN . ')',
		array(
			'methods'             => WP_REST_Server::READABLE,
			'callback'            => 'bibliography_builder_rest_get_bibliography',
			'permission_callback' => 'bibliography_builder_rest_permissions_check',
			'args'                => array_merge(
				$common_args,
				array(
					'id'     => array(
						'description'       => __(
							"The block's stable bibliographyId.",
							'borges-bibliography-builder'
						),
						'type'              => 'string',
						'validate_callback' => 'bibliography_builder_is_block_id',
					),
					'format' => $format_arg,
				)
			),
		)
	);

	// Catalog and Internet Archive resolvers, registered last so the earlier
	// route indices stay stable. Their identifiers travel as query arguments:
	// LCCNs and ARKs can contain characters a path segment would not carry cleanly.
	register_rest_route(
		'bibliography/v1',
		'/catalog',
		array(
			'methods'             => WP_REST_Server::READABLE,
			'callback'            => 'bibliography_builder_rest_resolve_catalog',
			'permission_callback' => 'bibliography_builder_rest_isbn_permissions_check',
			'args'                => array(
				'id' => array(
					'description'       => __(
						'OCLC:, LCCN:, or OLID: (Open Library edition) key to resolve to CSL-JSON.',
						'borges-bibliography-builder'
					),
					'type'              => 'string',
					'required'          => true,
					'validate_callback' =>
						/**
						 * Validates the catalog ID parameter.
						 *
						 * @param mixed $value Value to check.
						 * @return bool
						 */
						static function ( $value ) {
							return '' !== bibliography_builder_normalize_catalog_key( $value );
						},
				),
			),
		)
	);

	register_rest_route(
		'bibliography/v1',
		'/archive',
		array(
			'methods'             => WP_REST_Server::READABLE,
			'callback'            => 'bibliography_builder_rest_resolve_archive',
			'permission_callback' => 'bibliography_builder_rest_archive_permissions_check',
			'args'                => array(
				'id' => array(
					'description'       => __(
						'Internet Archive item identifier or ARK (ark:/13960/...) to resolve to CSL-JSON.',
						'borges-bibliography-builder'
					),
					'type'              => 'string',
					'required'          => true,
					'validate_callback' =>
						/**
						 * Validates the Internet Archive ID parameter.
						 *
						 * @param mixed $value Value to check.
						 * @return bool
						 */
						static function ( $value ) {
							return '' !== bibliography_builder_normalize_archive_id( $value );
						},
				),
			),
		)
	);
}


/**
 * Serve plain-text bibliography responses without JSON string wrapping.
 *
 * @param bool             $served  Whether the request has already been served.
 * @param WP_HTTP_Response $result  Result to send to the client.
 * @param WP_REST_Request  $request Request used to generate the response.
 * @param WP_REST_Server   $server  Server instance.
 * @return bool
 */
function bibliography_builder_rest_pre_serve_request( $served, $result, $request, $server ) {
	if ( $served ) {
		return $served;
	}

	if ( 0 !== strpos( $request->get_route(), '/bibliography/v1/' ) ) {
		return $served;
	}

	if ( 'text' !== $request->get_param( 'format' ) ) {
		return $served;
	}

	$data = $result->get_data();

	if ( ! is_string( $data ) ) {
		return $served;
	}

	$headers = $result->get_headers();

	foreach ( $headers as $key => $value ) {
		$server->send_header( $key, $value );
	}

	// Plain-text REST response is intentionally stripped to plain text at send time.
	//
	// Deliberately NOT bibliography_builder_strip_bounded() here. $data is a
	// whole bibliography, already assembled by bibliography_builder_build_plain_text(),
	// which bounds each citation individually before stripping it. No single
	// strip therefore ever sees enough text to reach the backtracking cliff, and
	// the aggregate cost is linear in the number of citations. Applying the
	// per-field cap to the joined response would add no protection and would
	// silently truncate a legitimate bibliography: 200 citations is a supported
	// size and exceeds 64 KB on its own. Any future route returning a string
	// body must bound it at its source, as build_plain_text does.
	echo wp_strip_all_tags( $data, false ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
	return true;
}

/**
 * Register the block.
 *
 * @return void
 */
function bibliography_builder_block_init() {
	/**
	 * WP_Block_Type keeps any registration key as a property, and the email
	 * renderer reads this one off the block type; core's stubs list only the
	 * keys core itself reads.
	 *
	 * @psalm-suppress InvalidArgument
	 */
	register_block_type(
		__DIR__,
		array(
			// Read by the email renderer that WooCommerce, MailPoet, Jetpack's
			// newsletters, and Newspack share (see includes/email-output.php).
			'render_email_callback' => 'bibliography_builder_render_email',
		)
	);
}
add_action( 'init', 'bibliography_builder_block_init' );
add_action( 'rest_api_init', 'bibliography_builder_register_rest_routes' );

// Read-only Abilities API integration (WordPress 6.9+; inert on older versions).
require_once __DIR__ . '/includes/styles.php';
require_once __DIR__ . '/includes/block-data.php';
require_once __DIR__ . '/includes/csl-sanitize.php';
require_once __DIR__ . '/includes/formatter.php';
require_once __DIR__ . '/includes/sentence-case.php';
require_once __DIR__ . '/includes/read-routes.php';
require_once __DIR__ . '/includes/google-books-key.php';
require_once __DIR__ . '/includes/resolvers.php';
require_once __DIR__ . '/includes/abilities.php';
require_once __DIR__ . '/includes/review.php';
require_once __DIR__ . '/includes/save-markup.php';
require_once __DIR__ . '/includes/save-sort.php';
require_once __DIR__ . '/includes/save-display.php';
require_once __DIR__ . '/includes/save-json-ld-coins.php';
require_once __DIR__ . '/includes/save-cite-export.php';
require_once __DIR__ . '/includes/frontend-labels.php';
require_once __DIR__ . '/includes/list-semantics.php';
require_once __DIR__ . '/includes/frontend-json-ld.php';
require_once __DIR__ . '/includes/json-ld-enrichment.php';
require_once __DIR__ . '/includes/coins-enrichment.php';
require_once __DIR__ . '/includes/output-defaults.php';
require_once __DIR__ . '/includes/email-output.php';
require_once __DIR__ . '/includes/block-locator.php';
require_once __DIR__ . '/includes/write-routes.php';
require_once __DIR__ . '/includes/rate-limit.php';
require_once __DIR__ . '/includes/bulk-routes.php';
require_once __DIR__ . '/includes/write-abilities.php';

if ( defined( 'WP_CLI' ) && WP_CLI ) {
	require_once __DIR__ . '/includes/cli.php';
}

add_filter( 'rest_pre_serve_request', 'bibliography_builder_rest_pre_serve_request', 10, 4 );

/**
 * Register bibliography block checks with Block Accessibility Checks (BAC).
 *
 * Soft dependency: this hook is only fired when Troy Chaplin's BAC plugin is
 * active. If BAC is not present, this function is never called.
 *
 * Registered checks:
 *   - empty_bibliography (error) - block has no citations.
 *   - heading_missing (warning) - citations exist with no visible heading.
 *   - raw_url_link_text (warning) - citation link text is a raw URL/DOI.
 *   - all_metadata_disabled (warning) - metadata outputs are disabled.
 *
 * @since 1.1.0
 *
 * @return void
 */
function bibliography_builder_register_a11y_checks() {
	if ( ! function_exists( 'ba11yc_register_block_check' ) ) {
		return;
	}

	$raw_url_link_text_message     = __(
		'One or more citations use a URL or DOI as link text. Add a descriptive title for screen readers.',
		'borges-bibliography-builder'
	);
	$all_metadata_disabled_message = __(
		'All machine-readable metadata outputs are disabled. Enable JSON-LD, COinS, or CSL-JSON for interoperability.',
		'borges-bibliography-builder'
	);
	$heading_missing_message       = __(
		'Bibliography block has no heading. Screen reader users may not find this section.',
		'borges-bibliography-builder'
	);

	\ba11yc_register_block_check(
		'bibliography-builder/bibliography',
		array(
			'namespace'    => 'borges-bibliography-builder',
			'name'         => 'empty_bibliography',
			'error_msg'    => __( 'Bibliography block contains no citations.', 'borges-bibliography-builder' ),
			'warning_msg'  => __( 'Bibliography block contains no citations.', 'borges-bibliography-builder' ),
			'description'  => __( 'Add at least one citation before publishing.', 'borges-bibliography-builder' ),
			'level'        => 'error',
			'configurable' => true,
			'category'     => 'accessibility',
		)
	);

	\ba11yc_register_block_check(
		'bibliography-builder/bibliography',
		array(
			'namespace'    => 'borges-bibliography-builder',
			'name'         => 'heading_missing',
			'error_msg'    => $heading_missing_message,
			'warning_msg'  => $heading_missing_message,
			'description'  => __(
				'Add a heading in block settings so the bibliography is announced as a document section.',
				'borges-bibliography-builder'
			),
			'level'        => 'warning',
			'configurable' => true,
			'category'     => 'accessibility',
		)
	);

	\ba11yc_register_block_check(
		'bibliography-builder/bibliography',
		array(
			'namespace'    => 'borges-bibliography-builder',
			'name'         => 'raw_url_link_text',
			'error_msg'    => $raw_url_link_text_message,
			'warning_msg'  => $raw_url_link_text_message,
			'description'  => __(
				'Citations with a URL or DOI should have a descriptive title as link text.',
				'borges-bibliography-builder'
			),
			'level'        => 'warning',
			'configurable' => true,
			'category'     => 'accessibility',
		)
	);

	\ba11yc_register_block_check(
		'bibliography-builder/bibliography',
		array(
			'namespace'    => 'borges-bibliography-builder',
			'name'         => 'all_metadata_disabled',
			'error_msg'    => $all_metadata_disabled_message,
			'warning_msg'  => $all_metadata_disabled_message,
			'description'  => __(
				'Enable at least one metadata output to improve citation-manager interoperability.',
				'borges-bibliography-builder'
			),
			'level'        => 'warning',
			'configurable' => true,
			'category'     => 'accessibility',
		)
	);
}
add_action( 'ba11yc_ready', 'bibliography_builder_register_a11y_checks', 10, 0 );

/**
 * Conditionally enqueue the BAC validation script in the block editor.
 *
 * The script is only enqueued when BAC's own script handle is already
 * registered, so there is no hard dependency on Troy's plugin.
 *
 * @since 1.1.0
 *
 * @return void
 */
function bibliography_builder_enqueue_a11y_validation() {
	if ( ! wp_script_is( 'block-accessibility-script', 'registered' ) ) {
		return;
	}

	$asset_file = BIBLIOGRAPHY_BUILDER_PLUGIN_DIR . 'build/validation.asset.php';
	if ( ! file_exists( $asset_file ) ) {
		return;
	}

	$asset        = require $asset_file;
	$dependencies = array_merge( $asset['dependencies'], array( 'block-accessibility-script' ) );

	wp_enqueue_script(
		'borges-bibliography-builder-a11y-validation',
		plugins_url( 'build/validation.js', __FILE__ ),
		$dependencies,
		$asset['version'],
		true
	);
}
add_action( 'enqueue_block_editor_assets', 'bibliography_builder_enqueue_a11y_validation', 20 );

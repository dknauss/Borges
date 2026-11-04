<?php
/**
 * Installs and configures the trace site (run by setup.sh).
 *
 * Usage: php site.php install | configure <block-markup-file>
 *
 * @package BibliographyBuilder
 */

// phpcs:disable WordPress.WP.AlternativeFunctions -- A CLI tool, not plugin code.

$borges_trace_step = $argv[1] ?? '';
$_SERVER['HTTP_HOST'] = 'localhost:8890';

if ( 'install' === $borges_trace_step ) {
	define( 'WP_INSTALLING', true );
}

require getenv( 'TRACE_STACK' ) . '/site/wp-load.php';

if ( 'install' === $borges_trace_step ) {
	require_once ABSPATH . 'wp-admin/includes/upgrade.php';
	if ( ! is_blog_installed() ) {
		wp_install( 'Borges trace', 'admin', 'admin@example.org', true, '', wp_generate_password() );
	}

	update_option( 'permalink_structure', '/%postname%/' );

	// Switched on directly, as Yoast's activation fails when the plugin is
	// first loaded from the command line; Yoast runs its setup on the
	// next request.
	update_option( 'active_plugins', array( 'bibliography-builder/bibliography-builder.php', 'nlweb/nlweb.php', 'wordpress-seo/wp-seo.php' ) );
	echo "installed\n";
	exit;
}

wp_set_current_user( 1 );

// Yoast: schema on (a bare option update would turn it off), and the
// schema aggregation endpoint that NLWeb reads.
$borges_trace_wpseo                                       = get_option( 'wpseo', array() );
$borges_trace_wpseo['enable_schema']                      = true;
$borges_trace_wpseo['enable_schema_aggregation_endpoint'] = true;
update_option( 'wpseo', $borges_trace_wpseo );

// NLWeb's WordPress plugin, ranking with the local LLM stub.
update_option(
	'nlweb_settings',
	array_merge(
		(array) get_option( 'nlweb_settings', array() ),
		array(
			'llm_provider'        => 'anthropic',
			'api_key'             => 'stub',
			'api_endpoint'        => 'http://localhost:8891/',
			'model_high'          => 'stub',
			'model_low'           => 'stub',
			'enable_query_fanout' => false,
		)
	)
);

$borges_trace_intro = "<!-- wp:paragraph -->\n<p>Every work this essay draws on is listed below, from NumPy and the FAIR principles to Borges's library of Babel.</p>\n<!-- /wp:paragraph -->\n\n";
$borges_trace_post  = get_page_by_path( 'what-a-bibliography-tells-machines', OBJECT, 'post' );
$borges_trace_id    = wp_insert_post(
	array(
		'ID'           => $borges_trace_post ? $borges_trace_post->ID : 0,
		'post_title'   => 'What a bibliography tells machines',
		'post_name'    => 'what-a-bibliography-tells-machines',
		'post_status'  => 'publish',
		'post_author'  => 1,
		'post_content' => wp_slash( $borges_trace_intro . file_get_contents( $argv[2] ) ),
	),
	true
);

flush_rewrite_rules();
echo is_wp_error( $borges_trace_id ) ? $borges_trace_id->get_error_message() : 'post ' . get_permalink( $borges_trace_id ), "\n";

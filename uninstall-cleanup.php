<?php
/**
 * Uninstall cleanup logic for Borges Bibliography Builder.
 *
 * This file only *defines* the cleanup functions; it performs no work when
 * loaded, so it is safe to require from both uninstall.php and the test suite.
 * The plugin persists nothing durable except transients (keyed
 * `_transient_bbb_<md5>` / `_transient_timeout_bbb_<md5>` in the options table)
 * and object-cache entries in two named groups. User content (bibliography
 * blocks stored in post_content) is intentionally left untouched.
 *
 * @package BibliographyBuilder
 */

if ( ! function_exists( 'bibliography_builder_uninstall_cleanup' ) ) {
	/**
	 * Remove all transient and object-cache data created by the plugin.
	 *
	 * Transients live in each site's options table, so on multisite we sweep
	 * every site. Object-cache groups are not per-site, so one flush clears them.
	 *
	 * @return void
	 */
	function bibliography_builder_uninstall_cleanup() {
		if ( function_exists( 'is_multisite' ) && is_multisite() ) {
			$site_ids = get_sites(
				array(
					'fields' => 'ids',
					'number' => 0,
				)
			);

			foreach ( $site_ids as $site_id ) {
				switch_to_blog( (int) $site_id );
				bibliography_builder_delete_transient_rows();
				restore_current_blog();
			}
		} else {
			bibliography_builder_delete_transient_rows();
		}

		// Object-cache groups are global, not per-site; flush once if supported.
		if ( function_exists( 'wp_cache_flush_group' ) ) {
			wp_cache_flush_group( 'bibliography_builder_formatter' );
			wp_cache_flush_group( 'bibliography_builder_pmid' );
			wp_cache_flush_group( 'bibliography_builder_rate_limit' );
		}
	}
}

if ( ! function_exists( 'bibliography_builder_delete_transient_rows' ) ) {
	/**
	 * Delete the plugin's transient rows from the current site's options table.
	 *
	 * Transient keys are MD5 hashes prefixed with `bbb_`, so they cannot be
	 * enumerated individually; a LIKE sweep on the option_name is the only way
	 * to remove both the value and its timeout companion.
	 *
	 * @return void
	 */
	function bibliography_builder_delete_transient_rows() {
		global $wpdb;

		if ( ! isset( $wpdb ) ) {
			return;
		}

		$value_like   = $wpdb->esc_like( '_transient_bbb_' ) . '%';
		$timeout_like = $wpdb->esc_like( '_transient_timeout_bbb_' ) . '%';

		$wpdb->query(
			$wpdb->prepare(
				"DELETE FROM {$wpdb->options} WHERE option_name LIKE %s OR option_name LIKE %s",
				$value_like,
				$timeout_like
			)
		);
	}
}

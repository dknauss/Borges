<?php
/**
 * Plugin Name: Borges runtime smoke: low bulk rate limit
 * Description: Test-only mu-plugin the runtime matrix installs so a few bulk reformat requests spend the whole budget and reach the 429.
 *
 * @package BibliographyBuilder
 */

/*
 * Three posts a day: a two-post dry run and a clipped commit spend it, and the
 * next request is refused. A day-long window keeps a reset from landing in
 * the middle of the smoke test (windows are aligned to their length).
 */
add_filter(
	'bibliography_builder_bulk_rate_limit',
	static function () {
		return array(
			'posts'  => 3,
			'window' => DAY_IN_SECONDS,
		);
	}
);

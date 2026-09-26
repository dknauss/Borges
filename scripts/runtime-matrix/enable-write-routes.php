<?php
/**
 * Plugin Name: Borges runtime smoke: enable write routes
 * Description: Test-only mu-plugin the runtime matrix installs to exercise the opt-in citation write routes.
 *
 * @package BibliographyBuilder
 */

add_filter( 'bibliography_builder_enable_write_routes', '__return_true' );

<?php
/**
 * Stand-in for the WooCommerce email editor's table helper, so the email
 * callback's renderer path can run without the email editor package.
 *
 * @package BibliographyBuilder
 */

namespace Automattic\WooCommerce\EmailEditor\Integrations\Utils;

/**
 * Records its arguments and wraps content the way the real helper does.
 */
class Table_Wrapper_Helper {
	/**
	 * Arguments of the last call.
	 *
	 * @var array
	 */
	public static $calls = array();

	/**
	 * Wrap content in a one-cell table.
	 *
	 * @param string $content    Content.
	 * @param array  $table_attrs Table attributes.
	 * @param array  $cell_attrs  Cell attributes.
	 * @return string
	 */
	public static function render_table_wrapper( $content, $table_attrs = array(), $cell_attrs = array() ) {
		self::$calls[] = array( $content, $table_attrs, $cell_attrs );

		return '<table width="' . $table_attrs['width'] . '"><tr><td align="' . $cell_attrs['align'] . '">' . $content . '</td></tr></table>';
	}
}

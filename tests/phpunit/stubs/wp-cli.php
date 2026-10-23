<?php
/**
 * A minimal WP-CLI for the CLI command tests and for Psalm: it records what
 * a command prints instead of printing it, and turns error() and halt() into
 * exceptions so a test can see that the command stopped.
 *
 * @package BibliographyBuilder
 */

namespace {
	/**
	 * Thrown where WP-CLI would exit.
	 */
	class Bibliography_Builder_Test_CLI_Exit extends Exception {}

	/**
	 * Recording stand-in for the WP_CLI class.
	 */
	class WP_CLI {
		/**
		 * Recorded output, as [ kind, value ] pairs.
		 *
		 * @var array<int, array{0: string, 1: mixed}>
		 */
		public static $log = array();

		/**
		 * Registered commands by name.
		 *
		 * @var array<string, mixed>
		 */
		public static $commands = array();

		/**
		 * @param string $name     Command name.
		 * @param mixed  $callable Class name or callable.
		 * @return bool
		 */
		public static function add_command( $name, $callable ) {
			self::$commands[ $name ] = $callable;
			return true;
		}

		/**
		 * @param string $message Message.
		 * @return void
		 */
		public static function line( $message = '' ) {
			self::$log[] = array( 'line', $message );
		}

		/**
		 * @param string $message Message.
		 * @return void
		 */
		public static function success( $message ) {
			self::$log[] = array( 'success', $message );
		}

		/**
		 * @param string $message Message.
		 * @return void
		 */
		public static function warning( $message ) {
			self::$log[] = array( 'warning', $message );
		}

		/**
		 * @param string|WP_Error $message Message or error.
		 * @return void
		 * @throws Bibliography_Builder_Test_CLI_Exit Always.
		 */
		public static function error( $message ) {
			self::$log[] = array( 'error', $message instanceof WP_Error ? $message->get_error_message() : $message );
			throw new Bibliography_Builder_Test_CLI_Exit( 'error' );
		}

		/**
		 * @param int $code Exit status.
		 * @return void
		 * @throws Bibliography_Builder_Test_CLI_Exit Always.
		 */
		public static function halt( $code ) {
			self::$log[] = array( 'halt', $code );
			throw new Bibliography_Builder_Test_CLI_Exit( 'halt' );
		}
	}
}

namespace WP_CLI\Utils {
	/**
	 * Records the rows a command would print.
	 *
	 * @param string       $format Output format.
	 * @param array        $items  Rows.
	 * @param array|string $fields Columns.
	 * @return void
	 */
	function format_items( $format, $items, $fields ) {
		\WP_CLI::$log[] = array(
			'items',
			array(
				'format' => $format,
				'items'  => $items,
				'fields' => is_string( $fields ) ? explode( ',', $fields ) : $fields,
			),
		);
	}
}

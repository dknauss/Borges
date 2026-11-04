<?php
$root = getenv( 'TRACE_STACK' ) . '/site';
$path = parse_url( $_SERVER['REQUEST_URI'], PHP_URL_PATH );
if ( $path !== '/' && file_exists( $root . $path ) && ! is_dir( $root . $path ) ) { return false; }
if ( is_dir( $root . $path ) && file_exists( $root . rtrim( $path, '/' ) . '/index.php' ) ) { require $root . rtrim( $path, '/' ) . '/index.php'; return; }
chdir( $root ); require $root . '/index.php';

<?php
$_SERVER['HTTP_HOST'] = 'localhost:8890';
require getenv( 'TRACE_STACK' ) . '/site/wp-load.php';
update_option( 'borges_trace_variant', $argv[1] ?? '' );
echo 'variant: ', var_export( get_option( 'borges_trace_variant' ), true ), "\n";

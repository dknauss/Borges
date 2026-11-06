<?php
/* Demo only: a stand-in for Marginalia's Gloss paragraph style. */
add_action( 'wp_head', static function () {
	echo '<style>.demo-gloss{float:right;clear:right;width:14rem;margin:0 calc(-14rem - 2rem) 1rem 1.5rem;font-size:.85em;line-height:1.45;border-top:1px solid currentColor;padding-top:.4em}@media (max-width:1100px){.demo-gloss{float:none;width:auto;margin:1rem 0 1rem 2rem}}</style>';
} );

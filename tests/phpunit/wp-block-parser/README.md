# WordPress block parser (test copy)

Unmodified copies of WordPress core's block parser, so the PHPUnit suite can
check `includes/block-locator.php` against the real `parse_blocks()` without a
WordPress install:

- `class-wp-block-parser.php`
- `class-wp-block-parser-block.php`
- `class-wp-block-parser-frame.php`

Source: WordPress/WordPress `wp-includes/` at 8e52502 (7.2-alpha-63945).
WordPress is GPL-2.0-or-later, like this plugin. These files are test-only and
never ship (`tests/` is in `.distignore`).

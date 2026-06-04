# WordPress.org SVN Deploy Checklist

This repository uses Git for development and WordPress.org SVN for release publication.

## Checklist

1. **Keep Git as the source of truth**
   - Develop in GitHub.
   - Use SVN only for WordPress.org release publication.

2. **Use the correct WordPress.org SVN identity**
   - SVN username must be the WordPress.org username used for the plugin.
   - The username is case-sensitive.
   - Use the SVN-specific password from WordPress.org account settings, not the normal account password.

3. **Update `trunk/` with release-ready code**
   - `trunk/` should contain the current release baseline.
   - Do not place the main plugin file inside a nested subfolder under `trunk/`.

4. **Keep assets in `/assets/`**
   - Screenshots, banners, and icons belong in `assets/`.
   - The WordPress.org Preview blueprint belongs at `assets/blueprints/blueprint.json`; in this repository that source file is `.wordpress-org/blueprints/blueprint.json`.
   - Keep the WordPress.org Preview blueprint aligned with `playground/blueprint.json`.
   - Both blueprints must request PHP `intl` using `phpExtensionBundles: ["kitchen-sink"]` and `features: { "networking": true, "intl": true }` so the browser Playground runtime can run the `citeproc-php` formatter.
   - Do not commit development-only files there.

5. **Tag releases from `trunk/`**
   - Create release tags by copying `trunk/` into `tags/<version>/` using SVN copy.
   - Update `Stable tag:` in `trunk/readme.txt` when tagging.

6. **Do not upload zip files to SVN**
   - Commit individual files only.
   - Keep the packaged GitHub release zip separate from SVN.

7. **Treat SVN as a public release repository**
   - Only commit finished changes that are safe for WordPress.org users.
   - Anything committed to SVN should be ready to ship.

8. **If authentication fails, check these first**
   - Username capitalization/case.
   - Whether the account is listed as a plugin committer.

## Repository workflow summary

- **GitHub release zip**: packaged artifact for GitHub Releases and Playground.
- **WordPress.org SVN `trunk/`**: public release source.
- **WordPress.org `assets/`**: directory screenshots, banner, and icon assets.
- **Playground blueprints**: `playground/blueprint.json` powers GitHub/readme demo links and installs the latest GitHub Release ZIP through the WordPress Playground CORS proxy; `.wordpress-org/blueprints/blueprint.json` deploys to SVN `assets/blueprints/blueprint.json` for the plugin-directory Preview button, where WordPress.org installs the plugin automatically.
- **WordPress.org `tags/<version>/`**: release snapshot.

## Playground preview verification

After editing either Blueprint, run:

```bash
npm run test -- --runTestsByPath src/blueprint.test.js
```

For a browser/WASM smoke check, launch the GitHub demo link and add the sample citations. The GitHub demo blueprint should install the latest GitHub Release ZIP through the WordPress Playground CORS proxy; direct GitHub release asset URLs are blocked by browser CORS in live Playground. The WordPress.org Preview blueprint should not install Borges itself because WordPress.org installs the current plugin automatically. The formatter REST response must not return `bibliography_builder_formatter_extension_missing`; the success notice should say citations were added without the fallback warning.


## Translation count and language-pack wording

WordPress.org's plugin page treats English (US) as the source language and counts only approved generated language packs as translated locales. If the public sidebar lists English (US) plus one translated locale while the Development tab says "translated into 1 locale," that means one translated locale is published and English (US) is the source language.

Do not describe bundled PO/MO seed files as official language availability. WordPress.org may import shipped `.mo` files into translate.wordpress.org, but a locale appears as an official language pack only after the Stable plugin translation reaches the approval threshold and a language pack is generated. The plugin page's live **Languages** list is the canonical public availability signal.

## Sources

- [Using Subversion – Plugin Handbook](https://developer.wordpress.org/plugins/wordpress-org/how-to-use-subversion/)
- [Subversion Access – Make WordPress.org](https://make.wordpress.org/meta/handbook/tutorials-guides/svn-access/)

# Hosting the main-preview ZIP for Playground

The README's "Try the current main build" link opens WordPress Playground with
`playground/blueprint-main.json`, and the development-only
`playground/blueprint-write-api.json` boots the same build. Both install a ZIP
of the current `main` branch that CI builds on every push to `main`, after the
full CI suite passes. Playground runs in the browser, so it can download that
ZIP only from a host that answers with an `Access-Control-Allow-Origin` header.

There are two ways to serve the ZIP. CI publishes it both ways, so either one can
be used by changing one URL in each blueprint.

## Option A: GitHub release asset, through Playground's CORS proxy

```
https://wordpress-playground-cors-proxy.net/?https://github.com/dknauss/Borges/releases/download/main-preview/borges-bibliography-builder.zip
```

CI's `publish-main-preview` job uploads the ZIP to the rolling `main-preview`
pre-release with `gh release upload --clobber`. GitHub's release downloads send
no CORS header, so the blueprint has to fetch it through Playground's CORS proxy,
which answers with a redirect that the browser can follow.

- **Good:** nothing to set up beyond the release, and the stable demo
  (`playground/blueprint.json`, the latest release) works the same way.
- **Weak spot:** the proxy is a third-party service, and it sometimes stalls. On
  2026-11-09 a live probe (`playground-live-probe.yml`) loaded the Main build
  demo 9 times across Chromium, Firefox, and WebKit: 7 loads got the proxy's
  redirect in about 0.2 s, one waited 11 s and then got an answer with no CORS
  header, and one never got an answer. Playground then shows "Could not
  download required files … `ResourceDownloadError`" for blueprint step #2.
  Reloading usually works, but nothing in this repository can make the proxy
  answer.
- **Small gap:** `--clobber` deletes the old asset before uploading the new
  one, so for a few seconds during each publish there is no ZIP at all.

## Option B: GitHub Pages (in use)

```
https://dknauss.github.io/Borges/main-preview/borges-bibliography-builder.zip
```

CI's `publish-main-preview-pages` job runs after `publish-main-preview` and
deploys the same ZIP (the artifact the CI suite tested) to GitHub Pages with
`actions/upload-pages-artifact` and `actions/deploy-pages`. Pages answers every
request with `Access-Control-Allow-Origin: *`, so the blueprint fetches the ZIP
directly and the CORS proxy is out of the path.

- **Good:** the Main build demo depends only on GitHub and Playground itself.
  A deployment swaps the whole site at once, so there is no window without a
  ZIP.
- **Setup:** Pages must be turned on once, in **Settings → Pages → Build and
  deployment → Source: GitHub Actions**. That also creates the `github-pages`
  environment, which by default lets only `main` deploy. Until it is on, the
  Pages job fails (and the Main build demo has no ZIP to install), so turn it
  on before merging the change that adds the job.
- **Cache:** Pages sends `Cache-Control: max-age=600`, so for up to 10 minutes
  after a push the demo can still install the previous build.
- **Public site:** the repository gets a Pages site with an index page, the ZIP,
  and a `COMMIT` file naming the build's commit. Nothing else is published.
- **Custom domain:** if the account's `dknauss.github.io` site ever gets a
  custom domain, Pages redirects the URL above there. Browsers follow that
  redirect and the custom domain also sends the CORS header, so the blueprints
  keep working.

The stable demo (`playground/blueprint.json`) and WordPress.org's preview still
use Option A for the latest release. Moving the stable demo too would mean
adding the release ZIP to every Pages deployment, because each deployment
replaces the whole site.

## Switching between them

1. Change the `installPlugin` step's `url` in `playground/blueprint-main.json`
   and `playground/blueprint-write-api.json` to the other URL above.
2. Update the expected URL in `src/blueprint.test.js`, then run
   `npm test -- src/blueprint.test.js src/playground-demo.test.js`.
3. Keep both CI jobs either way: each is the other's fallback.

To check either host, run the **Demo Link Monitor** (`demo-links.yml`, which
requests every blueprint's install URL) and, for a real browser load, the
**Playground Live Probe** (`playground-live-probe.yml`) from the Actions tab. The live probe also runs daily and opens a `playground-monitor` issue when the demos look unhealthy, so a broken host shows up there first.

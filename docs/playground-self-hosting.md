# Self-hosting WordPress Playground for the demos

The README's demo links open the public WordPress Playground at
`playground.wordpress.net`. Some cold loads there never reach the block editor:
Playground's own service worker sometimes fails to serve WordPress's core
scripts and styles (WordPress/wordpress-playground#4419), and the control
blueprint, with no Borges at all, fails the same way. Nothing in Borges's
blueprints can fix that (see `docs/playground-main-preview-hosting.md` for the
download failures that the blueprints could fix).

One way around it is to serve our own copy of Playground. This page records
what that takes and what a first experiment found. It is on the roadmap
(`.planning/ROADMAP.md`, "Self-hosted Playground for the demos") and nothing is
deployed yet.

## What it takes

Playground's guide is "Host your own Playground" in its developer docs
(`developers/architecture/host-your-own-playground`).

- **Build:** in a checkout of `WordPress/wordpress-playground`, run
  `npm ci` and `npm run build:website`. The site lands in
  `dist/packages/playground/wasm-wordpress-net`. On a GitHub-hosted runner it
  builds in about 4½ minutes with `NODE_OPTIONS=--max-old-space-size=12288`,
  after freeing some disk space.
- **Size:** the full build is about 1.5 GB, and the bundled WordPress builds
  alone are about 996 MB. A hosted copy has to be trimmed to the one
  WordPress version and one PHP version the demos use.
- **Domain root:** the production build uses Vite's base `/`, so it has to be
  served from the root of a domain or subdomain. It cannot live under
  `dknauss.github.io/Borges/`, beside the main-preview ZIP.
- **Hosts:**
  - GitHub Pages caps a site at 1 GB, so only a trimmed build fits. A Pages
    site at a domain root means a new user or organization site
    (`<name>.github.io`) or a custom domain.
  - Cloudflare Pages is out: it limits each file to 25 MB, and Playground's
    PHP engine files are 15 to 30 MB each.
  - Netlify, or any static host with no such per-file limit, would work.
  - The server must send `.wasm` files as `application/wasm`.
- **CORS proxy:** a production build still sends cross-origin downloads through
  Playground's CORS proxy (`wordpress-playground-cors-proxy.net`) unless
  `CORS_PROXY_URL` is set when building. The stable demo installs the latest
  release from GitHub through that proxy, and every demo installs Block
  Accessibility Checks from WordPress.org.
- **Upkeep:** a self-hosted copy is pinned to one Playground commit. It needs
  rebuilding to pick up Playground's fixes, including any fix for #4419.

## Experiment (2026-11-09)

A temporary workflow on the branch of PR #282 (run 42685251644) built
Playground at commit `af13c04ca16c765f6dc6b60f0915230eec3e4856`, served it on
`localhost:8080` with Python's `ThreadingHTTPServer`, and ran
`scripts/playground-live-probe.mjs` against it and against the public site.
`PROBE_PLAYGROUND` picks the Playground host, and
`scripts/playground-probe-report.mjs` groups its table by host. Each browser
alternated between the two hosts so both saw the same conditions, with 5 loads
of `playground/blueprint-main.json` (from `main`) and 5 of the control
blueprint (`scripts/probe-fixtures/control-blueprint.json`) per browser and
host.

Loads that reached a working block editor:

| Blueprint | Browser  | Self-hosted | Public |
| --------- | -------- | ----------- | ------ |
| Main build | Chromium | 5 of 5 | 4 of 5 |
| Main build | Firefox  | 5 of 5 | 5 of 5 |
| Main build | WebKit   | 5 of 5 | 4 of 5 |
| Control    | Chromium | 5 of 5 | 5 of 5 |
| Control    | Firefox  | 5 of 5 | 5 of 5 |
| Control    | WebKit   | 5 of 5 | 4 of 5 |
| **Total**  |          | **30 of 30** | **27 of 30** |

The three public failures were timeouts before the editor appeared, not
blueprint errors. The self-hosted copy also booted faster: the Main build demo
reached the editor in Chromium in about 6.5 s, against about 8.8 s on the
public site.

### What it does and does not show

- **Small sample.** Five loads per cell cannot tell 100% from 90%. A 10% gap
  needs a few hundred loads to stand on.
- **Not a real network.** Localhost has no latency, no CDN, and no browser
  check in front of it, so the speed gap is an upper bound.
- **A quiet window.** The public site failed 3 of 30 loads here, fewer than in
  some earlier probes.
- **A likely reason.** The public site runs WordPress on a second origin,
  `wpsandbox.wordpress.net`, inside an iframe, and the service worker failures
  seen there happen on that origin. The local build served everything from one
  origin. If that holds, a hosted copy would avoid most of the failures, but
  this experiment does not prove it.

### Running it again

The workflow was removed from #282 before it merged. To repeat the
experiment, restore `.github/workflows/playground-selfhost-experiment.yml` from
commit `2f0a4a3` (`git show 2f0a4a3:.github/workflows/playground-selfhost-experiment.yml`,
reachable through PR #282), change its `branches` filter to your branch, raise
`RUNS`, and push: it runs on a push that changes its own file.

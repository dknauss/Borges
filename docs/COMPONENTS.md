# Component ownership and editing

Static save is intentional. citations contains nested CSL records; displayOverride changes display text without changing csl. Preserve metadata and displayOverride on design updates. Existing saved markup needs deprecations/compatibility; plugin deactivation leaves the bibliography. SPEC.md remains authoritative.

Follow [the shared workflow](COMPONENT-WORKFLOW.md). `components.json` is the checked inventory.

## Contract inventory

| Component | Source | Editing / update model |
|---|---|---|
| `bibliography-builder/bibliography` | [`block.json`](../block.json) | Declared fields/supports below |

## `bibliography-builder/bibliography`

Declared attributes: citationStyle, headingText, headingLevel, outputJsonLd, outputCoins, outputCslJson, outputCiteExport, bibliographyId, citations; existing style controls are listed in supports. Attribute declarations are not proof of visible UI controls.

Saved output remains in post content; existing instances require compatibility/deprecations before markup changes

Declared style supports (existing controls, not a newly restricted API):

```json
{
  "html": false,
  "anchor": true,
  "className": true,
  "spacing": {
    "margin": [
      "top",
      "bottom"
    ],
    "padding": [
      "top",
      "bottom"
    ]
  },
  "typography": {
    "fontSize": true
  }
}
```

## Validation and release

Run `python3 tools/check-components.py`. CI checks the inventory and interfaces.
Use `tools/audit-design-overrides.php` via read-only WP-CLI before a design release.
Review the existing repository test/build instructions as well; this checker is not an application test.
Changing files does not reconcile database overrides or rewrite existing inserted patterns.

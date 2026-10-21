# Contributing to Bibliography Builder

Thank you for your interest in contributing! This document explains how to get set up and submit changes.

## Development Setup

1. **Prerequisites:** Node.js 22+, npm 9+, and a local WordPress installation (6.4+).

2. **Clone and install:**
   ```bash
   git clone https://github.com/dknauss/Borges.git
   cd borges-bibliography-builder
   npm install
   ```

3. **Link to WordPress:** symlink or copy the plugin folder into your `wp-content/plugins/` directory.

4. **Start development mode:**
   ```bash
   npm run start
   ```

5. **Activate the plugin** in the WordPress admin under Plugins.

## Code Style

- JavaScript follows the [@wordpress/scripts](https://developer.wordpress.org/block-editor/reference-guides/packages/packages-scripts/) ESLint configuration.
- SCSS follows the WordPress Stylelint configuration.
- Run linting before committing:
  ```bash
  npm run lint:js
  npm run lint:css
  ```

## Testing

```bash
npm run test       # Unit tests (Jest)
```

Tests live alongside the source in `src/` or in a `__tests__/` directory. When adding a feature or fixing a bug, include tests that cover the change.

## Pull Request Process

1. **Create a branch** from `main` with a descriptive name (e.g., `fix/doi-detection-edge-case`).
2. **Make your changes** with clear, focused commits.
3. **Run linting and tests** before pushing.
4. **Open a pull request** against `main`. In the PR description:
   - Describe what changed and why.
   - Reference any related issues (`Closes #123`).
   - Include testing steps if the change affects editor behavior.
5. A maintainer will review your PR. Please respond to feedback and keep the PR up to date with `main`.

## Reporting Bugs

Use the [bug report issue template](https://github.com/dknauss/Borges/issues/new?template=01-bug-report.yml). Include steps to reproduce, expected behavior, and your WordPress/browser versions.

## Security Issues

Do **not** report security vulnerabilities in public issues. See [SECURITY.md](SECURITY.md) for responsible disclosure instructions.

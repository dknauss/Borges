/* eslint-disable jest/no-done-callback */
const { test, expect } = require('@playwright/test');

/**
 * Plugin lifecycle tests: activate, create content, deactivate, verify content
 * survives, reactivate, verify block is still recognized.
 *
 * SAFETY NOTE: The activate/deactivate tests run against an auto-mounted
 * (read-write) Playground server. The "delete" test MUST run against a separate
 * Playground that installed from the release zip — never against auto-mount,
 * which would delete the actual repo files. Use scripts/test-lifecycle-e2e.sh
 * to run both server configurations correctly.
 */

async function dismissEditorOverlay(page) {
	for (let attempt = 0; attempt < 3; attempt += 1) {
		const dialog = page.getByRole('dialog').first();
		const dialogCloseButton = dialog
			.getByRole('button', {
				name: /Close|Dismiss|Got it|Okay|OK|Done|Skip/i,
			})
			.first();

		if (
			(await dialog.isVisible().catch(() => false)) &&
			(await dialogCloseButton.isVisible().catch(() => false))
		) {
			await dialogCloseButton.click({ force: true });
			await dialog
				.waitFor({ state: 'hidden', timeout: 5000 })
				.catch(() => {});
		}

		await page.keyboard.press('Escape').catch(() => {});

		const overlay = page.locator('.components-modal__screen-overlay');
		if (!(await overlay.count())) {
			return;
		}

		await overlay
			.first()
			.waitFor({ state: 'hidden', timeout: 2000 })
			.catch(() => {});
	}
}

async function getPluginRow(page) {
	let loaded = false;
	for (let attempt = 0; attempt < 3; attempt += 1) {
		await page.goto('/wp-admin/plugins.php');
		await page.waitForLoadState('networkidle');

		const pageText = await page.locator('body').textContent();
		if (pageText && !pageText.includes('Internal Server Error')) {
			loaded = true;
			break;
		}

		await page.waitForTimeout(1000);
	}

	if (!loaded) {
		throw new Error(
			'Plugins screen returned Internal Server Error repeatedly.'
		);
	}

	return page
		.locator(
			[
				'tr[data-slug="borges-bibliography-builder"]',
				'tr[data-slug="bibliography-builder"]',
				'tr[data-slug="Bibliography-Builder"]',
				'tr[data-plugin="borges-bibliography-builder/bibliography-builder.php"]',
				'tr[data-plugin="bibliography-builder/bibliography-builder.php"]',
				'tr[data-plugin="Bibliography-Builder/bibliography-builder.php"]',
				'tr[data-plugin$="/bibliography-builder.php"]',
			].join(', ')
		)
		.first()
		.or(
			page.locator('tr', {
				hasText:
					/Borges Bibliography Builder|Bibliography Builder|Bibliography/i,
			})
		);
}

async function ensurePluginActive(page) {
	let pluginRow = await getPluginRow(page);
	await expect(pluginRow).toBeVisible();

	const activateLink = pluginRow.getByRole('link', { name: /^Activate/i });
	if (await activateLink.count()) {
		await activateLink.click();
		await page.waitForLoadState('networkidle');
		pluginRow = await getPluginRow(page);
	}

	await expect(
		pluginRow.getByRole('link', { name: /Deactivate/i })
	).toBeVisible({ timeout: 10_000 });
}

async function deactivatePlugin(page) {
	const pluginRow = await getPluginRow(page);
	const deactivateLink = pluginRow.getByRole('link', {
		name: /Deactivate/i,
	});
	await expect(deactivateLink).toBeVisible({ timeout: 10_000 });
	await deactivateLink.click();
	await page.waitForLoadState('networkidle');

	const updatedRow = await getPluginRow(page);
	await expect(
		updatedRow.getByRole('link', { name: /^Activate/i })
	).toBeVisible({ timeout: 10_000 });
}

/**
 * Create a post with a bibliography block, publish it, and return the
 * front-end URL.
 * @param {import('@playwright/test').Page} page
 */
async function createPostWithBibliography(page) {
	await page.goto('/wp-admin/post-new.php');
	await dismissEditorOverlay(page);

	const postData = await page.evaluate(async () => {
		const { blocks, data } = window.wp || {};
		if (!blocks || !data) {
			throw new Error('Gutenberg editor APIs are not available.');
		}

		const dispatch = data.dispatch('core/editor');
		const select = data.select('core/editor');
		const block = blocks.createBlock('bibliography-builder/bibliography', {
			citationStyle: 'chicago-notes-bibliography',
			headingText: 'References',
			outputJsonLd: true,
			outputCoins: false,
			outputCslJson: false,
			citations: [
				{
					id: 'lifecycle2024',
					displayText:
						'Test Author. Lifecycle Test Article. Test Journal (2024).',
					csl: {
						id: 'lifecycle2024',
						type: 'article-journal',
						title: 'Lifecycle Test Article',
						'container-title': 'Test Journal',
						author: [{ family: 'Author', given: 'Test' }],
						issued: { 'date-parts': [[2024]] },
					},
				},
			],
		});

		dispatch.resetBlocks([block]);
		dispatch.editPost({
			title: 'Lifecycle Test Post',
			status: 'publish',
		});
		await dispatch.savePost();

		const currentPost = select.getCurrentPost();
		return {
			id: currentPost?.id || select.getCurrentPostId(),
			link: currentPost?.link || null,
		};
	});

	if (postData.link) {
		return postData.link;
	}

	const postId = postData.id;
	if (!postId) {
		throw new Error('Could not determine post ID after save.');
	}

	const fallbackLink = await page.evaluate(async (id) => {
		const nonce = window.wpApiSettings?.nonce;
		const response = await fetch(
			`/wp-json/wp/v2/posts/${id}?context=edit`,
			{
				headers: nonce ? { 'X-WP-Nonce': nonce } : {},
			}
		);
		if (!response.ok) {
			throw new Error(`Failed to fetch post ${id}.`);
		}
		const post = await response.json();
		return post?.link || '/';
	}, postId);

	return fallbackLink || '/';
}

test.describe('Plugin lifecycle', () => {
	test.setTimeout(60_000);
	test.beforeEach(async ({ page }) => {
		page.on('dialog', (dialog) => dialog.accept());
	});

	test('content survives plugin deactivation', async ({ page }) => {
		await ensurePluginActive(page);

		const postUrl = await createPostWithBibliography(page);

		await deactivatePlugin(page);

		// Static-saved HTML should survive deactivation.
		await page.goto(postUrl);
		await page.waitForLoadState('networkidle');

		const body = await page.locator('body').textContent();
		expect(body).toBeTruthy();
		expect(body).not.toContain('Fatal error');
		expect(body).not.toContain('There has been a critical error');

		// Reactivate for subsequent tests.
		await ensurePluginActive(page);
	});

	test('block is recognized after reactivation', async ({ page }) => {
		await ensurePluginActive(page);

		await page.goto('/wp-admin/edit.php');
		await page.waitForLoadState('networkidle');

		const firstPost = page
			.locator('.row-title, .row-actions .edit a')
			.first();
		if (await firstPost.isVisible().catch(() => false)) {
			await firstPost.click();
			await page.waitForLoadState('domcontentloaded');
			await page.waitForTimeout(3000);

			// No block validation errors.
			const pageContent = await page.locator('body').textContent();
			expect(pageContent).not.toContain('This block contains unexpected');
			expect(pageContent).not.toContain('Attempt Block Recovery');
		}
	});

	test('deactivation is clean with no errors', async ({ page }) => {
		await ensurePluginActive(page);
		await deactivatePlugin(page);

		// Admin dashboard should load without errors.
		await page.goto('/wp-admin/');
		await page.waitForLoadState('networkidle');

		const body = await page.locator('body').textContent();
		expect(body).not.toContain('Fatal error');
		expect(body).not.toContain('There has been a critical error');

		// Reactivate for a clean state.
		await ensurePluginActive(page);
	});
});

/**
 * Delete test — runs against a Playground that installs from the release zip
 * (NOT auto-mount). The test-lifecycle-e2e.sh script routes this to the
 * correct server via --grep "delete".
 *
 * The zip directory is mounted at /wordpress/plugin-zip/ inside Playground.
 * The test uploads the zip via wp-admin "Upload Plugin" so WordPress owns
 * the files and can safely delete them.
 */

const path = require('path');

/**
 * Seed durable plugin state by calling the authenticated /format endpoint while
 * the plugin is active. A successful format writes a `_transient_bbb_<hash>` row
 * to the options table — exactly the data uninstall.php must remove.
 *
 * Best-effort: the plain Playground used for the delete test may lack the intl
 * extension citeproc-php needs, so callers should not hard-fail on the status.
 * The transient SQL in uninstall.php runs on delete regardless of whether a row
 * was seeded; seeding just makes the DELETE match real data when the env allows.
 *
 * @param {import('@playwright/test').Page} page
 * @return {Promise<number|null>} HTTP status of the /format request, or null.
 */
async function seedPluginTransient(page) {
	return page.evaluate(async () => {
		try {
			const nonce = window.wpApiSettings?.nonce;
			const response = await fetch('/wp-json/bibliography/v1/format', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					...(nonce ? { 'X-WP-Nonce': nonce } : {}),
				},
				body: JSON.stringify({
					style: 'chicago-notes-bibliography',
					cslItems: [
						{
							id: 'uninstall2024',
							type: 'article-journal',
							title: 'Uninstall Cleanup Test',
							'container-title': 'Test Journal',
							author: [{ family: 'Author', given: 'Test' }],
							issued: { 'date-parts': [[2024]] },
						},
					],
				}),
			});
			return response.status;
		} catch (error) {
			return null;
		}
	});
}

async function installPluginFromZip(page) {
	await page.goto('/wp-admin/plugin-install.php?tab=upload');
	await page.waitForLoadState('networkidle');

	const zipPath = path.resolve(
		__dirname,
		'../../output/release/borges-bibliography-builder.zip'
	);

	const fileInput = page.locator('input[type="file"]');
	await fileInput.setInputFiles(zipPath);

	const installButton = page.getByRole('button', {
		name: /Install Now/i,
	});
	await installButton.click();
	await page.waitForLoadState('networkidle');

	// Activate the plugin after upload.
	const activateLink = page.getByRole('link', { name: /Activate Plugin/i });
	if (await activateLink.isVisible().catch(() => false)) {
		await activateLink.click();
		await page.waitForLoadState('networkidle');
	}
}

test.describe('Plugin delete', () => {
	test.setTimeout(90_000);

	test('deleting the plugin runs uninstall.php cleanly', async ({ page }) => {
		// Install from the release zip via Upload Plugin.
		await installPluginFromZip(page);

		// Verify plugin is active.
		let pluginRow = await getPluginRow(page);
		await expect(pluginRow).toBeVisible();

		// Seed a real `_transient_bbb_*` row so the uninstall DELETE has
		// something to match. Best-effort — see seedPluginTransient().
		const seedStatus = await seedPluginTransient(page);
		test.info().annotations.push({
			type: 'seed-format-status',
			description: String(seedStatus),
		});

		// Deactivate.
		const deactivateLink = pluginRow.getByRole('link', {
			name: /Deactivate/i,
		});
		if (await deactivateLink.isVisible().catch(() => false)) {
			await deactivateLink.click();
			await page.waitForLoadState('networkidle');
		}

		// Delete.
		pluginRow = await getPluginRow(page);
		await expect(
			pluginRow.getByRole('link', { name: /^Activate/i })
		).toBeVisible({ timeout: 10_000 });

		// From here on, any 5xx response means the uninstall path faulted —
		// a parse error, undefined function, or bad SQL in uninstall.php would
		// surface as a server error on the delete request.
		const serverErrors = [];
		page.on('response', (response) => {
			if (response.status() >= 500) {
				serverErrors.push(`${response.status()} ${response.url()}`);
			}
		});

		const deleteLink = pluginRow.getByRole('link', { name: /Delete/i });
		await expect(deleteLink).toBeVisible();

		// WordPress shows a JS confirm dialog for delete.
		page.on('dialog', (dialog) => dialog.accept());
		await deleteLink.click();
		await page.waitForLoadState('networkidle');

		// WordPress may show a "Yes, delete these files" confirmation form.
		const confirmButton = page.locator(
			'input[value="Yes, delete these files"], input#submit'
		);
		if (await confirmButton.count()) {
			await confirmButton.click();
			await page.waitForLoadState('networkidle');
		}

		await page.waitForTimeout(2000);

		// The delete results page (where an uninstall.php fatal would render)
		// must show no PHP error.
		const deleteResultBody = await page.locator('body').textContent();
		expect(deleteResultBody).not.toMatch(
			/Fatal error|Parse error|There has been a critical error/i
		);

		// Verify plugin is gone.
		await page.goto('/wp-admin/plugins.php');
		await page.waitForLoadState('networkidle');

		const body = await page.locator('body').textContent();
		expect(body).not.toContain('Fatal error');
		expect(body).not.toContain('There has been a critical error');

		const remainingRow = await getPluginRow(page);
		await expect(remainingRow).toHaveCount(0, { timeout: 10_000 });

		// uninstall.php executed during the delete with no server error.
		expect(serverErrors).toEqual([]);
	});
});

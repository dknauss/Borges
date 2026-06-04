/* eslint-disable jest/no-done-callback */
const { test, expect } = require('@playwright/test');

const DOI_SAMPLES = ['10.1145/3368089.3409742', '10.1038/s41586-020-2649-2'];
const DEMO_IMPORT_INPUT = `${DOI_SAMPLES.join('\n\n')}

PMID:26673779

@article{knuth1984literate,
  author = {Knuth, Donald E.},
  title = {Literate Programming},
  journal = {The Computer Journal},
  year = {1984},
  volume = {27},
  number = {2},
  pages = {97--111},
  doi = {10.1093/comjnl/27.2.97}
}`;

function getPluginRow(page) {
	return page.locator(
		'tr[data-plugin="borges-bibliography-builder/bibliography-builder.php"]:not(.plugin-update-tr)'
	);
}

async function ensurePluginActivated(page) {
	await page.goto('/wp-admin/plugins.php');
	await expect(
		page.getByRole('heading', { level: 1, name: 'Plugins' })
	).toBeVisible();

	const pluginRow = getPluginRow(page);

	await expect(pluginRow).toHaveCount(1);
	await expect(pluginRow).toBeVisible();

	const activateLink = pluginRow.getByRole('link', { name: /^Activate$/i });

	if (await activateLink.count()) {
		await activateLink.click();
		await page.waitForLoadState('networkidle');
	}

	await expect(pluginRow).toContainText('Bibliography');
	await expect(
		pluginRow.getByRole('link', { name: /Activate|Deactivate/i }).first()
	).toBeVisible();
}

test('plugin is active in WordPress Playground', async ({ page }) => {
	await ensurePluginActivated(page);

	await expect(getPluginRow(page)).toBeVisible();
});

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

async function openInserterAndSearch(page, query) {
	await page
		.getByRole('button', { name: /Block Inserter|Toggle block inserter/i })
		.click({ force: true });

	const inserterSearch = page
		.locator(
			'input[placeholder*="Search" i], input[aria-label*="Search" i], [role="searchbox"], .block-editor-inserter__search input'
		)
		.first();

	if (
		!(await inserterSearch.isVisible({ timeout: 3000 }).catch(() => false))
	) {
		const browseAllButton = page
			.getByRole('button', {
				name: /Browse all|See all|Open block inserter/i,
			})
			.first();

		if (await browseAllButton.isVisible().catch(() => false)) {
			await browseAllButton.click({ force: true });
		}
	}

	await expect(inserterSearch).toBeVisible();
	await inserterSearch.fill(query);
}

async function getEditorFrame(page) {
	const editorIframe = page.frameLocator('iframe[name="editor-canvas"]');
	const iframeBody = editorIframe.locator('body');

	if (await iframeBody.isVisible({ timeout: 3000 }).catch(() => false)) {
		return editorIframe;
	}

	return page;
}

async function insertBibliographyBlock(page) {
	await page.waitForFunction(
		() =>
			window.wp?.blocks?.getBlockType(
				'bibliography-builder/bibliography'
			) &&
			window.wp?.blocks?.createBlock &&
			window.wp?.data?.dispatch('core/block-editor')?.insertBlock,
		null,
		{ timeout: 20_000 }
	);

	await page.evaluate(() => {
		const block = window.wp.blocks.createBlock(
			'bibliography-builder/bibliography'
		);
		const editor = window.wp.data.dispatch('core/block-editor');
		editor.insertBlock(block);
		editor.selectBlock(block.clientId);
	});

	const editorFrame = await getEditorFrame(page);
	await expect(
		editorFrame
			.locator('.wp-block-bibliography-builder-bibliography')
			.first()
	).toBeVisible({ timeout: 30_000 });

	return editorFrame;
}

async function createPostWithBibliographyBlock(page) {
	await ensurePluginActivated(page);
	await page.goto('/wp-admin/post-new.php');
	await page.waitForLoadState('domcontentloaded');
	await dismissEditorOverlay(page);

	return insertBibliographyBlock(page);
}

async function importCitations(editorFrame, inputValue, expectedCount) {
	const textarea = editorFrame
		.locator('#bibliography-builder-paste-input')
		.first();
	await expect(textarea).toBeVisible({ timeout: 20_000 });
	await textarea.fill(inputValue);

	await editorFrame.getByRole('button', { name: /^Add$/i }).click();

	const entries = editorFrame.locator('.bibliography-builder-entry-text');
	await expect(entries.first()).toBeVisible({ timeout: 45_000 });
	await expect(entries).toHaveCount(expectedCount, { timeout: 45_000 });

	const notice = editorFrame
		.locator(
			'.bibliography-builder-inline-snackbar, .bibliography-builder-inline-notice'
		)
		.first();
	await expect(notice).toBeVisible({ timeout: 20_000 });
	await expect(notice).toContainText(
		`Added ${expectedCount} ${
			expectedCount === 1 ? 'citation' : 'citations'
		}.`
	);
	await expect(notice).not.toContainText("Couldn't parse");
	await expect(notice).not.toContainText('Unparsed items remain');

	return entries;
}

test('bibliography block is discoverable in the editor inserter', async ({
	page,
}) => {
	await ensurePluginActivated(page);
	await page.goto('/wp-admin/post-new.php');
	await page.waitForLoadState('domcontentloaded');

	await dismissEditorOverlay(page);

	await expect(
		page.getByRole('button', {
			name: /Block Inserter|Toggle block inserter/i,
		})
	).toBeVisible({ timeout: 20_000 });
	await openInserterAndSearch(page, 'Bibliography');
	await expect(page.getByText('Bibliography').first()).toBeVisible();
});

test('bibliography block imports a DOI in the Playground editor', async ({
	page,
}) => {
	test.setTimeout(90_000);

	const editorFrame = await createPostWithBibliographyBlock(page);
	const entries = await importCitations(editorFrame, DOI_SAMPLES[1], 1);

	await expect
		.poll(async () => (await entries.first().textContent())?.trim() || '', {
			timeout: 45_000,
		})
		.not.toBe('');
});

test('bibliography block imports two pasted DOIs together', async ({
	page,
}) => {
	test.setTimeout(120_000);

	const editorFrame = await createPostWithBibliographyBlock(page);

	await importCitations(editorFrame, DOI_SAMPLES.join('\n\n'), 2);
});

test('bibliography block imports the demo DOI, PMID, and BibTeX content', async ({
	page,
}) => {
	test.setTimeout(150_000);

	const editorFrame = await createPostWithBibliographyBlock(page);

	await importCitations(editorFrame, DEMO_IMPORT_INPUT, 4);
});

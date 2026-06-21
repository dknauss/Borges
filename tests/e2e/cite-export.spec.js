/* eslint-disable jest/no-done-callback */
/**
 * Frontend regression coverage for the per-entry Cite / Export affordances
 * (shipped in 1.4.x via PR #37). Guards the deterministic half of the original
 * 04-04 manual checkpoint:
 *
 *   1. the "Per-entry Cite / Export" toggle is present in the block inspector;
 *   2. enabling it renders <details class="bibliography-builder-cite-export">
 *      panels on the published frontend, each with a copy button and RIS /
 *      CSL-JSON / BibTeX / BibLaTeX export links carrying correct data URIs and
 *      download filenames (view.js restores the download value at runtime);
 *   3. leaving it off (the default) emits no cite/export panels.
 *
 * The purely visual row (flush-left layout / readability) is intentionally NOT
 * covered here — that remains a screenshot/manual judgment.
 *
 * State is driven through wp.data (the same dispatch pattern the other specs use
 * to insert blocks) rather than by clicking the inspector switch: the regression
 * surface worth guarding is attribute -> save-markup -> view.js -> frontend, not
 * the thin ToggleControl binding. The control's existence is asserted separately.
 *
 * Run via: npm run test:e2e:playground (boots WordPress Playground; needs network
 * for the CrossRef DOI import).
 */
const { test, expect } = require('@playwright/test');

const DOI_SAMPLE = '10.1038/s41586-020-2649-2';
const TOGGLE_LABEL = 'Per-entry Cite / Export';
const CITE_EXPORT_PANEL = '.bibliography-builder-cite-export';

function getPluginRow(page) {
	return page
		.locator(
			[
				'tr[data-slug="borges-bibliography-builder"]:not(.plugin-update-tr)',
				'tr[data-slug="Borges"]:not(.plugin-update-tr)',
				'tr[data-plugin="borges-bibliography-builder/bibliography-builder.php"]:not(.plugin-update-tr)',
				'tr[data-plugin="Borges/bibliography-builder.php"]:not(.plugin-update-tr)',
				'tr[data-plugin$="/bibliography-builder.php"]:not(.plugin-update-tr)',
			].join(', ')
		)
		.first();
}

async function ensurePluginActivated(page) {
	await page.goto('/wp-admin/plugins.php');
	await expect(
		page.getByRole('heading', { level: 1, name: 'Plugins' })
	).toBeVisible();

	const pluginRow = getPluginRow(page);
	await expect(pluginRow).toBeVisible();

	const activateLink = pluginRow.getByRole('link', { name: /^Activate$/i });
	if (await activateLink.count()) {
		await activateLink.click();
		await page.waitForLoadState('networkidle');
	}

	await expect(pluginRow).toContainText('Bibliography');
}

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

	return entries;
}

// Set the block's `outputCiteExport` attribute through the editor data store.
// Done before import so the import path computes per-entry export strings inline
// (avoids the toggle-after-the-fact backfill race).
async function setCiteExportAttribute(page, value) {
	await page.evaluate((val) => {
		const { select, dispatch } = window.wp.data;
		const target = select('core/block-editor')
			.getBlocks()
			.find(
				(block) => block.name === 'bibliography-builder/bibliography'
			);
		dispatch('core/block-editor').updateBlockAttributes(target.clientId, {
			outputCiteExport: val,
		});
	}, value);
}

async function publishCurrentPost(page) {
	return page.evaluate(async () => {
		const { dispatch, select } = window.wp.data;
		dispatch('core/editor').editPost({
			title: 'Cite/Export E2E',
			status: 'publish',
		});
		await dispatch('core/editor').savePost();
		return select('core/editor').getCurrentPost().link;
	});
}

test('the Per-entry Cite / Export toggle is available in the block inspector', async ({
	page,
}) => {
	test.setTimeout(90_000);

	await createPostWithBibliographyBlock(page);

	// Open the settings sidebar if the inspector control is not already shown.
	const toggleLabel = page.getByText(TOGGLE_LABEL).first();
	if (!(await toggleLabel.isVisible({ timeout: 2000 }).catch(() => false))) {
		const settingsButton = page
			.getByRole('button', { name: /^Settings$/i })
			.first();
		if (await settingsButton.isVisible().catch(() => false)) {
			await settingsButton.click({ force: true }).catch(() => {});
		}
		const blockTab = page.getByRole('tab', { name: /^Block$/i }).first();
		if (await blockTab.isVisible({ timeout: 2000 }).catch(() => false)) {
			await blockTab.click({ force: true }).catch(() => {});
		}
	}

	await expect(toggleLabel).toBeVisible({ timeout: 15_000 });
});

test('enabled Cite / Export renders per-entry panels with every export format on the frontend', async ({
	page,
}) => {
	test.setTimeout(120_000);

	const editorFrame = await createPostWithBibliographyBlock(page);
	// Enable before import so per-entry export strings are computed inline.
	await setCiteExportAttribute(page, true);
	await importCitations(editorFrame, DOI_SAMPLE, 1);

	const frontendUrl = await publishCurrentPost(page);
	await page.goto(frontendUrl);
	await page.waitForLoadState('networkidle');

	await expect(
		page.locator('.wp-block-bibliography-builder-bibliography')
	).toBeVisible();

	// 1 imported citation -> exactly 1 cite/export panel.
	const panel = page.locator(CITE_EXPORT_PANEL).first();
	await expect(panel).toBeVisible();
	await expect(page.locator(CITE_EXPORT_PANEL)).toHaveCount(1);

	// The panel is a <details> disclosure, collapsed by default — its contents
	// are present but hidden until expanded. Open it (also verifies the
	// disclosure works) before asserting on the button and links.
	await panel.locator('summary').click();
	await expect(panel).toHaveAttribute('open', '');

	// Copy button is present with non-empty citation text for the clipboard.
	const copyButton = panel.locator('.bibliography-builder-cite-copy');
	await expect(copyButton).toBeVisible();
	await expect(copyButton).toHaveAttribute('data-cite-text', /.+/);

	// All four export links: correct download filename, data URI, and the
	// runtime download attribute restored by view.js.
	const formats = [
		{
			name: 'RIS',
			selector: 'a[data-cite-export-filename$=".ris"]',
			href: /^data:application\/x-research-info-systems/,
			download: /\.ris$/,
		},
		{
			name: 'CSL-JSON',
			selector: 'a[data-cite-export-filename$=".csl.json"]',
			href: /^data:application\/vnd\.citationstyles\.csl\+json/,
			download: /\.csl\.json$/,
		},
		{
			name: 'BibLaTeX',
			selector: 'a[data-cite-export-filename$=".biblatex.bib"]',
			href: /^data:text\/x-bibtex/,
			download: /\.biblatex\.bib$/,
		},
		{
			name: 'BibTeX',
			selector:
				'a[data-cite-export-filename$=".bib"]:not([data-cite-export-filename$=".biblatex.bib"])',
			href: /^data:text\/x-bibtex/,
			download: /(?<!biblatex)\.bib$/,
		},
	];

	for (const format of formats) {
		const link = panel.locator(format.selector).first();
		await expect(link, `${format.name} link present`).toBeVisible();
		await expect(link).toHaveAttribute('href', format.href);
		// view.js copies data-cite-export-filename onto the download attribute.
		await expect(link).toHaveAttribute('download', format.download);
	}
});

test('Cite / Export panels are absent on the frontend when the toggle is off (default)', async ({
	page,
}) => {
	test.setTimeout(120_000);

	const editorFrame = await createPostWithBibliographyBlock(page);
	// Leave outputCiteExport at its default (false).
	await importCitations(editorFrame, DOI_SAMPLE, 1);

	const frontendUrl = await publishCurrentPost(page);
	await page.goto(frontendUrl);
	await page.waitForLoadState('networkidle');

	await expect(
		page.locator('.wp-block-bibliography-builder-bibliography')
	).toBeVisible();
	await expect(page.locator(CITE_EXPORT_PANEL)).toHaveCount(0);
});

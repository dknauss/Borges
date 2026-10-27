/* eslint-disable no-console, import/no-extraneous-dependencies, curly */
/**
 * Capture fresh screenshots for the WordPress plugin directory and GitHub README.
 *
 * Usage: PLAYWRIGHT_BASE_URL=http://127.0.0.1:9401 node scripts/capture-screenshots.js
 *
 * The gallery is ordered as a narrative (see readme.txt `== Screenshots ==`):
 *   1  Front-end rendered bibliography (the payoff)
 *   2  Block inserter (discovery)
 *   3  Paste / Import form with imported citations + hover actions
 *   4  Manual Entry form
 *   5  Structured field editor (fixing an imported / free-text entry in place)
 *   6  Numeric reorder controls (IEEE / Vancouver)
 *   7  Block settings sidebar (style, heading, metadata toggles)
 *   8  Exports panel (copy + downloads)
 *   9  Front-end per-entry Cite / Export panel (reader-facing)
 *
 * Capture happens in an efficient editor-driven order; each shot is written to
 * its narrative-numbered file regardless of when it is taken.
 */

const { chromium } = require('playwright');
const path = require('path');

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:9401';
const OUTPUT_DIR = path.resolve(__dirname, '../.wordpress-org');

const SAMPLE_BIBTEX = [
	'@article{smith2024,',
	'  author = {Smith, Ada and Jones, Brian},',
	'  title = {Advances in Citation Management for Academic Publishing},',
	'  journal = {Journal of Digital Scholarship},',
	'  year = {2024},',
	'  volume = {12},',
	'  number = {3},',
	'  pages = {117--134},',
	'  doi = {10.1234/jds.2024.0042}',
	'}',
	'',
	'@book{williams2023,',
	'  author = {Williams, Carol},',
	'  title = {The Oxford Handbook of Research Methods},',
	'  publisher = {Oxford University Press},',
	'  year = {2023},',
	'  address = {Oxford},',
	'  isbn = {978-0-19-123456-7}',
	'}',
	'',
	'@inbook{chen2022,',
	'  author = {Chen, David},',
	'  title = {Statistical Approaches to Literature Review},',
	'  booktitle = {Methods in Modern Scholarship},',
	'  editor = {Taylor, Elena},',
	'  publisher = {Cambridge University Press},',
	'  year = {2022},',
	'  pages = {45--78}',
	'}',
].join('\n');

// A deliberately untagged, identifier-free reference. The free-text parser
// imports it heuristically (inputFormat 'freetext'), which is what surfaces the
// structured-field "Edit fields" affordance used for screenshot 5.
const SAMPLE_FREETEXT =
	'Doe, Jane. "A Note on Untagged References Without Identifiers." Journal of Worked Examples, vol. 4, 2021, pp. 10-20.';

function shot(name) {
	return `${OUTPUT_DIR}/${name}`;
}

async function dismissEditorOverlay(page) {
	for (let attempt = 0; attempt < 5; attempt++) {
		const dialog = page.getByRole('dialog').first();
		const closeBtn = dialog
			.getByRole('button', {
				name: /Close|Dismiss|Got it|Okay|OK|Done|Skip/i,
			})
			.first();

		if (
			(await dialog.isVisible().catch(() => false)) &&
			(await closeBtn.isVisible().catch(() => false))
		) {
			await closeBtn.click({ force: true });
			await dialog
				.waitFor({ state: 'hidden', timeout: 5000 })
				.catch(() => {});
		}
		await page.keyboard.press('Escape').catch(() => {});

		const overlay = page.locator('.components-modal__screen-overlay');
		if (!(await overlay.count())) return;
		await overlay
			.first()
			.waitFor({ state: 'hidden', timeout: 2000 })
			.catch(() => {});
	}
}

// Close any open WordPress modal (e.g. the Welcome Guide) by clicking its close
// button. Unlike pressing Escape, this does not also close an open inserter.
async function closeAnyModal(page) {
	const overlay = page.locator('.components-modal__screen-overlay');
	if (!(await overlay.count())) return;
	const close = overlay
		.getByRole('button', { name: /Close|Got it|Dismiss/i })
		.first();
	if (await close.isVisible().catch(() => false)) {
		await close.click({ force: true });
		await overlay
			.first()
			.waitFor({ state: 'hidden', timeout: 3000 })
			.catch(() => {});
	}
}

async function ensurePluginActive(page) {
	await page.goto(`${BASE_URL}/wp-admin/plugins.php`);
	await page.waitForLoadState('networkidle');
	const row = page.locator('tr', { hasText: 'Bibliography' });
	const activateLink = row.getByRole('link', { name: /^Activate/i });
	if (await activateLink.count()) {
		await activateLink.click();
		await page.waitForLoadState('networkidle');
	}
}

// Open the block settings sidebar and select its Block tab so the Settings and
// Exports panels (and their controls) are present.
async function openBlockSidebar(page) {
	const settingsButton = page
		.getByRole('button', { name: /^Settings$/i })
		.first();
	if (await settingsButton.isVisible().catch(() => false)) {
		// Only click when the sidebar is closed (button is a toggle).
		const pressed = await settingsButton
			.getAttribute('aria-pressed')
			.catch(() => null);
		if (pressed !== 'true') {
			await settingsButton.click();
			await page.waitForTimeout(400);
		}
	}

	const blockTab = page.getByRole('tab', { name: /^Block$/i }).first();
	if (await blockTab.isVisible().catch(() => false)) {
		await blockTab.click();
		await page.waitForTimeout(400);
	}
}

// Pick a citation style from the sidebar SelectControl (native <select>).
async function selectStyle(page, value) {
	const styleSelect = page
		.getByRole('combobox', { name: /Citation Style/i })
		.first();
	if (await styleSelect.isVisible().catch(() => false)) {
		await styleSelect.selectOption(value).catch(() => {});
		await page.waitForTimeout(1500);
	}
}

async function addCitations(page, editorFrame, text) {
	const textarea = editorFrame.locator('textarea').first();
	await textarea.waitFor({ state: 'visible', timeout: 5000 });
	await textarea.fill(text);
	await page.waitForTimeout(400);

	const addButton = editorFrame
		.locator(
			'button:has-text("Add"), button:has-text("Parse"), button:has-text("Import")'
		)
		.first();
	await addButton.click();
	await page.waitForTimeout(3000);
}

(async () => {
	const browser = await chromium.launch();
	const context = await browser.newContext({
		viewport: { width: 1280, height: 900 },
	});
	const page = await context.newPage();

	await ensurePluginActive(page);

	// Navigate to a new post.
	await page.goto(`${BASE_URL}/wp-admin/post-new.php`);
	const editorFrame = page.frameLocator(
		'iframe[name="editor-canvas"], iframe'
	);
	await dismissEditorOverlay(page);
	// Proactively disable the Welcome Guide so its modal does not pop in mid-flow.
	await page
		.evaluate(() => {
			try {
				window.wp?.data
					?.dispatch('core/preferences')
					?.set('core/edit-post', 'welcomeGuide', false);
				window.wp?.data
					?.dispatch('core/preferences')
					?.set('core', 'welcomeGuide', false);
			} catch {
				// Older/newer editors may expose a different store; ignore.
			}
		})
		.catch(() => {});
	await editorFrame
		.getByRole('textbox', { name: /Add title/i })
		.waitFor({ state: 'visible', timeout: 15000 });
	await editorFrame
		.getByRole('textbox', { name: /Add title/i })
		.fill('Sample Bibliography');

	// --- Screenshot 2: Bibliography block in the inserter ---
	await page
		.getByRole('button', {
			name: /Block Inserter|Toggle block inserter/i,
		})
		.click({ force: true });

	const inserterSearch = page
		.locator(
			'input[placeholder*="Search" i], input[aria-label*="Search" i], [role="searchbox"], .block-editor-inserter__search input'
		)
		.first();
	await inserterSearch.waitFor({ state: 'visible' });
	await inserterSearch.fill('Bibliography');
	const blockOption = page
		.locator('.block-editor-block-types-list__item')
		.filter({ hasText: 'Bibliography' })
		.first();
	await blockOption.waitFor({ state: 'visible', timeout: 10000 });
	await page.waitForTimeout(500);
	await page.screenshot({ path: shot('screenshot-2.png') });
	console.log('Screenshot 2: Block inserter');

	// Insert the block, then close the inserter panel. Dismiss any late modal
	// (Welcome Guide) first so it cannot intercept the click.
	await closeAnyModal(page);
	await blockOption.scrollIntoViewIfNeeded();
	await blockOption.click();
	await page.waitForTimeout(2000);
	const closeInserter = page
		.getByRole('button', { name: /Block Inserter|Toggle block inserter/i })
		.first();
	if (await closeInserter.isVisible().catch(() => false)) {
		await closeInserter.click();
		await page.waitForTimeout(500);
	}

	// Import a realistic mix: three BibTeX records plus one untagged free-text
	// reference (the latter is what enables the structured field editor).
	await addCitations(page, editorFrame, SAMPLE_BIBTEX);
	await addCitations(page, editorFrame, SAMPLE_FREETEXT);

	// --- Screenshot 3: Import form populated, with hover actions revealed ---
	const firstEntry = editorFrame
		.locator('.bibliography-builder-entry, li')
		.first();
	if (await firstEntry.isVisible().catch(() => false)) {
		await firstEntry.hover();
		await page.waitForTimeout(400);
	}
	await page.screenshot({ path: shot('screenshot-3.png') });
	console.log('Screenshot 3: Import form with citations and hover actions');

	// --- Screenshot 4: Manual Entry form ---
	const manualTab = page
		.getByRole('button', { name: /Manual Entry/i })
		.first();
	if (await manualTab.isVisible().catch(() => false)) {
		await manualTab.click();
		await page.waitForTimeout(1000);
	}
	await page.screenshot({ path: shot('screenshot-4.png') });
	console.log('Screenshot 4: Manual Entry form');

	// Back to the paste/import mode for the in-list editing shots.
	const pasteTab = page
		.getByRole('button', { name: /Paste.*Import/i })
		.first();
	if (await pasteTab.isVisible().catch(() => false)) {
		await pasteTab.click();
		await page.waitForTimeout(500);
	}

	// --- Screenshot 5: Structured field editor (in place) ---
	// The free-text entry exposes an "Edit fields for …" button on hover.
	const freetextEntry = editorFrame
		.locator('.bibliography-builder-entry, li')
		.filter({ hasText: /Untagged References/i })
		.first();
	if (await freetextEntry.isVisible().catch(() => false)) {
		await freetextEntry.scrollIntoViewIfNeeded();
		await freetextEntry.hover();
		await page.waitForTimeout(300);
		const editFields = freetextEntry
			.getByRole('button', { name: /Edit fields for/i })
			.first();
		if (await editFields.isVisible().catch(() => false)) {
			await editFields.click();
			await editorFrame
				.locator('.bibliography-builder-structured-edit')
				.first()
				.waitFor({ state: 'visible', timeout: 5000 })
				.catch(() => {});
			await page.waitForTimeout(500);
			await page.screenshot({ path: shot('screenshot-5.png') });
			console.log('Screenshot 5: Structured field editor');
			// Close the editor without saving.
			const cancelBtn = editorFrame
				.getByRole('button', { name: /^Cancel$/i })
				.first();
			if (await cancelBtn.isVisible().catch(() => false)) {
				await cancelBtn.click();
				await page.waitForTimeout(400);
			}
		} else {
			console.warn(
				'Screenshot 5 SKIPPED: structured-edit affordance not found'
			);
		}
	}

	// Open the sidebar (needed for style selection and toggles).
	await openBlockSidebar(page);

	// --- Screenshot 6: Numeric reorder controls (IEEE) ---
	await selectStyle(page, 'ieee');
	const reorderEntry = editorFrame
		.locator('.bibliography-builder-entry, li')
		.first();
	if (await reorderEntry.isVisible().catch(() => false)) {
		await reorderEntry.scrollIntoViewIfNeeded();
		await reorderEntry.hover();
		await page.waitForTimeout(400);
		const moveBtn = editorFrame
			.getByRole('button', { name: /Move .* (up|down)/i })
			.first();
		await moveBtn
			.waitFor({ state: 'visible', timeout: 4000 })
			.catch(() =>
				console.warn('Screenshot 6: reorder buttons not visible')
			);
		await page.screenshot({ path: shot('screenshot-6.png') });
		console.log('Screenshot 6: Numeric reorder controls (IEEE)');
	}

	// Return to the default style for the configuration and front-end shots.
	await selectStyle(page, 'chicago-notes-bibliography');

	// --- Screenshot 7: Block settings sidebar ---
	// Enable the per-entry Cite / Export panel (also needed for the front-end
	// shot) and capture the full settings panel.
	const citeToggle = page
		.getByRole('checkbox', { name: /Per-entry Cite \/ Export/i })
		.first();
	if (await citeToggle.isVisible().catch(() => false)) {
		await citeToggle.check().catch(() => {});
		await page.waitForTimeout(500);
	}
	// Reveal hover actions on an entry for visual context.
	const settingsEntry = editorFrame
		.locator('.bibliography-builder-entry, li')
		.first();
	if (await settingsEntry.isVisible().catch(() => false)) {
		await settingsEntry.hover();
		await page.waitForTimeout(300);
	}
	await page.screenshot({ path: shot('screenshot-7.png') });
	console.log('Screenshot 7: Block settings sidebar');

	// --- Screenshot 8: Exports panel ---
	const copyBibliography = page
		.getByRole('button', { name: /Copy bibliography/i })
		.first();
	if (await copyBibliography.isVisible().catch(() => false)) {
		await copyBibliography.scrollIntoViewIfNeeded();
		await page.waitForTimeout(400);
		await page.screenshot({ path: shot('screenshot-8.png') });
		console.log('Screenshot 8: Exports panel');
	} else {
		console.warn('Screenshot 8 SKIPPED: Exports panel not found');
	}

	// --- Publish for the front-end shots ---
	const publishButton = page
		.getByRole('button', { name: /^Publish$/i })
		.first();
	await publishButton.click();
	await page.waitForTimeout(1500);

	const confirmPublish = page.locator(
		'.editor-post-publish-panel__header-publish-button button, button.editor-post-publish-button'
	);
	for (let i = 0; i < (await confirmPublish.count()); i++) {
		const text = await confirmPublish.nth(i).textContent();
		if (/publish/i.test(text)) {
			await confirmPublish.nth(i).click();
			break;
		}
	}
	await page.waitForTimeout(3000);

	// Resolve the published post URL.
	let postUrl = null;
	const viewLinks = page.locator('a');
	const viewCount = await viewLinks.count();
	for (let i = 0; i < viewCount; i++) {
		const text = await viewLinks
			.nth(i)
			.textContent()
			.catch(() => '');
		const href = await viewLinks
			.nth(i)
			.getAttribute('href')
			.catch(() => '');
		if (/view\s*post/i.test(text) && href) {
			postUrl = href.startsWith('http')
				? href
				: `${BASE_URL}/${href.replace(/^\//, '')}`;
			break;
		}
	}
	if (!postUrl) {
		await page.goto(`${BASE_URL}/wp-json/wp/v2/posts?per_page=1`);
		const responseText = await page.locator('body').textContent();
		try {
			const posts = JSON.parse(responseText);
			if (posts.length > 0 && posts[0].link) {
				postUrl = posts[0].link;
			}
		} catch {
			// Ignore parse errors.
		}
	}

	// --- Screenshot 1: Front-end rendered bibliography (the hero shot) ---
	await page.goto(postUrl || BASE_URL);
	await page.waitForLoadState('networkidle');
	await page.waitForTimeout(1000);
	await page.screenshot({ path: shot('screenshot-1.png') });
	console.log(
		postUrl
			? 'Screenshot 1: Front-end bibliography'
			: 'Screenshot 1: Homepage (could not resolve published post URL)'
	);

	// --- Screenshot 9: Front-end Cite / Export panel (expanded) ---
	const citeExport = page
		.locator('.bibliography-builder-cite-export')
		.first();
	if (await citeExport.isVisible().catch(() => false)) {
		await citeExport.scrollIntoViewIfNeeded();
		const summary = citeExport.locator('summary').first();
		if (await summary.isVisible().catch(() => false)) {
			await summary.click();
			await page.waitForTimeout(600);
		}
		await page.screenshot({ path: shot('screenshot-9.png') });
		console.log('Screenshot 9: Front-end Cite / Export panel');
	} else {
		console.warn(
			'Screenshot 9 SKIPPED: front-end Cite / Export panel not found'
		);
	}

	await browser.close();
	console.log(`\nAll screenshots saved to ${OUTPUT_DIR}/`);
})();

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

// Live check of the PMCID proxy against NCBI's PMC citation exporter. Kept
// separate from the demo import so a PMC-side failure is attributed to PMCID.
test('bibliography block imports a PubMed Central PMCID', async ({ page }) => {
	test.setTimeout(120_000);

	const editorFrame = await createPostWithBibliographyBlock(page);

	// Hit the proxy route directly first. If NCBI rejects the request, the
	// failure message carries the proxy's error code and upstream status
	// instead of only "no entry appeared" from the UI assertion below.
	const proxyResult = await page.evaluate(async () => {
		try {
			const data = await window.wp.apiFetch({
				path: '/bibliography/v1/pmcid/PMC3531190',
			});
			return { ok: true, title: data?.title, type: data?.type };
		} catch (error) {
			return {
				ok: false,
				code: error?.code,
				message: error?.message,
				data: error?.data,
			};
		}
	});

	expect(
		proxyResult.ok,
		`PMCID proxy failed: ${JSON.stringify(proxyResult)}`
	).toBe(true);
	expect(typeof proxyResult.title).toBe('string');

	await importCitations(editorFrame, 'PMCID: PMC3531190', 1);
});

// Live check of the arXiv proxy against export.arxiv.org. The direct proxy
// call comes first so a failure reports the proxy's error code and upstream
// status rather than only "no entry appeared".
test('bibliography block imports an arXiv preprint', async ({ page }) => {
	test.setTimeout(120_000);

	const editorFrame = await createPostWithBibliographyBlock(page);

	const proxyResult = await page.evaluate(async () => {
		try {
			const data = await window.wp.apiFetch({
				path: '/bibliography/v1/arxiv?id=1706.03762',
			});
			return { ok: true, title: data?.title, doi: data?.DOI };
		} catch (error) {
			return {
				ok: false,
				code: error?.code,
				message: error?.message,
				data: error?.data,
			};
		}
	});

	expect(
		proxyResult.ok,
		`arXiv proxy failed: ${JSON.stringify(proxyResult)}`
	).toBe(true);
	expect(proxyResult.title).toMatch(/Attention/i);
	expect(proxyResult.doi).toBe('10.48550/arXiv.1706.03762');

	await importCitations(editorFrame, 'arXiv:1706.03762', 1);
});

// Live check of the read-only Abilities API integration (WordPress 6.9+).
// Discovery first, then a run of borges/validate-citations, which needs no
// post fixture. Read-only abilities run over GET with an `input` argument.
test('Borges read-only abilities are discoverable and runnable', async ({
	page,
}) => {
	test.setTimeout(90_000);

	await ensurePluginActivated(page);
	await page.goto('/wp-admin/post-new.php');
	await page.waitForFunction(() => typeof window.wp?.apiFetch === 'function');

	const result = await page.evaluate(async () => {
		const call = async (options) => {
			try {
				return { ok: true, data: await window.wp.apiFetch(options) };
			} catch (error) {
				return {
					ok: false,
					code: error?.code,
					message: error?.message,
					data: error?.data,
				};
			}
		};

		const names = [
			'borges/get-bibliographies',
			'borges/export-bibliography',
			'borges/validate-citations',
		];
		const discovered = {};
		for (const name of names) {
			discovered[name] = await call({
				path: `/wp-abilities/v1/abilities/${name}`,
			});
		}

		const query = new URLSearchParams({
			'input[items][0][type]': 'book',
			'input[items][0][title]': 'Live Ability Check',
			'input[items][1][type]': 'not-a-csl-type',
		});
		const run = await call({
			path: `/wp-abilities/v1/abilities/borges/validate-citations/run?${query}`,
		});

		return { discovered, run };
	});

	for (const [name, response] of Object.entries(result.discovered)) {
		expect(
			response.ok,
			`${name} not discoverable: ${JSON.stringify(response)}`
		).toBe(true);
		expect(response.data?.category).toBe('bibliography');
	}

	expect(
		result.run.ok,
		`validate-citations run failed: ${JSON.stringify(result.run)}`
	).toBe(true);
	expect(result.run.data.valid).toBe(false);
	expect(result.run.data.results[0].valid).toBe(true);
	expect(result.run.data.results[1].valid).toBe(false);
});

// Live check of the ISBN proxy against Open Library's Books API. The ISBN is
// the example Open Library's API documentation uses.
test('bibliography block imports a book by ISBN', async ({ page }) => {
	test.setTimeout(120_000);

	const editorFrame = await createPostWithBibliographyBlock(page);

	const proxyResult = await page.evaluate(async () => {
		try {
			const data = await window.wp.apiFetch({
				path: '/bibliography/v1/isbn/9780140328721',
			});
			return { ok: true, type: data?.type, title: data?.title };
		} catch (error) {
			return {
				ok: false,
				code: error?.code,
				message: error?.message,
				data: error?.data,
			};
		}
	});

	expect(
		proxyResult.ok,
		`ISBN proxy failed: ${JSON.stringify(proxyResult)}`
	).toBe(true);
	expect(proxyResult.type).toBe('book');
	expect(proxyResult.title).toMatch(/Fantastic Mr\.? Fox/i);

	await importCitations(editorFrame, 'ISBN 978-0-14-032872-1', 1);
});

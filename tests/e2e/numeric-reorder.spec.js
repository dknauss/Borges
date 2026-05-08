/* eslint-disable jest/no-done-callback */
const { test, expect } = require('@playwright/test');

function getPluginRow(page) {
	return page
		.locator(
			'tr[data-slug="borges-bibliography-builder"], tr[data-plugin="borges-bibliography-builder/bibliography-builder.php"]'
		)
		.first()
		.or(
			page.locator('tr', {
				hasText: 'Bibliography',
			})
		);
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

	await expect(
		pluginRow.getByRole('link', { name: /Activate|Deactivate/i }).first()
	).toBeVisible();
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

async function createNumericBibliographyPost(page) {
	await page.goto('/wp-admin/post-new.php');
	await page.waitForLoadState('domcontentloaded');
	await dismissEditorOverlay(page);

	const postData = await page.evaluate(async () => {
		const { blocks, data } = window.wp || {};
		if (!blocks || !data) {
			throw new Error('Gutenberg editor APIs are not available.');
		}

		const dispatch = data.dispatch('core/editor');
		const select = data.select('core/editor');

		const block = blocks.createBlock('bibliography-builder/bibliography', {
			citationStyle: 'ieee',
			headingText: 'References',
			outputJsonLd: true,
			outputCoins: false,
			outputCslJson: false,
			citations: [
				{
					id: 'zulu-2024',
					formattedText: 'Zulu citation',
					displayOverride: null,
					inputFormat: 'manual',
					parseWarnings: [],
					csl: {
						type: 'article-journal',
						title: 'Zulu citation',
						author: [{ family: 'Zulu' }],
						issued: { 'date-parts': [[2024]] },
					},
				},
				{
					id: 'alpha-2023',
					formattedText: 'Alpha citation',
					displayOverride: null,
					inputFormat: 'manual',
					parseWarnings: [],
					csl: {
						type: 'article-journal',
						title: 'Alpha citation',
						author: [{ family: 'Alpha' }],
						issued: { 'date-parts': [[2023]] },
					},
				},
			],
		});

		dispatch.resetBlocks([block]);
		dispatch.editPost({
			title: 'Numeric Reorder Test',
			status: 'draft',
		});
		await dispatch.savePost();

		return {
			id: select.getCurrentPostId(),
			blockNames: data
				.select('core/block-editor')
				.getBlocks()
				.map((blockItem) => blockItem.name),
		};
	});

	return postData.id;
}

async function saveEditorPost(page) {
	await page.evaluate(async () => {
		const dispatch = window.wp.data.dispatch('core/editor');
		await dispatch.savePost();
	});
}

function getCanvas(page) {
	return page.frameLocator('iframe').first();
}

async function getCitationOrder(page) {
	const entries = getCanvas(page).locator('.bibliography-builder-entry-text');
	const count = await entries.count();
	const values = [];

	for (let index = 0; index < count; index += 1) {
		values.push((await entries.nth(index).textContent())?.trim());
	}

	return values;
}

async function revealEntryActions(page, index = 0) {
	const entry = getCanvas(page).locator('li').nth(index);
	await entry.focus();
}

test('numeric reorder persists after save and editor reload', async ({
	page,
}) => {
	test.setTimeout(60_000);

	await ensurePluginActivated(page);
	const postId = await createNumericBibliographyPost(page);
	await dismissEditorOverlay(page);
	await expect(getCanvas(page).locator('li').first()).toBeVisible({
		timeout: 20_000,
	});
	await revealEntryActions(page, 0);

	await expect(
		getCanvas(page).getByRole('button', { name: /Move 'Zulu 2024' down/i })
	).toBeVisible();

	expect(await getCitationOrder(page)).toEqual([
		'Zulu citation',
		'Alpha citation',
	]);

	await getCanvas(page)
		.getByRole('button', { name: /Move 'Zulu 2024' down/i })
		.click();

	await expect
		.poll(() => getCitationOrder(page))
		.toEqual(['Alpha citation', 'Zulu citation']);

	await saveEditorPost(page);
	await page.goto(`/wp-admin/post.php?post=${postId}&action=edit`);
	await page.waitForLoadState('domcontentloaded');
	await dismissEditorOverlay(page);

	await expect
		.poll(() => getCitationOrder(page))
		.toEqual(['Alpha citation', 'Zulu citation']);
});

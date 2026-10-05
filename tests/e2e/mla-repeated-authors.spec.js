/* eslint-disable jest/no-done-callback */
/**
 * MLA 9 repeated authors in the real block editor.
 *
 * save() replaces the names of an MLA entry by the same author as the entry
 * before it with three hyphens, keeping the names for screen readers. Unit and
 * parity tests pin the markup; this spec checks what only a real editor shows:
 *
 *   1. a block saved from the editor publishes the hyphens, and reopens valid;
 *   2. a post saved before the change (deprecation fixture v08, frozen on disk)
 *      opens valid through the deprecation chain, and re-saves with the hyphens.
 *
 * Run via: npm run test:e2e:playground
 */
const { readFileSync } = require('fs');
const { join } = require('path');
const { test, expect } = require('@playwright/test');
const { waitForEditorReady } = require('./helpers/editor');

const BLOCK_NAME = 'bibliography-builder/bibliography';
const REPEATED = '.bibliography-builder-repeated-author';
const LEGACY_MARKUP = readFileSync(
	join(__dirname, '..', 'fixtures', 'deprecations', 'v08-deprecated.html'),
	'utf8'
);

function borges(id, title, year) {
	return {
		id,
		csl: {
			id,
			type: 'book',
			title,
			publisher: 'Sur',
			author: [{ family: 'Borges', given: 'Jorge Luis' }],
			issued: { 'date-parts': [[year]] },
		},
		formattedText: `Borges, Jorge Luis. ${title}. Sur, ${year}.`,
		displayOverride: null,
	};
}

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

async function waitForBlockEditor(page) {
	await waitForEditorReady(page);
	await dismissEditorOverlay(page);
}

async function getBibliographyBlocks(page) {
	await page.waitForFunction(
		(name) =>
			window.wp.data
				.select('core/block-editor')
				.getBlocks()
				.some((block) => block.name === name),
		BLOCK_NAME,
		{ timeout: 30_000 }
	);

	return page.evaluate(
		(name) =>
			window.wp.data
				.select('core/block-editor')
				.getBlocks()
				.filter((block) => block.name === name)
				.map((block) => ({
					isValid: block.isValid,
					citations: block.attributes.citations.length,
				})),
		BLOCK_NAME
	);
}

async function savePost(page, title) {
	return page.evaluate(async (postTitle) => {
		const { dispatch, select } = window.wp.data;
		dispatch('core/editor').editPost({
			title: postTitle,
			status: 'publish',
		});
		await dispatch('core/editor').savePost();
		const post = select('core/editor').getCurrentPost();
		return { id: post.id, link: post.link };
	}, title);
}

async function getRawContent(page, id) {
	return page.evaluate(
		async (postId) =>
			(
				await window.wp.apiFetch({
					path: `/wp/v2/posts/${postId}?context=edit`,
				})
			).content.raw,
		id
	);
}

async function expectHyphensOnFrontend(page, link) {
	await page.goto(link);

	const entries = page.locator('.bibliography-builder-entry-text');
	await expect(entries).toHaveCount(2);
	await expect(entries.nth(0)).toContainText('Borges, Jorge Luis.');
	await expect(entries.nth(0).locator(REPEATED)).toHaveCount(0);

	const repeated = entries.nth(1).locator(REPEATED);
	// Three hyphens, not the dashes wptexturize makes of literal "-".
	await expect(
		repeated.locator('.bibliography-builder-repeated-author-mark')
	).toHaveText('---');
	await expect(
		repeated.locator('.bibliography-builder-repeated-author-mark')
	).toHaveAttribute('aria-hidden', 'true');
	await expect(entries.nth(1)).not.toContainText('\u2014');
	await expect(entries.nth(1)).not.toContainText('\u2013');
	await expect(
		repeated.locator('.bibliography-builder-visually-hidden')
	).toHaveText('Borges, Jorge Luis');
	// Visually hidden, not removed: still in the accessibility tree.
	await expect(
		repeated.locator('.bibliography-builder-visually-hidden')
	).toHaveCSS('position', 'absolute');
}

test('an MLA block saved in the editor publishes three hyphens and reopens valid', async ({
	page,
}) => {
	test.setTimeout(120_000);

	await ensurePluginActivated(page);
	await page.goto('/wp-admin/post-new.php');
	await waitForBlockEditor(page);

	await page.evaluate(
		({ name, citations }) => {
			const block = window.wp.blocks.createBlock(name, {
				citationStyle: 'mla-9',
				headingText: 'Works Cited',
				citations,
			});
			window.wp.data.dispatch('core/block-editor').insertBlock(block);
		},
		{
			name: BLOCK_NAME,
			citations: [
				borges('b1', 'Ficciones', 1944),
				borges('b2', 'El Aleph', 1949),
			],
		}
	);

	const { id, link } = await savePost(page, 'MLA repeated authors E2E');
	expect(await getRawContent(page, id)).toContain(
		'bibliography-builder-repeated-author'
	);

	await page.goto(`/wp-admin/post.php?post=${id}&action=edit`);
	await waitForBlockEditor(page);
	expect(await getBibliographyBlocks(page)).toEqual([
		{ isValid: true, citations: 2 },
	]);

	await expectHyphensOnFrontend(page, link);
});

test('an MLA block saved before the hyphens opens valid and re-saves with them', async ({
	page,
}) => {
	test.setTimeout(120_000);

	await ensurePluginActivated(page);
	await page.goto('/wp-admin/post-new.php');
	await waitForBlockEditor(page);

	const id = await page.evaluate(
		async (content) =>
			(
				await window.wp.apiFetch({
					path: '/wp/v2/posts',
					method: 'POST',
					data: {
						title: 'Legacy MLA E2E',
						status: 'publish',
						content,
					},
				})
			).id,
		LEGACY_MARKUP
	);

	expect(await getRawContent(page, id)).not.toContain(
		'bibliography-builder-repeated-author'
	);

	await page.goto(`/wp-admin/post.php?post=${id}&action=edit`);
	await waitForBlockEditor(page);
	expect(await getBibliographyBlocks(page)).toEqual([
		{ isValid: true, citations: 2 },
	]);

	const { link } = await savePost(page, 'Legacy MLA E2E, re-saved');
	expect(await getRawContent(page, id)).toContain(
		'bibliography-builder-repeated-author'
	);

	await expectHyphensOnFrontend(page, link);
});

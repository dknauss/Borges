/**
 * Block editor helpers shared by the Playground E2E specs.
 *
 * The specs used to insert a block as soon as the wp.data APIs existed, then
 * gave the editor-canvas iframe three seconds to appear before falling back to
 * the top-level page. On a slow first load both raced: a block dispatched
 * before the post entity loaded could be lost, and a canvas that took longer
 * than three seconds sent the assertion to the wrong document, so the first
 * insert in a spec file often passed only on a retry. These helpers wait for
 * the editor itself to report ready and ask the page which canvas it renders,
 * instead of guessing on a timer.
 */
const { expect } = require('@playwright/test');

const CANVAS_IFRAME = 'iframe[name="editor-canvas"]';

/**
 * Wait until the post editor can take block dispatches and has rendered its
 * canvas, iframed or not.
 *
 * @param {import('@playwright/test').Page} page Page.
 */
async function waitForEditorReady(page) {
	await page.waitForFunction(
		(iframeSelector) => {
			const wp = window.wp;

			if (
				!wp?.blocks?.createBlock ||
				!wp?.data?.dispatch('core/block-editor')?.insertBlock ||
				!wp?.data?.dispatch('core/editor')?.savePost ||
				!wp?.data?.select('core/editor')?.getCurrentPost()?.type
			) {
				return false;
			}

			const iframe = document.querySelector(iframeSelector);
			const root = iframe
				? iframe.contentDocument?.querySelector('.is-root-container')
				: document.querySelector('.is-root-container');

			return !!root;
		},
		CANVAS_IFRAME,
		{ timeout: 60_000 }
	);
}

/**
 * The document the editor renders blocks in: the editor-canvas iframe when
 * there is one, otherwise the page. Call after waitForEditorReady().
 *
 * @param {import('@playwright/test').Page} page Page.
 * @return {Promise<import('@playwright/test').Page|import('@playwright/test').FrameLocator>} Canvas.
 */
async function getEditorCanvas(page) {
	const iframed = await page.evaluate(
		(iframeSelector) => !!document.querySelector(iframeSelector),
		CANVAS_IFRAME
	);

	return iframed ? page.frameLocator(CANVAS_IFRAME) : page;
}

/**
 * Insert a block once the editor is ready, select it, and wait until that
 * block, by client ID, is visible in the canvas.
 *
 * @param {import('@playwright/test').Page} page       Page.
 * @param {string}                          name       Block name.
 * @param {Object}                          attributes Block attributes.
 * @return {Promise<{canvas: Object, clientId: string}>} Canvas and client ID.
 */
async function insertBlock(page, name, attributes = {}) {
	await waitForEditorReady(page);

	const clientId = await page.evaluate(
		({ blockName, blockAttributes }) => {
			const block = window.wp.blocks.createBlock(
				blockName,
				blockAttributes
			);
			const editor = window.wp.data.dispatch('core/block-editor');
			editor.insertBlock(block);
			editor.selectBlock(block.clientId);
			return block.clientId;
		},
		{ blockName: name, blockAttributes: attributes }
	);

	const canvas = await getEditorCanvas(page);
	await expect(canvas.locator(`[data-block="${clientId}"]`)).toBeVisible({
		timeout: 30_000,
	});

	return { canvas, clientId };
}

module.exports = { getEditorCanvas, insertBlock, waitForEditorReady };

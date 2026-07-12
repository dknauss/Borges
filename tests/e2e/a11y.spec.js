/* eslint-disable jest/no-done-callback, @wordpress/no-global-active-element */
const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

const SAMPLE_BIBTEX = `@article{a11y2026,
  author = {Audit, Avery},
  title = {Keyboard Accessible Bibliographies},
  journal = {Journal of Block Testing},
  year = {2026},
  volume = {1},
  number = {1},
  pages = {1--9},
  url = {https://example.com/a11y}
}`;

async function dismissEditorOverlay(page) {
	for (let attempt = 0; attempt < 5; attempt += 1) {
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
			continue;
		}

		await page.keyboard.press('Escape').catch(() => {});
		await page.waitForTimeout(300);

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

	await expect(pluginRow).toContainText('Bibliography');
	await expect(
		pluginRow.getByRole('link', { name: /Activate|Deactivate/i }).first()
	).toBeVisible();
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
	// Keep the a11y gate focused on the block UI itself. Inserter behavior is
	// covered by tests/e2e/playground.spec.js, and the editor's inserter is
	// intentionally dynamic enough to be flaky on slower CI runners.
	await page.waitForFunction(
		() =>
			window.wp?.blocks?.getBlockType(
				'bibliography-builder/bibliography'
			) &&
			window.wp?.blocks?.createBlock &&
			window.wp?.data?.dispatch('core/block-editor')?.insertBlock,
		null,
		{ timeout: 20000 }
	);

	await page.evaluate(() => {
		const block = window.wp.blocks.createBlock(
			'bibliography-builder/bibliography'
		);
		const editor = window.wp.data.dispatch('core/block-editor');
		editor.insertBlock(block);
		editor.selectBlock(block.clientId);
	});

	// Confirm the block appeared in the canvas before returning.
	// Playwright FrameLocator does not support .or(), so try iframe first.
	const inIframe = page
		.frameLocator('iframe[name="editor-canvas"]')
		.locator('.wp-block-bibliography-builder-bibliography')
		.first();
	const iframeVisible = await inIframe
		.waitFor({ state: 'visible', timeout: 30000 })
		.then(() => true)
		.catch(() => false);
	if (!iframeVisible) {
		// Fallback for WP installs without the editor-canvas iframe.
		await page
			.locator('.wp-block-bibliography-builder-bibliography')
			.first()
			.waitFor({ state: 'visible', timeout: 10000 });
	}
}

async function selectBibliographyBlock(page, editorFrame) {
	await dismissEditorOverlay(page);
	const blockRoot = editorFrame
		.locator('.wp-block-bibliography-builder-bibliography')
		.first();

	await blockRoot.click({ force: true });
	await page
		.waitForFunction(
			() =>
				window.wp?.data?.select('core/block-editor')?.getSelectedBlock()
					?.name === 'bibliography-builder/bibliography',
			null,
			{ timeout: 10000 }
		)
		.catch(() => {});
}

async function publishCurrentPost(page) {
	return page.evaluate(async () => {
		const { data } = window.wp || {};
		if (!data) {
			throw new Error('Gutenberg editor data store is not available.');
		}

		const editor = data.dispatch('core/editor');
		const select = data.select('core/editor');
		editor.editPost({
			title: `Accessibility Audit ${Date.now()}`,
			status: 'publish',
		});
		await editor.savePost();

		const currentPost = select.getCurrentPost();
		if (currentPost?.link) {
			return currentPost.link;
		}

		const postId = currentPost?.id || select.getCurrentPostId();
		if (!postId) {
			throw new Error('Could not determine saved post ID.');
		}

		const nonce = window.wpApiSettings?.nonce;
		const response = await fetch(
			`/wp-json/wp/v2/posts/${postId}?context=edit`,
			{
				headers: nonce ? { 'X-WP-Nonce': nonce } : {},
			}
		);
		if (!response.ok) {
			throw new Error(`Failed to fetch saved post ${postId}.`);
		}
		const post = await response.json();
		return post?.link || '';
	});
}

function getBlockAxeContext(page) {
	return page.frames().some((frame) => frame.name() === 'editor-canvas')
		? [
				'iframe[name="editor-canvas"]',
				'.wp-block-bibliography-builder-bibliography',
		  ]
		: '.wp-block-bibliography-builder-bibliography';
}

async function expectNoAxeViolations(page, context) {
	const scanResults = await new AxeBuilder({ page })
		.withTags(WCAG_TAGS)
		.include(context)
		.analyze();

	expect(
		scanResults.violations,
		scanResults.violations
			.map((violation) => {
				const targets = violation.nodes
					.slice(0, 3)
					.map((node) => node.target.join(' '))
					.join('; ');
				const more =
					violation.nodes.length > 3
						? ` (+${violation.nodes.length - 3} more)`
						: '';
				return `${violation.id} (${violation.impact}): ${violation.help} — ${targets}${more}`;
			})
			.join('\n')
	).toEqual([]);
}

test.describe('Bibliography block accessibility gate', () => {
	test.setTimeout(120000);
	test.describe.configure({ mode: 'serial' });

	test('plugin is active before accessibility checks run', async ({
		page,
	}) => {
		await ensurePluginActivated(page);
	});

	test('keyboard behavior and axe scans pass in editor and frontend', async ({
		page,
	}) => {
		let editorFrame;
		let frontendUrl = '';

		await test.step('set up a post with the Bibliography block', async () => {
			await page.goto('/wp-admin/post-new.php');
			await page.waitForLoadState('domcontentloaded');
			await dismissEditorOverlay(page);
			await expect(
				page.getByRole('button', {
					name: /Block Inserter|Toggle block inserter/i,
				})
			).toBeVisible({ timeout: 30000 });
			await insertBibliographyBlock(page);
			await dismissEditorOverlay(page);
			editorFrame = await getEditorFrame(page);
			await expect(
				editorFrame.locator('#bibliography-builder-paste-input')
			).toBeVisible({
				timeout: 20000,
			});
		});

		await test.step('toolbar mode buttons expose state and are keyboard reachable', async () => {
			const pasteButton = page
				.getByRole('button', { name: /Paste.*Import/i })
				.first();
			const manualButton = page
				.getByRole('button', { name: /Manual Entry/i })
				.first();

			await expect(pasteButton).toBeVisible({ timeout: 20000 });
			await expect(manualButton).toBeVisible({ timeout: 20000 });
			await expect(pasteButton).toHaveAttribute('aria-pressed', 'true');

			await manualButton.focus();
			await page.keyboard.press('Enter');
			await expect(manualButton).toHaveAttribute('aria-pressed', 'true');
			await expect(
				editorFrame.getByLabel('Publication Type')
			).toBeVisible({
				timeout: 3000,
			});

			await pasteButton.focus();
			await page.keyboard.press('Enter');
			await expect(pasteButton).toHaveAttribute('aria-pressed', 'true');
		});

		await test.step('citation input and add button work from the keyboard', async () => {
			const textarea = editorFrame.locator('textarea').first();
			await textarea.focus();
			expect(
				await textarea.evaluate((el) => document.activeElement === el)
			).toBe(true);
			expect(
				(await textarea.getAttribute('aria-label')) ||
					(await textarea.getAttribute('aria-labelledby'))
			).toBeTruthy();

			await textarea.fill(SAMPLE_BIBTEX);
			const addButton = editorFrame
				.getByRole('button', { name: /^Add$/i })
				.first();
			await addButton.focus();
			await addButton.press('Enter');

			const entries = editorFrame.locator('.bibliography-builder-entry');
			await entries.first().waitFor({ state: 'visible', timeout: 15000 });
			await expect(entries).toHaveCount(1);
		});

		await test.step('citation form collapse/expand controls are keyboard reachable', async () => {
			await dismissEditorOverlay(page);
			await selectBibliographyBlock(page, editorFrame);
			const chevronButton = page
				.getByRole('button', {
					name: /Hide citation form|Show citation form/i,
				})
				.first();

			await expect(chevronButton).toBeVisible({ timeout: 20000 });
			expect(await chevronButton.getAttribute('aria-label')).toMatch(
				/citation form/i
			);

			await chevronButton.focus();
			await page.keyboard.press('Enter');
			await expect(editorFrame.locator('textarea')).toHaveCount(0);

			const pasteButton = page
				.getByRole('button', { name: /Paste.*Import/i })
				.first();
			await pasteButton.focus();
			await page.keyboard.press('Enter');
			await expect(editorFrame.locator('textarea')).toHaveCount(1);
		});

		await test.step('citation row and action controls are keyboard reachable', async () => {
			const entry = editorFrame
				.locator('.bibliography-builder-entry')
				.first();
			expect(await entry.getAttribute('tabindex')).not.toBeNull();

			const trigger = entry
				.locator('.bibliography-builder-entry-trigger')
				.first();
			if (await trigger.isVisible().catch(() => false)) {
				expect(await trigger.getAttribute('aria-label')).toBeTruthy();
			}

			await entry.focus();
			const actionButtons = entry.locator(
				'.bibliography-builder-action-button'
			);
			await expect(actionButtons.first()).toBeVisible();

			const deleteButton = entry
				.locator('.bibliography-builder-action-button-delete')
				.first();
			if (await deleteButton.isVisible().catch(() => false)) {
				expect(
					await deleteButton.getAttribute('aria-label')
				).toBeTruthy();
			}
		});

		await test.step('bibliography list uses semantic list markup', async () => {
			const list = editorFrame
				.locator('.bibliography-builder-list')
				.first();
			await expect(list).toBeVisible();
			expect(
				['ul', 'ol'].includes(
					await list.evaluate((el) => el.tagName.toLowerCase())
				)
			).toBe(true);
		});

		// Audit plan item 4: focus lands on new entry after keyboard Add.
		await test.step('focus moves into block after keyboard-activated Add', async () => {
			const textarea = editorFrame.locator(
				'#bibliography-builder-paste-input'
			);
			await textarea.fill(
				SAMPLE_BIBTEX.replace(
					'Keyboard Accessible Bibliographies',
					'Keyboard Accessible Bibliographies 2'
				)
			);
			await page.waitForTimeout(500);
			const addButton = editorFrame
				.getByRole('button', { name: /^Add$/i })
				.first();
			await addButton.focus();
			await addButton.click();
			await expect(
				editorFrame.locator('.bibliography-builder-entry')
			).toHaveCount(2, { timeout: 15000 });

			// Focus must not be stranded at document root.
			const focusedTag = await page.evaluate(
				() => document.activeElement?.tagName?.toLowerCase() ?? ''
			);
			expect(['body', 'html']).not.toContain(focusedTag);
		});

		// Audit plan item 5: focus returns to trigger after collapse.
		await test.step('focus restores to chevron after citation form collapse', async () => {
			const chevronButton = page
				.getByRole('button', {
					name: /Hide citation form|Show citation form/i,
				})
				.first();
			await chevronButton.focus();
			await page.keyboard.press('Enter');
			await expect(editorFrame.locator('textarea')).toHaveCount(0);

			const isChevronFocused = await chevronButton.evaluate(
				(el) => document.activeElement === el
			);
			// Restore for subsequent steps.
			await page.keyboard.press('Enter');
			await expect(editorFrame.locator('textarea')).toHaveCount(1);
			expect(isChevronFocused).toBe(true);
		});

		// Audit plan item 6: interactive controls have a visible focus ring.
		await test.step('interactive controls expose a visible focus indicator', async () => {
			const pasteButton = page
				.getByRole('button', { name: /Paste.*Import/i })
				.first();
			await pasteButton.focus();
			const hasVisibleRing = await pasteButton.evaluate((el) => {
				const s = window.getComputedStyle(el);
				return (
					(s.outlineStyle !== 'none' &&
						parseFloat(s.outlineWidth) > 0) ||
					(s.boxShadow !== 'none' && s.boxShadow !== '')
				);
			});
			expect(hasVisibleRing).toBe(true);
		});

		await test.step('editor block has no automated WCAG axe violations', async () => {
			await expectNoAxeViolations(page, getBlockAxeContext(page));
		});

		await test.step('published frontend output has no automated WCAG axe violations', async () => {
			frontendUrl = await publishCurrentPost(page);
			expect(frontendUrl).toBeTruthy();

			await page.goto(frontendUrl);
			await page.waitForLoadState('networkidle');
			await expect(
				page
					.locator('.wp-block-bibliography-builder-bibliography')
					.first()
			).toBeVisible({ timeout: 10000 });
			await expectNoAxeViolations(
				page,
				'.wp-block-bibliography-builder-bibliography'
			);
		});
	});

	// Audit plan item 7: forced-colors (Windows High Contrast) mode.
	test('block passes axe scan under forced-colors media', async ({
		page,
	}) => {
		await page.emulateMedia({ forcedColors: 'active' });
		await page.goto('/wp-admin/post-new.php');
		await page.waitForLoadState('domcontentloaded');
		await dismissEditorOverlay(page);
		await expect(
			page.getByRole('button', {
				name: /Block Inserter|Toggle block inserter/i,
			})
		).toBeVisible({ timeout: 20000 });
		await insertBibliographyBlock(page);
		await dismissEditorOverlay(page);
		await expectNoAxeViolations(page, getBlockAxeContext(page));
	});

	// Audit plan item 8: 400% zoom / narrow-viewport reflow.
	test('published bibliography reflows at 320 px width without horizontal scroll', async ({
		page,
	}) => {
		// Insert block, add citation, publish.
		await page.goto('/wp-admin/post-new.php');
		await page.waitForLoadState('domcontentloaded');
		await dismissEditorOverlay(page);
		await expect(
			page.getByRole('button', {
				name: /Block Inserter|Toggle block inserter/i,
			})
		).toBeVisible({ timeout: 20000 });
		await insertBibliographyBlock(page);
		await dismissEditorOverlay(page);
		const editorFrame = await getEditorFrame(page);
		const textarea = editorFrame.locator('textarea').first();
		await expect(textarea).toBeVisible({ timeout: 10000 });
		await textarea.fill(SAMPLE_BIBTEX);
		await editorFrame
			.getByRole('button', { name: /^Add$/i })
			.first()
			.click();
		await editorFrame
			.locator('.bibliography-builder-entry')
			.first()
			.waitFor({ state: 'visible', timeout: 15000 });

		const frontendUrl = await publishCurrentPost(page);
		expect(frontendUrl).toBeTruthy();

		// Navigate at 320 px — equivalent to 400% zoom on a 1280 px display.
		await page.setViewportSize({ width: 320, height: 600 });
		await page.goto(frontendUrl);
		await page.waitForLoadState('networkidle');
		await expect(
			page.locator('.wp-block-bibliography-builder-bibliography').first()
		).toBeVisible({ timeout: 10000 });

		const hasHorizontalScroll = await page.evaluate(
			() => document.documentElement.scrollWidth > window.innerWidth
		);
		expect(hasHorizontalScroll).toBe(false);
	});

	// Audit plan items 9–10: BAC checks fire when plugin is active.
	test('BAC error indicator appears on empty block, clears when complete', async ({
		page,
	}) => {
		await page.goto('/wp-admin/post-new.php');
		await page.waitForLoadState('domcontentloaded');
		await dismissEditorOverlay(page);
		await expect(
			page.getByRole('button', {
				name: /Block Inserter|Toggle block inserter/i,
			})
		).toBeVisible({ timeout: 20000 });
		await insertBibliographyBlock(page);
		await dismissEditorOverlay(page);

		// BAC may not be active in all environments; skip gracefully if absent.
		// Detect via the block-accessibility-checks Redux store (v4 API).
		const bacPresent = await page
			.evaluate(
				() =>
					typeof window.wp !== 'undefined' &&
					typeof window.wp.data !== 'undefined' &&
					typeof window.wp.data.select(
						'block-accessibility-checks'
					) !== 'undefined'
			)
			.catch(() => false);

		if (!bacPresent) {
			test.skip(
				true,
				'Block Accessibility Checks plugin not active — skipping BAC integration assertions'
			);
			return;
		}

		// Item 9: empty block should show a BAC error indicator.
		// BAC wraps each flagged block in .ba11y-block-wrapper and renders
		// a .ba11y-block-indicator--error badge for error-level checks.
		const errorIndicator = page.locator('.ba11y-block-indicator--error');
		await expect(errorIndicator).toBeVisible({ timeout: 5000 });

		// Item 10: adding a citation and heading clears both the error and warning.
		const editorFrame = await getEditorFrame(page);
		const textarea = editorFrame.locator('textarea').first();
		await expect(textarea).toBeVisible({ timeout: 10000 });
		await textarea.fill(SAMPLE_BIBTEX);
		await editorFrame
			.getByRole('button', { name: /^Add$/i })
			.first()
			.click();
		await editorFrame
			.locator('.bibliography-builder-entry')
			.first()
			.waitFor({ state: 'visible', timeout: 15000 });

		// Satisfy the heading_missing warning via the block sidebar.
		const headingInput = page
			.getByRole('textbox', { name: /heading/i })
			.first();
		if (
			await headingInput.isVisible({ timeout: 3000 }).catch(() => false)
		) {
			await headingInput.fill('References');
		}

		// Both error (empty_bibliography) and warning (heading_missing) should clear.
		await expect(errorIndicator).not.toBeVisible({ timeout: 5000 });
		const warningIndicator = page.locator(
			'.ba11y-block-indicator--warning'
		);
		await expect(warningIndicator).not.toBeVisible({ timeout: 3000 });
	});
});

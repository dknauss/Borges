/**
 * Save-markup parity between the JS save() and its PHP port.
 *
 * Server-side write routes (Phase 05, M2) regenerate a block's saved HTML in
 * PHP with `bibliography_builder_render_save_markup()`. The editor re-validates
 * that HTML against the JS `save()` whenever the post is opened, so the two
 * must agree or the block opens as invalid.
 *
 * The contract is split across the two test runners, meeting at committed
 * files in tests/fixtures/save-parity/:
 *
 * - `cases.json` holds block attributes. PHPUnit (SaveMarkupParityTest)
 *   renders each case in PHP and asserts it equals the committed `<name>.html`.
 * - This test asserts each committed `<name>.html` is byte-identical to what
 *   the current JS `save()` produces for the same attributes, and that the
 *   full block markup validates in the real block registry with the block's
 *   supports (anchor, className, font size, spacing) applied.
 *
 * A change to save() therefore fails here until the PHP port and the fixtures
 * are updated to match: regenerate the fixtures from PHP with
 *   BORGES_WRITE_SAVE_PARITY_FIXTURES=1 composer test:php -- --filter SaveMarkupParity
 * and this test tells you whether the port still agrees.
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import {
	getSaveContent,
	parse,
	registerBlockType,
	unregisterBlockType,
} from '@wordpress/blocks';
// Registers the block-supports save hooks (anchor, className, typography,
// spacing), so getSaveContent() matches what the editor saves.
import '@wordpress/block-editor';

import metadata from '../block.json';
import save from './save';

const FIXTURE_DIR = join(__dirname, '..', 'tests', 'fixtures', 'save-parity');
const { cases } = JSON.parse(
	readFileSync(join(FIXTURE_DIR, 'cases.json'), 'utf8')
);

/**
 * Serialize block attributes for a block comment, as the block serializer
 * does, so the parsed attributes match what PHP read.
 *
 * @param {Object} attributes Block attributes.
 * @return {string} Comment-safe JSON.
 */
function serializeCommentAttributes(attributes) {
	return JSON.stringify(attributes)
		.replace(/--/g, '\\u002d\\u002d')
		.replace(/</g, '\\u003c')
		.replace(/>/g, '\\u003e')
		.replace(/&/g, '\\u0026')
		.replace(/\\"/g, '\\u0022');
}

function blockMarkup(attributes, innerHTML) {
	const { name } = metadata;
	const json = serializeCommentAttributes(attributes);

	return innerHTML
		? `<!-- wp:${name} ${json} -->\n${innerHTML}\n<!-- /wp:${name} -->`
		: `<!-- wp:${name} ${json} /-->`;
}

describe('save() parity with the PHP port', () => {
	beforeAll(() => {
		// Current save only: a block that validates only through a deprecation
		// would be migrated on open, which a server write must never rely on.
		registerBlockType(metadata.name, { ...metadata, save });
	});

	afterAll(() => {
		unregisterBlockType(metadata.name);
	});

	it('has cases', () => {
		expect(cases.length).toBeGreaterThan(0);
	});

	it.each(cases.map((testCase) => [testCase.name, testCase]))(
		'%s: PHP markup matches save() and validates',
		(name, { attributes }) => {
			const phpMarkup = readFileSync(
				join(FIXTURE_DIR, `${name}.html`),
				'utf8'
			).replace(/\n$/, '');
			const [parsed] = parse(blockMarkup(attributes, phpMarkup));

			expect(parsed.name).toBe(metadata.name);

			const jsMarkup = getSaveContent(metadata.name, parsed.attributes);

			if (process.env.BORGES_DUMP_SAVE_PARITY) {
				// eslint-disable-next-line no-console
				console.log(`${name}\n${jsMarkup}`);
			}

			expect(phpMarkup).toBe(jsMarkup);
			expect(parsed.isValid).toBe(true);
		}
	);
});

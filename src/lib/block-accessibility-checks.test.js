import { registerBACChecks } from './block-accessibility-checks';

const BLOCK_NAME = 'bibliography-builder/bibliography';

function makeAttributes(overrides = {}) {
	return {
		citations: [],
		headingText: '',
		outputJsonLd: true,
		outputCoins: false,
		outputCslJson: false,
		...overrides,
	};
}

describe('registerBACChecks', () => {
	let originalBAC;

	beforeEach(() => {
		originalBAC = window.BlockAccessibilityChecks;
	});

	afterEach(() => {
		window.BlockAccessibilityChecks = originalBAC;
	});

	it('is a no-op when window.BlockAccessibilityChecks is absent', () => {
		delete window.BlockAccessibilityChecks;
		expect(() => registerBACChecks()).not.toThrow();
	});

	it('is a no-op when registerBlockChecks is not a function', () => {
		window.BlockAccessibilityChecks = {};
		expect(() => registerBACChecks()).not.toThrow();
	});

	it('calls registerBlockChecks with the block name and checks array', () => {
		const registerBlockChecks = jest.fn();
		window.BlockAccessibilityChecks = { registerBlockChecks };

		registerBACChecks();

		expect(registerBlockChecks).toHaveBeenCalledTimes(1);
		const [name, checks] = registerBlockChecks.mock.calls[0];
		expect(name).toBe(BLOCK_NAME);
		expect(Array.isArray(checks)).toBe(true);
		expect(checks.length).toBeGreaterThan(0);
	});
});

describe('BAC check logic', () => {
	let checks;

	beforeEach(() => {
		const registerBlockChecks = jest.fn();
		window.BlockAccessibilityChecks = { registerBlockChecks };
		registerBACChecks();
		checks = registerBlockChecks.mock.calls[0][1];
	});

	afterEach(() => {
		delete window.BlockAccessibilityChecks;
	});

	function getCheck(id) {
		return checks.find((c) => c.id === id);
	}

	describe('empty_bibliography', () => {
		it('fires when citations is empty', () => {
			expect(getCheck('empty_bibliography').test(makeAttributes())).toBe(
				true
			);
		});

		it('fires when citations is missing', () => {
			expect(
				getCheck('empty_bibliography').test(
					makeAttributes({ citations: undefined })
				)
			).toBe(true);
		});

		it('does not fire when citations are present', () => {
			expect(
				getCheck('empty_bibliography').test(
					makeAttributes({ citations: [{ title: 'Test' }] })
				)
			).toBe(false);
		});

		it('has error severity', () => {
			expect(getCheck('empty_bibliography').severity).toBe('error');
		});
	});

	describe('heading_missing', () => {
		it('fires when citations exist but headingText is empty', () => {
			expect(
				getCheck('heading_missing').test(
					makeAttributes({
						citations: [{ title: 'Test' }],
						headingText: '',
					})
				)
			).toBe(true);
		});

		it('does not fire when headingText is set', () => {
			expect(
				getCheck('heading_missing').test(
					makeAttributes({
						citations: [{ title: 'Test' }],
						headingText: 'References',
					})
				)
			).toBe(false);
		});

		it('does not fire when block is empty', () => {
			expect(
				getCheck('heading_missing').test(
					makeAttributes({ citations: [] })
				)
			).toBe(false);
		});

		it('has warning severity', () => {
			expect(getCheck('heading_missing').severity).toBe('warning');
		});
	});

	describe('raw_url_link_text', () => {
		it('fires when a citation has a URL but no title', () => {
			expect(
				getCheck('raw_url_link_text').test(
					makeAttributes({
						citations: [{ URL: 'https://example.com/paper' }],
					})
				)
			).toBe(true);
		});

		it('fires when a citation has a DOI but no title', () => {
			expect(
				getCheck('raw_url_link_text').test(
					makeAttributes({
						citations: [{ DOI: '10.1234/example' }],
					})
				)
			).toBe(true);
		});

		it('fires when a citation title is itself a raw URL', () => {
			expect(
				getCheck('raw_url_link_text').test(
					makeAttributes({
						citations: [
							{
								URL: 'https://example.com',
								title: 'https://example.com',
							},
						],
					})
				)
			).toBe(true);
		});

		it('does not fire when citations have descriptive titles', () => {
			expect(
				getCheck('raw_url_link_text').test(
					makeAttributes({
						citations: [
							{ URL: 'https://example.com', title: 'My Paper' },
						],
					})
				)
			).toBe(false);
		});

		it('does not fire when citations array is empty', () => {
			expect(
				getCheck('raw_url_link_text').test(
					makeAttributes({ citations: [] })
				)
			).toBe(false);
		});

		it('has warning severity', () => {
			expect(getCheck('raw_url_link_text').severity).toBe('warning');
		});
	});

	describe('all_metadata_disabled', () => {
		it('fires when all three metadata outputs are disabled', () => {
			expect(
				getCheck('all_metadata_disabled').test(
					makeAttributes({
						outputJsonLd: false,
						outputCoins: false,
						outputCslJson: false,
					})
				)
			).toBe(true);
		});

		it('does not fire when outputJsonLd is enabled', () => {
			expect(
				getCheck('all_metadata_disabled').test(
					makeAttributes({
						outputJsonLd: true,
						outputCoins: false,
						outputCslJson: false,
					})
				)
			).toBe(false);
		});

		it('does not fire when outputCoins is enabled', () => {
			expect(
				getCheck('all_metadata_disabled').test(
					makeAttributes({
						outputJsonLd: false,
						outputCoins: true,
						outputCslJson: false,
					})
				)
			).toBe(false);
		});

		it('does not fire when outputCslJson is enabled', () => {
			expect(
				getCheck('all_metadata_disabled').test(
					makeAttributes({
						outputJsonLd: false,
						outputCoins: false,
						outputCslJson: true,
					})
				)
			).toBe(false);
		});

		it('has warning severity', () => {
			expect(getCheck('all_metadata_disabled').severity).toBe('warning');
		});
	});
});

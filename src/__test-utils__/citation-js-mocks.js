/**
 * Shared citation-js mock factories for Jest test files.
 *
 * jest.mock() calls are hoisted above imports by Jest's transform, so they
 * cannot reference imported values. Use require() inside mock factory
 * callbacks to pull these factories in at hoist time:
 *
 *   jest.mock('@citation-js/core', () =>
 *     require('./__test-utils__/citation-js-mocks').citationJsCoreMock()
 *   );
 */

function citationJsCoreMock() {
	return {
		Cite: {
			async: jest.fn(),
		},
	};
}

function citationJsPluginMock() {
	return {};
}

function stubFormattingFactory() {
	return {
		formatBibliographyEntries: jest.fn((cslItems) =>
			cslItems.map(() => 'Formatted bibliography entry')
		),
	};
}

function descriptiveFormattingFactory() {
	return {
		formatBibliographyEntries: jest.fn((cslItems) =>
			cslItems.map((item) =>
				`${item.author?.[0]?.family || 'Unknown'}. ${item.title}. ${
					item.URL || ''
				}`.trim()
			)
		),
	};
}

module.exports = {
	citationJsCoreMock,
	citationJsPluginMock,
	stubFormattingFactory,
	descriptiveFormattingFactory,
};

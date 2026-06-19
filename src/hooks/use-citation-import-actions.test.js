import { act, renderHook } from '@testing-library/react';
import { useCitationImportActions } from './use-citation-import-actions';
import { parsePastedInput } from '../lib/parser';
import { partitionDuplicateCitations } from '../lib/deduplicate';
import { computeExportStrings } from './compute-export-strings';

jest.mock(
	'@wordpress/element',
	() => {
		const React = require('react');
		return { useCallback: React.useCallback };
	},
	{ virtual: true }
);

jest.mock('@wordpress/i18n', () => ({ __: (s) => s }), { virtual: true });

jest.mock('../lib/deduplicate', () => ({
	partitionDuplicateCitations: jest.fn(),
}));

jest.mock('../lib/input-support', () => ({
	SUPPORTED_INPUT_MESSAGE: 'supported input',
}));

jest.mock('../lib/sorter', () => ({
	sortCitations: jest.fn((citations) => citations),
}));

jest.mock('./compute-export-strings', () => ({
	computeExportStrings: jest.fn(async (cslObjects) =>
		(cslObjects || []).map(() => ({
			exportBibtex: 'BIBTEX',
			exportBiblatex: 'BIBLATEX',
		}))
	),
}));

jest.mock('../lib/citation-limits', () => ({
	MAX_CITATIONS_PER_BIBLIOGRAPHY: 100,
	getBibliographyLimitExceededMessage: jest.fn(() => 'exceeded'),
	getBibliographyLimitReachedMessage: jest.fn(() => 'reached'),
}));

jest.mock('../lib/parser', () => ({ parsePastedInput: jest.fn() }));

jest.mock('../lib/formatting/csl', () => ({
	formatBibliographyEntries: jest.fn((items) =>
		items.map(() => 'Formatted entry')
	),
}));

function makeArgs(overrides = {}) {
	const citationsRef = { current: [] };
	return {
		announce: jest.fn(),
		beginAsyncOperation: jest.fn(() => 1),
		citationStyle: 'apa-7',
		citationsRef,
		clearNotice: jest.fn(),
		inputValue: '10.1234/example',
		isCurrentAsyncOperation: jest.fn(() => true),
		queueFocus: jest.fn(),
		setAttributes: jest.fn(),
		setIsLoading: jest.fn(),
		updatePasteInput: jest.fn(),
		...overrides,
	};
}

describe('useCitationImportActions — export-string pre-computation', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		parsePastedInput.mockResolvedValue({
			entries: [{ id: 'new-1', csl: { title: 'Imported' } }],
			errors: [],
			truncated: false,
			remainingInput: '',
			skippedDuplicateCount: 0,
		});
		partitionDuplicateCitations.mockReturnValue({
			uniqueEntries: [{ id: 'new-1', csl: { title: 'Imported' } }],
			duplicateEntries: [],
		});
		computeExportStrings.mockImplementation(async (cslObjects) =>
			(cslObjects || []).map(() => ({
				exportBibtex: 'BIBTEX',
				exportBiblatex: 'BIBLATEX',
			}))
		);
	});

	it('stores exportBibtex/exportBiblatex on imported citations', async () => {
		const args = makeArgs();
		const { result } = renderHook(() => useCitationImportActions(args));

		await act(() => result.current.handleParse());

		expect(args.setAttributes).toHaveBeenCalledTimes(1);
		const saved = args.setAttributes.mock.calls[0][0].citations[0];
		expect(saved.exportBibtex).toBe('BIBTEX');
		expect(saved.exportBiblatex).toBe('BIBLATEX');
		expect(saved.formattedText).toBe('Formatted entry');
	});
});

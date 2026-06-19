import { act, renderHook } from '@testing-library/react';
import { useManualCitationActions } from './use-manual-citation-actions';
import { findDuplicateCitation } from '../lib/deduplicate';
import { validateManualEntry } from '../lib/manual-entry';

jest.mock(
	'@wordpress/element',
	() => {
		const React = require('react');
		return {
			useCallback: React.useCallback,
			useMemo: React.useMemo,
			useState: React.useState,
		};
	},
	{ virtual: true }
);

jest.mock('@wordpress/i18n', () => ({ __: (s) => s }), { virtual: true });

jest.mock('../lib/deduplicate', () => ({
	findDuplicateCitation: jest.fn(() => null),
}));

jest.mock('../lib/manual-entry', () => ({
	buildManualCsl: jest.fn(() => ({ title: 'Manual entry' })),
	createEmptyManualEntryFields: jest.fn((type = 'article-journal') => ({
		type,
	})),
	createManualCitationFromCsl: jest.fn(async (csl) => ({
		id: 'manual-1',
		csl,
	})),
	MANUAL_ENTRY_TYPE_OPTIONS: [],
	validateManualEntry: jest.fn(() => null),
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
	getBibliographyLimitReachedMessage: jest.fn(() => 'reached'),
}));

jest.mock('../lib/formatting/csl', () => ({
	formatBibliographyEntries: jest.fn((items) =>
		items.map(() => 'Formatted entry')
	),
}));

function makeArgs(overrides = {}) {
	return {
		announce: jest.fn(),
		beginAsyncOperation: jest.fn(() => 1),
		citationStyle: 'apa-7',
		citationsRef: { current: [] },
		clearNotice: jest.fn(),
		currentNotice: null,
		isCurrentAsyncOperation: jest.fn(() => true),
		pasteZoneRef: { current: null },
		queueFocus: jest.fn(),
		setAttributes: jest.fn(),
		...overrides,
	};
}

describe('useManualCitationActions — export-string pre-computation', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		validateManualEntry.mockReturnValue(null);
		findDuplicateCitation.mockReturnValue(null);
	});

	it('stores exportBibtex/exportBiblatex on a manually added citation', async () => {
		const args = makeArgs();
		const { result } = renderHook(() => useManualCitationActions(args));

		await act(() => result.current.handleManualAdd());

		expect(args.setAttributes).toHaveBeenCalledTimes(1);
		const saved = args.setAttributes.mock.calls[0][0].citations[0];
		expect(saved.exportBibtex).toBe('BIBTEX');
		expect(saved.exportBiblatex).toBe('BIBLATEX');
		expect(saved.formattedText).toBe('Formatted entry');
	});
});

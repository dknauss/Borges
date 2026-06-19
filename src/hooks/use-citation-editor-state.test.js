import { act, renderHook, waitFor } from '@testing-library/react';
import { useCitationEditorState } from './use-citation-editor-state';
import { formatBibliographyEntries } from '../lib/formatting/csl';
import { validateIdentifierFields } from '../lib/manual-entry';

// Mock @wordpress/element → React hooks.
jest.mock(
	'@wordpress/element',
	() => {
		const React = require('react');
		return {
			useCallback: React.useCallback,
			useRef: React.useRef,
			useState: React.useState,
		};
	},
	{ virtual: true }
);

// Stub formatting utilities — only the shapes matter here.
const HEADING_DEFAULTS = {
	'chicago-notes-bibliography': 'Bibliography',
	'chicago-author-date': 'References',
	'apa-7': 'References',
	'mla-9': 'Works Cited',
	harvard: 'References',
	ieee: 'References',
	vancouver: 'References',
	oscola: 'Bibliography',
	abnt: 'Referências',
};

jest.mock('../lib/formatting', () => ({
	getAutoFormattedText: jest.fn((citation) => citation.formattedText || ''),
	getDefaultHeadingText: jest.fn(
		(styleKey = 'chicago-notes-bibliography') =>
			HEADING_DEFAULTS[styleKey] || 'Bibliography'
	),
	getDisplayText: jest.fn(
		(citation) => citation.displayOverride || citation.formattedText || ''
	),
	getStyleDefinition: jest.fn(() => ({
		label: 'Chicago Notes-Bibliography',
	})),
}));

jest.mock('../lib/manual-entry', () => ({
	normalizeDoiValue: jest.fn((v) => v || null),
	normalizeUrlValue: jest.fn((v) => v || null),
	validateIdentifierFields: jest.fn(() => null),
}));

jest.mock('../lib/sorter', () => ({
	sortCitations: jest.fn((citations) => citations),
}));

jest.mock('../lib/formatting/csl', () => ({
	formatBibliographyEntries: jest.fn((items) =>
		items.map(() => 'Reformatted entry')
	),
}));

jest.mock('./compute-export-strings', () => ({
	computeExportStrings: jest.fn(async (cslObjects) =>
		(cslObjects || []).map(() => ({
			exportBibtex: 'BIBTEX',
			exportBiblatex: 'BIBLATEX',
		}))
	),
}));

// --- Test helpers ---

function makeCitation(overrides = {}) {
	return {
		id: 'cit-1',
		formattedText: 'Smith. A Book. 2024.',
		displayOverride: null,
		parseWarnings: [],
		csl: {
			type: 'book',
			title: 'A Book',
			author: [{ family: 'Smith', given: 'Ada' }],
			issued: { 'date-parts': [[2024]] },
		},
		...overrides,
	};
}

function makeHookArgs(citations = [makeCitation()]) {
	const citationsRef = { current: citations };
	const setAttributes = jest.fn((update) => {
		if (update.citations) {
			citationsRef.current = update.citations;
		}
	});
	const announce = jest.fn();
	const clearNotice = jest.fn();
	const queueFocus = jest.fn();

	return {
		announce,
		clearNotice,
		citationsRef,
		queueFocus,
		setAttributes,
		citationStyle: 'chicago-notes-bibliography',
	};
}

beforeEach(() => {
	jest.clearAllMocks();
	formatBibliographyEntries.mockImplementation((items) =>
		items.map(() => 'Reformatted entry')
	);
	validateIdentifierFields.mockReturnValue(null);
});

// --- Inline text editing ---

describe('handleEditStart / handleEditConfirm / handleEditCancel', () => {
	it('starts editing by setting editingId and editText', () => {
		const args = makeHookArgs();
		const { result } = renderHook(() => useCitationEditorState(args));

		act(() => result.current.handleEditStart('cit-1'));

		expect(result.current.editingId).toBe('cit-1');
		expect(result.current.editText).toBe('Smith. A Book. 2024.');
		expect(args.announce).toHaveBeenCalledWith(
			'info',
			'Editing citation. Press Escape to cancel.'
		);
	});

	it('does nothing when handleEditStart is called with an unknown id', () => {
		const args = makeHookArgs();
		const { result } = renderHook(() => useCitationEditorState(args));

		act(() => result.current.handleEditStart('nonexistent'));

		expect(result.current.editingId).toBeNull();
	});

	it('confirms edit and writes displayOverride when text differs from auto-format', () => {
		const args = makeHookArgs();
		const { result } = renderHook(() => useCitationEditorState(args));

		act(() => result.current.handleEditStart('cit-1'));
		act(() => result.current.setEditText('Smith. A Book (Revised). 2024.'));
		act(() => result.current.handleEditConfirm());

		expect(args.setAttributes).toHaveBeenCalledWith(
			expect.objectContaining({
				citations: expect.arrayContaining([
					expect.objectContaining({
						id: 'cit-1',
						displayOverride: 'Smith. A Book (Revised). 2024.',
					}),
				]),
			})
		);
		expect(result.current.editingId).toBeNull();
	});

	it('preserves non-edited citations when confirming an inline override', () => {
		const args = makeHookArgs([
			makeCitation(),
			makeCitation({
				id: 'cit-2',
				formattedText: 'Jones. Another Book. 2023.',
				csl: {
					type: 'book',
					title: 'Another Book',
					author: [{ family: 'Jones', given: 'Bea' }],
					issued: { 'date-parts': [[2023]] },
				},
			}),
		]);
		const { result } = renderHook(() => useCitationEditorState(args));

		act(() => result.current.handleEditStart('cit-1'));
		act(() => result.current.setEditText('Smith. Revised Book. 2024.'));
		act(() => result.current.handleEditConfirm());

		expect(args.setAttributes.mock.calls[0][0].citations[1]).toMatchObject({
			id: 'cit-2',
			formattedText: 'Jones. Another Book. 2023.',
		});
	});

	it('clears displayOverride when confirmed text matches auto-formatted text', () => {
		const citation = makeCitation({ displayOverride: 'Old override' });
		const args = makeHookArgs([citation]);
		const { result } = renderHook(() => useCitationEditorState(args));

		// getAutoFormattedText returns citation.formattedText by default.
		act(() => result.current.handleEditStart('cit-1'));
		act(() => result.current.setEditText('Smith. A Book. 2024.')); // matches formattedText
		act(() => result.current.handleEditConfirm());

		const saved = args.setAttributes.mock.calls[0][0].citations[0];
		expect(saved.displayOverride).toBeNull();
	});

	it('cancels editing and clears state without saving (via Escape key)', () => {
		const args = makeHookArgs();
		const { result } = renderHook(() => useCitationEditorState(args));

		act(() => result.current.handleEditStart('cit-1'));
		act(() => result.current.setEditText('Changed text'));
		act(() =>
			result.current.handleEditKeyDown({
				key: 'Escape',
				preventDefault: jest.fn(),
			})
		);

		expect(result.current.editingId).toBeNull();
		expect(result.current.editText).toBe('');
		expect(args.setAttributes).not.toHaveBeenCalled();
	});

	it('triggers confirm on Enter and cancel on Escape via handleEditKeyDown', () => {
		const args = makeHookArgs();
		const { result } = renderHook(() => useCitationEditorState(args));

		act(() => result.current.handleEditStart('cit-1'));

		const preventDefault = jest.fn();

		act(() =>
			result.current.handleEditKeyDown({
				key: 'Escape',
				preventDefault,
			})
		);
		expect(preventDefault).toHaveBeenCalled();
		expect(result.current.editingId).toBeNull();

		act(() => result.current.handleEditStart('cit-1'));
		act(() =>
			result.current.handleEditKeyDown({
				key: 'Enter',
				preventDefault,
			})
		);
		expect(result.current.editingId).toBeNull();
	});

	it('ignores confirm when no inline edit is active', () => {
		const args = makeHookArgs();
		const { result } = renderHook(() => useCitationEditorState(args));

		act(() => result.current.handleEditConfirm());

		expect(args.setAttributes).not.toHaveBeenCalled();
	});

	it('does not resave when blur follows an Escape cancel', () => {
		const args = makeHookArgs();
		const { result } = renderHook(() => useCitationEditorState(args));

		act(() => result.current.handleEditStart('cit-1'));
		act(() =>
			result.current.handleEditKeyDown({
				key: 'Escape',
				preventDefault: jest.fn(),
			})
		);
		act(() => result.current.handleEditConfirm());

		expect(args.setAttributes).not.toHaveBeenCalled();
	});
});

// --- Structured edit save — async race condition ---

describe('handleStructuredEditSave race condition', () => {
	it('commits updated citation when no cancel occurs during save', async () => {
		const args = makeHookArgs();
		const { result } = renderHook(() => useCitationEditorState(args));

		act(() => result.current.handleStructuredEditStart('cit-1'));
		act(() =>
			result.current.handleStructuredFieldChange('title', 'Updated Title')
		);

		await act(() => result.current.handleStructuredEditSave());

		expect(args.setAttributes).toHaveBeenCalledWith(
			expect.objectContaining({ citations: expect.any(Array) })
		);
		expect(result.current.structuredEditingId).toBeNull();
	});

	it('reformats the full bibliography when structured edits are saved', async () => {
		const args = makeHookArgs([
			makeCitation({
				id: 'cit-1',
				formattedText: 'First entry',
				csl: {
					type: 'book',
					title: 'First title',
					author: [{ family: 'Smith', given: 'Ada' }],
					issued: { 'date-parts': [[2024]] },
				},
			}),
			makeCitation({
				id: 'cit-2',
				formattedText: 'Second entry',
				csl: {
					type: 'book',
					title: 'Second title',
					author: [{ family: 'Smith', given: 'Ada' }],
					issued: { 'date-parts': [[2024]] },
				},
			}),
		]);

		formatBibliographyEntries.mockResolvedValueOnce([
			'First title (2024a)',
			'Second title (2024b)',
		]);
		const { result } = renderHook(() => useCitationEditorState(args));

		act(() => result.current.handleStructuredEditStart('cit-1'));
		act(() =>
			result.current.handleStructuredFieldChange('title', 'First title')
		);
		await act(() => result.current.handleStructuredEditSave());

		expect(formatBibliographyEntries).toHaveBeenCalledWith(
			[
				expect.objectContaining({ title: 'First title' }),
				expect.objectContaining({ title: 'Second title' }),
			],
			'chicago-notes-bibliography',
			expect.objectContaining({
				onFallback: expect.any(Function),
			})
		);
	});

	it('does not commit when cancel fires while formatBibliographyEntries is pending', async () => {
		// Create the promise once so resolveFormat is set synchronously by the
		// Promise constructor, regardless of when the mock is actually called.
		let resolveFormat;
		const pendingFormat = new Promise((resolve) => {
			resolveFormat = resolve;
		});
		formatBibliographyEntries.mockReturnValueOnce(pendingFormat);

		const args = makeHookArgs();
		const { result } = renderHook(() => useCitationEditorState(args));

		act(() => result.current.handleStructuredEditStart('cit-1'));

		// Start save (async, will block on formatBibliographyEntries).
		let savePromise;
		act(() => {
			savePromise = result.current.handleStructuredEditSave();
		});

		// Cancel while format is still pending — nulls structuredEditingIdRef.
		act(() => result.current.handleStructuredEditCancel());

		// Resolve the format and let the save finish.
		resolveFormat(['Late formatted entry']);
		await act(async () => savePromise);

		expect(args.setAttributes).not.toHaveBeenCalled();
	});

	it('does not commit when cancel fires between formatBibliographyEntries resolving and setAttributes', async () => {
		let resolveFormat;
		const pendingFormat = new Promise((resolve) => {
			resolveFormat = resolve;
		});
		formatBibliographyEntries.mockReturnValueOnce(pendingFormat);

		const args = makeHookArgs();
		const { result } = renderHook(() => useCitationEditorState(args));

		act(() => result.current.handleStructuredEditStart('cit-1'));

		let savePromise;
		act(() => {
			savePromise = result.current.handleStructuredEditSave();
		});

		act(() => result.current.handleStructuredEditCancel());

		resolveFormat(['Formatted']);
		await act(async () => savePromise);

		expect(args.setAttributes).not.toHaveBeenCalled();
	});
});

// --- Structured field change ---

describe('handleStructuredFieldChange', () => {
	it('updates individual structured fields without replacing others', () => {
		const args = makeHookArgs();
		const { result } = renderHook(() => useCitationEditorState(args));

		act(() => result.current.handleStructuredEditStart('cit-1'));
		act(() =>
			result.current.handleStructuredFieldChange('title', 'New Title')
		);
		act(() =>
			result.current.handleStructuredFieldChange('publisher', 'MIT Press')
		);

		expect(result.current.structuredFields.title).toBe('New Title');
		expect(result.current.structuredFields.publisher).toBe('MIT Press');
	});

	it('builds author field text from mixed CSL name shapes', () => {
		const args = makeHookArgs([
			makeCitation({
				csl: {
					type: 'book',
					title: 'Mixed Authors',
					author: [
						null,
						{ literal: 'Example Collective' },
						{ given: 'Ada' },
						{ family: 'Lovelace' },
						{ family: 'Hopper', given: 'Grace' },
					],
				},
			}),
		]);
		const { result } = renderHook(() => useCitationEditorState(args));

		act(() => result.current.handleStructuredEditStart('cit-1'));

		expect(result.current.structuredFields.authors).toBe(
			'Example Collective; Ada; Lovelace; Hopper, Grace'
		);
	});
});

// --- Structured edit guards and fallbacks ---

describe('handleStructuredEditSave guard branches', () => {
	it('does nothing when no structured edit is active', async () => {
		const args = makeHookArgs();
		const { result } = renderHook(() => useCitationEditorState(args));

		await act(() => result.current.handleStructuredEditSave());

		expect(args.setAttributes).not.toHaveBeenCalled();
		expect(formatBibliographyEntries).not.toHaveBeenCalled();
	});

	it('does nothing when structured edit starts with an unknown id', async () => {
		const args = makeHookArgs();
		const { result } = renderHook(() => useCitationEditorState(args));

		act(() => result.current.handleStructuredEditStart('missing-citation'));
		await act(() => result.current.handleStructuredEditSave());

		expect(result.current.structuredEditingId).toBeNull();
		expect(args.setAttributes).not.toHaveBeenCalled();
	});

	it('does nothing when the active structured citation is removed before save', async () => {
		const args = makeHookArgs();
		const { result } = renderHook(() => useCitationEditorState(args));

		act(() => result.current.handleStructuredEditStart('cit-1'));
		args.citationsRef.current = [];
		await act(() => result.current.handleStructuredEditSave());

		expect(args.setAttributes).not.toHaveBeenCalled();
		expect(formatBibliographyEntries).not.toHaveBeenCalled();
	});

	it('blocks save and focuses the notice when identifier validation fails', async () => {
		validateIdentifierFields.mockReturnValue('Enter a valid DOI or URL.');
		const args = makeHookArgs();
		const { result } = renderHook(() => useCitationEditorState(args));

		act(() => result.current.handleStructuredEditStart('cit-1'));
		await act(() => result.current.handleStructuredEditSave());

		expect(args.announce).toHaveBeenCalledWith(
			'warning',
			'Enter a valid DOI or URL.'
		);
		expect(args.queueFocus).toHaveBeenCalledWith({ type: 'notice' });
		expect(args.setAttributes).not.toHaveBeenCalled();
	});

	it('removes optional CSL fields when their structured fields are cleared', async () => {
		const args = makeHookArgs([
			makeCitation({
				csl: {
					type: 'article-journal',
					title: 'Field Cleanup',
					author: [{ family: 'Smith', given: 'Ada' }],
					'container-title': 'Journal of Tests',
					publisher: 'Example Press',
					page: '12-18',
					DOI: '10.1234/example',
					URL: 'https://example.com/article',
					issued: { 'date-parts': [[2024]] },
				},
			}),
		]);
		const { result } = renderHook(() => useCitationEditorState(args));

		act(() => result.current.handleStructuredEditStart('cit-1'));
		for (const field of [
			'authors',
			'containerTitle',
			'publisher',
			'page',
			'doi',
			'url',
		]) {
			act(() => result.current.handleStructuredFieldChange(field, ''));
		}
		act(() => result.current.handleStructuredFieldChange('year', 'n.d.'));

		await act(() => result.current.handleStructuredEditSave());

		const savedCsl = args.setAttributes.mock.calls[0][0].citations[0].csl;
		expect(savedCsl).toMatchObject({
			type: 'article-journal',
			title: 'Field Cleanup',
		});
		expect(savedCsl).not.toHaveProperty('author');
		expect(savedCsl).not.toHaveProperty('container-title');
		expect(savedCsl).not.toHaveProperty('publisher');
		expect(savedCsl).not.toHaveProperty('page');
		expect(savedCsl).not.toHaveProperty('DOI');
		expect(savedCsl).not.toHaveProperty('URL');
		expect(savedCsl).not.toHaveProperty('issued');
	});

	it('parses semicolon author edits and keeps optional structured fields', async () => {
		const args = makeHookArgs();
		const { result } = renderHook(() => useCitationEditorState(args));

		act(() => result.current.handleStructuredEditStart('cit-1'));
		act(() =>
			result.current.handleStructuredFieldChange(
				'authors',
				'Ada Lovelace; ; Smith, ; Hopper, Grace'
			)
		);
		act(() =>
			result.current.handleStructuredFieldChange(
				'publisher',
				'Example Press'
			)
		);
		act(() =>
			result.current.handleStructuredFieldChange(
				'url',
				'https://example.com/book'
			)
		);

		await act(() => result.current.handleStructuredEditSave());

		const savedCsl = args.setAttributes.mock.calls[0][0].citations[0].csl;
		expect(savedCsl.author).toEqual([
			{ given: 'Ada', family: 'Lovelace' },
			{ literal: 'Smith,' },
			{ family: 'Hopper', given: 'Grace' },
		]);
		expect(savedCsl.publisher).toBe('Example Press');
		expect(savedCsl.URL).toBe('https://example.com/book');
	});

	it('clears structured edit state when the citation is removed while the formatter module loads', async () => {
		const args = makeHookArgs();
		const { result } = renderHook(() => useCitationEditorState(args));

		act(() => result.current.handleStructuredEditStart('cit-1'));

		let savePromise;
		act(() => {
			savePromise = result.current.handleStructuredEditSave();
		});
		args.citationsRef.current = [];

		await act(async () => savePromise);

		expect(args.setAttributes).not.toHaveBeenCalled();
		expect(result.current.structuredEditingId).toBeNull();
		expect(result.current.structuredFields).toEqual({});
	});

	it('does not commit when cancel fires while formatting is pending', async () => {
		let resolveFormat;
		formatBibliographyEntries.mockReturnValueOnce(
			new Promise((resolve) => {
				resolveFormat = resolve;
			})
		);
		const args = makeHookArgs();
		const { result } = renderHook(() => useCitationEditorState(args));

		act(() => result.current.handleStructuredEditStart('cit-1'));

		let savePromise;
		act(() => {
			savePromise = result.current.handleStructuredEditSave();
		});

		await waitFor(() =>
			expect(formatBibliographyEntries).toHaveBeenCalled()
		);
		act(() => result.current.handleStructuredEditCancel());

		resolveFormat(['Late formatted entry']);
		await act(async () => savePromise);

		expect(args.setAttributes).not.toHaveBeenCalled();
	});

	it('announces and focuses notice when structured reformatting falls back', async () => {
		formatBibliographyEntries.mockImplementation(
			(items, style, options) => {
				options.onFallback();
				return Promise.resolve(
					items.map(() => 'Fallback formatted entry')
				);
			}
		);
		const args = makeHookArgs();
		const { result } = renderHook(() => useCitationEditorState(args));

		act(() => result.current.handleStructuredEditStart('cit-1'));
		act(() =>
			result.current.handleStructuredFieldChange(
				'title',
				'Fallback Title'
			)
		);
		await act(() => result.current.handleStructuredEditSave());

		expect(args.announce).toHaveBeenCalledWith(
			'warning',
			'Fields updated. Formatter unavailable; using fallback citation text.',
			{}
		);
		expect(args.queueFocus).toHaveBeenCalledWith({ type: 'notice' });
	});
});

// --- Citation style changes ---

describe('handleCitationStyleChange', () => {
	it('ignores empty and unchanged style selections', async () => {
		const args = makeHookArgs();
		const { result } = renderHook(() => useCitationEditorState(args));

		await act(() => result.current.handleCitationStyleChange(''));
		await act(() =>
			result.current.handleCitationStyleChange(
				'chicago-notes-bibliography'
			)
		);

		expect(args.setAttributes).not.toHaveBeenCalled();
		expect(formatBibliographyEntries).not.toHaveBeenCalled();
	});

	it('changes style without reformatting when there are no citations', async () => {
		const args = makeHookArgs([]);
		const { result } = renderHook(() => useCitationEditorState(args));

		await act(() => result.current.handleCitationStyleChange('apa-7'));

		expect(args.setAttributes).toHaveBeenCalledWith({
			citationStyle: 'apa-7',
		});
		expect(formatBibliographyEntries).not.toHaveBeenCalled();
		expect(args.announce).toHaveBeenCalledWith(
			'success',
			'Style changed to Chicago Notes-Bibliography.',
			{ type: 'snackbar' }
		);
	});

	it('swaps heading to next style default when current heading matches previous style default', async () => {
		const args = {
			...makeHookArgs([]),
			headingText: 'Bibliography',
		};
		const { result } = renderHook(() => useCitationEditorState(args));

		await act(() => result.current.handleCitationStyleChange('mla-9'));

		expect(args.setAttributes).toHaveBeenCalledWith(
			expect.objectContaining({ headingText: 'Works Cited' })
		);
	});

	it('preserves custom heading when switching styles', async () => {
		const args = {
			...makeHookArgs([]),
			headingText: 'My Custom Heading',
		};
		const { result } = renderHook(() => useCitationEditorState(args));

		await act(() => result.current.handleCitationStyleChange('mla-9'));

		const call = args.setAttributes.mock.calls[0][0];
		expect(call).not.toHaveProperty('headingText');
	});

	it('preserves blank heading when switching styles', async () => {
		const args = {
			...makeHookArgs([]),
			headingText: '',
		};
		const { result } = renderHook(() => useCitationEditorState(args));

		await act(() => result.current.handleCitationStyleChange('mla-9'));

		const call = args.setAttributes.mock.calls[0][0];
		expect(call).not.toHaveProperty('headingText');
	});

	it('keeps a persistent notice when style-change reformatting falls back', async () => {
		formatBibliographyEntries.mockImplementation(
			(items, style, options) => {
				options.onFallback();
				return items.map(() => 'Fallback reformatted entry');
			}
		);
		const args = makeHookArgs();
		const { result } = renderHook(() => useCitationEditorState(args));

		await act(() => result.current.handleCitationStyleChange('apa-7'));

		expect(args.setAttributes).toHaveBeenCalledWith(
			expect.objectContaining({
				citationStyle: 'apa-7',
				citations: [
					expect.objectContaining({
						formattedText: 'Fallback reformatted entry',
					}),
				],
			})
		);
		expect(args.announce).toHaveBeenCalledWith(
			'warning',
			'Style changed to Chicago Notes-Bibliography. Reformatted 1 citation. Formatter unavailable; using fallback citation text.',
			{}
		);
		expect(args.queueFocus).toHaveBeenCalledWith({ type: 'notice' });
	});
});

// --- resetEditingState ---

describe('resetEditingState', () => {
	it('clears both inline and structured editing state simultaneously', () => {
		const args = makeHookArgs();
		const { result } = renderHook(() => useCitationEditorState(args));

		act(() => result.current.handleEditStart('cit-1'));
		act(() => result.current.handleStructuredEditStart('cit-1'));
		act(() => result.current.resetEditingState());

		expect(result.current.editingId).toBeNull();
		expect(result.current.editText).toBe('');
		expect(result.current.structuredEditingId).toBeNull();
		expect(result.current.structuredFields).toEqual({});
	});
});

// --- Export-string pre-computation (Phase 04-03) ---

describe('export-string pre-computation', () => {
	it('stores exportBibtex/exportBiblatex on citations after a style change', async () => {
		const args = makeHookArgs();
		const { result } = renderHook(() => useCitationEditorState(args));

		await act(() => result.current.handleCitationStyleChange('apa-7'));

		const saved = args.setAttributes.mock.calls[0][0].citations[0];
		expect(saved.exportBibtex).toBe('BIBTEX');
		expect(saved.exportBiblatex).toBe('BIBLATEX');
	});

	it('stores export strings after a structured edit save', async () => {
		const args = makeHookArgs();
		const { result } = renderHook(() => useCitationEditorState(args));

		act(() => result.current.handleStructuredEditStart('cit-1'));
		act(() =>
			result.current.handleStructuredFieldChange('title', 'Edited Title')
		);
		await act(() => result.current.handleStructuredEditSave());

		const saved = args.setAttributes.mock.calls[0][0].citations[0];
		expect(saved.exportBibtex).toBe('BIBTEX');
		expect(saved.exportBiblatex).toBe('BIBLATEX');
	});

	it('assigns a stable id to a citation lacking one on the next format pass', async () => {
		const args = makeHookArgs([makeCitation({ id: '' })]);
		const { result } = renderHook(() => useCitationEditorState(args));

		await act(() => result.current.handleCitationStyleChange('apa-7'));

		const saved = args.setAttributes.mock.calls[0][0].citations[0];
		expect(typeof saved.id).toBe('string');
		expect(saved.id.length).toBeGreaterThan(0);
	});
});

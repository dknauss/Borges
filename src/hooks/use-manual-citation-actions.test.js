import { act, renderHook } from '@testing-library/react';
import { useManualCitationActions } from './use-manual-citation-actions';
import { computeExportStrings } from './compute-export-strings';
import { findDuplicateCitation } from '../lib/deduplicate';
import { validateManualEntry } from '../lib/manual-entry';

jest.mock( '@wordpress/element', () => {
	const React = require( 'react' );
	return {
		useCallback: React.useCallback,
		useMemo: React.useMemo,
		useState: React.useState,
	};
} );

jest.mock( '@wordpress/i18n', () => ( {
	__: ( text ) => text,
	_n: ( single, plural, count ) => ( count === 1 ? single : plural ),
	sprintf: ( template, ...values ) =>
		template.replace( /%((\d+)\$)?[sd]/g, ( match, _pos, index ) => {
			const valueIndex = index ? Number( index ) - 1 : 0;
			return String( values[ valueIndex ] ?? '' );
		} ),
} ) );

jest.mock( '../lib/deduplicate', () => ( {
	findDuplicateCitation: jest.fn( () => null ),
} ) );

jest.mock( '../lib/manual-entry', () => ( {
	buildManualCsl: jest.fn( () => ( { title: 'Manual entry' } ) ),
	createEmptyManualEntryFields: jest.fn( ( type = 'article-journal' ) => ( {
		type,
	} ) ),
	createManualCitationFromCsl: jest.fn( async ( csl ) => ( {
		id: 'manual-1',
		csl,
	} ) ),
	MANUAL_ENTRY_TYPE_OPTIONS: [],
	validateManualEntry: jest.fn( () => null ),
} ) );

jest.mock( '../lib/sorter', () => ( {
	sortCitations: jest.fn( ( citations ) => citations ),
} ) );

jest.mock( './compute-export-strings', () => ( {
	computeExportStrings: jest.fn( async ( cslObjects ) =>
		( cslObjects || [] ).map( () => ( {
			exportBibtex: 'BIBTEX',
			exportBiblatex: 'BIBLATEX',
		} ) )
	),
} ) );

jest.mock( '../lib/citation-limits', () => ( {
	MAX_CITATIONS_PER_BIBLIOGRAPHY: 100,
	getBibliographyLimitReachedMessage: jest.fn( () => 'reached' ),
} ) );

jest.mock( '../lib/formatting/csl', () => ( {
	formatBibliographyEntries: jest.fn( ( items ) =>
		items.map( () => 'Formatted entry' )
	),
} ) );

function makeArgs( overrides = {} ) {
	return {
		announce: jest.fn(),
		beginAsyncOperation: jest.fn( () => 1 ),
		citationStyle: 'apa-7',
		citationsRef: { current: [] },
		clearNotice: jest.fn(),
		currentNotice: null,
		isCurrentAsyncOperation: jest.fn( () => true ),
		outputCiteExport: true,
		pasteZoneRef: { current: null },
		queueFocus: jest.fn(),
		setAttributes: jest.fn(),
		...overrides,
	};
}

describe( 'useManualCitationActions — export-string pre-computation', () => {
	beforeEach( () => {
		jest.clearAllMocks();
		validateManualEntry.mockReturnValue( null );
		findDuplicateCitation.mockReturnValue( null );
	} );

	it( 'stores exportBibtex/exportBiblatex on a manually added citation', async () => {
		const args = makeArgs();
		const { result } = renderHook( () => useManualCitationActions( args ) );

		await act( () => result.current.handleManualAdd() );

		expect( args.setAttributes ).toHaveBeenCalledTimes( 1 );
		const saved = args.setAttributes.mock.calls[ 0 ][ 0 ].citations[ 0 ];
		expect( saved.exportBibtex ).toBe( 'BIBTEX' );
		expect( saved.exportBiblatex ).toBe( 'BIBLATEX' );
		expect( saved.formattedText ).toBe( 'Formatted entry' );
	} );

	it( 'does not pre-compute export strings when the feature is disabled', async () => {
		const args = makeArgs( { outputCiteExport: false } );
		const { result } = renderHook( () => useManualCitationActions( args ) );

		await act( () => result.current.handleManualAdd() );

		expect( computeExportStrings ).not.toHaveBeenCalled();
		const saved = args.setAttributes.mock.calls[ 0 ][ 0 ].citations[ 0 ];
		expect( saved.exportBibtex ).toBeUndefined();
		expect( saved.exportBiblatex ).toBeUndefined();
		expect( saved.formattedText ).toBe( 'Formatted entry' );
	} );
} );

describe( 'useManualCitationActions — prefillManualFields (#293)', () => {
	beforeEach( () => {
		jest.clearAllMocks();
	} );

	it( 'starts a fresh entry from the given fields and keeps the notice', () => {
		const args = makeArgs( {
			currentNotice: { id: 'bare-url', content: 'why' },
		} );
		const { result } = renderHook( () => useManualCitationActions( args ) );

		act( () =>
			result.current.handleManualFieldChange( 'title', 'Old title' )
		);
		args.clearNotice.mockClear();
		act( () =>
			result.current.prefillManualFields( {
				type: 'webpage',
				url: 'https://example.org/report.pdf',
			} )
		);

		expect( result.current.manualFields ).toEqual( {
			type: 'webpage',
			url: 'https://example.org/report.pdf',
		} );
		expect( args.clearNotice ).not.toHaveBeenCalled();
	} );
} );

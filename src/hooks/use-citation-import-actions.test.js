import { act, renderHook } from '@testing-library/react';
import { useCitationImportActions } from './use-citation-import-actions';
import { parsePastedInput } from '../lib/parser';
import { partitionDuplicateCitations } from '../lib/deduplicate';
import { computeExportStrings } from './compute-export-strings';

jest.mock( '@wordpress/element', () => {
	const React = require( 'react' );
	return { useCallback: React.useCallback };
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
	partitionDuplicateCitations: jest.fn(),
} ) );

jest.mock( '../lib/input-support', () => ( {
	BARE_URL_MANUAL_ENTRY_MESSAGE: 'bare url manual entry',
	BARE_URL_MESSAGE: 'bare url explanation',
	SUPPORTED_INPUT_MESSAGE: 'supported input',
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
	getBibliographyLimitExceededMessage: jest.fn( () => 'exceeded' ),
	getBibliographyLimitReachedMessage: jest.fn( () => 'reached' ),
} ) );

jest.mock( '../lib/parser', () => ( { parsePastedInput: jest.fn() } ) );

jest.mock( '../lib/formatting/csl', () => ( {
	formatBibliographyEntries: jest.fn( ( items ) =>
		items.map( () => 'Formatted entry' )
	),
} ) );

function makeArgs( overrides = {} ) {
	const citationsRef = { current: [] };
	return {
		announce: jest.fn(),
		beginAsyncOperation: jest.fn( () => 1 ),
		citationStyle: 'apa-7',
		citationsRef,
		clearNotice: jest.fn(),
		inputValue: '10.1234/example',
		isCurrentAsyncOperation: jest.fn( () => true ),
		outputCiteExport: true,
		queueFocus: jest.fn(),
		setAttributes: jest.fn(),
		setIsLoading: jest.fn(),
		updatePasteInput: jest.fn(),
		...overrides,
	};
}

describe( 'useCitationImportActions — export-string pre-computation', () => {
	beforeEach( () => {
		jest.clearAllMocks();
		parsePastedInput.mockResolvedValue( {
			entries: [ { id: 'new-1', csl: { title: 'Imported' } } ],
			errors: [],
			truncated: false,
			remainingInput: '',
			skippedDuplicateCount: 0,
		} );
		partitionDuplicateCitations.mockReturnValue( {
			uniqueEntries: [ { id: 'new-1', csl: { title: 'Imported' } } ],
			duplicateEntries: [],
		} );
		computeExportStrings.mockImplementation( async ( cslObjects ) =>
			( cslObjects || [] ).map( () => ( {
				exportBibtex: 'BIBTEX',
				exportBiblatex: 'BIBLATEX',
			} ) )
		);
	} );

	it( 'stores exportBibtex/exportBiblatex on imported citations', async () => {
		const args = makeArgs();
		const { result } = renderHook( () => useCitationImportActions( args ) );

		await act( () => result.current.handleParse() );

		expect( args.setAttributes ).toHaveBeenCalledTimes( 1 );
		const saved = args.setAttributes.mock.calls[ 0 ][ 0 ].citations[ 0 ];
		expect( saved.exportBibtex ).toBe( 'BIBTEX' );
		expect( saved.exportBiblatex ).toBe( 'BIBLATEX' );
		expect( saved.formattedText ).toBe( 'Formatted entry' );
	} );
} );

describe( 'useCitationImportActions — a lone pasted link (#293)', () => {
	const PDF_URL =
		'https://clinicalgenome.org/site/assets/files/3635/clingen_vcep_protocol_version_11_november2023-1.pdf';

	function mockUnreadable(
		remainingInput,
		{ errorCount = 1, unreadableLinks = [ PDF_URL ] } = {}
	) {
		parsePastedInput.mockResolvedValue( {
			entries: [],
			errors: Array( errorCount ).fill( 'bare url error' ),
			truncated: false,
			remainingInput,
			skippedDuplicateCount: 0,
			unreadableLinks,
		} );
		partitionDuplicateCitations.mockReturnValue( {
			uniqueEntries: [],
			duplicateEntries: [],
		} );
	}

	beforeEach( () => {
		jest.clearAllMocks();
	} );

	it( 'opens Manual Entry with the link and explains why', async () => {
		mockUnreadable( PDF_URL );
		const onBareUrl = jest.fn();
		const args = makeArgs( { inputValue: PDF_URL, onBareUrl } );
		const { result } = renderHook( () => useCitationImportActions( args ) );

		await act( () => result.current.handleParse() );

		expect( onBareUrl ).toHaveBeenCalledWith( PDF_URL );
		expect( args.updatePasteInput ).toHaveBeenCalledTimes( 1 );
		expect( args.updatePasteInput ).toHaveBeenCalledWith( '', {
			syncDom: true,
		} );
		expect( args.announce ).toHaveBeenCalledWith(
			'info',
			'bare url manual entry'
		);
		expect( args.queueFocus ).toHaveBeenCalledWith( { type: 'notice' } );
		expect( args.setAttributes ).not.toHaveBeenCalled();
		expect( args.setIsLoading ).toHaveBeenLastCalledWith( false );
	} );

	it( 'keeps the error when the link came with other unreadable text', async () => {
		mockUnreadable( `${ PDF_URL }\n\nNot a citation`, { errorCount: 2 } );
		const onBareUrl = jest.fn();
		const args = makeArgs( { inputValue: 'mixed', onBareUrl } );
		const { result } = renderHook( () => useCitationImportActions( args ) );

		await act( () => result.current.handleParse() );

		expect( onBareUrl ).not.toHaveBeenCalled();
		expect( args.announce ).toHaveBeenCalledWith(
			'warning',
			'bare url error'
		);
	} );

	it( 'keeps the lookup error and the link when a DOI link fails to resolve', async () => {
		const doiLink = 'https://doi.org/10.1234/abcd';
		mockUnreadable( doiLink, { unreadableLinks: [] } );
		const onBareUrl = jest.fn();
		const args = makeArgs( { inputValue: doiLink, onBareUrl } );
		const { result } = renderHook( () => useCitationImportActions( args ) );

		await act( () => result.current.handleParse() );

		expect( onBareUrl ).not.toHaveBeenCalled();
		expect( args.announce ).toHaveBeenCalledWith(
			'warning',
			'bare url error'
		);
		expect( args.updatePasteInput ).toHaveBeenCalledWith( doiLink, {
			syncDom: true,
		} );
	} );

	it( 'explains a leftover link beside a citation it added', async () => {
		const added = { id: 'new-1', csl: { title: 'Imported' } };
		parsePastedInput.mockResolvedValue( {
			entries: [ added ],
			errors: [ 'bare url error' ],
			truncated: false,
			remainingInput: PDF_URL,
			skippedDuplicateCount: 0,
			unreadableLinks: [ PDF_URL ],
		} );
		partitionDuplicateCitations.mockReturnValue( {
			uniqueEntries: [ added ],
			duplicateEntries: [],
		} );
		const onBareUrl = jest.fn();
		const args = makeArgs( {
			inputValue: 'mixed',
			onBareUrl,
			outputCiteExport: false,
		} );
		const { result } = renderHook( () => useCitationImportActions( args ) );

		await act( () => result.current.handleParse() );

		expect( onBareUrl ).not.toHaveBeenCalled();
		expect( args.setAttributes ).toHaveBeenCalledTimes( 1 );
		const [ status, message ] = args.announce.mock.calls[ 0 ];
		expect( status ).toBe( 'warning' );
		expect( message ).toContain( "Couldn't parse 1 item." );
		expect( message ).toContain( 'bare url explanation' );
		expect( args.updatePasteInput ).toHaveBeenCalledWith( PDF_URL, {
			syncDom: true,
		} );
	} );

	it( 'explains a leftover link beside a duplicate', async () => {
		parsePastedInput.mockResolvedValue( {
			entries: [],
			errors: [ 'bare url error' ],
			truncated: false,
			remainingInput: PDF_URL,
			skippedDuplicateCount: 1,
			unreadableLinks: [ PDF_URL ],
		} );
		partitionDuplicateCitations.mockReturnValue( {
			uniqueEntries: [],
			duplicateEntries: [],
		} );
		const onBareUrl = jest.fn();
		const args = makeArgs( { inputValue: 'mixed', onBareUrl } );
		const { result } = renderHook( () => useCitationImportActions( args ) );

		await act( () => result.current.handleParse() );

		expect( onBareUrl ).not.toHaveBeenCalled();
		expect( args.announce.mock.calls[ 0 ][ 1 ] ).toContain(
			'bare url explanation'
		);
	} );

	it( 'keeps the error when no Manual Entry handler is given', async () => {
		mockUnreadable( PDF_URL );
		const args = makeArgs( { inputValue: PDF_URL } );
		const { result } = renderHook( () => useCitationImportActions( args ) );

		await act( () => result.current.handleParse() );

		expect( args.announce ).toHaveBeenCalledWith(
			'warning',
			'bare url error'
		);
		expect( args.updatePasteInput ).toHaveBeenCalledWith( PDF_URL, {
			syncDom: true,
		} );
	} );
} );

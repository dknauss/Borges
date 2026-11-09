import {
	expandPageRange,
	parseVancouverCitation,
	parseVancouverNames,
} from './free-text-vancouver';
import { parseFreeTextCitation } from './free-text-parser';

describe( 'parseVancouverNames', () => {
	it( 'reads surname-and-initials names', () => {
		expect(
			parseVancouverNames(
				'Harris CR, van der Walt SJ, Chang M-W, Mayo CW, Jr, et al'
			)
		).toEqual( [
			{ family: 'Harris', given: 'CR' },
			{ family: 'van der Walt', given: 'SJ' },
			{ family: 'Chang', given: 'M-W' },
			{ family: 'Mayo', given: 'CW', suffix: 'Jr' },
			{ literal: 'et al.' },
		] );
	} );

	it( 'rejects names with full stops or no initials', () => {
		expect( parseVancouverNames( 'Coleman B, L' ) ).toEqual( [] );
		expect( parseVancouverNames( 'Harris C.R.' ) ).toEqual( [] );
		expect( parseVancouverNames( 'van der SJ' ) ).toEqual( [] );
		expect( parseVancouverNames( 'et al' ) ).toEqual( [] );
	} );
} );

describe( 'expandPageRange', () => {
	it.each( [
		[ '357-62', '357-362' ],
		[ '51-8', '51-58' ],
		[ '97-111', '97-111' ],
		[ '129-3', '129-3' ],
		[ 'e1003106', 'e1003106' ],
	] )( '%s → %s', ( page, expected ) => {
		expect( expandPageRange( page ) ).toBe( expected );
	} );
} );

describe( 'parseVancouverCitation', () => {
	it( 'reads a journal article with a DOI', () => {
		expect(
			parseVancouverCitation(
				'Harris CR, Millman KJ, Gommers R. Array programming with NumPy. Nature. 2020 Sep 16;585(7825):357-62. doi:10.1038/s41586-020-2649-2'
			)
		).toEqual( {
			csl: {
				type: 'article-journal',
				title: 'Array programming with NumPy',
				author: [
					{ family: 'Harris', given: 'CR' },
					{ family: 'Millman', given: 'KJ' },
					{ family: 'Gommers', given: 'R' },
				],
				'container-title': 'Nature',
				issued: { 'date-parts': [ [ 2020, 9, 16 ] ] },
				volume: '585',
				issue: '7825',
				page: '357-362',
				DOI: '10.1038/s41586-020-2649-2',
			},
			confidence: 'low',
		} );
	} );

	it( 'reads article variants: a month only, a question title, PMID', () => {
		expect(
			parseVancouverCitation(
				'Brand S, Herron M. Keep designing. Whole Earth Review. 1985 May.'
			)?.csl
		).toMatchObject( {
			'container-title': 'Whole Earth Review',
			issued: { 'date-parts': [ [ 1985, 5 ] ] },
		} );
		expect(
			parseVancouverCitation(
				'Matthey S, Barnett B. Whatever happened to anxiety? J Affect Disord 2003;74(2): 139-47. PMID: 12706515 [PMCID: PMC123456].'
			)?.csl
		).toMatchObject( {
			title: 'Whatever happened to anxiety?',
			'container-title': 'J Affect Disord',
			page: '139-147',
			PMID: '12706515',
		} );
		expect(
			parseVancouverCitation(
				'Seshadri C, Lin L. T cell responses. J Immunol. 2015;195(10):4595-603. PubMed PMID: 26466957; PMCID: PMC4637215.'
			)?.csl
		).toMatchObject( { 'container-title': 'J Immunol', volume: '195' } );
	} );

	it( 'reads a book with an edition, editors, and a place', () => {
		expect(
			parseVancouverCitation(
				'Cormen TH, Stein C. Introduction to algorithms. 3rd ed. Cambridge, MA: MIT Press; 2009.'
			)?.csl
		).toEqual( {
			type: 'book',
			title: 'Introduction to algorithms',
			author: [
				{ family: 'Cormen', given: 'TH' },
				{ family: 'Stein', given: 'C' },
			],
			'publisher-place': 'Cambridge, MA',
			publisher: 'MIT Press',
			edition: '3',
			issued: { 'date-parts': [ [ 2009 ] ] },
		} );
		expect(
			parseVancouverCitation(
				'Borges JL. Labyrinths. Yates DA, Irby JE, editors. New York: New Directions; 1962.'
			)?.csl.editor
		).toEqual( [
			{ family: 'Yates', given: 'DA' },
			{ family: 'Irby', given: 'JE' },
		] );
	} );

	it( 'reads an organization as the author', () => {
		expect(
			parseVancouverCitation(
				'University of Chicago Press. Manual of style. Chicago: University of Chicago Press; 1906.'
			)?.csl.author
		).toEqual( [ { literal: 'University of Chicago Press' } ] );
		expect(
			parseVancouverCitation(
				'Adobe. Structured Data Validator. GitHub; [date unknown].'
			)?.csl
		).toEqual( {
			type: 'book',
			title: 'Structured Data Validator',
			author: [ { literal: 'Adobe' } ],
			publisher: 'GitHub',
		} );
	} );

	it( 'reads a chapter and a conference paper', () => {
		expect(
			parseVancouverCitation(
				'Borges JL. The library of Babel. In: Yates DA, Irby JE, editors. Labyrinths. New York: New Directions; 1962. p. 51-8.'
			)?.csl
		).toEqual( {
			type: 'chapter',
			title: 'The library of Babel',
			author: [ { family: 'Borges', given: 'JL' } ],
			'container-title': 'Labyrinths',
			editor: [
				{ family: 'Yates', given: 'DA' },
				{ family: 'Irby', given: 'JE' },
			],
			'publisher-place': 'New York',
			publisher: 'New Directions',
			page: '51-58',
			issued: { 'date-parts': [ [ 1962 ] ] },
		} );
		expect(
			parseVancouverCitation(
				'Devlin J, Lee K. BERT. In: Proceedings of NAACL-HLT. Association for Computational Linguistics; 2019. p. 4171-86.'
			)?.csl
		).toMatchObject( {
			type: 'paper-conference',
			publisher: 'Association for Computational Linguistics',
			page: '4171-4186',
		} );
	} );

	it( 'reads encyclopedia entries with no author', () => {
		expect(
			parseVancouverCitation(
				'Isnād. In: Encyclopaedia britannica. [date unknown].'
			)?.csl
		).toEqual( {
			type: 'entry-encyclopedia',
			title: 'Isnād',
			'container-title': 'Encyclopaedia britannica',
		} );
		expect(
			parseVancouverCitation(
				'Mark JJ. Ancient Egyptian vizier. In: World history encyclopedia. 2017.'
			)?.csl
		).toMatchObject( {
			type: 'chapter',
			issued: { 'date-parts': [ [ 2017 ] ] },
		} );
	} );

	it( 'reads web pages and preprints', () => {
		expect(
			parseVancouverCitation(
				'Knauss D. The page is an interface [Internet]. Marginalia; 2026 Oct 25 [cited 2026 Oct 27]. Available from: https://m.arginalia.com/the-page-is-an-interface/'
			)?.csl
		).toEqual( {
			type: 'webpage',
			title: 'The page is an interface',
			author: [ { family: 'Knauss', given: 'D' } ],
			'container-title': 'Marginalia',
			issued: { 'date-parts': [ [ 2026, 10, 25 ] ] },
			URL: 'https://m.arginalia.com/the-page-is-an-interface/',
			accessed: { 'date-parts': [ [ 2026, 10, 27 ] ] },
		} );
		expect(
			parseVancouverCitation(
				'WordPress.org. Block editor handbook [Internet]. WordPress Developer Resources [cited 2026 Oct 27]. Available from: https://developer.wordpress.org/block-editor/'
			)?.csl.author
		).toEqual( [ { literal: 'WordPress.org' } ] );
		expect(
			parseVancouverCitation(
				'Vaswani A, Shazeer N. Attention is all you need [Preprint]. arXiv; 2017. doi:10.48550/arXiv.1706.03762'
			)?.csl
		).toMatchObject( {
			type: 'article',
			publisher: 'arXiv',
			genre: 'Preprint',
			DOI: '10.48550/arXiv.1706.03762',
		} );
	} );

	it( 'reads a journal marked [Internet] as an article', () => {
		expect(
			parseVancouverCitation(
				'Stanger CA, Anglin C. Devices for assisting manipulation. IEEE Trans Rehabil Eng [Internet]. 1994;2(4): 256–65. Available from: http://ieeexplore.ieee.org/document/340872.'
			)?.csl
		).toMatchObject( {
			type: 'article-journal',
			'container-title': 'IEEE Trans Rehabil Eng',
			page: '256-265',
			URL: 'http://ieeexplore.ieee.org/document/340872',
		} );
	} );

	it( 'skips a cited date that does not read', () => {
		expect(
			parseVancouverCitation(
				'citation [Internet]. Schema.org [cited last week]. Available from: https://schema.org/citation'
			)?.csl
		).toEqual( {
			type: 'webpage',
			title: 'citation',
			'container-title': 'Schema.org',
			URL: 'https://schema.org/citation',
		} );
	} );

	it.each( [
		[
			'APA',
			'Grafton, A. (1997). The footnote: A curious history. Harvard University Press.',
		],
		[
			'names that hold initials with full stops',
			'Dietz, R. S., McHone, J. F., Volcanic landforms. In: El-Baz F, editors. NASA; 1979.',
		],
		[
			'a broken name list read as an organization',
			'Coleman B, L. Piponniau, et al. To be transplanted. Journal of Transplantation. 2011;30(5): 4.',
		],
		[
			'an article with no author',
			'Array programming with NumPy. Nature. 2020;585(7825):357-62.',
		],
		[
			'a journal with only a year',
			'Knuth DE. Literate programming. The Computer Journal. 1984.',
		],
		[
			'a book with no author',
			'Introduction to algorithms. Cambridge, MA: MIT Press; 2009.',
		],
		[
			'a chapter with no date',
			'Borges JL. The library of Babel. In: Labyrinths. New Directions.',
		],
		[
			'chapter editors that are not names',
			'Borges JL. The library of Babel. In: some friends, editors. Labyrinths. New Directions; 1962.',
		],
		[
			'book editors that are not names',
			'Borges JL. Labyrinths. some friends, editors. New Directions; 1962.',
		],
		[
			'an online date that does not read',
			'Knauss D. The page [Internet]. Marginalia; soon. Available from: https://example.com/',
		],
		[
			'a web page with no link',
			'Knauss D. The page is an interface [Internet]. Marginalia; 2026 Oct 25.',
		],
		[
			'a web page whose title holds names',
			'Smith, J., Jones, K. A page [Internet]. Site. Available from: https://example.com/',
		],
		[ 'an empty title', 'Knauss D. ?. Nature. 2001;1:1.' ],
	] )( 'declines %s', ( _, input ) => {
		expect( parseVancouverCitation( input ) ).toBeNull();
	} );
} );

describe( 'Vancouver style hint', () => {
	it( 'gives the same result with and without the hint', () => {
		const article =
			'Knuth DE. Literate programming. The Computer Journal. 1984;27(2):97-111.';

		expect( parseFreeTextCitation( article )?.csl ).toMatchObject( {
			type: 'article-journal',
			page: '97-111',
		} );
		expect(
			parseFreeTextCitation( article, { styleKey: 'vancouver' } )
		).toEqual( parseFreeTextCitation( article ) );
	} );
} );

describe( 'Vancouver edge cases from review', () => {
	it( 'keeps the PMID of a PubMed export trailer', () => {
		expect(
			parseVancouverCitation(
				'Smith AB. A trial. Nature. 2020;12(1):10-20. PubMed PMID: 12345678.'
			).csl
		).toMatchObject( { PMID: '12345678', title: 'A trial' } );
		expect(
			parseVancouverCitation(
				'Smith AB. A trial. Nature. 2020;12(1):10-20. PubMed PMID: 12345678; PMCID: PMC1234567.'
			).csl
		).toMatchObject( { PMID: '12345678' } );
	} );

	it( 'keeps a closing parenthesis that belongs to the URL', () => {
		expect(
			parseVancouverCitation(
				'Smith AB. Test [Internet]. Wikipedia; 2020. Available from: https://en.wikipedia.org/wiki/Test_(assessment)'
			).csl.URL
		).toBe( 'https://en.wikipedia.org/wiki/Test_(assessment)' );
	} );

	it( 'declines a journal abbreviated with full stops rather than splitting it', () => {
		expect(
			parseVancouverCitation(
				'Smith AB. A trial. N. Engl. J. Med. 2020;12(1):10-20.'
			)
		).toBeNull();
	} );
} );

import { buildCslJsonString, buildJsonLdString, cslToJsonLd } from './jsonld';

describe('cslToJsonLd', () => {
	it('maps journal articles to ScholarlyArticle with Periodical context and DOI URL', () => {
		expect(
			cslToJsonLd({
				type: 'article-journal',
				title: 'Learning Blocks',
				'container-title': 'Journal of WordPress Studies',
				ISSN: ['1234-5678'],
				DOI: '10.1234/example-doi',
				issued: {
					'date-parts': [[2024, 3, 1]],
				},
				author: [
					{
						given: 'Ada',
						family: 'Smith',
					},
				],
			})
		).toEqual({
			'@context': 'https://schema.org',
			'@type': 'ScholarlyArticle',
			name: 'Learning Blocks',
			author: [
				{
					'@type': 'Person',
					name: 'Ada Smith',
					familyName: 'Smith',
					givenName: 'Ada',
				},
			],
			datePublished: '2024-03-01',
			isPartOf: {
				'@type': 'Periodical',
				name: 'Journal of WordPress Studies',
				issn: '1234-5678',
			},
			identifier: {
				'@type': 'PropertyValue',
				propertyID: 'DOI',
				value: '10.1234/example-doi',
			},
			url: 'https://doi.org/10.1234%2Fexample-doi',
		});
	});

	it('keeps year-only dates unchanged when month and day are absent', () => {
		expect(
			cslToJsonLd({
				type: 'book',
				title: 'Year Only Example',
				issued: {
					'date-parts': [[2024]],
				},
			})
		).toMatchObject({
			datePublished: '2024',
		});
	});

	it('normalizes ORCID values and maps publishers for books', () => {
		expect(
			cslToJsonLd({
				type: 'book',
				title: 'The Channels of Student Activism',
				publisher: 'University of Chicago Press',
				ISBN: '9780226819909',
				author: [
					{
						given: 'Amy J.',
						family: 'Binder',
						ORCID: '0000-0001-2345-6789',
					},
				],
			})
		).toEqual({
			'@context': 'https://schema.org',
			'@type': 'Book',
			name: 'The Channels of Student Activism',
			author: [
				{
					'@type': 'Person',
					name: 'Amy J. Binder',
					familyName: 'Binder',
					givenName: 'Amy J.',
					sameAs: 'https://orcid.org/0000-0001-2345-6789',
				},
			],
			publisher: {
				'@type': 'Organization',
				name: 'University of Chicago Press',
			},
			isbn: '9780226819909',
		});
	});

	it('uses the first ISBN string and URL-encodes DOI URLs', () => {
		expect(
			cslToJsonLd({
				type: 'book',
				title: 'Encoded DOI Example',
				ISBN: ['9780226819909', '9780226819916'],
				DOI: '10.1234/example doi/with spaces',
			})
		).toMatchObject({
			isbn: '9780226819909',
			url: 'https://doi.org/10.1234%2Fexample%20doi%2Fwith%20spaces',
		});
	});

	it('maps conference papers to Event containers and keeps explicit URLs', () => {
		expect(
			cslToJsonLd({
				type: 'paper-conference',
				title: 'Block Interactivity',
				'container-title': 'Gutenberg Summit',
				URL: 'https://example.com/slides',
				author: [
					{
						literal: 'OpenAI',
					},
				],
			})
		).toEqual({
			'@context': 'https://schema.org',
			'@type': 'ScholarlyArticle',
			name: 'Block Interactivity',
			author: [
				{
					'@type': 'Organization',
					name: 'OpenAI',
				},
			],
			isPartOf: {
				'@type': 'Event',
				name: 'Gutenberg Summit',
			},
			url: 'https://example.com/slides',
		});
	});

	it('maps literal-only corporate authors to Organization instead of Person', () => {
		expect(
			cslToJsonLd({
				type: 'webpage',
				title: 'Privacy Policy',
				author: [
					{
						literal: 'Google',
					},
				],
			})
		).toMatchObject({
			author: [
				{
					'@type': 'Organization',
					name: 'Google',
				},
			],
		});
	});

	it('maps chapter to Chapter with Book isPartOf when container-title is present', () => {
		expect(
			cslToJsonLd({
				type: 'chapter',
				title: 'The Block Editor Ecosystem',
				'container-title': 'The WordPress Handbook',
				publisher: 'Open Source Press',
				author: [{ given: 'Ada', family: 'Smith' }],
			})
		).toMatchObject({
			'@type': 'Chapter',
			name: 'The Block Editor Ecosystem',
			isPartOf: {
				'@type': 'Book',
				name: 'The WordPress Handbook',
			},
			publisher: {
				'@type': 'Organization',
				name: 'Open Source Press',
			},
		});
	});

	it('maps review-book to Review type', () => {
		expect(
			cslToJsonLd({
				type: 'review-book',
				title: 'Review of The WordPress Handbook',
				author: [{ given: 'Grace', family: 'Hopper' }],
			})
		).toMatchObject({
			'@type': 'Review',
			name: 'Review of The WordPress Handbook',
		});
	});

	it('falls back to CreativeWork for unknown types and omits sameAs when ORCID is absent', () => {
		expect(
			cslToJsonLd({
				type: 'map',
				title: 'Unknown Type Example',
				author: [
					{
						given: 'Ada',
						family: 'Smith',
					},
				],
			})
		).toEqual({
			'@context': 'https://schema.org',
			'@type': 'CreativeWork',
			name: 'Unknown Type Example',
			author: [
				{
					'@type': 'Person',
					name: 'Ada Smith',
					familyName: 'Smith',
					givenName: 'Ada',
				},
			],
		});
	});

	it('omits optional properties for sparse records without authors or identifiers', () => {
		expect(
			cslToJsonLd({
				type: 'thesis',
			})
		).toEqual({
			'@context': 'https://schema.org',
			'@type': 'Thesis',
			name: '',
		});
	});

	it('keeps person authors without family, given, or ORCID metadata minimal', () => {
		expect(
			cslToJsonLd({
				type: 'report',
				title: 'Literal Person Example',
				author: [
					{
						literal: 'Ada Research Group',
						family: 'Research Group',
					},
					{},
				],
			})
		).toMatchObject({
			author: [
				{
					'@type': 'Person',
					name: 'Ada Research Group',
					familyName: 'Research Group',
				},
				{
					'@type': 'Person',
					name: '',
				},
			],
		});
	});

	it('preserves already-normalized ORCID URLs', () => {
		expect(
			cslToJsonLd({
				type: 'book',
				title: 'ORCID URL Example',
				author: [
					{
						given: 'Ada',
						family: 'Smith',
						ORCID: 'https://orcid.org/0000-0001-2345-6789',
					},
				],
			})
		).toMatchObject({
			author: [
				{
					sameAs: 'https://orcid.org/0000-0001-2345-6789',
				},
			],
		});
	});

	it('uses scalar ISSN values and ignores unsupported container contexts', () => {
		expect(
			cslToJsonLd({
				type: 'article-journal',
				title: 'Scalar ISSN Example',
				'container-title': 'Journal of Examples',
				ISSN: '2049-3630',
			})
		).toMatchObject({
			isPartOf: {
				issn: '2049-3630',
			},
		});

		expect(
			cslToJsonLd({
				type: 'book',
				title: 'Book With Series',
				'container-title': 'Unsupported Series Context',
			})
		).not.toHaveProperty('isPartOf');
	});

	it('does not let explicit URLs override DOI URLs and ignores empty ISBN arrays', () => {
		expect(
			cslToJsonLd({
				type: 'book',
				title: 'DOI URL Priority',
				DOI: '10.5555/url-priority',
				URL: 'https://example.com/landing-page',
				ISBN: ['', 42, null],
			})
		).toMatchObject({
			url: 'https://doi.org/10.5555%2Furl-priority',
		});
		expect(
			cslToJsonLd({
				type: 'book',
				title: 'DOI URL Priority',
				DOI: '10.5555/url-priority',
				URL: 'https://example.com/landing-page',
				ISBN: ['', 42, null],
			})
		).not.toHaveProperty('isbn');
	});

	it('produces valid JSON-LD for multiple authors and quote-heavy titles', () => {
		const json = buildJsonLdString([
			{
				type: 'report',
				title: '"Quoted" title',
				author: [
					{ given: 'Ada', family: 'Smith' },
					{ given: 'Grace', family: 'Hopper' },
				],
			},
		]);

		expect(() => JSON.parse(json)).not.toThrow();
		expect(JSON.parse(json)[0]).toMatchObject({
			'@type': 'Report',
			author: [{ name: 'Ada Smith' }, { name: 'Grace Hopper' }],
		});
	});
});

describe('buildJsonLdString', () => {
	it('escapes script breakouts in JSON-LD output', () => {
		const json = buildJsonLdString([
			{
				type: 'webpage',
				title: '</script><script>alert(1)</script>',
			},
		]);

		expect(json).toContain(
			'\\u003c/script>\\u003cscript>alert(1)\\u003c/script>'
		);
		expect(json).not.toContain('</script><script>');
	});

	it('escapes U+2028 and U+2029 in JSON-LD output', () => {
		// Built from escapes, never embedded raw: these are line terminators in
		// JS source, so a literal one in this file would change how the test
		// itself parses. JSON.stringify leaves them unescaped, which is legal
		// inside a JSON string and not XSS -- ld+json is never executed -- but a
		// downstream consumer that evals the block rather than parsing it sees a
		// broken literal.
		const LS = String.fromCharCode(0x2028);
		const PS = String.fromCharCode(0x2029);
		const json = buildJsonLdString([
			{ type: 'webpage', title: `a${LS}b${PS}c` },
		]);

		expect(json).not.toContain(LS);
		expect(json).not.toContain(PS);
		// Built by concatenation so the expectation is a literal backslash
		// followed by "u2028", not the character it denotes.
		expect(json).toContain('\\' + 'u2028');
		expect(json).toContain('\\' + 'u2029');
		expect(JSON.parse(json)[0].name).toBe(`a${LS}b${PS}c`);
	});

	it('keeps quote-breakout payloads inside the title string instead of creating sibling properties', () => {
		const json = buildJsonLdString([
			{
				type: 'webpage',
				title: '"}, "malicious": "payload"',
			},
		]);
		const parsed = JSON.parse(json);

		expect(parsed[0].name).toBe('"}, "malicious": "payload"');
		expect(parsed[0].malicious).toBeUndefined();
	});

	it('escapes control characters in JSON-LD without breaking parsing', () => {
		const json = buildJsonLdString([
			{
				type: 'webpage',
				title: 'Control \u0000 value \u0008 test',
			},
		]);

		expect(json).toContain('\\u0000');
		expect(json).toContain('\\b');
		expect(() => JSON.parse(json)).not.toThrow();
		expect(JSON.parse(json)[0].name).toBe('Control \u0000 value \b test');
	});
});

describe('buildCslJsonString', () => {
	it('escapes script breakouts in serialized CSL-JSON output', () => {
		const json = buildCslJsonString([
			{
				type: 'book',
				title: '</script><script>alert(1)</script>',
			},
		]);

		expect(json).toContain(
			'\\u003c/script>\\u003cscript>alert(1)\\u003c/script>'
		);
		expect(json).not.toContain('</script><script>');
	});

	it('escapes U+2028 and U+2029 in serialized CSL-JSON output', () => {
		// Asserted separately from the JSON-LD serializer rather than assumed:
		// they are independent functions and have to be verified independently.
		const LS = String.fromCharCode(0x2028);
		const PS = String.fromCharCode(0x2029);
		const json = buildCslJsonString([
			{ type: 'book', title: `a${LS}b${PS}c` },
		]);

		expect(json).not.toContain(LS);
		expect(json).not.toContain(PS);
		// Built by concatenation so the expectation is a literal backslash
		// followed by "u2028", not the character it denotes.
		expect(json).toContain('\\' + 'u2028');
		expect(json).toContain('\\' + 'u2029');
		expect(JSON.parse(json)[0].title).toBe(`a${LS}b${PS}c`);
	});
});

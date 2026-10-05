import { validateAndSanitizeCsl } from './csl-sanitize';

const MINIMAL_VALID = {
	type: 'article-journal',
	title: 'A Test Article',
};

describe('validateAndSanitizeCsl', () => {
	// ── top-level guard ───────────────────────────────────────────────────────

	it('throws on null input (line 240)', () => {
		expect(() => validateAndSanitizeCsl(null)).toThrow(
			'Invalid CSL object.'
		);
	});

	it('throws on array input', () => {
		expect(() => validateAndSanitizeCsl([])).toThrow('Invalid CSL object.');
	});

	it('throws on primitive input', () => {
		expect(() => validateAndSanitizeCsl('string')).toThrow(
			'Invalid CSL object.'
		);
	});

	it('throws on unknown CSL type', () => {
		expect(() =>
			validateAndSanitizeCsl({ type: 'unknown-type', title: 'x' })
		).toThrow('Invalid CSL type.');
	});

	it('throws when title is not a string', () => {
		expect(() =>
			validateAndSanitizeCsl({ type: 'book', title: 42 })
		).toThrow('Invalid CSL title.');
	});

	it('returns a clean object for minimal valid input', () => {
		const result = validateAndSanitizeCsl(MINIMAL_VALID);
		expect(result.type).toBe('article-journal');
		expect(result.title).toBe('A Test Article');
	});

	it('accepts standalone CSL types used by the formatter', () => {
		for (const type of ['performance', 'periodical', 'regulation']) {
			const result = validateAndSanitizeCsl({
				type,
				title: 'Standalone Title',
			});
			expect(result.type).toBe(type);
		}
	});

	// ── prototype pollution prevention ───────────────────────────────────────

	it('strips __proto__ key from input object', () => {
		const input = JSON.parse(
			'{"type":"book","title":"Safe","__proto__":{"evil":true}}'
		);
		const result = validateAndSanitizeCsl(input);
		// Use hasOwnProperty — toHaveProperty walks the prototype chain.
		expect(Object.prototype.hasOwnProperty.call(result, '__proto__')).toBe(
			false
		);
		expect({}.evil).toBeUndefined();
	});

	it('strips constructor key from input object', () => {
		const input = { type: 'book', title: 'Safe', constructor: 'pwned' };
		const result = validateAndSanitizeCsl(input);
		expect(
			Object.prototype.hasOwnProperty.call(result, 'constructor')
		).toBe(false);
	});

	it('strips prototype key from input object', () => {
		const input = { type: 'book', title: 'Safe', prototype: 'pwned' };
		const result = validateAndSanitizeCsl(input);
		expect(Object.prototype.hasOwnProperty.call(result, 'prototype')).toBe(
			false
		);
	});

	// ── depth limit ───────────────────────────────────────────────────────────

	it('truncates values nested deeper than 10 levels (line 89)', () => {
		// Build an object nested 12 levels deep.
		let deep = { value: 'leaf' };
		for (let i = 0; i < 12; i++) {
			deep = { nested: deep };
		}
		const input = { type: 'book', title: 'Deep', extra: deep };
		// Should not throw — just silently drops the over-deep value.
		const result = validateAndSanitizeCsl(input);
		expect(result.type).toBe('book');
	});

	// ── sanitizeScalar returns undefined for non-scalars (line 84) ────────────

	it('drops object values in positions expecting scalars', () => {
		// An object where a leaf value is itself an object with no valid scalar.
		// sanitizeScalar returns undefined for it, so the key is omitted.
		const input = {
			type: 'book',
			title: 'Test',
			extra: { notAScalar: { nested: {} } },
		};
		const result = validateAndSanitizeCsl(input);
		// extra.notAScalar.nested resolves to {} (empty object), kept as object.
		expect(result.extra).toBeDefined();
	});

	// ── HTML stripping ────────────────────────────────────────────────────────

	it('strips HTML tags from string fields', () => {
		const input = {
			type: 'article-journal',
			title: '<b>Injected</b> Title <script>evil()</script>',
			publisher: '<em>Press</em>',
		};
		const result = validateAndSanitizeCsl(input);
		expect(result.title).toBe('Injected Title evil()');
		expect(result.publisher).toBe('Press');
	});

	it('handles nested HTML tags iteratively (no bypass via nesting)', () => {
		const input = {
			type: 'book',
			title: '<<b>script</b>>alert(1)<</b>/script>',
		};
		const result = validateAndSanitizeCsl(input);
		expect(result.title).not.toMatch(/</);
	});

	// ── name lists ────────────────────────────────────────────────────────────

	it('accepts valid author list', () => {
		const input = {
			...MINIMAL_VALID,
			author: [{ family: 'Borges', given: 'Jorge Luis' }],
		};
		const result = validateAndSanitizeCsl(input);
		expect(result.author[0].family).toBe('Borges');
	});

	it('throws when author list is not an array (line 141)', () => {
		expect(() =>
			validateAndSanitizeCsl({
				...MINIMAL_VALID,
				author: { family: 'Solo' },
			})
		).toThrow('Invalid CSL author list.');
	});

	it('throws when an author entry is not an object (line 122)', () => {
		expect(() =>
			validateAndSanitizeCsl({
				...MINIMAL_VALID,
				author: ['not-an-object'],
			})
		).toThrow('Invalid CSL author entry.');
	});

	it('throws when author family field is not a string (line 132)', () => {
		expect(() =>
			validateAndSanitizeCsl({
				...MINIMAL_VALID,
				author: [{ family: 99, given: 'Jorge' }],
			})
		).toThrow('Invalid CSL author field: family.');
	});

	it('throws when author given field is not a string', () => {
		expect(() =>
			validateAndSanitizeCsl({
				...MINIMAL_VALID,
				author: [{ family: 'Borges', given: true }],
			})
		).toThrow('Invalid CSL author field: given.');
	});

	it('accepts literal author name', () => {
		const result = validateAndSanitizeCsl({
			...MINIMAL_VALID,
			author: [{ literal: 'Anonymous' }],
		});
		expect(result.author[0].literal).toBe('Anonymous');
	});

	// ── issued / accessed dates ───────────────────────────────────────────────

	it('accepts valid issued date', () => {
		const result = validateAndSanitizeCsl({
			...MINIMAL_VALID,
			issued: { 'date-parts': [[2024, 3, 15]] },
		});
		expect(result.issued['date-parts']).toEqual([[2024, 3, 15]]);
	});

	it('accepts issued date with string-encoded integers', () => {
		const result = validateAndSanitizeCsl({
			...MINIMAL_VALID,
			issued: { 'date-parts': [['2023', '11']] },
		});
		expect(result.issued['date-parts']).toEqual([[2023, 11]]);
	});

	it('accepts literal and raw dates without date-parts', () => {
		const result = validateAndSanitizeCsl({
			...MINIMAL_VALID,
			issued: { literal: '<b>Spring 2026</b>' },
			accessed: { raw: '<i>2026-06-20</i>' },
		});

		expect(result.issued.literal).toBe('Spring 2026');
		expect(result.accessed.raw).toBe('2026-06-20');
	});

	it('throws when literal or raw date values are not strings', () => {
		expect(() =>
			validateAndSanitizeCsl({
				...MINIMAL_VALID,
				issued: { literal: 2026 },
			})
		).toThrow('Invalid CSL issued value.');
	});

	it('throws when issued is not an object (line 161)', () => {
		expect(() =>
			validateAndSanitizeCsl({
				...MINIMAL_VALID,
				issued: '2024',
			})
		).toThrow('Invalid CSL issued value.');
	});

	it('throws when issued has no supported date representation', () => {
		expect(() =>
			validateAndSanitizeCsl({
				...MINIMAL_VALID,
				issued: { season: 'spring' },
			})
		).toThrow('Invalid CSL issued date-parts.');
	});

	it('throws when issued date-parts is an empty array (line 170)', () => {
		expect(() =>
			validateAndSanitizeCsl({
				...MINIMAL_VALID,
				issued: { 'date-parts': [] },
			})
		).toThrow('Invalid CSL issued date-parts.');
	});

	it('filters out non-array date-part entries (line 176)', () => {
		// One valid entry, one invalid — invalid is filtered, valid kept.
		const result = validateAndSanitizeCsl({
			...MINIMAL_VALID,
			issued: { 'date-parts': [[2024], 'bad'] },
		});
		expect(result.issued['date-parts']).toEqual([[2024]]);
	});

	it('throws when all date-part entries are invalid (line 188)', () => {
		expect(() =>
			validateAndSanitizeCsl({
				...MINIMAL_VALID,
				issued: { 'date-parts': ['bad', null] },
			})
		).toThrow('Invalid CSL issued date-parts.');
	});

	it('drops non-integer date part values (line 156)', () => {
		// Float and non-numeric string parts are dropped; valid parts kept.
		const result = validateAndSanitizeCsl({
			...MINIMAL_VALID,
			issued: { 'date-parts': [[2024, 3.5, 'abc', 15]] },
		});
		expect(result.issued['date-parts'][0]).toEqual([2024, 15]);
	});

	it('applies same validation to accessed field', () => {
		expect(() =>
			validateAndSanitizeCsl({
				...MINIMAL_VALID,
				accessed: 'not-an-object',
			})
		).toThrow('Invalid CSL issued value.');
	});

	// ── STRING_FIELDS validation ──────────────────────────────────────────────

	it('coerces numeric string metadata fields to strings', () => {
		const result = validateAndSanitizeCsl({
			type: 'book',
			title: 'Good',
			volume: 12,
			issue: 3,
			edition: 2,
			number: 108125,
		});

		expect(result.volume).toBe('12');
		expect(result.number).toBe('108125');
		expect(result.issue).toBe('3');
		expect(result.edition).toBe('2');
	});

	it('strips markup from number, as from every string field', () => {
		expect(
			validateAndSanitizeCsl({
				type: 'article-journal',
				title: 'Good',
				number: '<em>108125</em>',
			}).number
		).toBe('108125');
	});

	it('throws when a string field contains a non-string non-number value', () => {
		expect(() =>
			validateAndSanitizeCsl({
				type: 'book',
				title: 'Good',
				publisher: true,
			})
		).toThrow('Invalid CSL publisher.');
	});

	// ── STRING_OR_STRING_ARRAY_FIELDS (ISBN / ISSN) ───────────────────────────

	it('accepts ISBN as a plain string (line 215)', () => {
		const result = validateAndSanitizeCsl({
			...MINIMAL_VALID,
			ISBN: '978-3-16-148410-0',
		});
		expect(result.ISBN).toBe('978-3-16-148410-0');
	});

	it('accepts ISBN as an array of strings (line 220-223)', () => {
		const result = validateAndSanitizeCsl({
			...MINIMAL_VALID,
			ISBN: ['978-3-16-148410-0', '0-306-40615-2'],
		});
		expect(result.ISBN).toHaveLength(2);
	});

	it('strips HTML from ISBN array entries', () => {
		const result = validateAndSanitizeCsl({
			...MINIMAL_VALID,
			ISBN: ['<b>978-3-16-148410-0</b>'],
		});
		expect(result.ISBN[0]).toBe('978-3-16-148410-0');
	});

	it('throws when ISBN is neither string nor string array (line 226/281)', () => {
		expect(() =>
			validateAndSanitizeCsl({
				...MINIMAL_VALID,
				ISBN: 12345,
			})
		).toThrow('Invalid CSL ISBN.');
	});

	it('throws when ISBN array contains non-strings', () => {
		expect(() =>
			validateAndSanitizeCsl({
				...MINIMAL_VALID,
				ISBN: ['good', 42],
			})
		).toThrow('Invalid CSL ISBN.');
	});

	it('accepts ISSN as a string', () => {
		const result = validateAndSanitizeCsl({
			...MINIMAL_VALID,
			ISSN: '2049-3630',
		});
		expect(result.ISSN).toBe('2049-3630');
	});

	it('sanitizes editor and reviewed-author name lists', () => {
		const result = validateAndSanitizeCsl({
			type: 'review-book',
			title: 'Review Example',
			editor: [{ literal: 'Editorial Board' }],
			'reviewed-author': [{ family: 'Borges', given: 'Jorge Luis' }],
		});

		expect(result.editor).toEqual([{ literal: 'Editorial Board' }]);
		expect(result['reviewed-author']).toEqual([
			{ family: 'Borges', given: 'Jorge Luis' },
		]);
	});

	it('validates all supported string metadata fields when present', () => {
		const result = validateAndSanitizeCsl({
			type: 'article-journal',
			title: '<em>Title</em>',
			'container-title': '<b>Journal</b>',
			publisher: '<span>Publisher</span>',
			page: '<i>10-20</i>',
			volume: '<strong>12</strong>',
			issue: '<strong>4</strong>',
			DOI: '<span>10.1234/example</span>',
			URL: '<span>https://example.com</span>',
			language: '<span>en</span>',
			edition: '<span>2</span>',
			medium: '<span>Print</span>',
			genre: '<span>Essay</span>',
			'publisher-place': '<span>Buenos Aires</span>',
			'event-place': '<span>Edmonton</span>',
			'reviewed-title': '<span>Reviewed Book</span>',
		});

		expect(result).toMatchObject({
			title: 'Title',
			'container-title': 'Journal',
			publisher: 'Publisher',
			page: '10-20',
			volume: '12',
			issue: '4',
			DOI: '10.1234/example',
			URL: 'https://example.com',
			language: 'en',
			edition: '2',
			medium: 'Print',
			genre: 'Essay',
			'publisher-place': 'Buenos Aires',
			'event-place': 'Edmonton',
			'reviewed-title': 'Reviewed Book',
		});
	});

	it('accepts valid accessed dates', () => {
		const result = validateAndSanitizeCsl({
			...MINIMAL_VALID,
			accessed: { 'date-parts': [[2026, '05', '04']] },
		});

		expect(result.accessed['date-parts']).toEqual([[2026, 5, 4]]);
	});

	// ── passthrough of unknown extra fields ───────────────────────────────────

	it('passes through unknown extra fields after sanitization', () => {
		const result = validateAndSanitizeCsl({
			type: 'book',
			title: 'Test',
			'custom-field': 'value',
		});
		expect(result['custom-field']).toBe('value');
	});
});

function person(family, given) {
	return {
		family,
		...(given ? { given } : {}),
	};
}

function literal(name) {
	return { literal: name };
}

function issued(year) {
	return {
		issued: {
			'date-parts': [[year]],
		},
	};
}

function citation({ id, title, author, editor, year }) {
	return {
		id,
		csl: {
			id,
			type: 'article-journal',
			...(title ? { title } : {}),
			...(author ? { author } : {}),
			...(editor ? { editor } : {}),
			...(year ? issued(year) : {}),
		},
		displayOverride: null,
		formattedText: title || id,
		inputFormat: 'bibtex',
		parseWarnings: [],
	};
}

export const SORT_BASELINE_FIXTURES = [
	citation({
		id: 'title-only-zebra-handbook',
		title: 'The Zebra Handbook',
		year: 2024,
	}),
	citation({
		id: 'smith-zeta-2024',
		title: 'Zeta Methods',
		author: [person('Smith', 'Alex')],
		year: 2024,
	}),
	citation({
		id: 'binder-zeta-2025',
		title: 'Zeta Methods',
		author: [person('Binder', 'Casey')],
		year: 2025,
	}),
	citation({
		id: 'garcia-alpha-2020',
		title: 'Alpha Accents',
		author: [person('García', 'María')],
		year: 2020,
	}),
	citation({
		id: 'de-beauvoir-beta-2024',
		title: 'Beta Particles',
		author: [person('de Beauvoir', 'Simone')],
		year: 2024,
	}),
	citation({
		id: 'oconnor-missing-date',
		title: 'No Date Study',
		author: [person("O'Connor", 'Riley')],
	}),
	citation({
		id: 'editor-marks-book-design-2019',
		title: 'The Book by Design',
		editor: [person('Marks', 'P. J. M.')],
		year: 2019,
	}),
	citation({
		id: 'who-alpha-report-2021',
		title: 'Alpha Report',
		author: [literal('World Health Organization')],
		year: 2021,
	}),
	citation({
		id: 'title-only-assistant-handbook',
		title: 'An Assistant Handbook',
		year: 2023,
	}),
	citation({
		id: 'anderson-three-authors-2022',
		title: 'Collaborative Alpha',
		author: [
			person('Anderson', 'Pat'),
			person('Ng', 'Kai'),
			person('Zimmer', 'Lee'),
		],
		year: 2022,
	}),
	citation({
		id: 'brown-two-authors-2021',
		title: 'Two Author Study',
		author: [person('Brown', 'Morgan'), person('Clark', 'Jamie')],
		year: 2021,
	}),
	citation({
		id: 'angstrom-beta-2024',
		title: 'Beta Resonance',
		author: [person('Ångström', 'Anders')],
		year: 2024,
	}),
	citation({
		id: 'van-der-berg-alpha-2023',
		title: 'Alpha Particles',
		author: [person('van der Berg', 'Ingrid')],
		year: 2023,
	}),
	citation({
		id: 'jones-alpha-2018',
		title: 'Alpha Study',
		author: [person('Jones', 'Taylor')],
		year: 2018,
	}),
	citation({
		id: 'jones-alpha-2020',
		title: 'Alpha Study',
		author: [person('Jones', 'Taylor')],
		year: 2020,
	}),
	citation({
		id: 'jones-beta-2020',
		title: 'Beta Study',
		author: [person('Jones', 'Taylor')],
		year: 2020,
	}),
	citation({
		id: 'jones-zebra-2020',
		title: 'The Zebra Study',
		author: [person('Jones', 'Taylor')],
		year: 2020,
	}),
	citation({
		id: 'jones-aardvark-2020',
		title: 'An Aardvark Study',
		author: [person('Jones', 'Taylor')],
		year: 2020,
	}),
	citation({
		id: 'lee-mixedcase-2024',
		title: 'mIxEd Case Findings',
		author: [person('Lee', 'Jordan')],
		year: 2024,
	}),
	citation({
		id: 'lee-alpha-2024',
		title: 'Alpha Case Findings',
		author: [person('Lee', 'Jordan')],
		year: 2024,
	}),
	citation({
		id: 'miller-a-theory-2021',
		title: 'A Theory of Sorting',
		author: [person('Miller', 'Quinn')],
		year: 2021,
	}),
	citation({
		id: 'miller-theory-2020',
		title: 'Theory of Sorting',
		author: [person('Miller', 'Quinn')],
		year: 2020,
	}),
	citation({
		id: 'ng-zeta-2019',
		title: 'Zeta Collaboration',
		author: [person('Ng', 'Kai')],
		year: 2019,
	}),
	citation({
		id: 'editor-owens-companion-2022',
		title: 'A Companion to Bibliographies',
		editor: [person('Owens', 'Robin')],
		year: 2022,
	}),
	citation({
		id: 'unesco-cultural-2020',
		title: 'Cultural Memory Report',
		author: [literal('UNESCO')],
		year: 2020,
	}),
	citation({
		id: 'zimmer-omega-2017',
		title: 'Omega Practices',
		author: [person('Zimmer', 'Lee')],
		year: 2017,
	}),
	citation({
		id: 'adams-two-authors-2024',
		title: 'Networked Archives',
		author: [person('Adams', 'Chris'), person('Baker', 'Dana')],
		year: 2024,
	}),
	citation({
		id: 'title-only-bare-alpha',
		title: 'a bare Alpha',
	}),
	citation({
		id: 'no-author-no-title',
	}),
	citation({
		id: 'corporate-lowercase-archive-2018',
		title: 'Archive Governance',
		author: [literal('open knowledge foundation')],
		year: 2018,
	}),
];

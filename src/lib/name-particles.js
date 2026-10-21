/**
 * Name particles ("van", "de la", "von", "d'") and how a style sorts them.
 *
 * CSL keeps a particle that is part of the surname in `non-dropping-particle`,
 * and each style's `demote-non-dropping-particle` option says whether it moves
 * behind the given name ("Duijnhoven, Elza van", Chicago) or stays in front
 * ("van Duijnhoven, E.", APA). Imported names usually arrive with the particle
 * still inside `family`, so a lowercase particle at the start of `family` is
 * read the same way. A capitalized form is part of the surname as written and
 * never split ("Van Buren").
 *
 * The PHP save port mirrors this in includes/save-markup.php, and the formatter
 * splits the same particles before citeproc-php renders a demoting style.
 */

import styleData from '../../includes/styles.json';

// Lowercase particles kept lowercase inside a name and treated as
// non-dropping particles when they open a family name. The list lives in
// includes/styles.json, which the PHP save port and formatter read too.
export const NAME_PARTICLES = new Set(styleData.nameParticles);

// An elided particle joined to the surname: d'Alembert, l'Hôpital.
const ELIDED_PARTICLE = /^([dl]['’])(?=\p{Lu})/u;

/**
 * Split the particles that open a family name.
 *
 * @param {string} family Family name.
 * @return {{particle: string, family: string}|null} The particle and the rest,
 *         or null when the name opens with no lowercase particle.
 */
export function splitNameParticle(family) {
	if (typeof family !== 'string') {
		return null;
	}

	const elided = family.match(ELIDED_PARTICLE);

	if (elided) {
		return {
			particle: elided[1],
			family: family.slice(elided[1].length),
		};
	}

	const words = [];
	let rest = family.trim();
	let match = rest.match(/^(\S+)\s+(?=\S)/u);

	while (match && NAME_PARTICLES.has(match[1])) {
		words.push(match[1]);
		rest = rest.slice(match[0].length);
		match = rest.match(/^(\S+)\s+(?=\S)/u);
	}

	// The surname proper starts with a capital; "van der" alone, or a run of
	// lowercase words, is not a particle plus a surname.
	if (!words.length || !/^\p{Lu}/u.test(rest)) {
		return null;
	}

	return { particle: words.join(' '), family: rest };
}

/**
 * Whether a style's `demote-non-dropping-particle` option moves the particle
 * out of the sort key.
 *
 * @param {string} demote `never`, `sort-only`, or `display-and-sort`.
 * @return {boolean} True when the style sorts by the surname proper.
 */
export function demotesParticleForSort(demote) {
	return demote === 'sort-only' || demote === 'display-and-sort';
}

/**
 * The part of a personal name a style sorts by: the surname proper when the
 * style demotes the particle, the particle and surname together when it does
 * not. A dropping particle never takes part in sorting.
 *
 * @param {Object}  name           CSL name.
 * @param {boolean} demoteParticle Whether the style demotes the particle.
 * @return {string} Sort family, or '' when the name has no family.
 */
export function getSortFamily(name = {}, demoteParticle = false) {
	let family = typeof name.family === 'string' ? name.family : '';
	let particle =
		typeof name['non-dropping-particle'] === 'string'
			? name['non-dropping-particle'].trim()
			: '';

	if (!family) {
		return '';
	}

	if (!particle) {
		const split = splitNameParticle(family);

		if (split) {
			particle = split.particle;
			family = split.family;
		}
	}

	if (!particle || demoteParticle) {
		return family;
	}

	return /['’]$/u.test(particle)
		? `${particle}${family}`
		: `${particle} ${family}`;
}

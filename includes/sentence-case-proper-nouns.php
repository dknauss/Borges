<?php
/**
 * Words that keep their capital in sentence case.
 *
 * English capitalizes some words wherever they fall: languages and
 * nationalities, countries and continents, Canadian provinces and
 * territories, US states, months, and days. Sentence case cannot tell them
 * from ordinary words by their capitals, so it would print "The making of
 * the english working class". These lists keep them.
 *
 * The lists are short on purpose. They leave out names that are also common
 * words, which a title could use either way: May, March, August, China,
 * Turkey, Chad, Jordan, Guinea, Polish, and Nice. People's names are left to
 * the "Keep title capitalization as entered" checkbox, and a site can add its
 * own words with the `bibliography_builder_sentence_case_proper_nouns`
 * filter.
 *
 * @package BibliographyBuilder
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Single words that keep their capital, lowercased.
 *
 * @return array<string, true> Word => true, for lookups.
 */
function bibliography_builder_sentence_case_proper_nouns() {
	$list = array_merge(
		// Days and months (not May, March, or August).
		array( 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday' ),
		array( 'january', 'february', 'april', 'june', 'july', 'september', 'october', 'november', 'december' ),
		// Languages and nationalities.
		array(
			'english',
			'british',
			'scottish',
			'irish',
			'welsh',
			'american',
			'canadian',
			'mexican',
			'french',
			'german',
			'spanish',
			'portuguese',
			'italian',
			'dutch',
			'belgian',
			'swiss',
			'austrian',
			'danish',
			'swedish',
			'norwegian',
			'finnish',
			'icelandic',
			'russian',
			'ukrainian',
			'czech',
			'slovak',
			'hungarian',
			'romanian',
			'bulgarian',
			'serbian',
			'croatian',
			'greek',
			'latin',
			'hebrew',
			'arabic',
			'persian',
			'turkish',
			'kurdish',
			'armenian',
			'georgian',
			'hindi',
			'urdu',
			'bengali',
			'punjabi',
			'tamil',
			'sanskrit',
			'chinese',
			'mandarin',
			'cantonese',
			'japanese',
			'korean',
			'vietnamese',
			'thai',
			'filipino',
			'indonesian',
			'malay',
			'swahili',
			'yoruba',
			'zulu',
			'amharic',
			'australian',
			'african',
			'asian',
			'european',
			'brazilian',
			'argentine',
			'chilean',
			'peruvian',
			'colombian',
			'cuban',
			'egyptian',
			'israeli',
			'palestinian',
			'iranian',
			'iraqi',
			'syrian',
			'lebanese',
			'saudi',
			'indian',
			'pakistani',
			'afghan',
			'nigerian',
			'kenyan',
			'ethiopian',
			'ghanaian',
			'haitian',
			'jamaican',
			'quebecois',
			'acadian',
			'cree',
			'inuktitut',
			'ojibwe',
			'mohawk',
			'inuit',
			'métis',
			'metis',
		),
		// Countries and continents (single words).
		array(
			'canada',
			'mexico',
			'america',
			'americas',
			'brazil',
			'argentina',
			'chile',
			'peru',
			'colombia',
			'venezuela',
			'cuba',
			'haiti',
			'jamaica',
			'england',
			'scotland',
			'wales',
			'ireland',
			'britain',
			'france',
			'germany',
			'spain',
			'portugal',
			'italy',
			'netherlands',
			'belgium',
			'switzerland',
			'austria',
			'denmark',
			'sweden',
			'norway',
			'finland',
			'iceland',
			'poland',
			'russia',
			'ukraine',
			'hungary',
			'romania',
			'bulgaria',
			'serbia',
			'croatia',
			'greece',
			'egypt',
			'israel',
			'palestine',
			'iran',
			'iraq',
			'syria',
			'lebanon',
			'india',
			'pakistan',
			'afghanistan',
			'bangladesh',
			'japan',
			'korea',
			'vietnam',
			'thailand',
			'philippines',
			'indonesia',
			'malaysia',
			'singapore',
			'taiwan',
			'australia',
			'nigeria',
			'kenya',
			'ethiopia',
			'ghana',
			'africa',
			'asia',
			'europe',
			'antarctica',
			'oceania',
			'arctic',
			'antarctic',
		),
		// Canadian provinces and territories.
		array(
			'alberta',
			'columbia',
			'manitoba',
			'brunswick',
			'newfoundland',
			'labrador',
			'ontario',
			'quebec',
			'québec',
			'saskatchewan',
			'nunavut',
			'yukon',
		),
		// US states (single words; "New", "North", and the like are phrases).
		array(
			'alabama',
			'alaska',
			'arizona',
			'arkansas',
			'california',
			'colorado',
			'connecticut',
			'delaware',
			'florida',
			'georgia',
			'hawaii',
			'idaho',
			'illinois',
			'indiana',
			'iowa',
			'kansas',
			'kentucky',
			'louisiana',
			'maine',
			'maryland',
			'massachusetts',
			'michigan',
			'minnesota',
			'mississippi',
			'missouri',
			'montana',
			'nebraska',
			'nevada',
			'ohio',
			'oklahoma',
			'oregon',
			'pennsylvania',
			'tennessee',
			'texas',
			'utah',
			'vermont',
			'virginia',
			'washington',
			'wisconsin',
			'wyoming',
			'carolina',
			'dakota',
		)
	);

	/**
	 * Filter the single words that sentence case keeps capitalized.
	 *
	 * Add a field's own names (Darwin, Wallace) or remove one that a
	 * site's titles use as an ordinary word. Matching ignores case.
	 *
	 * @param string[] $list Words.
	 */
	$list  = apply_filters( 'bibliography_builder_sentence_case_proper_nouns', $list );
	$words = array();

	foreach ( is_array( $list ) ? $list : array() as $word ) {
		if ( is_string( $word ) && '' !== $word ) {
			$words[ mb_strtolower( $word, 'UTF-8' ) ] = true;
		}
	}

	return $words;
}

/**
 * Names of more than one word whose words all keep their capitals, lowercased
 * and split into words: "New York", where "new" alone is an ordinary word.
 *
 * @return array<int, string[]>
 */
function bibliography_builder_sentence_case_proper_phrases() {
	return array_map(
		static function ( string $phrase ): array {
			return explode( ' ', $phrase );
		},
		array(
			'new brunswick',
			'nova scotia',
			'prince edward island',
			'northwest territories',
			'new york',
			'new jersey',
			'new mexico',
			'new hampshire',
			'rhode island',
			'west virginia',
			'north carolina',
			'south carolina',
			'north dakota',
			'south dakota',
			'united states',
			'united kingdom',
			'new zealand',
			'south africa',
			'south korea',
			'north korea',
			'sri lanka',
			'costa rica',
			'el salvador',
			'puerto rico',
			'hong kong',
			'middle east',
			'north america',
			'south america',
			'central america',
			'first nations',
		)
	);
}

/**
 * Whether a word is one of the proper nouns sentence case keeps, ignoring a
 * possessive ('s) and a plural s ("Canadians", "Mondays").
 *
 * @param string              $word  Word.
 * @param array<string, true> $words The list, from
 *                                   bibliography_builder_sentence_case_proper_nouns().
 * @return bool
 */
function bibliography_builder_sentence_case_is_proper_noun( $word, $words ) {
	$word = (string) preg_replace( "/['\x{2019}]s$/u", '', mb_strtolower( $word, 'UTF-8' ) );

	return isset( $words[ $word ] )
		|| ( 's' === substr( $word, -1 ) && isset( $words[ substr( $word, 0, -1 ) ] ) );
}

/**
 * The indexes of a title's words that keep their capitals as proper nouns:
 * single words from the list, and every word of a listed phrase whose words
 * are all capitalized in the title.
 *
 * @param array<int, array{text: string, offset: int, break: bool}> $words Words.
 * @return array<int, true>
 */
function bibliography_builder_sentence_case_proper_indexes( $words ) {
	$kept  = array();
	$lower = array();
	$list  = bibliography_builder_sentence_case_proper_nouns();

	foreach ( $words as $index => $word ) {
		$lower[ $index ] = (string) preg_replace( "/['\x{2019}]s$/u", '', mb_strtolower( $word['text'], 'UTF-8' ) );

		if ( bibliography_builder_sentence_case_is_proper_noun( $word['text'], $list ) ) {
			$kept[ $index ] = true;
		}
	}

	foreach ( bibliography_builder_sentence_case_proper_phrases() as $phrase ) {
		$length = count( $phrase );
		$last   = count( $words ) - $length;

		for ( $start = 0; $start <= $last; $start++ ) {
			if ( array_slice( $lower, $start, $length ) !== $phrase ) {
				continue;
			}

			for ( $index = $start; $index < $start + $length; $index++ ) {
				$kept[ $index ] = true;
			}
		}
	}

	return $kept;
}

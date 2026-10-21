<?php
/**
 * A citeproc-php formatter that parses its style once and renders one entry
 * at a time.
 *
 * `CiteProc::render()` calls `init()` on every call, and `init()` builds a new
 * Context, reads and parses the locale file, and rebuilds the style's whole
 * object tree: about 3 ms, against well under 1 ms to render an entry. The
 * formatter renders each entry on its own, because citeproc-php keeps
 * per-render state on its parsed style nodes (once one entry is cut to
 * "et al.", later entries lose their "and"; APA's 21+ rule leaves "and" set
 * to an ellipsis), so a fresh parse per entry was the simple, safe choice.
 *
 * This class keeps that per-entry isolation without the reparse. The first
 * `init()` parses as usual and records every property of every object in the
 * parsed style tree. Each later `init()` puts those properties back, resets
 * the Context's per-render lists and Layout's cited-item counter, and makes
 * the parsed Context current again. Each entry therefore renders against the
 * same state a fresh parse would give it. The CSL style goldens pin that
 * output byte for byte.
 *
 * The restore writes about 2,000 properties on some 400 objects per entry, so
 * it groups them by object and writes each group through a closure bound to
 * the declaring class: half the cost of a ReflectionProperty::setValue() call
 * per property.
 *
 * Loaded only after bibliography_builder_ensure_formatter_available(), because
 * it extends a Composer class.
 *
 * @package BibliographyBuilder
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Parse once, render many, each render as if freshly parsed.
 */
final class Bibliography_Builder_Reusable_CiteProc extends \Seboettg\CiteProc\CiteProc {

	/**
	 * The Context from the first init().
	 *
	 * @var \Seboettg\CiteProc\Context|null
	 */
	private $parsed_context = null;

	/**
	 * Post-parse property values: list of [ writer, object, values by name ],
	 * one per object and declaring class.
	 *
	 * @var array<int, array{0: Closure, 1: object, 2: array<string, mixed>}>
	 */
	private $snapshot = array();

	/**
	 * `Context::$results`, which has no setter.
	 *
	 * @var ReflectionProperty|null
	 */
	private $results_property = null;

	/**
	 * `Layout::$numberOfCitedItems`, a static counter that date ordinals read.
	 *
	 * @var ReflectionProperty|null
	 */
	private $cited_count_property = null;

	// phpcs:disable WordPress.NamingConventions.ValidVariableName -- $citationAsArray is the parent's parameter name.

	/**
	 * Prepare a render: parse the first time, restore the parsed state after.
	 *
	 * @param bool $citationAsArray Passed through to citeproc-php.
	 * @return void
	 */
	public function init( $citationAsArray = false ) {
		if ( null === $this->parsed_context ) {
			parent::init( $citationAsArray );

			$this->parsed_context = self::getContext();
			$this->snapshot       = self::restore_plan( self::snapshot_style_tree( $this->parsed_context ) );

			$this->results_property = new ReflectionProperty( \Seboettg\CiteProc\Context::class, 'results' );
			$this->results_property->setAccessible( true );

			$this->cited_count_property = new ReflectionProperty(
				\Seboettg\CiteProc\Rendering\Layout::class,
				'numberOfCitedItems'
			);
			$this->cited_count_property->setAccessible( true );

			return;
		}

		foreach ( $this->snapshot as $entry ) {
			$entry[0]( $entry[1], $entry[2] );
		}

		$context = $this->parsed_context;

		$context->setCitationData( new \Seboettg\CiteProc\Data\DataList() );
		$context->setCitedItems( new \Seboettg\Collection\ArrayList() );
		$context->setRenderingState(
			new \Seboettg\CiteProc\RenderingState( \Seboettg\CiteProc\RenderingState::RENDERING )
		);
		/**
		 * Both properties are set on the first call, with parsed_context.
		 *
		 * @psalm-suppress PossiblyNullReference
		 */
		$this->results_property->setValue( $context, new \Seboettg\Collection\ArrayList() );
		/**
		 * Set on the first call too.
		 *
		 * @psalm-suppress PossiblyNullReference
		 */
		$this->cited_count_property->setValue( null, 0 );

		self::setContext( $context );
	}

	// phpcs:enable WordPress.NamingConventions.ValidVariableName

	/**
	 * Record every property of every object reachable from the parsed style:
	 * macros, bibliography, citation, root, sorting, and global options.
	 *
	 * The Context itself and its Locale are not recorded: the Context's
	 * per-render lists are reset explicitly, and the Locale is not changed by
	 * rendering.
	 *
	 * @param \Seboettg\CiteProc\Context $context Parsed context.
	 * @return array
	 */
	private static function snapshot_style_tree( $context ) {
		$roots = array(
			$context->getMacros(),
			$context->getBibliography(),
			$context->getCitation(),
			$context->getRoot(),
			$context->getSorting(),
			$context->getGlobalOptions(),
			$context->getBibliographySpecificOptions(),
			$context->getCitationSpecificOptions(),
		);

		$skip = array( $context, $context->getLocale() );
		/**
		 * Objects already visited.
		 *
		 * @var SplObjectStorage<object, mixed> $seen
		 */
		$seen     = new SplObjectStorage();
		$snapshot = array();
		$queue    = array();

		foreach ( array_merge( $roots, $skip ) as $object ) {
			if ( is_object( $object ) && ! in_array( $object, $skip, true ) ) {
				$queue[] = $object;
			}
		}

		foreach ( $skip as $object ) {
			if ( is_object( $object ) ) {
				$seen->attach( $object );
			}
		}

		while ( array() !== $queue ) {
			$object = array_pop( $queue );

			if ( $seen->contains( $object ) ) {
				continue;
			}

			$seen->attach( $object );

			for ( $class = new ReflectionClass( $object ); $class; $class = $class->getParentClass() ) {
				foreach ( $class->getProperties() as $property ) {
					if ( $property->isStatic() || $property->getDeclaringClass()->getName() !== $class->getName() ) {
						continue;
					}

					$property->setAccessible( true );

					if ( ! $property->isInitialized( $object ) ) {
						continue;
					}

					$value      = $property->getValue( $object );
					$snapshot[] = array( $object, $property, $value );

					self::queue_objects( $value, $queue );
				}
			}
		}

		return $snapshot;
	}

	/**
	 * Group a snapshot by object and declaring class, each group with a writer
	 * that can assign that class's private and protected properties.
	 *
	 * @param array $snapshot List of [ object, ReflectionProperty, value ].
	 * @return array<int, array{0: Closure, 1: object, 2: array<string, mixed>}>
	 */
	private static function restore_plan( $snapshot ) {
		$writers = array();
		$groups  = array();

		foreach ( $snapshot as $entry ) {
			$class = $entry[1]->getDeclaringClass()->getName();
			$key   = spl_object_id( $entry[0] ) . '|' . $class;

			if ( ! isset( $writers[ $class ] ) ) {
				$writers[ $class ] = Closure::bind(
					static function ( $target, $values ) {
						foreach ( $values as $name => $value ) {
							$target->$name = $value;
						}
					},
					null,
					$class
				);
			}

			if ( ! isset( $groups[ $key ] ) ) {
				$groups[ $key ] = array( $writers[ $class ], $entry[0], array() );
			}

			$groups[ $key ][2][ $entry[1]->getName() ] = $entry[2];
		}

		return array_values( $groups );
	}

	/**
	 * Queue the objects in a property value, looking inside arrays.
	 *
	 * @param mixed $value Property value.
	 * @param array $queue Queue, by reference.
	 * @return void
	 */
	private static function queue_objects( $value, &$queue ) {
		if ( is_object( $value ) ) {
			if ( ! $value instanceof Closure && ! $value instanceof SimpleXMLElement ) {
				$queue[] = $value;
			}
		} elseif ( is_array( $value ) ) {
			foreach ( $value as $item ) {
				self::queue_objects( $item, $queue );
			}
		}
	}
}

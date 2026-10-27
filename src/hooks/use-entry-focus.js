import { useCallback, useEffect, useRef, useState } from '@wordpress/element';

export function useEntryFocus( { citations, noticeVersion } ) {
	const pasteZoneRef = useRef( null );
	const noticeRef = useRef( null );
	const entryRefs = useRef( new Map() );
	const pendingFocusRef = useRef( null );
	const [ focusVersion, setFocusVersion ] = useState( 0 );

	const setEntryRef = useCallback( ( id, node ) => {
		if ( node ) {
			entryRefs.current.set( id, node );
			return;
		}

		entryRefs.current.delete( id );
	}, [] );

	const queueFocus = useCallback( ( target ) => {
		pendingFocusRef.current = target;
		setFocusVersion( ( currentVersion ) => currentVersion + 1 );
	}, [] );

	useEffect( () => {
		if ( ! pendingFocusRef.current ) {
			return;
		}

		const { type, id } = pendingFocusRef.current;
		let node = null;

		if ( type === 'entry' && id ) {
			node = entryRefs.current.get( id );
		} else if ( type === 'notice' ) {
			node = noticeRef.current;
		} else if ( type === 'paste' ) {
			node = pasteZoneRef.current;
		}

		if ( node && typeof node.focus === 'function' ) {
			node.focus( { preventScroll: true } );

			if ( typeof node.scrollIntoView === 'function' ) {
				const prefersReducedMotion = window.matchMedia(
					'(prefers-reduced-motion: reduce)'
				).matches;
				node.scrollIntoView( {
					block: 'nearest',
					behavior: prefersReducedMotion ? 'auto' : 'smooth',
				} );
			}

			pendingFocusRef.current = null;
		}
	}, [ citations, focusVersion, noticeVersion ] );

	return {
		entryRefs,
		noticeRef,
		pasteZoneRef,
		queueFocus,
		setEntryRef,
	};
}

import { useCallback, useEffect, useMemo, useRef } from '@wordpress/element';
import { useDispatch, useSelect } from '@wordpress/data';
import { store as noticesStore } from '@wordpress/notices';

/**
 * Block-scoped notice context.
 *
 * Notices use the Gutenberg core/notices store but remain block-local via this
 * context key rather than appearing in the global editor snackbar region.
 *
 * Rationale:
 *  - Parse/import feedback is easier to follow when attached to the block that
 *    triggered it.
 *  - Mixed-result notices (added, skipped, unparsed, review-needed) are more
 *    meaningful next to the active form than in a global snackbar.
 *  - Deliberate focus movement to the current notice works best when rendered
 *    adjacent to the add form.
 *
 * Tradeoff: pure success messages use a local snackbar pattern inside the
 * block, which is slightly less "global-editor-native" but clearer and more
 * accessible for bibliography-specific workflows.
 */
export const NOTICE_CONTEXT = 'bibliography/editor';
const AUTO_DISMISS_MS = 5000;

function getNoticeId( notice ) {
	return notice?.id || notice?.ID || null;
}

function normalizeNotice( notice ) {
	if ( ! notice ) {
		return null;
	}

	return {
		id: getNoticeId( notice ),
		status: notice.status,
		message: notice.content || notice.message || '',
		type: notice.type || 'default',
	};
}

export function useBlockNotices() {
	const nextNoticeIdRef = useRef( 0 );
	const { createNotice, removeAllNotices, removeNotice } =
		useDispatch( noticesStore );
	const notices = useSelect(
		( select ) => select( noticesStore ).getNotices( NOTICE_CONTEXT ) || [],
		[]
	);
	const currentNotice = useMemo(
		() => normalizeNotice( notices.at( -1 ) ),
		[ notices ]
	);
	const noticeVersion = useMemo(
		() =>
			notices
				.map( ( notice ) => getNoticeId( notice ) )
				.filter( Boolean )
				.join( '|' ),
		[ notices ]
	);

	const announce = useCallback(
		( status, message, options = {} ) => {
			nextNoticeIdRef.current += 1;

			removeAllNotices( 'default', NOTICE_CONTEXT );
			removeAllNotices( 'snackbar', NOTICE_CONTEXT );
			createNotice( status, message, {
				id:
					options.id ||
					`${ NOTICE_CONTEXT }-${ nextNoticeIdRef.current }`,
				context: NOTICE_CONTEXT,
				type: options.type || 'default',
				isDismissible:
					options.isDismissible ?? options.type !== 'snackbar',
				explicitDismiss: options.explicitDismiss,
			} );
		},
		[ createNotice, removeAllNotices ]
	);

	const clearNotice = useCallback( () => {
		if ( ! currentNotice?.id ) {
			return;
		}

		removeNotice( currentNotice.id, NOTICE_CONTEXT );
	}, [ currentNotice, removeNotice ] );

	useEffect( () => {
		if ( ! currentNotice || currentNotice.type !== 'snackbar' ) {
			return undefined;
		}

		const timeoutId = setTimeout( () => {
			removeNotice( currentNotice.id, NOTICE_CONTEXT );
		}, AUTO_DISMISS_MS );

		return () => clearTimeout( timeoutId );
	}, [ currentNotice, removeNotice ] );

	return {
		announce,
		clearNotice,
		currentNotice,
		noticeContext: NOTICE_CONTEXT,
		noticeVersion,
	};
}

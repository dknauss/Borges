import { Notice, Snackbar } from '@wordpress/components';
import { __ } from '@wordpress/i18n';

export function EditorCanvasNotices( { currentNotice, noticeRef, onDismiss } ) {
	let noticeContent = null;

	if ( currentNotice?.type === 'snackbar' ) {
		noticeContent = (
			<Snackbar
				onRemove={ onDismiss }
				className="bibliography-builder-inline-snackbar"
			>
				{ currentNotice.message }
			</Snackbar>
		);
	} else if ( currentNotice ) {
		noticeContent = (
			<Notice
				status={ currentNotice.status }
				onRemove={ onDismiss }
				className="bibliography-builder-inline-notice"
				isDismissible
				politeness="polite"
			>
				<p>{ currentNotice.message }</p>
			</Notice>
		);
	}

	return (
		<div
			ref={ noticeRef }
			className={ `bibliography-builder-editor-notices${
				currentNotice ? ' has-notice' : ''
			}` }
			tabIndex={ currentNotice ? -1 : undefined }
			role={ currentNotice ? 'region' : undefined }
			aria-label={
				currentNotice
					? __( 'Notification', 'borges-bibliography-builder' )
					: undefined
			}
		>
			{ noticeContent }
		</div>
	);
}

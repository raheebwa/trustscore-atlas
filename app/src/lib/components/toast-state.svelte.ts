// SPDX-License-Identifier: Apache-2.0
/**
 * One toast at a time, announced politely. A toast reports what just happened (copied, sent); it
 * never carries information a person needs to keep, which is why it may disappear.
 */
export interface ToastMessage {
	id: number;
	text: string;
	tone: 'info' | 'success' | 'error';
}

let next = 0;

export const toasts = $state<{ current: ToastMessage | null }>({ current: null });

export function showToast(text: string, tone: ToastMessage['tone'] = 'info', timeout = 4000): void {
	next += 1;
	const message = { id: next, text, tone };
	toasts.current = message;
	setTimeout(() => {
		if (toasts.current?.id === message.id) toasts.current = null;
	}, timeout);
}

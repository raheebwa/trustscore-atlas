// SPDX-License-Identifier: Apache-2.0
/**
 * Column description for DataTable. The key is a plain string rather than a key of the row type:
 * the table reads it out of the row and hands it back to the caller's cell snippet, and tying it
 * to the row's type only bought friction at every call site.
 */
export interface Column {
	key: string;
	label: string;
	align?: 'start' | 'end';
	numeric?: boolean;
	mono?: boolean;
	sortable?: boolean;
	primary?: boolean;
}

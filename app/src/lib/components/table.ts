// SPDX-License-Identifier: Apache-2.0
/** Column description for DataTable; kept beside it so a caller can type its own columns. */
export interface Column<Row> {
	key: keyof Row & string;
	label: string;
	align?: 'start' | 'end';
	numeric?: boolean;
	mono?: boolean;
	sortable?: boolean;
	primary?: boolean;
}

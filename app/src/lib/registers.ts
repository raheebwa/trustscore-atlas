// SPDX-License-Identifier: Apache-2.0
/**
 * How a register is shown: a short name a reader recognises and the kind of body that publishes
 * it. The slug stays the identifier everywhere (API, tools, trace), but "ura.vat_withholding_agents"
 * is a key, not a label, and a row of keys reads as noise.
 *
 * A slug this map has never seen still renders: it falls back to the publisher prefix, so a new
 * register appears in the interface the day its pack lands rather than the day someone edits
 * this file.
 */

export type RegisterKind =
	'regulator' | 'tax' | 'permit' | 'standards' | 'procurement' | 'municipal';

export interface RegisterDescription {
	slug: string;
	short: string;
	kind: RegisterKind;
}

const REGISTERS: Record<string, { short: string; kind: RegisterKind }> = {
	'bou.supervised_institutions': { short: 'Bank of Uganda', kind: 'regulator' },
	'cbk.licensed_banks': { short: 'Central Bank of Kenya', kind: 'regulator' },
	'cma.licensed_firms': { short: 'Capital Markets', kind: 'regulator' },
	'kcca.businesses': { short: 'KCCA trading licence', kind: 'municipal' },
	'kcca.property_rates': { short: 'KCCA property rates', kind: 'municipal' },
	'nlgrb.gaming_operators': { short: 'Gaming board', kind: 'permit' },
	'ppda.ocds': { short: 'Public procurement', kind: 'procurement' },
	'ucc.broadcasters': { short: 'Communications', kind: 'permit' },
	'unbs.certified_products': { short: 'Standards bureau', kind: 'standards' },
	'ura.customs_agents': { short: 'URA customs agents', kind: 'tax' },
	'ura.vat_withholding_agents': { short: 'URA VAT agents', kind: 'tax' },
	'ura.wht_exemptions': { short: 'URA tax exemptions', kind: 'tax' },
	'urbra.licensed_schemes': { short: 'Retirement benefits', kind: 'regulator' }
};

const PREFIX_KINDS: Record<string, RegisterKind> = {
	ura: 'tax',
	kcca: 'municipal',
	ppda: 'procurement',
	unbs: 'standards'
};

export function describeRegister(slug: string): RegisterDescription {
	const known = REGISTERS[slug];
	if (known) return { slug, ...known };
	const [prefix = '', rest = ''] = slug.split('.', 2);
	const words = (rest || prefix).replaceAll('_', ' ').trim();
	return {
		slug,
		short: `${prefix.toUpperCase()} ${words}`.trim(),
		kind: PREFIX_KINDS[prefix] ?? 'regulator'
	};
}

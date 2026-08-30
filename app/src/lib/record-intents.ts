// SPDX-License-Identifier: Apache-2.0
/**
 * Why someone is looking at a record. A lender, a buyer, a market researcher and the owner all
 * read the same evidence, but they open the page with different questions, and a page that
 * answers none of them in particular answers all of them badly.
 *
 * An intent changes emphasis and wording only. It never changes which registers were checked,
 * which statements exist, or what a score is: those are facts about the record, and a page that
 * moved them per audience would be telling four different stories about one business.
 */

export type IntentId = 'overview' | 'lending' | 'market' | 'procurement' | 'owner';

export interface Intent {
	id: IntentId;
	label: string;
	question: string;
	/** Registers whose presence answers this question first. Slugs, matched against found_in. */
	registers: string[];
	/** What this reader cannot conclude from Atlas, said before they conclude it. */
	limit: string;
}

export const INTENTS: Intent[] = [
	{
		id: 'overview',
		label: 'Overview',
		question: 'What do the registers say about this business?',
		registers: [],
		limit: 'Atlas reports what registers publish. It does not verify a business or rate it.'
	},
	{
		id: 'lending',
		label: 'Lending',
		question: 'Is this counterparty formally registered and currently licensed?',
		registers: ['ura.vat_withholding_agents', 'ura.customs_agents', 'bou.supervised_institutions'],
		limit:
			'Nothing here is a credit assessment, and no register published here reports debt, arrears or repayment history.'
	},
	{
		id: 'market',
		label: 'Market',
		question: 'What kind of business is this, and where does it operate?',
		registers: ['kcca.businesses', 'unbs.certified_products'],
		limit:
			'Sector and location come from licences, so a business may trade beyond what it licensed.'
	},
	{
		id: 'procurement',
		label: 'Procurement',
		question: 'Has this bidder delivered public contracts, and is it in good standing?',
		registers: ['ppda.ocds', 'ura.vat_withholding_agents'],
		limit:
			'Procurement history covers the release packages Atlas has loaded, and absence from them is not evidence of debarment.'
	},
	{
		id: 'owner',
		label: 'Owner',
		question: 'What does the public record say about my business, and how do I correct it?',
		registers: [],
		limit:
			'Corrections do not overwrite a register. A maintainer reviews them, and the published record changes at the next regeneration.'
	}
];

export function intentById(id: string | null | undefined): Intent {
	return INTENTS.find((intent) => intent.id === id) ?? INTENTS[0];
}

/** The registers this reader cares about that were checked and did not carry the business. */
export function missingFor(intent: Intent, foundIn: string[], checked: string[]): string[] {
	const found = new Set(foundIn);
	const seen = new Set(checked);
	return intent.registers.filter((slug) => seen.has(slug) && !found.has(slug));
}

/** The registers this reader cares about that nobody has checked yet. */
export function uncheckedFor(intent: Intent, checked: string[]): string[] {
	const seen = new Set(checked);
	return intent.registers.filter((slug) => !seen.has(slug));
}

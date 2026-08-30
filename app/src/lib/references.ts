/**
 * What a register published as its reference, and what a page may do with it.
 *
 * A reference is whatever the register gave us: a query URL for the ones with a website, a
 * citation like "URA report 13, pulled 2026-05-12" for the ones that publish reports. Rendering
 * the second as a link produced an address the browser resolved against Atlas itself, so the
 * evidence for 81,733 statements led nowhere. A reference becomes a link only when it parses as
 * http or https; otherwise it stays text, and the trace link stands in as the durable route to
 * the evidence.
 */

export interface Reference {
	source_slug: string;
	source_label: string;
	source_ref_label: string;
	source_url: string | null;
	trace_url: string;
}

function validUrl(value: string | null | undefined): URL | null {
	const trimmed = value?.trim();
	if (!trimmed) return null;
	try {
		const url = new URL(trimmed);
		return url.protocol === 'https:' || url.protocol === 'http:' ? url : null;
	} catch {
		return null;
	}
}

/** The host carries more meaning in a table than a 200-character query string. */
function shortLabel(url: URL): string {
	return url.hostname.replace(/^www\./, '');
}

export function describeReference({
	source,
	source_ref,
	atlas_id,
	field,
	source_label
}: {
	source: string;
	source_ref: string | null | undefined;
	atlas_id: string;
	field: string;
	source_label?: string;
}): Reference {
	const url = validUrl(source_ref);
	return {
		source_slug: source,
		source_label: source_label?.trim() || source,
		source_ref_label: url ? shortLabel(url) : source_ref?.trim() || source,
		source_url: url ? url.href : null,
		trace_url: `/b/${encodeURIComponent(atlas_id)}/trace/${encodeURIComponent(field)}`
	};
}

// Declarative WebMCP form attributes: a form with toolname becomes a tool in Chrome with
// WebMCP, and toolparamdescription documents each field for the model.
declare namespace svelteHTML {
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	interface HTMLAttributes<T> {
		toolname?: string;
		tooldescription?: string;
		toolparamdescription?: string;
	}
}

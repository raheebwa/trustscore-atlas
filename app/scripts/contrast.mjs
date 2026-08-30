// The values here must stay identical to the @theme block in src/routes/layout.css.
const palette = {
	ink: '#0B1E3F',
	'ink-muted': '#505C6B',
	canvas: '#F7F1E5',
	surface: '#FCF8F0',
	panel: '#EDE5D2',
	'panel-2': '#E3D8BF',
	accent: '#D4933F',
	'accent-ink': '#87571B',
	'accent-tint': '#F8ECD8',
	'error-ink': '#8B3A2F',
	'error-background': '#F7E7E2',
	'warning-ink': '#87571B',
	'warning-background': '#FAF0DE',
	'success-ink': '#3E6B5B',
	'success-background': '#E7EFEA'
};

const textPairs = [
	['ink', 'canvas'],
	['ink', 'surface'],
	['ink', 'panel'],
	['ink', 'panel-2'],
	['ink', 'accent'],
	['ink', 'accent-tint'],
	['ink-muted', 'canvas'],
	['ink-muted', 'surface'],
	// Captions and table meta sit on both panel layers all over this product, so these two
	// pairs decide the muted ink, not the lightest background.
	['ink-muted', 'panel'],
	['ink-muted', 'panel-2'],
	['ink-muted', 'accent-tint'],
	['accent-ink', 'canvas'],
	['accent-ink', 'surface'],
	['accent-ink', 'panel'],
	// accent-ink on panel-2 is deliberately absent: readable gold on the darkest neutral would
	// have to go darker than gold, so panel-2 takes muted ink instead.
	['accent-ink', 'accent-tint'],
	['error-ink', 'error-background'],
	['warning-ink', 'warning-background'],
	['success-ink', 'success-background']
];

function relativeLuminance(hex) {
	const channels = hex
		.slice(1)
		.match(/.{2}/g)
		.map((channel) => Number.parseInt(channel, 16) / 255)
		.map((channel) => (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4));
	return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrastRatio(foreground, background) {
	const lighter = Math.max(relativeLuminance(foreground), relativeLuminance(background));
	const darker = Math.min(relativeLuminance(foreground), relativeLuminance(background));
	return (lighter + 0.05) / (darker + 0.05);
}

const rows = textPairs.map(([foreground, background]) => {
	const ratio = contrastRatio(palette[foreground], palette[background]);
	return {
		foreground: `${foreground} ${palette[foreground]}`,
		background: `${background} ${palette[background]}`,
		ratio: ratio.toFixed(2),
		result: ratio >= 4.5 ? 'PASS' : 'FAIL'
	};
});

console.table(rows);

const fillOnlyChecks = ['canvas', 'surface'].map((background) => ({
	foreground: `accent ${palette.accent}`,
	background: `${background} ${palette[background]}`,
	ratio: contrastRatio(palette.accent, palette[background]).toFixed(2),
	result: 'EXPECTED EXCLUSION: fill-only token'
}));
console.log('Accent text exclusion check:');
console.table(fillOnlyChecks);

const violations = rows.filter((row) => row.result === 'FAIL');
if (violations.length > 0) {
	console.error(`Contrast violations: ${violations.length}`);
	process.exitCode = 1;
}

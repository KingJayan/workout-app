export type ParsedSet = {
	sets: number | null;
	reps: number | null;
	loadKg: number | null;
	rpe: number | null;
	durationSeconds: number | null;
	distanceMeters: number | null;
	setType: 'working' | 'warmup' | 'dropset' | 'failure' | 'amrap';
};

export type ParseError = { ok: false; error: string };
export type ParseResult = { ok: true; data: ParsedSet } | ParseError;

// recognized token keys and how to extract them
const TOKEN_PATTERNS: Record<string, RegExp> = {
	sets: /^(\d+)$/,
	reps: /^(\d+)$/,
	weight: /^(\d+(?:\.\d+)?)(?:kg|lbs?)?$/i,
	rpe: /^@?(\d+(?:\.\d+)?)$/,
	duration: /^(\d+(?:\.\d+)?)(?:s|sec|m|min)?$/i,
	distance: /^(\d+(?:\.\d+)?)(?:m|km|mi)?$/i
};

const SET_TYPE_KEYWORDS: Record<string, ParsedSet['setType']> = {
	warmup: 'warmup',
	wu: 'warmup',
	drop: 'dropset',
	dropset: 'dropset',
	fail: 'failure',
	failure: 'failure',
	amrap: 'amrap'
};

function parseToken(key: string, raw: string): number | null {
	const pattern = TOKEN_PATTERNS[key];
	if (!pattern) return null;
	const m = raw.trim().match(pattern);
	return m ? parseFloat(m[1]) : null;
}

function toDurationSeconds(raw: string): number | null {
	const m = raw.trim().match(/^(\d+(?:\.\d+)?)(s|sec|m|min)?$/i);
	if (!m) return null;
	const val = parseFloat(m[1]);
	const unit = (m[2] ?? 's').toLowerCase();
	return unit === 'm' || unit === 'min' ? val * 60 : val;
}

function toDistanceMeters(raw: string): number | null {
	const m = raw.trim().match(/^(\d+(?:\.\d+)?)(m|km|mi)?$/i);
	if (!m) return null;
	const val = parseFloat(m[1]);
	const unit = (m[2] ?? 'm').toLowerCase();
	if (unit === 'km') return val * 1000;
	if (unit === 'mi') return val * 1609.344;
	return val;
}

function toLoadKg(raw: string): number | null {
	const m = raw.trim().match(/^(\d+(?:\.\d+)?)(kg|lbs?)?$/i);
	if (!m) return null;
	const val = parseFloat(m[1]);
	const unit = (m[2] ?? 'kg').toLowerCase();
	return unit === 'lb' || unit === 'lbs' ? val * 0.453592 : val;
}

// extract all [...] tokens from the template, return their ordered names
function extractTemplateTokens(template: string): string[] {
	const matches = template.match(/\[(\w+)\]/g) ?? [];
	return matches.map((m) => m.slice(1, -1).toLowerCase());
}

// split input by the literal separators between tokens in the template
function splitInputByTemplate(template: string, input: string): string[] {
	// build a regex from the template: each [token] becomes a capture group
	const escaped = template
		.replace(/[.*+?^${}()|[\]\\]/g, (c) => (c === '[' || c === ']' ? c : '\\' + c))
		// replace [token] with a permissive capture group; whitespace around separators is optional
		.replace(/\[(\w+)\]/g, '([^\\s\\[\\]]+|\\S+?)');

	// allow optional whitespace around separator literals
	const relaxed = escaped.replace(/([^()?+*\\])\s+([^()?+*\\])/g, '$1\\s*$2');

	try {
		const re = new RegExp('^\\s*' + relaxed + '\\s*$', 'i');
		const m = input.trim().match(re);
		if (m) return m.slice(1);
	} catch {
		// fall through to whitespace split
	}

	// fallback: plain whitespace tokenization
	return input.trim().split(/\s+/);
}

export function parseSetInput(template: string, raw: string): ParseResult {
	if (!template.trim()) return { ok: false, error: 'empty template' };
	if (!raw.trim()) return { ok: false, error: 'empty input' };

	const tokenNames = extractTemplateTokens(template);
	if (tokenNames.length === 0) return { ok: false, error: 'template has no tokens' };

	// detect set type keywords anywhere in the raw input before splitting
	const lowerRaw = raw.toLowerCase();
	let setType: ParsedSet['setType'] = 'working';
	for (const [kw, type] of Object.entries(SET_TYPE_KEYWORDS)) {
		if (new RegExp(`\\b${kw}\\b`).test(lowerRaw)) {
			setType = type;
			break;
		}
	}

	const parts = splitInputByTemplate(template, raw);

	const result: ParsedSet = {
		sets: null,
		reps: null,
		loadKg: null,
		rpe: null,
		durationSeconds: null,
		distanceMeters: null,
		setType
	};

	for (let i = 0; i < tokenNames.length; i++) {
		const key = tokenNames[i];
		const rawPart = (parts[i] ?? '').trim();
		if (!rawPart) continue;

		switch (key) {
			case 'sets':
				result.sets = parseToken('sets', rawPart);
				break;
			case 'reps':
				result.reps = parseToken('reps', rawPart);
				break;
			case 'weight':
			case 'load':
				result.loadKg = toLoadKg(rawPart);
				break;
			case 'rpe':
				result.rpe = parseToken('rpe', rawPart.replace(/^@/, ''));
				break;
			case 'duration':
				result.durationSeconds = toDurationSeconds(rawPart);
				break;
			case 'distance':
				result.distanceMeters = toDistanceMeters(rawPart);
				break;
		}
	}

	return { ok: true, data: result };
}

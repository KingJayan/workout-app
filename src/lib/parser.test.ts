import { describe, it, expect } from 'vitest';
import { parseSetInput } from './parser.js';

// --- happy path ---

describe('standard template [sets]x[reps]@[weight] [rpe]', () => {
	const tpl = '[sets]x[reps]@[weight] [rpe]';

	it('parses clean input', () => {
		const r = parseSetInput(tpl, '4x8@225 8');
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		expect(r.data.sets).toBe(4);
		expect(r.data.reps).toBe(8);
		expect(r.data.loadKg).toBe(225);
		expect(r.data.rpe).toBe(8);
	});

	it('parses decimal rpe', () => {
		const r = parseSetInput(tpl, '3x5@100 7.5');
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		expect(r.data.rpe).toBe(7.5);
	});

	it('parses decimal weight', () => {
		const r = parseSetInput(tpl, '3x5@102.5 8');
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		expect(r.data.loadKg).toBe(102.5);
	});

	it('handles extra whitespace between tokens', () => {
		const r = parseSetInput(tpl, '  4 x 8 @ 225   8  ');
		expect(r.ok).toBe(true);
	});

	it('omitted rpe leaves it null', () => {
		const r = parseSetInput('[sets]x[reps]@[weight]', '3x10@80');
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		expect(r.data.rpe).toBeNull();
	});
});

// --- unit conversion ---

describe('weight unit conversion', () => {
	it('keeps kg as-is', () => {
		const r = parseSetInput('[sets]x[reps]@[weight]', '3x8@100kg');
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		expect(r.data.loadKg).toBeCloseTo(100);
	});

	it('converts lbs to kg', () => {
		const r = parseSetInput('[sets]x[reps]@[weight]', '3x8@225lbs');
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		expect(r.data.loadKg).toBeCloseTo(102.058, 2);
	});

	it('converts lb to kg', () => {
		const r = parseSetInput('[sets]x[reps]@[weight]', '1x1@135lb');
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		expect(r.data.loadKg).toBeCloseTo(61.235, 2);
	});
});

// --- duration template ---

describe('duration template [sets]x[duration]', () => {
	it('parses seconds', () => {
		const r = parseSetInput('[sets]x[duration]', '3x30s');
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		expect(r.data.sets).toBe(3);
		expect(r.data.durationSeconds).toBe(30);
	});

	it('parses minutes and converts to seconds', () => {
		const r = parseSetInput('[sets]x[duration]', '4x2m');
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		expect(r.data.durationSeconds).toBe(120);
	});

	it('parses bare number as seconds', () => {
		const r = parseSetInput('[sets]x[duration]', '3x45');
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		expect(r.data.durationSeconds).toBe(45);
	});
});

// --- distance template ---

describe('distance template [sets]x[distance]', () => {
	it('parses meters', () => {
		const r = parseSetInput('[sets]x[distance]', '5x400m');
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		expect(r.data.distanceMeters).toBe(400);
	});

	it('converts km to meters', () => {
		const r = parseSetInput('[sets]x[distance]', '1x5km');
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		expect(r.data.distanceMeters).toBe(5000);
	});

	it('converts miles to meters', () => {
		const r = parseSetInput('[sets]x[distance]', '1x1mi');
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		expect(r.data.distanceMeters).toBeCloseTo(1609.344, 1);
	});
});

// --- set type detection ---

describe('set type detection via keyword', () => {
	const tpl = '[sets]x[reps]@[weight]';

	it('defaults to working', () => {
		const r = parseSetInput(tpl, '3x8@100');
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		expect(r.data.setType).toBe('working');
	});

	it('detects warmup keyword', () => {
		const r = parseSetInput(tpl, '2x10@60 warmup');
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		expect(r.data.setType).toBe('warmup');
	});

	it('detects wu abbreviation', () => {
		const r = parseSetInput(tpl, '1x5@40 wu');
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		expect(r.data.setType).toBe('warmup');
	});

	it('detects amrap', () => {
		const r = parseSetInput('[sets]x[reps]@[weight] amrap', '1x15@80 amrap');
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		expect(r.data.setType).toBe('amrap');
	});

	it('detects dropset', () => {
		const r = parseSetInput(tpl, '3x8@100 dropset');
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		expect(r.data.setType).toBe('dropset');
	});

	it('detects failure', () => {
		const r = parseSetInput(tpl, '1x12@90 failure');
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		expect(r.data.setType).toBe('failure');
	});
});

// --- rpe with @ prefix ---

describe('rpe token with @ prefix in input', () => {
	it('strips leading @ from rpe value', () => {
		const r = parseSetInput('[sets]x[reps] [rpe]', '3x8 @8.5');
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		expect(r.data.rpe).toBe(8.5);
	});
});

// --- minimal templates ---

describe('minimal single-token templates', () => {
	it('[reps] only', () => {
		const r = parseSetInput('[reps]', '12');
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		expect(r.data.reps).toBe(12);
	});

	it('[weight] only with kg suffix', () => {
		const r = parseSetInput('[weight]', '80kg');
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		expect(r.data.loadKg).toBe(80);
	});
});

// --- load alias ---

describe('[load] as alias for weight', () => {
	it('parses [load] token', () => {
		const r = parseSetInput('[sets]x[reps]@[load]', '3x8@120');
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		expect(r.data.loadKg).toBe(120);
	});
});

// --- error cases ---

describe('error cases', () => {
	it('empty template returns error', () => {
		const r = parseSetInput('', '3x8@100');
		expect(r.ok).toBe(false);
	});

	it('empty input returns error', () => {
		const r = parseSetInput('[sets]x[reps]', '');
		expect(r.ok).toBe(false);
	});

	it('template with no tokens returns error', () => {
		const r = parseSetInput('no tokens here', '3x8');
		expect(r.ok).toBe(false);
	});
});

// --- edge cases ---

describe('edge cases', () => {
	it('missing optional tokens produce null fields', () => {
		const r = parseSetInput('[sets]x[reps]@[weight] [rpe]', '3x8@100');
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		expect(r.data.rpe).toBeNull();
	});

	it('trailing characters after last token are ignored', () => {
		const r = parseSetInput('[sets]x[reps]', '3x8!!');
		// should still parse sets and reps even with trailing noise
		expect(r.ok).toBe(true);
	});

	it('compact input with no spaces around separator', () => {
		const r = parseSetInput('[sets]x[reps]', '5x12');
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		expect(r.data.sets).toBe(5);
		expect(r.data.reps).toBe(12);
	});

	it('unknown token key produces no crash, fields stay null', () => {
		const r = parseSetInput('[sets]x[reps]@[unknown]', '3x8@foo');
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		expect(r.data.loadKg).toBeNull();
	});
});

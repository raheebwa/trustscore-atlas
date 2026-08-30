import { describe, expect, it } from 'vitest';
import { displayDistrict } from './location';

describe('displayDistrict', () => {
	it('reads a KCCA division as Kampala whatever district another register won', () => {
		expect(displayDistrict('Wakiso', 'Nakawa Division')).toBe('Kampala');
		expect(displayDistrict(null, 'central division')).toBe('Kampala');
	});

	it('keeps the resolved district everywhere else', () => {
		expect(displayDistrict('Wakiso', 'Kira Municipality')).toBe('Wakiso');
		expect(displayDistrict('Mbarara', null)).toBe('Mbarara');
		expect(displayDistrict(null, null)).toBeNull();
	});
});

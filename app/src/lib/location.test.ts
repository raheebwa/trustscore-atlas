import { describe, expect, it } from 'vitest';
import { displayDistrict, displayLocation } from './location';

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

describe('displayLocation', () => {
	it('reads a published division and district as one line', () => {
		expect(displayLocation('Wakiso', 'Nakawa Division', 'UG')).toBe('Nakawa Division, Kampala');
		expect(displayLocation('Mbarara', null, 'UG')).toBe('Mbarara');
	});

	it('falls back to the country when no location is published', () => {
		expect(displayLocation(null, null, 'KE')).toBe('Kenya');
		expect(displayLocation(null, null, 'UG')).toBe('Uganda');
		expect(displayLocation('  ', '', 'ke')).toBe('Kenya');
	});

	it('says so plainly when neither a location nor a country is known', () => {
		expect(displayLocation(null, null, null)).toBe('Location not published');
	});
});

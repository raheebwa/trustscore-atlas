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

	it('names the country only where the pack publishes nothing finer anywhere', () => {
		const kenya = { countryPublishesFinerLocation: false };
		expect(displayLocation(null, null, 'KE', kenya)).toBe('Kenya');
		expect(displayLocation('  ', '', 'ke', kenya)).toBe('Kenya');
	});

	it('says the location is not published where the pack does publish one for other records', () => {
		// Six Ugandan registers carry no location, and 14,689 records sit in that gap. "Uganda"
		// would read as a published fact next to records that name a district.
		expect(displayLocation(null, null, 'UG', { countryPublishesFinerLocation: true })).toBe(
			'Location not published'
		);
	});

	it('assumes a location is publishable when nothing says otherwise, and never invents one', () => {
		expect(displayLocation(null, null, 'UG')).toBe('Location not published');
		expect(displayLocation(null, null, null)).toBe('Location not published');
	});
});

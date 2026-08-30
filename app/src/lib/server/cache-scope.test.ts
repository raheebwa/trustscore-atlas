// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { cacheScope, deploymentVersion } from './cache-scope';

describe('cache scope', () => {
	it('binds the regeneration id to the deployment version, with dev as the fallback', () => {
		expect(cacheScope('regen-1', 'v-abc')).toBe('regen-1:v-abc');
		expect(cacheScope('regen-1', null)).toBe('regen-1:dev');
		expect(cacheScope('regen-1', ' ')).toBe('regen-1:dev');
	});

	it('reads the version id from the Worker binding', () => {
		expect(deploymentVersion({ CF_VERSION_METADATA: { id: 'v-abc' } })).toBe('v-abc');
		expect(deploymentVersion({})).toBeNull();
		expect(deploymentVersion(undefined)).toBeNull();
	});
});

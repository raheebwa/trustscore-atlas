// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		interface Platform {
			env: Env;
			ctx: ExecutionContext;
			caches: CacheStorage;
			cf?: IncomingRequestCfProperties;
		}

		// interface Error {}
		interface Locals {
			/** Verified Cloudflare Access identity, set by the server hook on /ops paths. */
			maintainer?: string;
		}
		// interface PageData {}
		// interface PageState {}
	}
}

export {};

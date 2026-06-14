import { NotImplementedError } from './errors';

/**
 * A reference to a versioned data contract exposed by a *provider* plugin, used
 * by a *consumer* plugin to request it.
 */
export interface DataContractRef {
  /** The provider plugin's manifest `id`. */
  providerId: string;
  /** The named, read-only contract the provider exposes (e.g. `"expenses"`). */
  contract: string;
  /** Contract major version the consumer was built against. */
  version: number;
}

/**
 * A resolver a provider registers to answer read requests for one of its
 * contracts. The runtime invokes it only for consumers that hold an active
 * user consent grant, already scoped to the requesting user and tenant.
 */
export type DataContractResolver<TParams = unknown, TRow = unknown> = (
  params: TParams,
) => Promise<TRow[]>;

/**
 * Cross-plugin data sharing (RFC 0002) — **reserved surface, not yet implemented**.
 *
 * A consent-gated, pull-based, read-only channel from a consumer plugin to a
 * provider plugin's data:
 *
 * - A consumer calls {@link query}. The runtime resolves it only if the current
 *   user has an active consent grant for `(consumer, provider, contract)`,
 *   otherwise it raises `ConsentRequiredError`. Access is tenant- and
 *   user-scoped and read-only.
 * - A provider registers a {@link provide} resolver per contract it exposes.
 *
 * Full implementation (consent model, manifest data-contract declarations,
 * audit log) is deferred to a future task; until then both methods throw
 * `NotImplementedError` — mirroring the other reserved surfaces.
 */
export const data = {
  /** Consumer: read a provider plugin's contract for the current user (consent-gated). */
  query<TParams = unknown, TRow = unknown>(
    _ref: DataContractRef,
    _params?: TParams,
  ): Promise<TRow[]> {
    throw new NotImplementedError(
      'sdk.data.query() (cross-plugin data sharing, RFC 0002) is not implemented yet.',
    );
  },
  /** Provider: register a resolver for one of the contracts this plugin exposes. */
  provide<TParams = unknown, TRow = unknown>(
    _contract: string,
    _resolver: DataContractResolver<TParams, TRow>,
  ): void {
    throw new NotImplementedError(
      'sdk.data.provide() (cross-plugin data sharing, RFC 0002) is not implemented yet.',
    );
  },
};

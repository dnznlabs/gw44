import { type Rpc, RpcRevert } from "../../core/ports.ts";

/** `chain:address:calldata` to return data. A missing key reverts, as an unknown selector would. */
export type MemoryCalls = Map<string, Uint8Array>;

export const memoryKey = (chain: string, to: string, data: string): string => `${chain}:${to}:${data}`;

/** The local adapter: a complete `Rpc` over a map, and the contract every other adapter meets. */
export function createMemoryRpc(chainIds: string[], calls: MemoryCalls): Rpc {
  return {
    supports: (chain) => chainIds.includes(chain),
    async call(chain, to, data) {
      const out = calls.get(memoryKey(chain, to, data));
      if (out === undefined) throw new RpcRevert();
      return out;
    },
  };
}

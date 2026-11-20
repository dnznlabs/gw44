/** One JSON-RPC `eth_call` against `latest`. The only I/O the core performs. */
export interface Rpc {
  /** False when no endpoint is configured for `chain`; `call` would throw `unknown-chain`. */
  supports(chain: string): boolean;
  /**
   * Returns the call's return data. Throws `RpcRevert` when the EVM reverted, which is an
   * answer, and `GatewayError("upstream")` when no endpoint produced one, which is not.
   */
  call(chain: string, to: string, data: string): Promise<Uint8Array>;
}

export class RpcRevert extends Error {
  constructor(message = "execution reverted") {
    super(message);
    this.name = "RpcRevert";
  }
}

export interface GatewayResponse {
  status: number;
  headers: [string, string][];
  body: Uint8Array;
}

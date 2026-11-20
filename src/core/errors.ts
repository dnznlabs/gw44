/** Every failure the gateway can describe to a client; anything else is a bug. */
export type GatewayErrorKind =
  | "bad-target" // the URL names no contract
  | "unknown-chain" // no RPC endpoint is configured for the chain
  | "not-found" // the contract answered, and the answer is "no such resource"
  | "bad-response" // the contract or the RPC returned bytes that do not decode
  | "upstream"; // no configured RPC endpoint produced an answer

const STATUS: Record<GatewayErrorKind, number> = {
  "bad-target": 400,
  "unknown-chain": 404,
  "not-found": 404,
  "bad-response": 502,
  upstream: 502,
};

export class GatewayError extends Error {
  readonly kind: GatewayErrorKind;

  constructor(kind: GatewayErrorKind, message: string) {
    super(message);
    this.name = "GatewayError";
    this.kind = kind;
  }

  get status(): number {
    return STATUS[this.kind];
  }
}

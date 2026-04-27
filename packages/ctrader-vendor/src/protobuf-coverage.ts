// §10.3 step 7 (protobuf coverage) — pure offline check that every cTrader
// Open API message we either send or receive on the live wire round-trips
// through the in-house codec. Runs without a broker, without OAuth, without a
// network socket. If this is red, the whole §10.3 gate is red regardless of
// what the live broker does.
//
// Returned shape is the same `evidence` payload the smoke runner expects, so
// step 7 can either call this directly (default) or bypass it for partial
// runs.

import {
  decodeFrame,
  decodeInner,
  encodeFrame,
  lookupType,
  messageTypeFor,
  payloadTypeFor,
  REQUIRED_MESSAGE_TYPES,
  type RequiredMessageName,
} from './codec.ts';

export interface MessageCoverageResult {
  readonly name: RequiredMessageName;
  readonly payloadType: number | null; // null for the envelope itself
  readonly bytes: number;
  readonly ok: boolean;
  readonly error?: string;
}

export interface ProtobufCoverageReport {
  readonly ok: boolean;
  readonly messages: ReadonlyArray<MessageCoverageResult>;
  readonly summary: { readonly total: number; readonly passed: number; readonly failed: number };
}

// Per-message canonical fixture used by the round-trip check. Keep these
// in-tree (vs hand-coded buffers) so the spec doubles as live documentation
// of what the gateway will actually send.
const FIXTURES: Record<RequiredMessageName, Record<string, unknown>> = {
  ProtoMessage: {
    payloadType: 51, // HEARTBEAT_EVENT
    payload: new Uint8Array(0),
    clientMsgId: 'envelope-fixture',
  },
  ProtoHeartbeatEvent: {},
  ProtoOAApplicationAuthReq: {
    clientId: 'fixture-client-id',
    clientSecret: 'fixture-client-secret',
  },
  ProtoOAAccountAuthReq: {
    ctidTraderAccountId: 17_101_520,
    accessToken: 'fixture-access-token',
  },
  ProtoOASymbolsListReq: {
    ctidTraderAccountId: 17_101_520,
    includeArchivedSymbols: false,
  },
  ProtoOASubscribeSpotsReq: {
    ctidTraderAccountId: 17_101_520,
    symbolId: [1, 2, 3],
  },
  ProtoOANewOrderReq: {
    ctidTraderAccountId: 17_101_520,
    symbolId: 1,
    orderType: 1, // MARKET
    tradeSide: 1, // BUY
    volume: 100,
    clientOrderId: '01HABCDEFGHIJKLMNPQRSTVWXY', // ULID
    relativeStopLoss: 100,
    relativeTakeProfit: 200,
  },
  ProtoOADealListReq: {
    ctidTraderAccountId: 17_101_520,
    fromTimestamp: 1_700_000_000_000,
    toTimestamp: 1_700_086_400_000,
    maxRows: 100,
  },
  ProtoOAExecutionEvent: {
    ctidTraderAccountId: 17_101_520,
    executionType: 3, // ORDER_FILLED
    isServerEvent: false,
  },
  ProtoOAAmendPositionSLTPReq: {
    ctidTraderAccountId: 17_101_520,
    positionId: 1,
    stopLoss: 1.23456,
    takeProfit: 1.26543,
    trailingStopLoss: false,
  },
  ProtoOAClosePositionReq: {
    ctidTraderAccountId: 17_101_520,
    positionId: 1,
    volume: 100,
  },
};

function checkOne(name: RequiredMessageName): MessageCoverageResult {
  try {
    const fixture = FIXTURES[name];
    if (name === 'ProtoMessage') {
      // Envelope round-trip: encode via the Type directly (not via encodeFrame
      // which wraps another envelope). We still want to confirm the schema
      // accepts the canonical fields.
      const Env = lookupType('ProtoMessage');
      const err = Env.verify(fixture);
      if (err) return { name, payloadType: null, bytes: 0, ok: false, error: err };
      const bytes = Env.encode(Env.create(fixture)).finish();
      const decoded = Env.decode(bytes) as unknown as { payloadType: number };
      if (decoded.payloadType !== 51) {
        return {
          name,
          payloadType: null,
          bytes: bytes.byteLength,
          ok: false,
          error: `envelope payloadType mismatch: got ${decoded.payloadType}`,
        };
      }
      return { name, payloadType: null, bytes: bytes.byteLength, ok: true };
    }

    const pt = payloadTypeFor(name);
    const frame = encodeFrame(pt, fixture);
    const decoded = decodeFrame(frame);
    if (decoded.payloadType !== pt) {
      return {
        name,
        payloadType: pt,
        bytes: frame.byteLength,
        ok: false,
        error: `decoded payloadType ${decoded.payloadType} ≠ expected ${pt}`,
      };
    }
    // Decode the inner payload via the same Type — proves bidirectional
    // serialization, not just envelope framing.
    const inner = decodeInner<Record<string, unknown>>(decoded);
    if (inner === null || typeof inner !== 'object') {
      return {
        name,
        payloadType: pt,
        bytes: frame.byteLength,
        ok: false,
        error: 'decodeInner returned non-object',
      };
    }
    // Sanity: Type lookup via payloadType matches the named message.
    if (messageTypeFor(pt).name !== name) {
      return {
        name,
        payloadType: pt,
        bytes: frame.byteLength,
        ok: false,
        error: `payloadType ${pt} resolved to ${messageTypeFor(pt).name}, expected ${name}`,
      };
    }
    return { name, payloadType: pt, bytes: frame.byteLength, ok: true };
  } catch (e) {
    return {
      name,
      payloadType: null,
      bytes: 0,
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export function runProtobufCoverage(): ProtobufCoverageReport {
  const messages = REQUIRED_MESSAGE_TYPES.map(checkOne);
  const passed = messages.filter((m) => m.ok).length;
  const failed = messages.length - passed;
  return {
    ok: failed === 0,
    messages,
    summary: { total: messages.length, passed, failed },
  };
}

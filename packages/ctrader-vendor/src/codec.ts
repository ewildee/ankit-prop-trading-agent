// In-house cTrader Open API codec (BLUEPRINT §10.3 ADR-012 verdict).
//
// Loads Spotware's vendored .proto files via protobufjs@8.0.1, builds the
// PayloadType → Type map at module-load time, and exposes the
//   wire format = [4-byte big-endian length N][N bytes ProtoMessage]
// framing that the cTrader Open API speaks over WSS port 5035 (BLUEPRINT
// §10.1). Pure data layer — no socket, no OAuth, no I/O.
//
// Why hand-built (vs `ctrader-ts` or `@reiryoku/ctrader-layer`):
// - BLUEPRINT §10.1 mandates Protobuf-over-WSS; both candidate vendors use
//   raw TLS-TCP and therefore fail step 1 of the §10.3 gate.
// - Single-maintainer supply-chain risk on either vendor; vendoring Spotware's
//   own .proto definitions at a pinned commit insulates us from that.
// - `protobufjs@8.0.1` is on the BLUEPRINT §5.2 pin list.

import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import protobuf from 'protobufjs';

const PROTO_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'proto');
const PROTO_FILES = [
  'OpenApiCommonModelMessages.proto',
  'OpenApiCommonMessages.proto',
  'OpenApiModelMessages.proto',
  'OpenApiMessages.proto',
] as const;

export class CodecError extends Error {
  override readonly name = 'CodecError';
}

let cachedRoot: protobuf.Root | null = null;

function loadRoot(): protobuf.Root {
  if (cachedRoot) return cachedRoot;
  const root = new protobuf.Root();
  root.resolvePath = (_origin: string, target: string): string => {
    // Both the entry files we pass to loadSync and the basename-only
    // `import "OpenApi*.proto"` directives inside them get resolved through
    // here. Anchor every .proto target on PROTO_DIR so protobufjs never walks
    // the filesystem outside the vendored tree.
    if (target.startsWith(PROTO_DIR)) return target;
    return join(PROTO_DIR, target);
  };
  root.loadSync(PROTO_FILES.slice(), { keepCase: true }).resolveAll();
  cachedRoot = root;
  return root;
}

// The set of messages we round-trip in the §10.3 step 7 protobuf-coverage
// check. Centralised so a single source of truth drives both the registry and
// the spec. Values are the message names as declared in the vendored .proto.
export const REQUIRED_MESSAGE_TYPES = [
  'ProtoMessage',
  'ProtoHeartbeatEvent',
  'ProtoOAApplicationAuthReq',
  'ProtoOAAccountAuthReq',
  'ProtoOASymbolsListReq',
  'ProtoOASubscribeSpotsReq',
  'ProtoOANewOrderReq',
  'ProtoOADealListReq',
  'ProtoOAExecutionEvent',
  'ProtoOAAmendPositionSLTPReq',
  'ProtoOAClosePositionReq',
] as const;
export type RequiredMessageName = (typeof REQUIRED_MESSAGE_TYPES)[number];

export function lookupType(name: string): protobuf.Type {
  const t = loadRoot().lookupType(name);
  if (!t) throw new CodecError(`unknown message type: ${name}`);
  return t;
}

// ---------------------------------------------------------------------------
// PayloadType registry — enum number → message Type
// ---------------------------------------------------------------------------

interface PayloadTypeEntry {
  readonly payloadType: number;
  readonly name: string;
  readonly type: protobuf.Type;
}

let cachedPayloadMap: Map<number, PayloadTypeEntry> | null = null;
let cachedNameMap: Map<string, PayloadTypeEntry> | null = null;

function buildPayloadMaps(): {
  byNumber: Map<number, PayloadTypeEntry>;
  byName: Map<string, PayloadTypeEntry>;
} {
  if (cachedPayloadMap && cachedNameMap) {
    return { byNumber: cachedPayloadMap, byName: cachedNameMap };
  }
  const root = loadRoot();
  const byNumber = new Map<number, PayloadTypeEntry>();
  const byName = new Map<string, PayloadTypeEntry>();

  // Walk every type in the root and harvest those with a `payloadType` field
  // that carries a `[default = …]` annotation referencing a known enum.
  // protobufjs surfaces those defaults on `field.typeDefault` once `resolveAll`
  // has run.
  const walk = (ns: protobuf.NamespaceBase): void => {
    for (const obj of Object.values(ns.nested ?? {})) {
      if (obj instanceof protobuf.Type) {
        const ptField = obj.fields['payloadType'];
        // Only register messages whose `payloadType` is *enum-typed* (i.e. it
        // references ProtoOAPayloadType or ProtoPayloadType) and carries a
        // [default = …] annotation. The envelope (`ProtoMessage`) has a
        // required uint32 with no default — its typeDefault is `0`, which we
        // must not register or it would shadow a real message at id 0.
        const isEnumPayloadType =
          ptField !== undefined &&
          (ptField.type === 'ProtoOAPayloadType' || ptField.type === 'ProtoPayloadType');
        if (
          ptField &&
          isEnumPayloadType &&
          typeof ptField.typeDefault === 'number' &&
          ptField.typeDefault > 0
        ) {
          const entry: PayloadTypeEntry = {
            payloadType: ptField.typeDefault,
            name: obj.name,
            type: obj,
          };
          byNumber.set(entry.payloadType, entry);
          byName.set(entry.name, entry);
        }
        walk(obj as unknown as protobuf.NamespaceBase);
      } else if (obj instanceof protobuf.Namespace) {
        walk(obj);
      }
    }
  };
  walk(root);
  cachedPayloadMap = byNumber;
  cachedNameMap = byName;
  return { byNumber, byName };
}

export function payloadTypeFor(name: string): number {
  const entry = buildPayloadMaps().byName.get(name);
  if (!entry) throw new CodecError(`no payloadType default for ${name}`);
  return entry.payloadType;
}

export function messageTypeFor(payloadType: number): protobuf.Type {
  const entry = buildPayloadMaps().byNumber.get(payloadType);
  if (!entry) throw new CodecError(`no message type for payloadType ${payloadType}`);
  return entry.type;
}

// ---------------------------------------------------------------------------
// Frame encode / decode
// ---------------------------------------------------------------------------

export interface DecodedFrame {
  readonly payloadType: number;
  readonly payload: Uint8Array;
  readonly clientMsgId?: string;
}

const PROTO_MESSAGE_TYPE_NAME = 'ProtoMessage';

export function encodeFrame(
  payloadType: number,
  fields: Record<string, unknown>,
  clientMsgId?: string,
): Uint8Array {
  const root = loadRoot();
  const inner = messageTypeFor(payloadType);
  const innerErr = inner.verify(fields);
  if (innerErr) throw new CodecError(`invalid fields for ${inner.name}: ${innerErr}`);
  const innerMsg = inner.create(fields);
  const innerBytes = inner.encode(innerMsg).finish();

  const Envelope = root.lookupType(PROTO_MESSAGE_TYPE_NAME);
  const envelopeFields: Record<string, unknown> = { payloadType, payload: innerBytes };
  if (clientMsgId !== undefined) envelopeFields['clientMsgId'] = clientMsgId;
  const env = Envelope.create(envelopeFields);
  const protoBytes = Envelope.encode(env).finish();

  const frame = new Uint8Array(4 + protoBytes.length);
  const view = new DataView(frame.buffer, frame.byteOffset, frame.byteLength);
  view.setUint32(0, protoBytes.length, false); // big-endian
  frame.set(protoBytes, 4);
  return frame;
}

export function decodeFrame(frame: Uint8Array): DecodedFrame {
  if (frame.length < 4) throw new CodecError(`frame too short: ${frame.length}`);
  const view = new DataView(frame.buffer, frame.byteOffset, frame.byteLength);
  const len = view.getUint32(0, false);
  if (frame.length !== 4 + len) {
    throw new CodecError(`frame length prefix ${len} != bytes ${frame.length - 4}`);
  }
  const protoBytes = frame.subarray(4);
  const root = loadRoot();
  const Envelope = root.lookupType(PROTO_MESSAGE_TYPE_NAME);
  const env = Envelope.decode(protoBytes) as unknown as {
    payloadType: number;
    payload?: Uint8Array;
    clientMsgId?: string;
  };
  // protobufjs's decode() leaves unset optional string fields as the proto3
  // default (`""`), not `undefined`. Treat the empty string as absent so
  // round-trips of frames without a clientMsgId report it as undefined.
  return {
    payloadType: env.payloadType,
    payload: env.payload ?? new Uint8Array(0),
    ...(env.clientMsgId ? { clientMsgId: env.clientMsgId } : {}),
  };
}

export function decodeInner<T = Record<string, unknown>>(frame: DecodedFrame): T {
  const inner = messageTypeFor(frame.payloadType);
  return inner.toObject(inner.decode(frame.payload), {
    longs: String,
    enums: Number,
    bytes: Array,
    defaults: false,
  }) as T;
}

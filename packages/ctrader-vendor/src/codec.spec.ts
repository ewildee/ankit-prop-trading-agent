import { describe, expect, test } from 'bun:test';
import {
  CodecError,
  decodeFrame,
  decodeInner,
  encodeFrame,
  lookupType,
  messageTypeFor,
  payloadTypeFor,
  REQUIRED_MESSAGE_TYPES,
} from './codec.ts';

const PT_APP_AUTH = 2100;
const PT_ACCOUNT_AUTH = 2102;
const PT_NEW_ORDER = 2106;
const PT_AMEND_SLTP = 2110;
const PT_CLOSE_POSITION = 2111;
const PT_SYMBOLS_LIST = 2114;
const PT_EXECUTION_EVENT = 2126;
const PT_SUBSCRIBE_SPOTS = 2127;
const PT_DEAL_LIST = 2133;
const PT_HEARTBEAT = 51;

describe('payloadType registry', () => {
  test('every required message resolves to a stable payloadType number', () => {
    expect(payloadTypeFor('ProtoOAApplicationAuthReq')).toBe(PT_APP_AUTH);
    expect(payloadTypeFor('ProtoOAAccountAuthReq')).toBe(PT_ACCOUNT_AUTH);
    expect(payloadTypeFor('ProtoOANewOrderReq')).toBe(PT_NEW_ORDER);
    expect(payloadTypeFor('ProtoOAAmendPositionSLTPReq')).toBe(PT_AMEND_SLTP);
    expect(payloadTypeFor('ProtoOAClosePositionReq')).toBe(PT_CLOSE_POSITION);
    expect(payloadTypeFor('ProtoOASymbolsListReq')).toBe(PT_SYMBOLS_LIST);
    expect(payloadTypeFor('ProtoOAExecutionEvent')).toBe(PT_EXECUTION_EVENT);
    expect(payloadTypeFor('ProtoOASubscribeSpotsReq')).toBe(PT_SUBSCRIBE_SPOTS);
    expect(payloadTypeFor('ProtoOADealListReq')).toBe(PT_DEAL_LIST);
    expect(payloadTypeFor('ProtoHeartbeatEvent')).toBe(PT_HEARTBEAT);
  });

  test('ProtoMessage envelope is NOT registered (would collide at payloadType=0)', () => {
    expect(() => payloadTypeFor('ProtoMessage')).toThrow(CodecError);
    expect(() => messageTypeFor(0)).toThrow(CodecError);
  });

  test('lookupType returns the same Type for the envelope', () => {
    const env = lookupType('ProtoMessage');
    expect(env.name).toBe('ProtoMessage');
    expect(env.fields['payloadType']?.type).toBe('uint32');
  });

  test('REQUIRED_MESSAGE_TYPES covers every message we write or read on the wire', () => {
    expect(REQUIRED_MESSAGE_TYPES).toContain('ProtoMessage');
    expect(REQUIRED_MESSAGE_TYPES).toContain('ProtoHeartbeatEvent');
    expect(REQUIRED_MESSAGE_TYPES).toContain('ProtoOAApplicationAuthReq');
    expect(REQUIRED_MESSAGE_TYPES).toContain('ProtoOAClosePositionReq');
  });
});

describe('frame encode/decode (length-prefixed ProtoMessage envelope)', () => {
  test('round-trips ProtoOAApplicationAuthReq with clientMsgId', () => {
    const frame = encodeFrame(PT_APP_AUTH, { clientId: 'cid', clientSecret: 'csec' }, 'corr-1');
    expect(frame.byteLength).toBeGreaterThan(4);
    const decoded = decodeFrame(frame);
    expect(decoded.payloadType).toBe(PT_APP_AUTH);
    expect(decoded.clientMsgId).toBe('corr-1');
    const inner = decodeInner<{ clientId: string; clientSecret: string }>(decoded);
    expect(inner.clientId).toBe('cid');
    expect(inner.clientSecret).toBe('csec');
  });

  test('round-trips ProtoOAClosePositionReq (int64 → string per decode longs:String)', () => {
    const frame = encodeFrame(PT_CLOSE_POSITION, {
      ctidTraderAccountId: 17101520,
      positionId: 987654321,
      volume: 100,
    });
    const decoded = decodeFrame(frame);
    expect(decoded.payloadType).toBe(PT_CLOSE_POSITION);
    expect(decoded.clientMsgId).toBeUndefined();
    // decodeInner forces longs: 'String' so int64 round-trips as a numeric
    // string and consumers do not need to depend on `Long`. The encoder
    // accepts JS numbers within the safe-integer range; values above
    // Number.MAX_SAFE_INTEGER must be passed as Long objects.
    const inner = decodeInner<{ ctidTraderAccountId: string; positionId: string; volume: string }>(
      decoded,
    );
    expect(inner.ctidTraderAccountId).toBe('17101520');
    expect(inner.positionId).toBe('987654321');
    expect(inner.volume).toBe('100');
  });

  test('round-trips a heartbeat (no inner fields)', () => {
    const frame = encodeFrame(PT_HEARTBEAT, {});
    const decoded = decodeFrame(frame);
    expect(decoded.payloadType).toBe(PT_HEARTBEAT);
    expect(decoded.payload.byteLength).toBeGreaterThanOrEqual(0);
  });

  test('frame uses 4-byte big-endian length prefix matching ProtoMessage bytes', () => {
    const frame = encodeFrame(PT_APP_AUTH, { clientId: 'a', clientSecret: 'b' });
    const view = new DataView(frame.buffer, frame.byteOffset, frame.byteLength);
    const declaredLen = view.getUint32(0, false); // big-endian
    expect(declaredLen).toBe(frame.byteLength - 4);
  });

  test('rejects fields that violate the message schema', () => {
    expect(() => encodeFrame(PT_APP_AUTH, { wrongField: 'x' })).toThrow(CodecError);
  });

  test('rejects truncated frames', () => {
    expect(() => decodeFrame(new Uint8Array(2))).toThrow(CodecError);
  });

  test('rejects frames whose length prefix lies', () => {
    const frame = encodeFrame(PT_APP_AUTH, { clientId: 'a', clientSecret: 'b' });
    const tampered = frame.slice();
    new DataView(tampered.buffer, tampered.byteOffset, tampered.byteLength).setUint32(
      0,
      999,
      false,
    );
    expect(() => decodeFrame(tampered)).toThrow(CodecError);
  });
});

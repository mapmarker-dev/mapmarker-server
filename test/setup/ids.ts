import { randomBytes } from 'node:crypto';

/** 앱처럼 UUID v7을 만든다(앞 48비트가 만든 시각 ms, 나머지는 무작위). Node에는 v7 생성기가 없다. */
export function uuidv7(): string {
  const bytes = randomBytes(16);
  bytes.writeUIntBE(Date.now(), 0, 6);
  bytes[6] = (bytes[6] & 0x0f) | 0x70; // 버전 7
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // RFC 9562 변형
  const hex = bytes.toString('hex');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join('-');
}

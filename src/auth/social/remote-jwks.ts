import { createPublicKey, JsonWebKey } from 'node:crypto';
import { Logger, ServiceUnavailableException } from '@nestjs/common';

export interface RemoteJwksOptions {
  /** 이 시간이 지나면 다음 요청 때 공개키를 다시 받는다. */
  maxAgeMs?: number;
  /** 모르는 kid가 와서 다시 받을 때, 직전에 받은 뒤 이만큼은 기다린다(제공자에 요청이 몰리지 않게). */
  refetchCooldownMs?: number;
  timeoutMs?: number;
  /** 테스트에서 시계를 바꿀 때만 넣는다. */
  now?: () => number;
}

/**
 * 제공자의 공개키 목록(JWKS)을 받아 두고 kid로 꺼낸다. id_token 서명 검증에 쓴다(카카오, 나중에 Apple·구글).
 *
 * - 받은 키는 `maxAgeMs` 동안 쓴다. 제공자는 키를 미리 바꿔 두므로 모르는 kid가 오면 한 번 더 받아 본다.
 *   다만 `refetchCooldownMs`에 한 번만 받는다. 엉터리 kid로 제공자에 요청을 쏟게 할 수 없게 하려는 것이다
 *   (카카오는 너무 자주 받으면 막을 수 있다고 안내한다).
 * - 다시 받기에 실패해도 예전 키가 있으면 그대로 쓴다. 키가 하나도 없을 때만 503이다.
 * - RSA 키만 받는다. 모양이 틀린 키는 건너뛴다.
 */
export class RemoteJwks {
  private readonly logger = new Logger(RemoteJwks.name);
  private readonly maxAgeMs: number;
  private readonly refetchCooldownMs: number;
  private readonly timeoutMs: number;
  private readonly now: () => number;

  /** kid → PEM(SPKI). `JwtService`의 publicKey가 문자열을 받는다. */
  private keys = new Map<string, string>();
  private fetchedAt = -Infinity;
  private lastAttemptAt = -Infinity;
  private inFlight: Promise<void> | null = null;

  constructor(
    private readonly url: string,
    options: RemoteJwksOptions = {},
  ) {
    this.maxAgeMs = options.maxAgeMs ?? 60 * 60 * 1000;
    this.refetchCooldownMs = options.refetchCooldownMs ?? 60 * 1000;
    this.timeoutMs = options.timeoutMs ?? 5000;
    this.now = options.now ?? Date.now;
  }

  /** kid의 공개키(PEM). 받은 목록에 없으면 undefined(그 토큰은 401). */
  async getKey(kid: string): Promise<string | undefined> {
    if (this.now() - this.fetchedAt >= this.maxAgeMs) {
      await this.refresh();
    }
    if (
      !this.keys.has(kid) &&
      this.now() - this.lastAttemptAt >= this.refetchCooldownMs
    ) {
      await this.refresh();
    }
    return this.keys.get(kid);
  }

  /** 동시에 여러 요청이 와도 한 번만 받는다. */
  private refresh(): Promise<void> {
    this.inFlight ??= this.fetchKeys().finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }

  private async fetchKeys(): Promise<void> {
    this.lastAttemptAt = this.now();
    try {
      const response = await fetch(this.url, {
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const body = (await response.json()) as { keys?: unknown };
      if (!Array.isArray(body.keys)) throw new Error('keys가 배열이 아님');
      this.keys = toPemByKid(body.keys);
      this.fetchedAt = this.now();
    } catch (error) {
      this.logger.warn(`공개키를 받지 못함 ${this.url}: ${String(error)}`);
      if (this.keys.size === 0) throw new ServiceUnavailableException();
    }
  }
}

function toPemByKid(jwks: unknown[]): Map<string, string> {
  const keys = new Map<string, string>();
  for (const jwk of jwks) {
    if (!isRsaJwk(jwk)) continue;
    try {
      const pem = createPublicKey({ key: jwk, format: 'jwk' }).export({
        type: 'spki',
        format: 'pem',
      });
      keys.set(jwk.kid, pem.toString());
    } catch {
      // 모양이 틀린 키 하나 때문에 나머지 키까지 못 쓰게 하지 않는다.
    }
  }
  return keys;
}

function isRsaJwk(value: unknown): value is JsonWebKey & { kid: string } {
  if (typeof value !== 'object' || value === null) return false;
  const jwk = value as Record<string, unknown>;
  // Node는 n·e가 빈 RSA 키도 받아 준다. 검증이 통과할 일은 없지만 목록에 두지 않는다.
  return (
    jwk.kty === 'RSA' &&
    typeof jwk.kid === 'string' &&
    typeof jwk.n === 'string' &&
    jwk.n !== '' &&
    typeof jwk.e === 'string' &&
    jwk.e !== ''
  );
}

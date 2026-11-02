import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { jwtModuleOptions } from './access-token';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  const secret = 'unit-test-secret-'.padEnd(32, 'x');
  const userId = '0192f0c2-7a3b-7c4d-8e5f-0123456789ab';

  function serviceWith(signingSecret = secret): AuthService {
    return new AuthService(
      new JwtService(jwtModuleOptions(signingSecret)),
      {} as PrismaService,
    );
  }

  /** base64url로 바꾼 JSON. 토큰을 직접 만들 때 쓴다. */
  function encode(value: object): string {
    return Buffer.from(JSON.stringify(value)).toString('base64url');
  }

  afterEach(() => {
    jest.useRealTimers();
  });

  it('서명한 토큰을 검사하면 사용자 ID가 나온다', async () => {
    const service = serviceWith();
    const token = await service.signAccessToken(userId);

    await expect(service.verifyAccessToken(token)).resolves.toEqual({
      id: userId,
    });
  });

  it('토큰에는 sub·iat·exp만 담긴다', async () => {
    const token = await serviceWith().signAccessToken(userId);
    const payload = new JwtService().decode<Record<string, unknown>>(token);

    expect(Object.keys(payload).sort()).toEqual(['exp', 'iat', 'sub']);
    expect(payload.sub).toBe(userId);
  });

  it('다른 키로 서명한 토큰은 401', async () => {
    const token = await serviceWith(
      'other-secret-'.padEnd(32, 'y'),
    ).signAccessToken(userId);

    await expect(serviceWith().verifyAccessToken(token)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('15분까지 쓸 수 있고, 지나면 401', async () => {
    const issuedAt = new Date('2026-11-02T00:00:00Z').getTime();
    // 시계만 바꾼다. jsonwebtoken의 비동기 콜백(nextTick·setImmediate)은 그대로 돈다.
    jest.useFakeTimers({
      now: issuedAt,
      doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'],
    });
    const service = serviceWith();
    const token = await service.signAccessToken(userId);

    jest.setSystemTime(issuedAt + 15 * 60 * 1000 - 1000);
    await expect(service.verifyAccessToken(token)).resolves.toEqual({
      id: userId,
    });

    jest.setSystemTime(issuedAt + 15 * 60 * 1000 + 1000);
    await expect(service.verifyAccessToken(token)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('서명이 없는 alg: none 토큰은 401', async () => {
    const now = Math.floor(Date.now() / 1000);
    const token = [
      encode({ alg: 'none', typ: 'JWT' }),
      encode({ sub: userId, iat: now, exp: now + 60 }),
      '',
    ].join('.');

    await expect(serviceWith().verifyAccessToken(token)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('토큰 모양이 아니면 401', async () => {
    await expect(
      serviceWith().verifyAccessToken('not-a-token'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('서명은 맞아도 sub가 없거나 UUID가 아니면 401', async () => {
    const jwt = new JwtService(jwtModuleOptions(secret));
    const service = serviceWith();

    for (const payload of [{}, { sub: 'admin' }, { sub: 42 }]) {
      const token = await jwt.signAsync(payload);
      await expect(service.verifyAccessToken(token)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    }
  });
});

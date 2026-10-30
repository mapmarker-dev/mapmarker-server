import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { jwtModuleOptions } from './access-token';
import { AuthService } from './auth.service';
import { AuthenticatedRequest, JwtAuthGuard } from './jwt-auth.guard';
import { Public } from './public.decorator';

class ProtectedController {
  handler(): void {}
}

class MixedController {
  @Public()
  open(): void {}
}

@Public()
class PublicController {
  handler(): void {}
}

describe('JwtAuthGuard', () => {
  const userId = '0192f0c2-7a3b-7c4d-8e5f-0123456789ab';
  const auth = new AuthService(
    new JwtService(jwtModuleOptions('unit-test-secret-'.padEnd(32, 'x'))),
    {} as PrismaService,
  );
  const guard = new JwtAuthGuard(new Reflector(), auth);

  /** 컨트롤러 [target]의 [method]로 들어온 요청. */
  function contextFor(
    target: new () => object,
    method: string,
    request: Partial<AuthenticatedRequest>,
  ): ExecutionContext {
    return {
      getClass: () => target,
      getHandler: () => target.prototype[method as keyof object],
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
  }

  function requestWith(authorization?: string): Partial<AuthenticatedRequest> {
    return { headers: authorization ? { authorization } : {} };
  }

  it('@Public() 경로는 헤더 없이 통과한다 (메서드에 붙여도, 컨트롤러에 붙여도)', async () => {
    await expect(
      guard.canActivate(contextFor(MixedController, 'open', requestWith())),
    ).resolves.toBe(true);
    await expect(
      guard.canActivate(contextFor(PublicController, 'handler', requestWith())),
    ).resolves.toBe(true);
  });

  it('헤더가 없거나, Bearer만 있거나, 다른 scheme이면 401', async () => {
    for (const header of [undefined, 'Bearer', 'Bearer ', 'Basic abc']) {
      await expect(
        guard.canActivate(
          contextFor(ProtectedController, 'handler', requestWith(header)),
        ),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    }
  });

  it('토큰이 틀리면 401', async () => {
    await expect(
      guard.canActivate(
        contextFor(ProtectedController, 'handler', requestWith('Bearer abc')),
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('bearer 소문자도 받고 request.user에 사용자를 넣는다', async () => {
    const token = await auth.signAccessToken(userId);

    for (const scheme of ['Bearer', 'bearer']) {
      const request = requestWith(`${scheme}  ${token}`);
      await expect(
        guard.canActivate(contextFor(ProtectedController, 'handler', request)),
      ).resolves.toBe(true);
      expect(request.user).toEqual({ id: userId });
    }
  });
});

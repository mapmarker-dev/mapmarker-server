import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { AuthUser } from './auth-user';
import { AuthService } from './auth.service';
import { IS_PUBLIC_KEY } from './public.decorator';

/** 가드를 지난 요청. `user`는 토큰으로 확인한 사용자다. */
export interface AuthenticatedRequest extends Request {
  user: AuthUser;
}

/** `Authorization: Bearer <토큰>`. scheme은 대소문자를 가리지 않는다(RFC 7235). */
const BEARER = /^Bearer\s+(\S+)$/i;

/**
 * 모든 경로에 걸리는 가드(AuthModule이 APP_GUARD로 등록한다).
 * `@Public()` 경로는 통과시키고, 나머지는 access 토큰을 검사해 `request.user`에 사용자를 넣는다.
 * 새 컨트롤러에서 가드를 빠뜨려도 막히는 쪽으로 틀리게 하려고 기본으로 건다.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(
      IS_PUBLIC_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = BEARER.exec(request.headers.authorization ?? '')?.[1];
    if (!token) throw new UnauthorizedException();
    request.user = await this.auth.verifyAccessToken(token);
    return true;
  }
}

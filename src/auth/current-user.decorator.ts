import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthUser } from './auth-user';
import { AuthenticatedRequest } from './jwt-auth.guard';

/** 가드가 토큰으로 확인한 요청 사용자. `@Public()` 경로에서는 쓰지 않는다. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthUser =>
    context.switchToHttp().getRequest<AuthenticatedRequest>().user,
);

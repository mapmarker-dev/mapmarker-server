import { Controller, Get } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
// 인터페이스라 런타임 값이 없다. 데코레이터가 붙은 인자 타입은 type import로 불러온다(isolatedModules).
import type { AuthUser } from './auth-user';
import { AuthService } from './auth.service';
import { CurrentUser } from './current-user.decorator';
import { MeResponse } from './dto/me-response.dto';

/** 인증. 소셜 로그인(토큰 발급) 경로도 여기에 더한다. */
@ApiTags('auth')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: '토큰이 없거나 틀리거나 만료됨' })
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /** 토큰의 사용자. 앱이 저장한 토큰이 아직 쓸 수 있는지 확인하는 데도 쓴다. */
  @Get('me')
  @ApiOkResponse({ type: MeResponse })
  me(@CurrentUser() user: AuthUser): Promise<MeResponse> {
    return this.authService.getMe(user.id);
  }
}

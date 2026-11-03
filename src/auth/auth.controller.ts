import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
// 인터페이스라 런타임 값이 없다. 데코레이터가 붙은 인자 타입은 type import로 불러온다(isolatedModules).
import type { AuthUser } from './auth-user';
import { AuthService } from './auth.service';
import { CurrentUser } from './current-user.decorator';
import { MeResponse } from './dto/me-response.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { TokenPairResponse } from './dto/token-pair-response.dto';
import { Public } from './public.decorator';
import { SessionsService } from './sessions.service';

/**
 * 인증. 재발급·로그아웃은 access 토큰이 만료된 뒤에도 불러야 해서 열어 두고 refresh 토큰으로 확인한다.
 * 그래서 `@ApiBearerAuth()`는 컨트롤러가 아니라 보호된 메서드에 단다.
 */
@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly sessions: SessionsService,
  ) {}

  /** 토큰의 사용자. 앱이 저장한 토큰이 아직 쓸 수 있는지 확인하는 데도 쓴다. */
  @Get('me')
  @ApiBearerAuth()
  @ApiOkResponse({ type: MeResponse })
  @ApiUnauthorizedResponse({ description: '토큰이 없거나 틀리거나 만료됨' })
  me(@CurrentUser() user: AuthUser): Promise<MeResponse> {
    return this.authService.getMe(user.id);
  }

  /** 토큰 재발급. refresh 토큰도 새로 바뀌니 받은 두 토큰을 모두 저장한다. 한 번에 하나만 보낸다. */
  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: TokenPairResponse })
  @ApiBadRequestResponse({ description: '본문이 틀림' })
  @ApiUnauthorizedResponse({
    description:
      '없거나 만료됐거나 이미 쓴 refresh 토큰. 이미 쓴 토큰이면 그 기기의 로그인을 끊는다. 다시 로그인한다',
  })
  refresh(@Body() dto: RefreshTokenDto): Promise<TokenPairResponse> {
    return this.sessions.refresh(dto.refreshToken);
  }

  /** 로그아웃. 이 기기의 로그인만 끊는다. access 토큰은 만료(최대 15분)까지 남으니 앱이 지운다. */
  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: '모르는 토큰이어도 204' })
  @ApiBadRequestResponse({ description: '본문이 틀림' })
  logout(@Body() dto: RefreshTokenDto): Promise<void> {
    return this.sessions.end(dto.refreshToken);
  }
}

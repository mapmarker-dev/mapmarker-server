import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { Env } from '../config/env';
import { jwtModuleOptions } from './access-token';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { SessionsService } from './sessions.service';
import { SocialLoginService } from './social-login.service';
import { KakaoTokenVerifier } from './social/kakao-token.verifier';
import { NaverTokenVerifier } from './social/naver-token.verifier';

/**
 * 소셜 로그인, access 토큰 서명·검사, 로그인 세션(refresh 토큰), 전역 가드. 경로를 열려면 `@Public()`을 붙인다.
 * e2e는 제공자 검증기를 `overrideProvider`로 가짜로 바꿔서 실제 카카오·네이버에 붙지 않는다.
 */
@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) =>
        jwtModuleOptions(config.get('JWT_ACCESS_SECRET', { infer: true })),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    SessionsService,
    SocialLoginService,
    KakaoTokenVerifier,
    NaverTokenVerifier,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
  exports: [AuthService, SessionsService],
})
export class AuthModule {}

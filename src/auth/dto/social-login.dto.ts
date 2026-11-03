import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';

/** 제공자 토큰 길이 상한. 실제 토큰은 이보다 훨씬 짧다. 큰 본문으로 검증을 돌리게 하지 않으려고 둔다. */
const PROVIDER_TOKEN_MAX_LENGTH = 4096;

/** 카카오 로그인. 앱이 카카오 SDK로 받은 OAuthToken의 idToken(콘솔에서 OpenID Connect를 켜야 나온다). */
export class KakaoLoginDto {
  @ApiProperty({
    description: '카카오 id_token(OIDC). access token이 아니다',
    maxLength: PROVIDER_TOKEN_MAX_LENGTH,
  })
  @IsString()
  @MaxLength(PROVIDER_TOKEN_MAX_LENGTH)
  idToken: string;
}

/** 네이버 로그인. 앱이 네이버 SDK로 받은 access token. */
export class NaverLoginDto {
  @ApiProperty({
    description: '네이버 access token',
    maxLength: PROVIDER_TOKEN_MAX_LENGTH,
  })
  @IsString()
  @MaxLength(PROVIDER_TOKEN_MAX_LENGTH)
  accessToken: string;
}

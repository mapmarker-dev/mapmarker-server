import { ApiProperty } from '@nestjs/swagger';

/**
 * 로그인·재발급 응답의 토큰 두 개.
 * access 토큰은 API를 부를 때 쓰고(15분), 만료되면 refresh 토큰으로 둘 다 새로 받는다.
 * refresh 토큰은 한 번 쓰면 바뀐다. 예전 토큰을 다시 보내면 탈취로 보고 그 기기의 로그인을 끊는다.
 */
export class TokenPairResponse {
  @ApiProperty({ description: '`Authorization: Bearer <accessToken>`' })
  accessToken: string;

  @ApiProperty({ format: 'date-time' })
  accessTokenExpiresAt: string;

  @ApiProperty({
    description: '기기에 안전하게 저장한다. 재발급·로그아웃에 쓴다',
  })
  refreshToken: string;

  @ApiProperty({
    format: 'date-time',
    description: '재발급할 때마다 30일 뒤로 다시 잡는다',
  })
  refreshTokenExpiresAt: string;
}

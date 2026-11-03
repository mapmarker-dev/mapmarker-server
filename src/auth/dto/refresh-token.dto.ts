import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';

/** 재발급·로그아웃 요청. 모양이 틀린 토큰은 400이 아니라 401(재발급)·204(로그아웃)다. */
export class RefreshTokenDto {
  @ApiProperty({
    description: '로그인·재발급 응답의 refreshToken',
    maxLength: 200,
  })
  @IsString()
  @MaxLength(200)
  refreshToken: string;
}

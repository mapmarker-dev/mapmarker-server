import { ApiProperty } from '@nestjs/swagger';
import { MeResponse } from './me-response.dto';
import { TokenPairResponse } from './token-pair-response.dto';

/** 소셜 로그인 응답. 토큰 쌍과 사용자. */
export class LoginResponse extends TokenPairResponse {
  @ApiProperty({ description: '이번 로그인으로 계정을 처음 만들었는지' })
  isNewUser: boolean;

  @ApiProperty({ type: MeResponse })
  user: MeResponse;
}

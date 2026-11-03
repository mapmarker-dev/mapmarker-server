import { ApiProperty } from '@nestjs/swagger';
import { ApiIdProperty } from '../../common/app-id';
import type { User } from '../../generated/prisma/client';

export class MeResponse {
  @ApiIdProperty()
  id: string;

  @ApiProperty({
    type: String,
    nullable: true,
    maxLength: 30,
    description: '제공자 닉네임(선택 동의). 가입할 때만 받는다',
  })
  nickname: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt: string;
}

export function toMeResponse(user: User): MeResponse {
  return {
    id: user.id,
    nickname: user.nickname,
    createdAt: user.createdAt.toISOString(),
  };
}

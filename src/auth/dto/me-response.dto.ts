import { ApiProperty } from '@nestjs/swagger';

export class MeResponse {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'date-time' })
  createdAt: string;
}

import { ApiProperty } from '@nestjs/swagger';
import { ApiIdProperty } from '../../common/app-id';

export class MeResponse {
  @ApiIdProperty()
  id: string;

  @ApiProperty({ format: 'date-time' })
  createdAt: string;
}

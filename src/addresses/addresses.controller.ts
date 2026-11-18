import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { AddressesService } from './addresses.service';
import { AddressSearchResponse } from './dto/address-search-response.dto';
import { CoordinateQuery } from './dto/coordinate.query';
import { CoordinateResponse } from './dto/coordinate-response.dto';
import { SearchAddressesQuery } from './dto/search-addresses.query';

const UNAVAILABLE = '행안부 주소 API에 잠시 닿지 못함';

/** 주소 검색과 좌표 조회(행안부 도로명주소 API). 장소·후보를 넣기 전에 앱이 부른다. */
@ApiTags('addresses')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: '토큰이 없거나 틀리거나 만료됨' })
@ApiServiceUnavailableResponse({ description: UNAVAILABLE })
@Controller('addresses')
export class AddressesController {
  constructor(private readonly addressesService: AddressesService) {}

  @Get()
  @ApiOkResponse({ type: AddressSearchResponse })
  @ApiBadRequestResponse({
    description: '검색어가 없거나, 다듬은 뒤 찾을 글이 없음',
  })
  search(@Query() query: SearchAddressesQuery): Promise<AddressSearchResponse> {
    return this.addressesService.search(query.query);
  }

  @Get('coordinates')
  @ApiOkResponse({ type: CoordinateResponse })
  @ApiBadRequestResponse({ description: '건물 키의 모양이 틀림' })
  @ApiNotFoundResponse({ description: '그 건물의 좌표가 없음' })
  coordinate(@Query() query: CoordinateQuery): Promise<CoordinateResponse> {
    return this.addressesService.coordinate(query);
  }
}

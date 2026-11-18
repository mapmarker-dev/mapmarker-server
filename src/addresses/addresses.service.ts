import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { cleanAddressQuery } from './address-query';
import { AddressSearchResponse } from './dto/address-search-response.dto';
import { CoordinateResponse } from './dto/coordinate-response.dto';
import { AddressRef, JusoClient } from './juso.client';
import { utmkToWgs84 } from './utm-k';

/** 주소 검색과 좌표 조회. 결과를 저장하지 않고 앱에 돌려준다(앱이 장소·후보로 저장한다). */
@Injectable()
export class AddressesService {
  constructor(private readonly juso: JusoClient) {}

  /** [text]를 다듬어 찾는다. 다듬은 뒤 찾을 글이 없으면 400. */
  async search(text: string): Promise<AddressSearchResponse> {
    const query = cleanAddressQuery(text);
    if (!query) throw new BadRequestException('찾을 주소가 없습니다');
    const { addresses, totalCount } = await this.juso.searchAddresses(
      query.keyword,
    );
    return { detail: query.detail, addresses, totalCount };
  }

  /** 건물 출입구 좌표. 없으면 404. */
  async coordinate(ref: AddressRef): Promise<CoordinateResponse> {
    const point = await this.juso.findCoordinate(ref);
    if (!point) throw new NotFoundException();
    return utmkToWgs84(point.x, point.y);
  }
}

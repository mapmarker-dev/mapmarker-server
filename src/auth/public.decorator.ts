import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * 토큰 없이 열어 두는 경로. 가드가 모든 경로에 걸려 있어서, 여는 곳만 이것으로 표시한다.
 * 컨트롤러 전체나 메서드 하나에 붙인다.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

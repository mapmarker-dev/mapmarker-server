/**
 * 사용자가 붙여 넣거나 친 글을 도로명주소 검색 API에 보낼 검색어로 다듬는다.
 *
 * 지도 앱에서 복사한 주소에는 상세 주소("1,2층"), 참고 항목("(양재동)"), 나라 이름("대한민국")이 붙어 있다.
 * 도로명주소 API는 도로명·건물번호(또는 지번)까지만 찾으므로 그 뒤는 상세 주소로 떼어 앱에 돌려준다.
 * 행안부는 특수문자나 SQL 예약어가 든 검색어를 공격으로 보고 IP를 막을 수 있다고 안내해서, 보내기 전에 지운다.
 */

/** 다듬은 검색어와 떼어 낸 상세 주소. */
export interface AddressQuery {
  keyword: string;
  /** 건물번호(또는 지번) 뒤에 붙어 있던 글. 예: "1,2층". 없으면 null. */
  detail: string | null;
}

/** 행안부 검색 API가 받지 않는 글자. */
const FORBIDDEN_CHARACTERS = /[%=<>[\]]/g;

/** 행안부가 검색어에서 막는 SQL 예약어. 낱말 단위로만 지운다(예: "Oryu-ro"의 "Or"는 남긴다). */
const SQL_WORDS =
  /\b(?:OR|SELECT|INSERT|DELETE|UPDATE|CREATE|DROP|EXEC|UNION|FETCH|DECLARE|TRUNCATE)\b/gi;

/** 도로명("…로", "…길", 예: "강남대로12길") + 건물번호("6", "20-3"). 번호 뒤는 끝·공백·쉼표다. */
const ROAD_ADDRESS = /^(.*?\S(?:로|길))\s*(\d+(?:-\d+)?)(?=$|[\s,])(.*)$/;

/** 지번: 동·리·가 + ("산" +) 번지("1", "1-2"). */
const JIBUN_ADDRESS =
  /^(.*?\S(?:동|리|가))\s+((?:산\s*)?\d+(?:-\d+)?)(?=$|[\s,])(.*)$/;

/** 도로명·지번이 없는 글(건물명) 뒤의 층·호. 예: "롯데월드타워 2층", "강남역 지하 1층 12호". */
const FLOOR_DETAIL = /^(.*?\S)\s+((?:지하\s*)?\d+(?:[,~-]\d+)*\s*(?:층|호).*)$/;

/** 행안부 검색어 길이 상한: 한글 40자, 영문·숫자 포함 80자. */
const MAX_HANGUL = 40;
const MAX_LENGTH = 80;
/** 행안부는 한 글자로는 찾지 않는다. */
const MIN_LENGTH = 2;

const HANGUL = /[가-힣ㄱ-ㅎㅏ-ㅣ]/g;

/** [text]를 검색어와 상세 주소로 나눈다. 찾을 글이 남지 않으면 null이다. */
export function cleanAddressQuery(text: string): AddressQuery | null {
  const cleaned = squeeze(
    squeeze(text)
      .replace(/^대한민국\s*/, '')
      .replace(/\([^)]*\)/g, ' ')
      .replace(FORBIDDEN_CHARACTERS, ' ')
      .replace(SQL_WORDS, ' '),
  );

  const { keyword, detail } = splitDetail(cleaned);
  if (
    keyword.length < MIN_LENGTH ||
    keyword.length > MAX_LENGTH ||
    (keyword.match(HANGUL)?.length ?? 0) > MAX_HANGUL
  ) {
    return null;
  }
  return { keyword, detail };
}

/**
 * 도로명주소나 지번이면 번호까지를 검색어로, 그 뒤를 상세 주소로 나눈다.
 * 아니면(건물명 등) 뒤에 붙은 층·호만 상세 주소로 떼고 나머지가 검색어다.
 * 행안부는 "롯데월드타워 2층"도 찾지만, 떼어 두어야 앱이 주소 칸에 "2층"을 남긴다.
 */
function splitDetail(text: string): AddressQuery {
  const match = ROAD_ADDRESS.exec(text) ?? JIBUN_ADDRESS.exec(text);
  if (!match) {
    const floor = FLOOR_DETAIL.exec(text);
    return floor
      ? { keyword: floor[1], detail: floor[2] }
      : { keyword: text, detail: null };
  }
  const [, place, number, rest] = match;
  const detail = rest.replace(/^[\s,]+/, '').trim();
  return {
    keyword: `${place} ${squeeze(number)}`,
    detail: detail === '' ? null : detail,
  };
}

/** 공백(줄바꿈 포함)을 한 칸으로 줄이고 앞뒤를 자른다. */
function squeeze(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

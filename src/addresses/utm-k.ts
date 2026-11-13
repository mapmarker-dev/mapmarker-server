import proj4 from 'proj4';

/**
 * UTM-K(EPSG:5179, GRS80 타원체). 행안부 좌표제공 API의 entX·entY가 이 좌표계다.
 * GRS80과 WGS84는 실용상 같아서(차이 1mm 미만) 타원체 변환 없이 위경도로 바꾼다.
 */
const UTM_K =
  '+proj=tmerc +lat_0=38 +lon_0=127.5 +k=0.9996 +x_0=1000000 +y_0=2000000 +ellps=GRS80 +units=m +no_defs';

const toWgs84 = proj4(UTM_K, 'WGS84');

/** UTM-K 좌표(미터)를 위도·경도로 바꾼다. */
export function utmkToWgs84(
  x: number,
  y: number,
): { latitude: number; longitude: number } {
  const [longitude, latitude] = toWgs84.forward([x, y]);
  return { latitude, longitude };
}

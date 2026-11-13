import { utmkToWgs84 } from './utm-k';

describe('utmkToWgs84', () => {
  it('원점(1000000, 2000000)은 위도 38, 경도 127.5다', () => {
    const { latitude, longitude } = utmkToWgs84(1000000, 2000000);

    expect(latitude).toBeCloseTo(38, 9);
    expect(longitude).toBeCloseTo(127.5, 9);
  });

  it('서울 시청 부근 좌표를 서울 시청 부근 위경도로 바꾼다', () => {
    const { latitude, longitude } = utmkToWgs84(953900, 1952000);

    expect(latitude).toBeGreaterThan(37.56);
    expect(latitude).toBeLessThan(37.57);
    expect(longitude).toBeGreaterThan(126.97);
    expect(longitude).toBeLessThan(126.98);
  });

  it('제주 쪽(남서)은 원점보다 위도·경도가 작다', () => {
    const { latitude, longitude } = utmkToWgs84(900000, 1500000);

    expect(latitude).toBeGreaterThan(33);
    expect(latitude).toBeLessThan(34);
    expect(longitude).toBeLessThan(127.5);
  });
});

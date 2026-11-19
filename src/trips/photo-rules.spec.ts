import { filesOf, photoKey, thumbnailKeyOf } from './photo-rules';

describe('사진 키', () => {
  it('사용자, 여행, 사진 ID로 원본 키를 만든다 (접두어로 사용자나 여행의 파일을 한 번에 찾는다)', () => {
    expect(photoKey('u1', 't1', 'p1')).toBe('users/u1/trips/t1/photos/p1.jpg');
  });

  it('썸네일 키는 원본 키 끝에 _thumb를 붙인다', () => {
    expect(thumbnailKeyOf('users/u1/trips/t1/photos/p1.jpg')).toBe(
      'users/u1/trips/t1/photos/p1_thumb.jpg',
    );
  });

  it('사진 하나의 파일은 원본과 썸네일 두 개다', () => {
    expect(filesOf({ storageKey: 'a/p.jpg' })).toEqual([
      'a/p.jpg',
      'a/p_thumb.jpg',
    ]);
  });
});

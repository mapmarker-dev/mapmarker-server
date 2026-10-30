/** 토큰으로 확인한 요청 사용자. 가드가 `request.user`에 넣고 `@CurrentUser()`로 꺼낸다. */
export interface AuthUser {
  id: string;
}

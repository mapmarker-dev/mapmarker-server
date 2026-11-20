-- 방문 전인 장소에는 방문 시각이 없다. API는 visited_at만 받고 visited를 맞춘다.
-- 방문했는데 시각을 모르는 경우(visited만 true)는 막지 않는다(나중 회고에서 쓸 수 있다).
ALTER TABLE "stops" ADD CONSTRAINT "stops_visited_at_check" CHECK ("visited" OR "visited_at" IS NULL);

-- 19_order_summary.sql
-- GET /api/orders 의 summary 집계 (API명세서 4.5 · 9장 🟠1).
--
-- 왜 함수로 빼는가
--   summary(매출·건수·수량)는 "현재 페이지"가 아니라 "조회 기간 전체" 기준이다.
--   그래서 목록 50건과 별개로 기간 전체를 한 번 더 읽어야 하는데, PostgREST는
--   집계 함수를 지원하지 않아 백엔드가 행을 전부 받아 파이썬으로 더하고 있었다.
--   게다가 PostgREST는 범위를 주지 않으면 1000행에서 조용히 자르기 때문에
--   fetch_all로 1000행씩 반복 요청까지 해야 했다. 30일치 2,792건이면 왕복 3번 +
--   주문 2,792건과 딸린 order_item 전부를 메모리에 올린다.
--
--   합계는 DB가 압도적으로 잘한다. 인덱스를 타고 한 번에 끝나며, 백엔드로는
--   숫자 3개만 건너온다.
--
-- stable로 선언한 이유: 읽기만 하므로 같은 트랜잭션 안에서 같은 인자면 같은 결과다.
-- 플래너가 이 사실을 알면 호출을 줄일 수 있다. volatile(기본값)이면 그 최적화가 막힌다.
--
-- 인자
--   p_from      포함 하한 (UTC). 백엔드가 KST 날짜 경계를 UTC로 바꿔 넘긴다.
--   p_to        **배타적** 상한 (UTC). end_date 다음날 00:00 KST.
--   p_paid_only true면 status='PAID'만. GET /orders?status=ALL 이면 false.
--
-- 경계 규약은 timeutil.DateRange(start_utc / end_utc_exclusive)와 정확히 같다.
-- 한쪽만 바꾸면 목록과 summary의 기준이 어긋나므로 함께 고칠 것.

create or replace function public.order_summary(
    p_store_id  bigint,
    p_from      timestamptz,
    p_to        timestamptz,
    p_paid_only boolean
)
returns jsonb
language sql
stable
as $function$
    with scoped as (
        select o.order_id, o.total_amount
          from orders o
         where o.store_id = p_store_id
           and o.ordered_at >= p_from
           and o.ordered_at <  p_to
           and (not p_paid_only or o.status = 'PAID')
    )
    select jsonb_build_object(
        -- total_amount는 DECIMAL(10,2)라 sum도 numeric이 된다.
        -- 응답은 정수 JSON number 규약(API명세서 1.2)이라 여기서 반올림해 내보낸다.
        'sales_amount', round(coalesce((select sum(total_amount) from scoped), 0))::bigint,
        'order_count',  (select count(*) from scoped)::bigint,
        'item_qty',     coalesce((
                            select sum(oi.quantity)
                              from order_item oi
                              join scoped s on s.order_id = oi.order_id
                        ), 0)::bigint
    );
$function$;

comment on function public.order_summary is
    'GET /api/orders 의 기간 전체 집계 (매출·건수·수량). API명세서 4.5';

-- 17_pay_order.sql
-- 결제 확정 RPC (FR-09, FR-12). POST /api/orders/{id}/pay 가 이 함수 하나를 호출한다.
--
-- 이 파일의 두 가지 목적:
--   1) RPC를 버전 관리에 올린다. 지금까지 DB에만 존재해서, 프로젝트를 새 Supabase에
--      올리거나 DB를 초기화하면 결제가 통째로 사라지는 상태였다.
--   2) SALES_STAT_DAILY 갱신을 추가한다(아래 [v2] 표시).
--
-- [v2] 왜 SALES_STAT_DAILY를 여기서 올리는가
--   DB설계서 v2.2 · 4.15는 이 테이블을 "일별 배치 집계"로 정의하지만 그 배치가 없다.
--   결과적으로 결제를 해도 이 테이블은 그대로였고, 이 테이블을 읽는 두 곳이 과거에
--   멈춰 있었다:
--     - GET /stats/sales      (판매 통계)
--     - GET /products/recommendations  (메뉴 추천 - 최근 7일 판매 수량 기준)
--   결제와 같은 트랜잭션에서 upsert하면 배치 없이도 항상 정합하고, 데모 규모에서는
--   야간 배치를 돌릴 이유가 없다.
--
--   sales_amount는 order_item.subtotal(정가) 합계다. 주문 단위 할인(등급/수동)을
--   품목에 배분하는 것은 별개 문제라 여기서 하지 않는다. 기존 시드도 같은 기준이라
--   GET /stats/sales가 GET /orders보다 할인분만큼 크게 나오는 것은 의도된 차이다.
--
-- 트랜잭션: PostgREST에는 다중 문장 트랜잭션이 없어(API명세서 1.6) 상태 전이·재고
-- 차감·알림·포인트·통계를 이 함수 하나로 묶는다. 나눠 호출하면 재고만 깎이고 결제가
-- 실패하는 상태가 생긴다.

create or replace function public.pay_order(
    p_order_id bigint,
    p_store_id bigint,
    p_payment_method text
)
returns jsonb
language plpgsql
as $function$
declare
    v_order       orders%rowtype;
    v_item        record;
    v_produced    int;
    v_remaining   int;
    v_paid_at     timestamptz;
    v_notif_id    bigint;
    v_rate        numeric;
    v_balance     int;
    v_shortages   jsonb := '[]'::jsonb;
    v_inv_updates jsonb := '[]'::jsonb;
    v_notifs      jsonb := '[]'::jsonb;
    v_low         boolean;
    v_today_kst   date := (now() at time zone 'Asia/Seoul')::date;
begin
    ----------------------------------------------------------------
    -- 1단계: 검증만 한다. 여기서는 아무것도 쓰지 않는다.
    ----------------------------------------------------------------
    select * into v_order
      from orders
     where order_id = p_order_id and store_id = p_store_id
     for update;                                   -- 동시 결제 차단

    if not found then
        return jsonb_build_object('ok', false, 'error', 'ORDER_NOT_FOUND');
    end if;

    if v_order.status <> 'PENDING' then
        return jsonb_build_object('ok', false, 'error', 'INVALID_STATE',
                                  'status', v_order.status);
    end if;

    if not exists (select 1 from order_item where order_id = p_order_id) then
        return jsonb_build_object('ok', false, 'error', 'EMPTY_ORDER');
    end if;

    -- 재고를 잠그고 부족분을 모은다
    for v_item in
        select oi.product_id,
               sum(oi.quantity)::int              as qty,
               p.product_name,
               coalesce(sp.stock_baseline_pct, 20) as baseline
          from order_item oi
          join product p  on p.product_id = oi.product_id
          left join store_product sp
                 on sp.store_id = p_store_id and sp.product_id = oi.product_id
         where oi.order_id = p_order_id
         group by oi.product_id, p.product_name, sp.stock_baseline_pct
    loop
        select produced_qty, remaining_qty into v_produced, v_remaining
          from inventory
         where store_id = p_store_id and product_id = v_item.product_id
         for update;                               -- 이 상품 재고를 잠근다

        if not found or v_remaining < v_item.qty then
            v_shortages := v_shortages || jsonb_build_object(
                'product_id',   v_item.product_id,
                'product_name', v_item.product_name,
                'requested',    v_item.qty,
                'remaining',    coalesce(v_remaining, 0)
            );
        end if;
    end loop;

    if jsonb_array_length(v_shortages) > 0 then
        -- 쓰기 전에 빠져나가므로 롤백할 것이 없다
        return jsonb_build_object('ok', false, 'error', 'INVENTORY_SHORTAGE',
                                  'shortages', v_shortages);
    end if;

    ----------------------------------------------------------------
    -- 2단계: 여기부터 쓰기. 하나라도 실패하면 함수 전체가 롤백된다.
    ----------------------------------------------------------------
    for v_item in
        select oi.product_id,
               sum(oi.quantity)::int              as qty,
               sum(oi.subtotal)::numeric          as amount,   -- [v2] 통계용
               p.product_name,
               coalesce(sp.stock_baseline_pct, 20) as baseline
          from order_item oi
          join product p  on p.product_id = oi.product_id
          left join store_product sp
                 on sp.store_id = p_store_id and sp.product_id = oi.product_id
         where oi.order_id = p_order_id
         group by oi.product_id, p.product_name, sp.stock_baseline_pct
    loop
        update inventory
           set sold_qty      = sold_qty + v_item.qty,
               remaining_qty = remaining_qty - v_item.qty,
               updated_at    = now()
         where store_id = p_store_id
           and product_id = v_item.product_id
           and remaining_qty >= v_item.qty          -- 원자적 조건부 차감
        returning produced_qty, remaining_qty into v_produced, v_remaining;

        if not found then
            raise exception 'inventory race on product %', v_item.product_id;
        end if;

        -- [v2] 일별 판매 통계 누적. 같은 상품을 하루에 여러 번 팔면 한 행에 더해진다
        -- (uk_salesstat_store_product_date 기준). stat_date는 KST 날짜다.
        insert into sales_stat_daily (store_id, product_id, stat_date, sold_qty, sales_amount)
        values (p_store_id, v_item.product_id, v_today_kst, v_item.qty, v_item.amount)
        on conflict (store_id, product_id, stat_date) do update
           set sold_qty     = sales_stat_daily.sold_qty     + excluded.sold_qty,
               sales_amount = sales_stat_daily.sales_amount + excluded.sales_amount;

        v_low := v_produced > 0
             and (v_remaining::numeric / v_produced) <= (v_item.baseline::numeric / 100);

        v_inv_updates := v_inv_updates || jsonb_build_object(
            'product_id',    v_item.product_id,
            'remaining_qty', v_remaining,
            'is_low_stock',  v_low
        );

        -- 매진 임박 알림: 같은 상품 KST 하루 1건
        if v_low and not exists (
            select 1 from notification
             where store_id = p_store_id
               and related_product_id = v_item.product_id
               and notif_type = 'STOCK_LOW'
               and (created_at at time zone 'Asia/Seoul')::date = v_today_kst
        ) then
            insert into notification (store_id, notif_type, related_product_id,
                                      remaining_qty_snapshot, title, message)
            values (p_store_id, 'STOCK_LOW', v_item.product_id, v_remaining,
                    v_item.product_name || ' 매진 임박',
                    v_item.product_name || ' 잔여 ' || v_remaining || '개 ('
                      || round(v_remaining::numeric * 100 / v_produced) || '%)')
            returning notification_id into v_notif_id;

            v_notifs := v_notifs || jsonb_build_object(
                'notification_id', v_notif_id,
                'product_id',      v_item.product_id,
                'title',           v_item.product_name || ' 매진 임박'
            );
        end if;
    end loop;

    -- 상태 전이
    update orders
       set status         = 'PAID',
           payment_method = p_payment_method,
           paid_at        = now()
     where order_id = p_order_id
    returning paid_at into v_paid_at;

    -- 포인트 적립: 주문에 이미 계산돼 있는 값을 그대로 지급한다
    if v_order.member_id is not null and v_order.point_earned > 0 then
        update member
           set point_balance = point_balance + v_order.point_earned,
               updated_at    = now()
         where member_id = v_order.member_id
        returning point_balance into v_balance;

        select point_earn_rate into v_rate
          from membership_grade where grade_id = v_order.applied_grade_id;

        insert into point_transaction (member_id, order_id, applied_grade_id,
                                       txn_type, point_amount, point_rate, balance_after)
        values (v_order.member_id, p_order_id, v_order.applied_grade_id,
                'EARN', v_order.point_earned, v_rate, v_balance);
    end if;

    return jsonb_build_object(
        'ok',                    true,
        'order_id',              p_order_id,
        'status',                'PAID',
        'paid_at',               v_paid_at,
        'total_amount',          round(v_order.total_amount)::int,
        'point_earned',          v_order.point_earned,
        'inventory_updates',     v_inv_updates,
        'notifications_created', v_notifs
    );
end;
$function$;

-- [v2] 일회성 정합 맞추기
-- 이 변경 이전에 결제된 건은 sales_stat_daily에 빠져 있다. 오늘 자 통계를 ORDERS에서
-- 다시 계산해 채운다(seed_past_orders가 과거 날짜에 하는 것과 같은 방식).
--
-- delete from sales_stat_daily
--  where store_id = 1 and stat_date = (now() at time zone 'Asia/Seoul')::date;
--
-- insert into sales_stat_daily (store_id, product_id, stat_date, sold_qty, sales_amount)
-- select 1, oi.product_id, (now() at time zone 'Asia/Seoul')::date,
--        sum(oi.quantity), sum(oi.subtotal)
--   from order_item oi
--   join orders o on o.order_id = oi.order_id
--  where o.store_id = 1 and o.status = 'PAID'
--    and (o.paid_at at time zone 'Asia/Seoul')::date = (now() at time zone 'Asia/Seoul')::date
--  group by oi.product_id;

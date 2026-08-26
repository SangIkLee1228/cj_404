-- 16_seed_past_orders.sql
-- 과거 29일치 주문(ORDERS/ORDER_ITEM)을 생성하고 SALES_STAT_DAILY를 거기서 다시 집계한다.
--
-- 배경: 시드는 ORDERS를 "오늘 하루치"만 만들고 SALES_STAT_DAILY에는 30일치 합성값을 넣었다.
-- 두 테이블이 비대칭이라 GET /stats/sales가 기간을 넓혀도 order_count는 93건에 고정되고
-- (객단가 181만원), 대시보드의 7D/30D는 오늘과 똑같은 값만 보여줬다.
--
-- 방향: ORDERS를 진실의 원천으로 삼고 SALES_STAT_DAILY를 거기서 재집계한다.
-- 실제 야간 배치가 하는 일과 같아서, 데이터가 구조적으로 옳아진다.
--
-- 규모는 기존 시드의 오늘 하루치를 따른다 (DB설계서 v2.2 · 9-2의 "결정적·멱등" 원칙 유지):
--   일 93건 · 건당 2.52줄 · 건당 4.02개 · 09:00~18:12 KST
--
-- 판매 분포: 상위 10종이 전체의 약 30%
--   v1은 상품을 `% 상품수`로 균등하게 뽑아 121종이 거의 똑같이 팔렸다(1위 1.29%,
--   기타 93.8%). 실제 빵집은 간판 상품에 판매가 몰리는데, 그 분포가 없으니 운영
--   현황의 "판매 상위 품목" 도넛이 회색 기타 한 덩어리로만 보였다.
--   -> 순위별 가중치를 준 확장 풀에서 뽑는다(아래 _pick).
--
-- 생성 범위: 회원 미연결 · 할인 없음 · PAID 고정.
--   회원/포인트 경로는 오늘치 93건(회원 18건)이 이미 커버하고 있고, POINT_TRANSACTION의
--   balance_after 러닝밸런스까지 맞추려면 member 캐시 정합성 과제(DB설계서 12장 #3)를
--   함께 건드려야 해서 이번 범위에서 뺐다.

create or replace function public.seed_past_orders(
  p_store_id      int default 1,
  p_days          int default 29,
  p_orders_per_day int default 93,
  -- true면 대상 날짜의 기존 생성분을 지우고 다시 만든다. 분포를 바꿔 재생성할 때 쓴다.
  -- 안전장치: 회원이 붙었거나 촬영 세션이 연결된 주문은 절대 지우지 않는다
  -- (생성분은 전부 비회원이고 세션이 없다). 오늘 자는 루프 범위 밖이라 손대지 않는다.
  p_regenerate    boolean default false
)
returns table (generated_days int, generated_orders bigint, generated_items bigint)
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_today  date := (now() at time zone 'Asia/Seoul')::date;
  v_staff  bigint;
  v_n      int;
  v_day    date;
  v_k      int;
  v_days   int := 0;
  v_orders bigint := 0;
  v_items  bigint := 0;
  v_o      bigint;
  v_i      bigint;
begin
  select staff_id into v_staff
    from staff_account where store_id = p_store_id and is_active order by staff_id limit 1;
  if v_staff is null then
    raise exception '매장 %의 활성 직원이 없습니다', p_store_id;
  end if;

  -- 상품 풀: 이 매장이 실제로 파는 것만. idx는 0-기반 연속 번호라 나머지연산으로 고를 수 있다.
  -- 커넥션 풀러가 세션을 재사용할 수 있어 on commit drop만 믿지 않고 먼저 지운다.
  drop table if exists _pool;
  drop table if exists _pick;

  -- 순위를 product_id 순이 아니라 해시 순으로 매긴다. 그냥 ID 순으로 하면 "번호가
  -- 빠른 10종"이 베스트셀러가 돼 카테고리가 한쪽으로 쏠린다.
  create temp table _pool on commit drop as
  select sp.product_id, sp.price::numeric as price,
         (row_number() over (order by (sp.product_id * 7919) % 1000, sp.product_id) - 1)::int as rnk
    from store_product sp
    join product p on p.product_id = sp.product_id
   where sp.store_id = p_store_id and sp.is_active and p.is_active;

  if not exists (select 1 from _pool) then
    raise exception '매장 %에 판매 중인 상품이 없습니다', p_store_id;
  end if;

  -- 가중치만큼 슬롯을 복제한 확장 풀. 균등하게 뽑아도 인기 상품이 자주 걸린다.
  --   1~10위 : 12 - 순위 (12,11,…,3) = 75슬롯
  --   11~40위: 3                      = 90슬롯
  --   41위~  : 1                      = 81슬롯 (121종 기준)
  -- => 상위 10종이 75/246 = 30.5%, 1위가 12/246 = 4.9%
  create temp table _pick on commit drop as
  select (row_number() over (order by p.rnk, g) - 1)::int as idx, p.product_id, p.price
    from _pool p,
         lateral generate_series(
           1, case when p.rnk < 10 then 12 - p.rnk when p.rnk < 40 then 3 else 1 end
         ) g;

  select count(*) into v_n from _pick;

  for v_k in 1 .. p_days loop
    v_day := v_today - v_k;

    if p_regenerate then
      -- 이 함수가 만든 것으로 보이는 주문만 지운다: 비회원 + 촬영 세션 없음.
      -- 실제 시연으로 생긴 주문(회원 연결·촬영 이력)은 조건에 걸리지 않아 살아남는다.
      delete from order_item oi
       using orders o
       where oi.order_id = o.order_id
         and o.store_id = p_store_id and o.status = 'PAID'
         and o.member_id is null
         and (o.paid_at at time zone 'Asia/Seoul')::date = v_day
         and not exists (select 1 from scan_session s where s.order_id = o.order_id);

      delete from orders o
       where o.store_id = p_store_id and o.status = 'PAID'
         and o.member_id is null
         and (o.paid_at at time zone 'Asia/Seoul')::date = v_day
         and not exists (select 1 from scan_session s where s.order_id = o.order_id);
    end if;

    -- 이미 그 날짜에 PAID 주문이 있으면 건너뛴다. 멱등이면서, 남이 만든 주문을
    -- 지우지 않는다.
    continue when exists (
      select 1 from orders o
       where o.store_id = p_store_id and o.status = 'PAID'
         and (o.paid_at at time zone 'Asia/Seoul')::date = v_day
    );

    -- 결정적 생성: random() 대신 (일자, 주문순번, 줄번호)와 서로소인 소수의 조합을 쓴다.
    -- 같은 날짜로 다시 돌리면 항상 같은 결과가 나온다.
    with ord as (
      select s as seq,
             ((v_day::timestamp + time '09:00' + ((s - 1) * interval '6 minutes'))
                at time zone 'Asia/Seoul') as ordered_at,
             case when (v_k * 1543 + s * 3079) % 100 < 48 then 2 else 3 end as line_count
        from generate_series(1, p_orders_per_day) s
    ),
    raw as (
      select o.seq, o.ordered_at, l,
             (v_k * 7919 + o.seq * 104729 + l * 1299709) % v_n as pick,
             case (v_k * 3571 + o.seq * 6151 + l * 97) % 5
                  when 3 then 2 when 4 then 3 else 1 end as qty,
             case (v_k * 13 + o.seq * 7 + l * 3) % 10
                  when 8 then 'MANUAL_ADD' when 9 then 'STAFF_CORRECTED'
                  else 'AI_DETECTED' end as source_type
        from ord o, lateral generate_series(1, o.line_count) l
    ),
    -- 같은 주문에서 같은 상품이 두 번 뽑히면 한 줄로 합친다(앱의 동일 상품 합산 규칙과 동일).
    lines as (
      select r.seq, r.ordered_at, p.product_id, p.price as unit_price,
             sum(r.qty)::smallint as quantity,
             (p.price * sum(r.qty)) as subtotal,
             min(r.source_type) as source_type
        from raw r join _pick p on p.idx = r.pick
       group by r.seq, r.ordered_at, p.product_id, p.price
    ),
    agg as (
      select seq, ordered_at, sum(subtotal) as gross from lines group by seq, ordered_at
    ),
    ins as (
      insert into orders (
        store_id, staff_id, status, payment_method,
        gross_amount, discount_amount, membership_discount_amount, manual_discount_amount,
        total_amount, point_used, point_earned, ordered_at, paid_at
      )
      select p_store_id, v_staff, 'PAID',
             case when (v_k + a.seq) % 10 = 0 then 'EASY_PAY' else 'CARD' end,
             a.gross, 0, 0, 0,
             a.gross, 0, 0,
             a.ordered_at, a.ordered_at + interval '45 seconds'
        from agg a
      returning order_id, ordered_at
    )
    insert into order_item (order_id, product_id, quantity, unit_price, subtotal, source_type)
    select i.order_id, l.product_id, l.quantity, l.unit_price, l.subtotal, l.source_type
      from lines l join ins i on i.ordered_at = l.ordered_at;

    get diagnostics v_i = ROW_COUNT;
    v_items := v_items + v_i;

    select count(*) into v_o from orders
     where store_id = p_store_id and status = 'PAID'
       and (paid_at at time zone 'Asia/Seoul')::date = v_day;
    v_orders := v_orders + v_o;
    v_days := v_days + 1;

    -- SALES_STAT_DAILY 재집계. 금액은 subtotal(정가) 합계 - 오늘치 기존 시드와 같은 기준이다
    -- (오늘: stat 1,536,200 vs orders.total 1,524,997, 차이는 할인분).
    delete from sales_stat_daily where store_id = p_store_id and stat_date = v_day;

    insert into sales_stat_daily (store_id, product_id, stat_date, sold_qty, sales_amount)
    select p_store_id, oi.product_id, v_day, sum(oi.quantity), sum(oi.subtotal)
      from order_item oi
      join orders o on o.order_id = oi.order_id
     where o.store_id = p_store_id and o.status = 'PAID'
       and (o.paid_at at time zone 'Asia/Seoul')::date = v_day
     group by oi.product_id;
  end loop;

  return query select v_days, v_orders, v_items;
end;
$fn$;

comment on function public.seed_past_orders(int, int, int) is
  '과거 N일치 PAID 주문을 결정적으로 생성하고 SALES_STAT_DAILY를 재집계한다. 이미 주문이 있는 날짜는 건너뛴다(멱등, 비파괴).';

-- 실행
-- select * from public.seed_past_orders();

-- 15_rebase_demo_dates.sql
-- 데모 시드 데이터의 날짜를 "항상 오늘(KST)" 기준으로 다시 앵커링한다.
--
-- 배경: 10_seed_transactional.sql이 만든 거래 데이터는 생성 시점(2026-08-24)에 고정돼 있다.
-- 시간이 지나면 GET /dashboard/overview?period=TODAY 가 0원/0건으로 비어 목업 화면을 검증할 수 없다.
-- 이 스크립트는 시드 전체를 통째로 N일 뒤로 밀어 마지막 영업일이 오늘이 되게 만든다.
--
-- 설계 결정 3가지:
--   1) 앵커는 sales_stat_daily.stat_date 최대값. 이 테이블은 시드 배치만 쓰고 API는 쓰지 않아
--      "시드가 어느 날짜에 놓여 있는가"를 오염 없이 알려주는 유일한 기준점이다.
--   2) 멱등: delta=0이면 아무것도 하지 않는다. 하루에 몇 번을 돌려도 결과가 같다.
--   3) 앵커 이후(=API로 새로 만들어진) 행은 건드리지 않는다. 이미 POS 테스트로 생긴
--      08-25 주문/재고 행이 섞여 있어, 통째로 밀면 그 행들이 미래로 날아간다.

create or replace function public.rebase_demo_dates()
returns table (shifted_days int, anchor_before date, anchor_after date)
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_anchor date;
  v_today  date := (now() at time zone 'Asia/Seoul')::date;
  v_delta  int;
  v_cut    timestamptz;
  -- 유니크 인덱스 회피용 임시 주차 오프셋 (아래 주석 참고)
  v_park   int  := 100000;
begin
  select max(stat_date) into v_anchor from sales_stat_daily;
  if v_anchor is null then
    raise exception '시드 데이터가 없습니다 (sales_stat_daily 비어 있음)';
  end if;

  v_delta := v_today - v_anchor;
  if v_delta = 0 then
    return query select 0, v_anchor, v_anchor;
    return;
  end if;

  -- 시드 구간의 배타적 상한: 앵커 날짜 다음날 00:00 KST.
  -- 이 시각 이후 행은 API가 만든 것이므로 그대로 둔다.
  v_cut := ((v_anchor + 1)::timestamp at time zone 'Asia/Seoul');

  ---------------------------------------------------------------------------
  -- 1) timestamptz 컬럼: 통짜 N일 이동
  --    KST는 서머타임이 없어 N일 이동이 시:분:초를 그대로 보존한다(09:12 → 09:12).
  ---------------------------------------------------------------------------
  update orders
     set ordered_at = ordered_at + make_interval(days => v_delta),
         paid_at    = paid_at    + make_interval(days => v_delta)  -- NULL이면 NULL 유지
   where ordered_at < v_cut;

  update scan_session
     set started_at   = started_at   + make_interval(days => v_delta),
         completed_at = completed_at + make_interval(days => v_delta)
   where started_at < v_cut;

  update detected_item
     set created_at = created_at + make_interval(days => v_delta)
   where created_at < v_cut;

  update correction_log
     set corrected_at = corrected_at + make_interval(days => v_delta)
   where corrected_at < v_cut;

  update point_transaction
     set created_at = created_at + make_interval(days => v_delta)
   where created_at < v_cut;

  update notification
     set created_at = created_at + make_interval(days => v_delta),
         read_at    = read_at    + make_interval(days => v_delta),
         deleted_at = deleted_at + make_interval(days => v_delta)
   where created_at < v_cut;

  -- GET /inventory 최상단 updated_at(폴링 리프레시 판단용)도 함께 민다.
  update inventory
     set updated_at = updated_at + make_interval(days => v_delta)
   where updated_at < v_cut;

  ---------------------------------------------------------------------------
  -- 2) date 컬럼: 2패스 이동
  --    uk_salesstat_store_product_date / uk_demostat_key 는 DEFERRABLE이 아니라
  --    검사가 행 단위 즉시 수행된다. stat_date를 한 번에 +N 하면 아직 안 옮겨진
  --    행의 자리로 먼저 옮겨진 행이 들어가 duplicate key로 실패한다.
  --    → 전부 먼 미래로 주차시킨 뒤(1패스) 목표 위치로 되돌린다(2패스).
  ---------------------------------------------------------------------------
  update sales_stat_daily set stat_date = stat_date + v_park
   where stat_date <= v_anchor;
  update sales_stat_daily set stat_date = stat_date - v_park + v_delta
   where stat_date > v_anchor + (v_park / 2);

  update demographic_stat set stat_date = stat_date + v_park
   where stat_date <= v_anchor;
  update demographic_stat set stat_date = stat_date - v_park + v_delta
   where stat_date > v_anchor + (v_park / 2);

  return query select v_delta, v_anchor, v_today;
end;
$fn$;

comment on function public.rebase_demo_dates() is
  '데모 시드 거래 데이터를 오늘(KST) 기준으로 재앵커링한다. 멱등이며 API 생성 행은 건드리지 않는다.';

-- 실행
-- select * from public.rebase_demo_dates();

-- 검증
-- select (now() at time zone 'Asia/Seoul')::date                          as kst_today,
--        max((paid_at at time zone 'Asia/Seoul')::date)                   as last_paid_kst,
--        count(*) filter (where (paid_at at time zone 'Asia/Seoul')::date
--                               = (now() at time zone 'Asia/Seoul')::date) as paid_today
--   from orders where store_id = 1 and status = 'PAID';

-- (선택) 매일 자동 실행 - KST 00:05 = UTC 15:05
-- create extension if not exists pg_cron;
-- select cron.schedule('rebase-demo-dates', '5 15 * * *', $cron$select public.rebase_demo_dates();$cron$);

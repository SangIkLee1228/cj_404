-- 18_add_kimchi_croquette.sql
-- 상품 '김치 고로케' 추가 (2026-08-26).
--
-- 왜 스크립트로 남기는가: 이 상품은 원본 시드(91종 카탈로그)에 없다. DB를 초기화하거나
-- 새 Supabase에 올리면 그대로 사라지고, AI 라벨 kimchi_croquette가 다시 미매칭이 된다.
--
-- 배경: AI 모델이 내려주는 라벨 중 kimchi_croquette에 대응하는 상품이 카탈로그에
-- 없었다(고로케는 '추억의 사라다 고로케' 하나뿐이었다). 조청 왕꽈배기를 대체하는
-- 방안도 검토했지만, order_item 26행·sales_stat_daily 23행이 그 상품을 참조하고 있어
-- 과거 이력을 깨뜨리게 되므로 신규 추가로 결정했다.
--
-- 이미지: Supabase Storage `images` 버킷의 products/donut-croquette/3879.png.
--   - Storage 키는 비-ASCII를 거부하므로(400 InvalidKey) 한글 경로를 쓸 수 없다.
--     기존 규칙대로 <영문 카테고리 슬러그>/<catalog id> 형태를 따른다.
--   - 3879는 dataset/products/catalog.json에 추가한 catalog id다(product_id 아님).
--   - 파일 실체가 PNG라 확장자·content-type을 png로 맞췄다. 기존 91종은 .jpg다.
--
-- 멱등: 같은 이름이 이미 있으면 아무것도 하지 않는다(uk_product_name).

do $$
declare
  v_product_id bigint;
  v_image_url  text := 'https://aywnlwqnjgvtcnxwuoxc.supabase.co/storage/v1/object/public/'
                       || 'images/products/donut-croquette/3879.png';
  -- 가격·기준선의 매장별 패턴을 빌려올 같은 카테고리 상품
  v_template   text := '추억의 사라다 고로케';
begin
  select product_id into v_product_id from product where product_name = '김치 고로케';
  if v_product_id is not null then
    raise notice '이미 존재합니다 (product_id=%). 아무것도 하지 않습니다.', v_product_id;
    return;
  end if;

  insert into product (product_name, product_type, category, source_type, is_active, image_url)
  values ('김치 고로케', 'BREAD', '도넛/고로케', 'IN_STORE', true, v_image_url)
  returning product_id into v_product_id;

  -- 1호점은 지정가 2,700원. 나머지 매장은 템플릿 상품의 매장별 비율을 유지해
  -- 100원 단위로 맞춘다(DB설계서 v2.2 · 4.4의 매장별 가격 차등 유지).
  insert into store_product (store_id, product_id, price, stock_baseline_pct, is_active)
  select sp.store_id, v_product_id,
         case when sp.store_id = 1 then 2700
              else round(2700 * sp.price / 3700.0 / 100) * 100 end,
         sp.stock_baseline_pct, true
    from store_product sp
    join product p on p.product_id = sp.product_id
   where p.product_name = v_template;

  -- 재고는 1·2·3호점만 운영한다(기존 INVENTORY 구성과 동일).
  -- 재고 행이 없으면 GET /inventory 목록에 아예 뜨지 않으므로 반드시 함께 만든다.
  insert into inventory (store_id, product_id, produced_qty, sold_qty, remaining_qty)
  select s, v_product_id, 25, 0, 25 from unnest(array[1, 2, 3]) s;

  raise notice '추가 완료: product_id=%', v_product_id;
end $$;

-- 검증
-- select p.product_id, p.product_name, p.category, p.image_url,
--        (select count(*) from store_product sp where sp.product_id = p.product_id) as store_rows,
--        (select count(*) from inventory i where i.product_id = p.product_id) as inv_rows
--   from product p where p.product_name = '김치 고로케';

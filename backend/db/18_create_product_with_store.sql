-- 18_create_product_with_store.sql
-- 상품 등록 RPC (FR-16). POST /api/products 가 이 함수 하나를 호출한다.
--
-- 이 파일의 두 가지 목적:
--   1) RPC를 버전 관리에 올린다. 지금까지 DB에만 존재해서, 프로젝트를 새 Supabase에
--      올리거나 DB를 초기화하면 상품 등록이 통째로 사라지는 상태였다.
--   2) initial_qty가 0일 때 INVENTORY 행을 만들지 않던 문제를 고친다(아래 [v2] 표시).
--
-- 트랜잭션: PostgREST에는 다중 문장 트랜잭션이 없어(API명세서 1.6) 세 테이블 쓰기를
-- 이 함수 하나로 묶는다. 나눠 호출하면 PRODUCT만 남고 STORE_PRODUCT가 없는 고아 행이
-- 생기는데, uk_product_name 때문에 같은 이름으로 재등록도 막혀 복구가 불가능해진다.
--
-- [v2] 왜 INVENTORY를 항상 만드는가
--   구버전은 `if p_initial_qty > 0`일 때만 재고 행을 만들었다. 그런데
--   ProductCreate.initial_qty의 기본값이 0이라(schemas/common.py), 수량을 명시하지
--   않고 등록한 상품은 재고 행 없이 태어난다. 그 상태에서:
--     - PATCH /inventory/{id}/restock -> 404 "재고 항목을 찾을 수 없습니다"
--       (routes/inventory.py가 기존 행을 읽어 더하는 방식이라 없으면 실패한다)
--     - 즉 매니저가 API로는 그 상품 재고를 채울 방법이 없다
--   API명세서 4.7의 "매일 KST 06:00 전 상품 0으로 초기화 -> 매니저가 당일 생산량을
--   보충으로 입력" 운영 모델도 모든 상품에 재고 행이 있음을 전제한다.
--   수량 0과 행 없음은 다른 상태다. 그래서 0이어도 행은 만든다.
--   결제는 영향 없다 - 17_pay_order.sql은 행이 없든 수량이 모자라든 똑같이
--   INVENTORY_SHORTAGE로 처리한다(`if not found or v_remaining < qty`).

create or replace function public.create_product_with_store(
    p_store_id     integer,
    p_created_by   integer,
    p_product_name text,
    p_product_type text,
    p_category     text,
    p_image_url    text,
    p_source_type  text,
    p_price        numeric,
    p_baseline_pct integer,
    p_initial_qty  integer
)
returns integer
language plpgsql
as $function$
declare
    v_product_id int;
begin
    -- 1) 카탈로그 (매장 무관). uk_product_name 위반 시 SQLSTATE 23505가 그대로
    --    올라가고 routes/products.py가 409 DUPLICATE_PRODUCT_NAME으로 바꾼다.
    insert into product (product_name, product_type, category, image_url, source_type, created_by)
    values (p_product_name, p_product_type, p_category, p_image_url, p_source_type, p_created_by)
    returning product_id into v_product_id;

    -- 2) 이 매장의 판매정보. is_active를 STORE_PRODUCT에만 두는 이유는 PRODUCT에
    --    쓰면 한 매장의 판매중지가 10개 매장 전체에 전파되기 때문이다(API명세서 9장).
    insert into store_product (store_id, product_id, price, stock_baseline_pct)
    values (p_store_id, v_product_id, p_price, p_baseline_pct);

    -- 3) [v2] 재고 행은 수량이 0이어도 항상 만든다. 위 주석 참고.
    insert into inventory (store_id, product_id, produced_qty, sold_qty, remaining_qty)
    values (p_store_id, v_product_id,
            coalesce(p_initial_qty, 0), 0, coalesce(p_initial_qty, 0));

    return v_product_id;
end;
$function$;

comment on function public.create_product_with_store is
    'POST /api/products - PRODUCT/STORE_PRODUCT/INVENTORY 3테이블 원자 등록 (API명세서 4.2)';

/**
 * POS BREAD 카탈로그 허용 목록 — "빵 목록.json"(class_index 0~91, 92종) 기준.
 *
 * 재확인(현재 backend 응답 기준): GET /products?product_type=BREAD(기본
 * status=ACTIVE, POS가 실제로 보내는 쿼리 그대로)는 92건을 내려준다. 이
 * 92건은 아래 allowlist와 1:1로 정확히 일치한다(초과/누락 0). status=ALL로
 * 조회하면 94건이 나오는데, 나머지 2건(product_id 209 "테스트빵001",
 * product_id 206 "소금빵")은 이미 backend에서 is_active=false로 꺼져 있어
 * 기본 쿼리에는 애초에 포함되지 않는다. 이 두 id는 allowlist(115~205, 210)
 * 범위 밖이라 이중으로 걸러진다 — 그래도 이름 비교가 아니라 안정적인
 * product_id로 명시적으로 배제한다는 걸 코드에 남겨 둔다(백엔드가 향후
 * is_active를 다시 켜도 POS 화면에는 나타나지 않도록 하는 방어선).
 *
 * DB/backend는 건드리지 않고, POS 화면에서만 필터링한다.
 *
 * product_id는 이 파일을 만들 때 실제 backend 응답을 1회 조회해 각 상품의
 * image_url 파일명(예: .../snack-bread/3799.jpg → "3799")을 "빵 목록.json"의
 * id와 대조해 확정했다 — 상품명이 아니라 이 안정적인 id로 매칭했다. 순서는
 * class_index 오름차순(=원래 화면 순서) 그대로다.
 */
export const ALLOWED_BREAD_PRODUCT_IDS = [
  115, 116, 117, 118, 119, 120, 121, 122, 123, 124, 125, 126, 127, 128, 129,
  130, 131, 132, 133, 134, 135, 136, 137, 138, 139, 140, 141, 142, 143, 144,
  145, 146, 147, 148, 149, 150, 151, 152, 153, 154, 155, 156, 157, 158, 159,
  160, 161, 162, 163, 164, 165, 166, 167, 168, 169, 170, 171, 172, 173, 174,
  175, 176, 177, 178, 179, 180, 181, 182, 183, 184, 185, 186, 187, 188, 189,
  190, 191, 192, 193, 194, 195, 196, 197, 198, 199, 200, 201, 202, 203, 204,
  205, 210,
];

/**
 * "테스트빵001"(206은 아니고 209), "소금빵"(206) — DB/backend에는 그대로
 * 두고 POS 화면에서만 명시적으로 숨긴다. 위 allowlist 범위 밖이라 이미
 * 걸러지지만, 이름이 아니라 product_id로 의도를 명확히 남긴다.
 */
export const HIDDEN_POS_BREAD_PRODUCT_IDS = new Set([209, 206]);

const ORDER_INDEX = new Map(ALLOWED_BREAD_PRODUCT_IDS.map((id, i) => [id, i]));

/** 92개만 남기고, class_index(=원래) 순서로 정렬한다. */
export function filterAndOrderBreadProducts(products) {
  return products
    .filter(
      (p) =>
        ORDER_INDEX.has(p.product_id) &&
        !HIDDEN_POS_BREAD_PRODUCT_IDS.has(p.product_id)
    )
    .sort(
      (a, b) => ORDER_INDEX.get(a.product_id) - ORDER_INDEX.get(b.product_id)
    );
}

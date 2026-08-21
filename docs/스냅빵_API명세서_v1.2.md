# 스냅빵_API명세서_v1.2

## 개요

| 항목 | 내용 |
|---|---|
| 문서 버전 | v1.2 · 2026-08-21 (v1.1 개정) |
| 기반 | DB 설계서 v1.4, 요구사항 명세서 v1.0, UX 설계서 v3.0, 프론트 목업 |
| 스택 | FastAPI 0.115 + Supabase(PostgREST) |
| Base URL | `https://localhost/api` (Nginx가 `/api/*`만 백엔드로 프록시) |
| Swagger | `https://localhost/api/docs` |
| 우선순위 | DB 설계서와 상충 시 DB 설계서 우선 |

---

## 1. 공통 규약

### 1.1 인증 · 권한

MVP는 로그인 화면을 구현하지 않는다 (DB 설계서 v1.4 · 7장).

| 환경 | 동작 |
|---|---|
| `AUTH_DISABLED=true` (개발·시연) | 토큰 없이 호출. 서버가 고정 직원(`store_id=1`, `staff_id=1`)으로 처리 |
| `AUTH_DISABLED=false` (기본값) | `Authorization: Bearer <supabase_access_token>` 필수. 없거나 만료 시 401 |

- **요청 바디·쿼리에 `store_id`·`staff_id`를 넣지 않는다.** 서버가 결정한다.
- 매니저 전용: `POST`·`PATCH /products`, `PATCH /inventory/{id}/restock`, `GET /dashboard/overview`, `GET /stats/sales`. 위반 시 `403 FORBIDDEN`.
- 그 외는 `STAFF`·`MANAGER` 공통. FE는 `GET /api/me`의 `role`로 메뉴를 분기한다.

### 1.2 형식

- 요청·응답 `application/json; charset=utf-8` (이미지 업로드만 `multipart/form-data`)
- 필드명 **snake_case**. 목업의 camelCase는 FE에서 변환
- **금액은 정수 JSON number.** DB가 `DECIMAL(10,2)`이므로 서버가 직렬화 시 `int(round(x))` 변환. 통화 기호·콤마는 FE가 붙인다
- 비율·좌표는 소수 number — `discount_rate`, `point_earn_rate`, `confidence`(0~100), `remaining_pct`, `bbox_*`(0~1)
- 일시는 **ISO 8601 UTC** (`2026-08-20T09:12:33Z`)

**타임존** — 저장·전송은 **UTC**, 집계 경계는 **Asia/Seoul(KST)**.
`period=TODAY`, `sales_chart` 시간 라벨(08~22), `stat_date`, "동일 상품 알림 하루 1건", 재고 일일 초기화가 모두 KST 기준이다. 집계 응답에 `"timezone": "Asia/Seoul"`을 함께 내린다.

### 1.3 목록 응답

```json
{ "items": [ ... ], "total": 128, "limit": 50, "offset": 0 }
```

- `items`·`total`·`limit`·`offset`은 **모든 목록 응답에 항상 포함**
- `limit`(기본 50, 최대 200), `offset`(기본 0)은 **모든 목록 엔드포인트**에 적용. 각 절의 파라미터 표에서 반복 기재하지 않는다
- `total`은 필터 적용 후·페이지 적용 전 전체 건수
- 부가 집계(`summary`, `unread_count`)는 `items`와 같은 레벨에 추가하며 해당 절에 명시

**정렬** — `?sort=field1,-field2` (`-`는 내림차순)

| 엔드포인트 | 기본 정렬 |
|---|---|
| `GET /inventory` | `stock_status,remaining_qty` (조치 필요 항목이 위) |
| `GET /orders` | `-ordered_at` |
| `GET /stats/sales` | `-sold_qty` |
| `GET /products` | `product_type,category,product_name` |
| `GET /notifications` | `-created_at` |

### 1.4 에러 응답

```json
{
  "error": {
    "code": "INVENTORY_SHORTAGE",
    "message": "소금빵의 잔여 수량이 부족합니다 (요청 5, 잔여 2)",
    "details": [ { "field": "items[0].quantity", "reason": "exceeds_remaining" } ],
    "trace_id": "0f1c9a2e-..."
  }
}
```

- `message`는 직원에게 그대로 보여줄 한국어 한 문장. `details`는 검증 오류일 때만
- 서버는 `RequestValidationError`·`HTTPException`·`Exception` 3개 핸들러를 등록해 **422 포함 모든 오류**를 이 형태로 변환한다

| HTTP | code | 상황 |
|---|---|---|
| 400 | `INVALID_REQUEST` | 값이 규칙에 안 맞음 |
| 401 | `UNAUTHORIZED` | 토큰 없음/만료 |
| 402 | `PAYMENT_FAILED` | 결제 승인 실패(Mock). 주문은 `PENDING` 유지 |
| 403 | `FORBIDDEN` | role 권한 부족 |
| 404 | `NOT_FOUND` | 대상 없음 |
| 409 | `INVALID_STATE` | 이미 결제된 주문 재결제, `RECOGNIZING` 세션 재인식 등 |
| 409 | `INVENTORY_SHORTAGE` | 잔여 재고 초과 판매 |
| 413 | `PAYLOAD_TOO_LARGE` | 이미지 10MB 초과 |
| 415 | `UNSUPPORTED_MEDIA_TYPE` | JPEG/PNG 외 |
| 422 | `VALIDATION_ERROR` | 타입/필수값 검증 실패 |
| 429 | `TOO_MANY_REQUESTS` | `GET /members/lookup` 호출 제한 초과 |
| 500 | `INTERNAL_ERROR` | 서버 오류 |
| 501 | `NOT_IMPLEMENTED` | AI 추론 서버 미연결 |

> nginx `client_max_body_size`가 20MB라 20MB 초과는 nginx가 HTML 오류를 반환한다. FE는 업로드 전 10MB를 먼저 검사한다.

**헤더**

- 모든 응답에 `X-Request-ID`. 클라이언트가 같은 헤더로 보내면 서버가 이어받고, `error.trace_id`와 동일하다
- 상태 변경 POST(`/orders/{id}/pay`, `/cancel`)는 `Idempotency-Key`를 받아 같은 키의 재요청에 최초 응답을 재생한다. 2차로 밀릴 경우 **FE는 `pay`에서 409를 받으면 실패로 표시하지 말고 `GET /orders/{id}`로 실제 상태를 확인**한다
- `GET /dashboard/overview`·`/inventory`·`/notifications`·`/stats/sales`는 `ETag` / `If-None-Match` → 변경 없으면 `304`

### 1.5 금액 계산

서버가 계산한다. FE는 표시만 한다.

```
gross_amount               = Σ(order_item.subtotal)
membership_discount_amount = floor(gross_amount × grade.discount_rate)
manual_discount_amount     = 직원이 입력한 수동 할인액 (FR-08)
discount_amount            = membership_discount_amount + manual_discount_amount
total_amount               = gross_amount − discount_amount
point_earned               = floor(total_amount × grade.point_earn_rate)   // 전 등급 0.5%
```

> **세트/프로모션 할인은 범위 밖이다.** 목업에서 세트 메뉴가 빠지면서 v1.2에서 제거했다. `POST /orders/{id}/discount`는 FR-08 직원 수동 할인 전용이다.

### 1.6 동시성

- 재고 차감은 **원자적 조건부 UPDATE**로 수행한다. Read-modify-write 금지
  `UPDATE inventory SET sold_qty = sold_qty + :q, remaining_qty = remaining_qty - :q WHERE store_id=:s AND product_id=:p AND remaining_qty >= :q`
  영향 행이 0이면 `409 INVENTORY_SHORTAGE`
- 한 주문의 결제는 항목 전체를 **단일 트랜잭션**으로 처리한다. 하나라도 부족하면 전체 실패, 아무것도 차감되지 않는다

---

## 2. 엔드포인트 목록

`구현`: ✅ 완료 / 🟡 스펙 불일치 / ❌ 미구현 (2026-08-21 `cj_404/backend` 기준)

| 그룹 | 메서드 | 경로 | 설명 | FR | 구현 |
|---|---|---|---|---|---|
| 시스템 | GET | `/health` | 서버 생존 (nginx 밖) | | ✅ |
| | GET | `/health/ready` | DB 연결 포함 준비 상태 | | ❌ |
| | GET | `/api/me` | 현재 직원 정보 | | 🟡 |
| 상품 | GET | `/api/products` | 상품 목록 | FR-16 | 🟡 |
| | GET | `/api/products/{product_id}` | 상품 단건 | FR-16 | ❌ |
| | GET | `/api/products/recommendations` | **메뉴 추천 TOP 3** | FR-11 | ❌ |
| | POST | `/api/products` | 상품 등록 | FR-16 | 🟡 |
| | PATCH | `/api/products/{product_id}` | 상품 수정 | FR-16 | ❌ |
| 이미지 | POST | `/api/storage/images` | 이미지 업로드 (스캔·상품) | FR-01, FR-16 | 🟡 `/upload` |
| | GET | `/api/storage/signed-url` | 서명 URL 재발급 | | ✅ |
| 스캔 | POST | `/api/scan-sessions` | 스캔 세션 생성 (기본·추가 촬영) | FR-01 | 🟡 |
| | POST | `/api/scan-sessions/{id}/recognize` | AI 인식 실행 | FR-02 | ✅ (501) |
| | POST | `/api/scan-sessions/{id}/cancel` | 인식 처리 중 취소 | FR-08 | ❌ |
| | POST | `/api/scan-sessions/{id}/discard` | 세션 폐기 (다시 촬영) | FR-01 | ❌ |
| | GET | `/api/scan-sessions/{id}` | 세션 상세 | FR-02 | ❌ |
| 주문 | POST | `/api/orders` | 주문 시작(PENDING) | FR-09 | ❌ |
| | GET | `/api/orders/current` | 진행 중 주문 복구 | FR-09 | ❌ |
| | GET | `/api/orders` | 판매 내역 목록 | FR-17 | ❌ |
| | GET | `/api/orders/{id}` | 주문 상세 | FR-17 | ❌ |
| | POST | `/api/orders/{id}/items` | 항목 직접 추가 | FR-06 | ❌ |
| | PATCH | `/api/orders/{id}/items/{item_id}` | 수량 변경·상품 재선택 | FR-04, FR-05 | ❌ |
| | DELETE | `/api/orders/{id}/items/{item_id}` | 항목 삭제 | FR-04 | ❌ |
| | POST | `/api/orders/{id}/member` | CJ ONE 회원 연결 | FR-18 | ❌ |
| | DELETE | `/api/orders/{id}/member` | 회원 연결 해제 | FR-18 | ❌ |
| | POST | `/api/orders/{id}/discount` | 직원 수동 할인 | FR-08 | ❌ |
| | POST | `/api/orders/{id}/pay` | 결제 확정 | FR-09, FR-12 | ❌ |
| | POST | `/api/orders/{id}/cancel` | 계산 취소 | FR-09 | ❌ |
| 회원 | GET | `/api/members/lookup` | 휴대폰번호로 회원 조회 | FR-18 | ❌ |
| 재고 | GET | `/api/inventory` | 재고 목록 | FR-13 | 🟡 |
| | PATCH | `/api/inventory/{product_id}/restock` | 수량 보충 | FR-13 | ❌ |
| 알림 | GET | `/api/notifications` | 알림 목록 | FR-15 | 🟡 |
| | GET | `/api/notifications/unread-count` | 미읽음 수 | FR-15 | ❌ |
| | PATCH | `/api/notifications/{id}/read` | 읽음 처리 | FR-15 | ✅ |
| | PATCH | `/api/notifications/read-all` | 모두 읽음 | FR-15 | ❌ |
| | DELETE | `/api/notifications/{id}` | 알림 삭제(소프트) | FR-15 | ❌ |
| 대시보드 | GET | `/api/dashboard/overview` | 운영 현황 | FR-13, FR-17 | ❌ |
| 통계 | GET | `/api/stats/sales` | **기간별 품목 판매 통계 (1차)** | FR-17 | ❌ |

> 모든 라우트에 `response_model`을 지정한다. 현재 코드는 지정된 라우트가 없어 `app/schemas/`의 응답 모델이 한 곳도 연결되지 않았다.

---

## 3. 판매 1건 처리 흐름

```
① POST /orders                        → order_id 발급 (status=PENDING)
                                        빈 PENDING 주문이 있으면 재사용
② POST /storage/images?purpose=SCAN   → image_path
③ POST /scan-sessions                 → order_id·capture_type=BASIC
④ POST /scan-sessions/{id}/recognize  → detected_item 저장
                                        + order_item 반영(AI_DETECTED, 동일 상품 합산)
⑤ PATCH/DELETE/POST /orders/{id}/items → 직원 정정 (CORRECTION_LOG 기록은 2차)
⑥ POST /orders/{id}/member            → (선택) CJ ONE 연결 → 할인·적립 재계산
⑦ POST /orders/{id}/pay               → PAID + 재고 차감 + 매진임박 알림 + 포인트 적립
```

- **추가 촬영**: ②③④를 `capture_type=ADD`로 반복. 결과가 기존 항목에 합산된다
- **다시 촬영**: `POST /scan-sessions/{id}/discard`로 주문 항목을 전부 비운 뒤 `capture_type=RETAKE`로 ②③④ 반복. `RETAKE`는 서버 동작이 `BASIC`과 동일한 통계용 라벨이다
- **처리 중 취소**: `POST /scan-sessions/{id}/cancel` → 세션만 `FAILED`. 주문 항목은 그대로
- **스캐너 장애(FR-10)**: ②③④를 건너뛰고 ⑤부터. 스캔 세션 없이 결제까지 완결
- **계산 취소**: `POST /orders/{id}/cancel` → `CANCELLED`. 재고는 차감된 적이 없다
- **결제 실패**: `402` 반환, 주문은 `PENDING` 유지, 화면도 옮기지 않는다. `PAYING` 상태는 MVP에서 쓰지 않는다

---

## 4. 엔드포인트 상세

### 4.1 시스템

**`GET /health`** — 인증 불필요. `/api` 밖이라 nginx를 거치지 않는다(Docker healthcheck·Prometheus 전용).

```json
{ "status": "ok", "version": "1.2.0" }
```

**`GET /health/ready`** — Supabase 연결까지 확인. 실패 시 `503`.

```json
{ "status": "ok", "checks": { "supabase": "ok" } }
```

**`GET /api/me`** — `AUTH_DISABLED=true`면 고정 직원.

```json
{ "staff_id": 1, "store_id": 1, "name": "개발용 직원",
  "role": "MANAGER", "store_name": "뚜레쥬르 스냅빵 데모매장" }
```

---

### 4.2 상품

**`GET /api/products`**

| 파라미터 | 타입 | 설명 |
|---|---|---|
| `product_type` | string | `BREAD` \| `DRINK` |
| `category` | string | 카테고리명 |
| `q` | string | 상품명 부분 검색 |
| `status` | string | `ACTIVE`(기본) \| `INACTIVE` \| `ALL` |

> POS 카탈로그는 기본값, 대시보드 상품 마스터는 `status=ALL`.

```json
{
  "items": [
    { "product_id": 9, "product_name": "소금빵", "product_type": "BREAD",
      "category": "간식빵", "price": 2200, "image_url": "https://…?token=…",
      "ai_class_label": "소금빵", "source_type": "IN_STORE",
      "stock_baseline_pct": 20, "is_active": true }
  ],
  "total": 41, "limit": 50, "offset": 0
}
```

**`GET /api/products/{product_id}`** — 상품 수정 화면 진입용. 응답은 위 `items` 요소와 동일.

**`GET /api/products/recommendations`** *(v1.2 신설 · FR-11)*

결제 화면(S-03)과 고객 화면(S-08) 하단의 메뉴 추천. **서버가 TOP 3를 계산해 내려준다.**

| 파라미터 | 타입 | 설명 |
|---|---|---|
| `order_id` | integer | 진행 중인 주문. 이미 담긴 상품은 제외 |
| `product_type` | string | 기본 `DRINK` (S-03의 음료 추천). `BREAD`\|`ALL` 가능 |
| `limit` | integer | 기본 **3**, 최대 10 |

선정 기준: `is_active=true` **AND** `remaining_qty > 0` **AND** 해당 주문에 없는 상품 중, **최근 7일 판매 수량(KST) 상위**. 동률이면 `price` 내림차순.

```json
{
  "items": [
    { "product_id": 31, "product_name": "아메리카노", "product_type": "DRINK",
      "price": 2500, "image_url": "https://…?token=…",
      "sold_qty_7d": 182, "remaining_qty": 40 }
  ],
  "total": 3, "limit": 3, "offset": 0
}
```

- 담기는 `POST /orders/{id}/items`를 그대로 쓴다. `source_type`은 `MANUAL_ADD`로 기록된다
- 고객 화면은 **표시 전용**이다. 담기 조작은 직원(S-03)만 한다

**`POST /api/products` → 201** *(MANAGER)*

```json
{ "product_name": "소금빵", "product_type": "BREAD", "category": "간식빵",
  "price": 2200, "source_type": "IN_STORE", "stock_baseline_pct": 20,
  "ai_class_label": "소금빵", "image_url": "product/2026/08/21/salt.jpg",
  "initial_qty": 30 }
```

- `store_id`·`created_by`는 서버가 결정한다
- `product_type="DRINK"`면 `ai_class_label`은 `null`로 저장
- `stock_baseline_pct` 기본값 **20** (현재 코드의 `5`는 오류)
- `initial_qty`를 주면 INVENTORY 행을 함께 생성(생략 시 0)

**`PATCH /api/products/{product_id}`** *(MANAGER)* — 보낸 필드만 수정. `is_active=false`로 판매 중지.

---

### 4.3 이미지

**`POST /api/storage/images`** — `multipart/form-data`, 필드명 `file`. JPEG/PNG, 최대 10MB.

| 파라미터 | 설명 |
|---|---|
| `purpose` | `SCAN`(기본) → `scan/YYYY/MM/DD/{uuid}.jpg` / `PRODUCT` → `product/…` |

```json
{ "image_path": "scan/2026/08/20/abc.jpg",
  "signed_url": "https://…/object/sign/images/…?token=…",
  "expires_in": 3600 }
```

> 버킷은 **비공개**다. DB에는 `image_path`만 저장하고, 조회 시 서버가 서명 URL을 붙여 내려준다. 트레이 사진의 개인정보 노출을 막기 위함이다(NFR-06).

**`GET /api/storage/signed-url?path=scan/2026/08/20/abc.jpg`** — 만료된 서명 URL 재발급.

```json
{ "signed_url": "https://…?token=…", "expires_in": 3600 }
```

---

### 4.4 스캔

**`POST /api/scan-sessions` → 201**

| 필드 | 타입 | 필수 | 설명 |
|---|---|---|---|
| `order_id` | integer | ✓ | 진행 중인 주문 |
| `capture_type` | string | | `BASIC`(기본) \| `ADD` \| `RETAKE` |
| `image_path` | string | | 업로드한 이미지 경로 |
| `overlap_warning` | boolean | | 프리뷰 겹침 경고 발생 여부 (FR-03) |

```json
{ "scan_session_id": 51, "order_id": 120, "capture_type": "BASIC",
  "status": "CAPTURED", "started_at": "2026-08-20T09:12:33Z" }
```

**`POST /api/scan-sessions/{id}/recognize`**

인식 결과는 주문에 자동 반영된다(`AI_DETECTED`). 동일 `product_id`는 기존 항목에 합산한다.

```json
{
  "scan_session_id": 51, "status": "COMPLETED", "recognition_ms": 682,
  "detected_items": [
    { "detected_item_id": 301, "product_id": 10, "product_name": "카망베르 치즈빵",
      "ai_class_label": "카망베르_치즈빵", "confidence": 98.0, "quantity": 1,
      "is_below_threshold": false,
      "bbox": { "x": 0.0750, "y": 0.3200, "w": 0.2400, "h": 0.2700 } }
  ],
  "order_summary": { "gross_amount": 11100, "total_amount": 11100, "item_count": 4 }
}
```

- `confidence`는 **0~100** 스케일. `bbox`는 **좌상단 원점·정규화 0~1**, `x`·`y`는 박스 좌상단
- `is_below_threshold` 판정은 서버가 한다. **신뢰도 수치는 화면에 노출하지 않는다**
- `product_id=null`이면 AI 클래스에 매칭되는 상품이 없다는 뜻 (`ai_class_label` 매핑 누락)
- 실패 시 `status="FAILED"` + `failure_reason`을 **HTTP 200**으로 반환. 오류가 아니라 인식 결과다
- **서버 타임아웃 30초** → `failure_reason="TIMEOUT"`. `RECOGNIZING` 세션 재호출은 `409`
- **현재 501 반환** (AI 추론 서버 미연결)

**`POST /api/scan-sessions/{id}/cancel`** — 처리 중 취소(FR-08). 세션만 전이, 주문 항목은 유지.

```json
{ "scan_session_id": 51, "status": "FAILED", "failure_reason": "CANCELLED_BY_STAFF" }
```

**`POST /api/scan-sessions/{id}/discard`** — 다시 촬영. 세션을 `DISCARDED`로 바꾸고 **해당 주문의 항목을 전부 비운다.**

```json
{ "scan_session_id": 51, "order_id": 120, "status": "DISCARDED", "reverted_item_count": 3 }
```

**`GET /api/scan-sessions/{id}`** — 세션 + 인식 항목. 응답은 `recognize`와 동일.

---

### 4.5 주문

**`POST /api/orders` → 201** — 새 계산 시작.

```json
{ "order_id": 120, "status": "PENDING", "gross_amount": 0,
  "discount_amount": 0, "total_amount": 0, "items": [],
  "ordered_at": "2026-08-20T09:12:30Z" }
```

> 항목이 0개인 `PENDING` 주문이 이미 있으면 새로 만들지 않고 그것을 반환한다(멱등). 항목 0개 `PENDING` 주문은 12시간 경과 시 자동 `CANCELLED`.

**`GET /api/orders/current`** — 현재 매장·직원의 가장 최근 `PENDING` 주문. 응답은 `GET /orders/{id}`와 동일, 없으면 **204**.
새로고침·S-05 왕복 후 세션 복구에 쓴다.

**`GET /api/orders`**

| 파라미터 | 설명 |
|---|---|
| `period` | `TODAY`(기본) \| `7D` \| `30D` — KST |
| `date_from` / `date_to` | `YYYY-MM-DD` (KST). 주면 `period` 무시 |
| `status` | 기본 `PAID`. `ALL`이면 취소 건 포함 |

```json
{
  "items": [
    { "order_id": 120, "ordered_at": "2026-08-20T09:12:30Z",
      "paid_at": "2026-08-20T09:13:02Z", "item_count": 4,
      "item_summary": "카망베르 치즈빵, 소금빵 외 1",
      "gross_amount": 11100, "discount_amount": 0, "total_amount": 11100,
      "member_applied": false, "point_earned": 0 }
  ],
  "total": 37, "limit": 50, "offset": 0, "timezone": "Asia/Seoul",
  "summary": { "sales_amount": 412300, "order_count": 37, "item_qty": 128 }
}
```

> `summary`는 페이지가 아니라 **조회 기간 전체** 기준이다.

**`GET /api/orders/{id}`**

```json
{
  "order_id": 120, "status": "PAID",
  "ordered_at": "2026-08-20T09:12:30Z", "paid_at": "2026-08-20T09:13:02Z",
  "payment_method": "CARD",
  "gross_amount": 11100, "membership_discount_amount": 0,
  "manual_discount_amount": 0, "discount_amount": 0, "total_amount": 10989,
  "member": null, "point_earned": 0, "point_used": 0, "correction_count": 1,
  "items": [
    { "order_item_id": 501, "product_id": 10, "product_name": "카망베르 치즈빵",
      "quantity": 1, "unit_price": 3200, "subtotal": 3200,
      "source_type": "AI_DETECTED", "needs_review": false }
  ]
}
```

- `member`가 있으면 `{"member_id":7,"name":"한*원","grade_code":"FAMILY"}`. **이름은 서버가 마스킹한다**
- `needs_review`는 해당 항목이 임계값 이하로 인식됐는지 여부. 촬영 완료 확인 모달의 "확인 필요 N개" 집계에 쓴다
- `correction_count`는 CORRECTION_LOG가 2차이므로 그전까지 `0`

**`POST /api/orders/{id}/items` → 201** — 카탈로그·추천에서 직접 추가(FR-06).

```json
{ "product_id": 27, "quantity": 1 }
```

- **동일 `product_id`가 이미 있으면 새 행 대신 `quantity`에 합산**하고 `source_type`을 `MANUAL_ADD`로 승격한다
- 응답은 갱신된 주문 객체

**`PATCH /api/orders/{id}/items/{item_id}`** — 수량 변경(FR-04) 또는 재선택(FR-05).

```json
{ "quantity": 2 }        // QTY_CHANGE
{ "product_id": 13 }     // RESELECT
```

- `product_id` 변경 시 대상 상품이 이미 있으면 합산 후 원래 행 삭제
- `quantity`는 1~99. `0`은 삭제와 같으나 DELETE를 쓴다

**`DELETE /api/orders/{id}/items/{item_id}`** — 응답은 갱신된 주문 객체.

**`POST /api/orders/{id}/member`**

```json
{ "phone": "01012345678" }
```
```json
{ "member": { "member_id": 7, "name": "한*원", "grade_code": "FAMILY", "grade_name": "패밀리" },
  "membership_discount_amount": 111, "total_amount": 10989, "point_earned_preview": 54 }
```

- 미등록 번호는 `404`. FE는 "비회원"이 아니라 "번호를 다시 확인해 주세요"로 표시하고 재입력·건너뛰기를 함께 제공한다
- 로깅 시 `phone`은 뒤 4자리만 남긴다(NFR-06)

**`DELETE /api/orders/{id}/member`** — 할인·적립이 0으로 복귀.

**`POST /api/orders/{id}/discount`** — 직원 수동 할인(FR-08) 전용.

```json
{ "amount": 500, "reason": "폐기임박" }
```

- 여러 번 호출하면 **덮어쓴다**. `amount: 0`이면 해제
- `manual_discount_amount + membership_discount_amount`가 `gross_amount`를 넘으면 `400`

**`POST /api/orders/{id}/pay`** — `Idempotency-Key` 권장.

```json
{ "payment_method": "CARD", "point_used": 0 }
```
```json
{
  "order_id": 120, "status": "PAID", "paid_at": "2026-08-20T09:13:02Z",
  "total_amount": 10989, "point_earned": 54,
  "inventory_updates": [ { "product_id": 10, "remaining_qty": 22, "is_low_stock": false } ],
  "notifications_created": [ { "notification_id": 88, "product_id": 9, "title": "소금빵 매진 임박" } ]
}
```

서버가 **단일 트랜잭션**으로 수행: ① `PAID` 전이·`paid_at` 기록 ② `INVENTORY` 원자적 차감(FR-12) ③ `remaining_qty / produced_qty ≤ stock_baseline_pct`인 상품에 `STOCK_LOW` 알림(같은 상품 KST 하루 1건) ④ 회원 연결 시 포인트 적립 + POINT_TRANSACTION(2차)

> 이미 `PAID`면 `409`. 재고 부족이면 `409 INVENTORY_SHORTAGE`, `error.details`에 부족 상품 목록. PG는 Mock이며 실패 시연은 `402`로 반환한다.

**`POST /api/orders/{id}/cancel`** — `PENDING`에서만 가능. `PAID`면 `409`(반품·환불은 범위 밖).

```json
{ "order_id": 120, "status": "CANCELLED" }
```

---

### 4.6 회원

**`GET /api/members/lookup?phone=01012345678`**

```json
{ "member_id": 7, "name": "한*원", "grade_code": "FAMILY", "grade_name": "패밀리",
  "discount_rate": 0.0100, "point_earn_rate": 0.0050, "point_balance": 3200 }
```

- 이름은 항상 마스킹. 원본은 API로 내보내지 않는다
- 없으면 `404`. **분당 20회 초과 시 `429`** (휴대폰번호 열거 방지)

---

### 4.7 재고

**`GET /api/inventory`**

| 파라미터 | 설명 |
|---|---|
| `status` | `ALL`(기본) \| `LOW` \| `OUT` |
| `q` | 상품명 검색 |
| `product_type` | `BREAD` \| `DRINK` |

```json
{
  "items": [
    { "product_id": 9, "product_name": "소금빵", "product_type": "BREAD",
      "category": "간식빵", "produced_qty": 30, "sold_qty": 25,
      "remaining_qty": 5, "remaining_pct": 16.7, "stock_baseline_pct": 20,
      "stock_status": "LOW", "updated_at": "2026-08-20T09:13:02Z" }
  ],
  "total": 41, "limit": 50, "offset": 0, "updated_at": "2026-08-20T09:13:02Z"
}
```

- `stock_status`: `remaining_qty = 0` → `OUT`, `remaining_pct ≤ stock_baseline_pct` → `LOW`, 나머지 `OK`
- 최상위 `updated_at`은 폴링 리렌더 판단용. `ETag`도 지원
- **FE 표기**: "재고 12개"가 아니라 **"추정 12개"**. 자동 발주로 이어지지 않음을 화면에 명시(NFR-07)

**일일 초기화** — 매일 **KST 06:00** 서버 배치가 전 상품의 `produced_qty`·`sold_qty`·`remaining_qty`를 `0`으로 되돌린다. 매니저가 S-11에서 당일 생산량을 보충으로 입력한다.

**`PATCH /api/inventory/{product_id}/restock`** *(MANAGER)*

```json
{ "qty": 10 }
```
```json
{ "product_id": 9, "produced_qty": 40, "remaining_qty": 15, "stock_status": "OK" }
```

> 보충 이력은 남기지 않는다(DB 설계서 v1.4 · 2장). `qty`는 1~999.

---

### 4.8 알림

**`GET /api/notifications`** — `is_read` 파라미터로 안읽음만 조회 가능.

```json
{
  "items": [
    { "notification_id": 88, "notif_type": "STOCK_LOW", "related_product_id": 9,
      "product_name": "소금빵", "title": "소금빵 매진 임박",
      "message": "현재 5개 남았습니다. 재진열 또는 추가 생산 여부를 확인해주세요.",
      "remaining_qty_snapshot": 5, "is_read": false,
      "created_at": "2026-08-20T09:13:02Z" }
  ],
  "total": 12, "limit": 50, "offset": 0, "unread_count": 3,
  "updated_at": "2026-08-20T09:13:02Z"
}
```

- **`GET /api/notifications/unread-count`** → `{ "unread_count": 3 }` (사이드바 배지 전용)
- **`PATCH /api/notifications/{id}/read`** → 갱신된 알림 객체
- **`PATCH /api/notifications/read-all`** → `{ "updated_count": 3 }`
- **`DELETE /api/notifications/{id}`** → 소프트 삭제, `204`

---

### 4.9 대시보드 · 통계

**`GET /api/dashboard/overview?period=TODAY`** *(MANAGER)*

운영 현황 화면 전체를 한 번에 채운다. `period`는 `TODAY`(기본)/`7D`/`30D`, KST 기준.

```json
{
  "period": "TODAY", "timezone": "Asia/Seoul",
  "kpi": { "sales_amount": 412300, "order_count": 37, "item_qty": 128,
           "correction_rate": 0.0, "low_stock_count": 4 },
  "sales_chart": { "unit": "HOUR",
                   "points": [ { "label": "8", "amount": 12400 }, { "label": "9", "amount": 38200 } ] },
  "top_products": [ { "product_id": 9, "product_name": "소금빵", "sold_qty": 24 } ],
  "recent_orders": [ { "order_id": 120, "ordered_at": "2026-08-20T09:12:30Z",
                       "item_summary": "카망베르 치즈빵, 소금빵 외 1",
                       "item_count": 4, "total_amount": 11100 } ],
  "low_stock": [ { "product_id": 9, "product_name": "소금빵", "remaining_qty": 5,
                   "produced_qty": 30, "stock_baseline_pct": 20 } ],
  "updated_at": "2026-08-20T09:13:05Z"
}
```

| 필드 | 설명 |
|---|---|
| `correction_rate` | **정정 건수 ÷ 판매 수량 × 100.** CORRECTION_LOG가 2차라 그전까지 `0.0` |
| `sales_chart.unit` | `TODAY`면 `HOUR`(KST 8~22), 그 외 `DAY` |
| `top_products` / `recent_orders` / `low_stock` | 각각 상위 5개 / 최근 6건 / 잔여 오름차순 6개 (고정, 페이지네이션 없음) |

> 요약 대시보드라 페이지네이션을 두지 않는다. 더 보려면 `GET /orders`·`GET /stats/sales`로 넘긴다.

**`GET /api/stats/sales`** *(MANAGER · MVP 1차)*

S-07 판매 통계 화면. 목록 규약(1.3)을 따르며 `limit`·`offset`·`sort`를 지원한다.

| 파라미터 | 설명 |
|---|---|
| `period` | `TODAY` \| `7D`(기본) \| `30D` — KST |
| `date_from` / `date_to` | 임의 기간 (KST). 주면 `period` 무시 |
| `group_by` | `PRODUCT`(기본) \| `CATEGORY` \| `DAY` |
| `product_type` | `BREAD` \| `DRINK` |

```json
{
  "period": "7D", "timezone": "Asia/Seoul",
  "items": [
    { "product_id": 9, "product_name": "소금빵", "category": "간식빵",
      "sold_qty": 148, "sales_amount": 325600,
      "prev_sold_qty": 131, "change_pct": 13.0 }
  ],
  "total": 41, "limit": 50, "offset": 0,
  "summary": { "sales_amount": 2841000, "order_count": 264, "item_qty": 912 }
}
```

- `prev_sold_qty`·`change_pct`는 **직전 동일 길이 기간** 대비 증감이다
- `summary`는 조회 기간 전체 기준

**실시간 갱신** — 5초 폴링.

| 대상 | 엔드포인트 | 판단 필드 |
|---|---|---|
| 운영 현황 | `GET /dashboard/overview` | `updated_at` |
| 재고 관리 | `GET /inventory` | 최상위 `updated_at` |
| 알림 배지 | `GET /notifications/unread-count` | `unread_count` |

`ETag`/`If-None-Match`를 쓰면 변경 없을 때 `304`로 페이로드 왕복이 없다. **고객 화면은 폴링 대상이 아니다**(POS와 같은 페이지의 파생 뷰).

---

## 5. 화면 ↔ API 대응표

### 직원 POS

| 화면 요소 | API |
|---|---|
| 세션 복구 (새로고침 · S-05 왕복 후) | `GET /orders/current` |
| 우측 상품 카탈로그 (빵/음료) | `GET /products?product_type=` |
| 촬영하기 | `POST /storage/images?purpose=SCAN` → `POST /scan-sessions` → `POST /scan-sessions/{id}/recognize` |
| 추가 촬영 | 위와 동일, `capture_type=ADD` |
| 다시 촬영 | `POST /scan-sessions/{id}/discard` → 위와 동일, `capture_type=RETAKE` |
| 처리 중 취소 | `POST /scan-sessions/{id}/cancel` |
| 수량 ± 버튼 | `PATCH /orders/{id}/items/{item_id}` |
| 항목 삭제 | `DELETE /orders/{id}/items/{item_id}` |
| 상품 카드 클릭 (직접 추가) | `POST /orders/{id}/items` |
| 메뉴 추천 (S-03 하단) | `GET /products/recommendations?order_id=` |
| 촬영 완료 확인 모달 | (FE 집계 — 총 개수·합계·`needs_review` 개수) |
| CJ ONE 멤버십 적립 (키패드) | `POST /orders/{id}/member` |
| 직원 수동 할인 | `POST /orders/{id}/discount` |
| 결제하기 | `POST /orders/{id}/pay` |
| 계산 취소 | `POST /orders/{id}/cancel` |
| 금일 판매 현황 (S-05) | `GET /orders?period=TODAY` |

### 점장 대시보드

| 화면 | API |
|---|---|
| 운영 현황 (KPI·차트·상위품목·최근판매·매진임박) | `GET /dashboard/overview?period=` |
| 재고 관리 (필터·검색) | `GET /inventory?status=&q=` |
| 수량 보충 | `PATCH /inventory/{product_id}/restock` |
| 판매 내역 (기간 필터·요약카드·목록) | `GET /orders?period=` |
| 판매 상세 모달 | `GET /orders/{id}` |
| 판매 통계 (S-07) | `GET /stats/sales?period=&group_by=` |
| 상품 마스터 목록 | `GET /products?status=ALL` |
| 상품 추가 / 수정 | `POST /products` / `PATCH /products/{id}` |
| 상품 이미지 등록 | `POST /storage/images?purpose=PRODUCT` |
| 알림 목록·읽음·삭제 | `GET /notifications` 외 |
| 사이드바 미읽음 배지 | `GET /notifications/unread-count` |

---

## 6. FE 확정 사항

| 항목 | 확정값 |
|---|---|
| CJ ONE 적립률 | **0.5%** 전 등급 단일. 목업의 0.1% 고정 수정 필요 |
| 회원명 | 서버가 마스킹해서 내려준다. FE는 받은 값을 그대로 표시 |
| 주문번호 | `order_id` (정수). `ORD-xxxx` 폐기 |
| 신뢰도 | 서버의 `is_below_threshold` / `needs_review` 사용. **수치 미노출** |
| 재고 상태 | 서버의 `stock_status` 사용. 화면 표기는 **"추정 N개"** |
| 금액 | 전부 서버 계산, FE는 표시만. JSON **정수** |
| 메뉴 추천 | 서버가 TOP 3 계산. FE 하드코딩 폐기 |
| 시각 | 응답은 UTC, **화면 표시는 KST 변환** |
| 오류 | `error.message`를 그대로 표시 + 항상 다음 행동 버튼 |
| 추적 헤더 | `X-Request-ID` |
| UI 용어 | **"촬영"** 으로 통일. "스캔"은 금지어 |

---

## 7. MVP 미구현 / 범위 밖

| 항목 | 상태 |
|---|---|
| `POST /scan-sessions/{id}/recognize` | **501 반환.** GPU 추론 서버 연결 후 동작 |
| 주문·결제 도메인 (13개 엔드포인트) | **미착수. MVP 시연의 실질 병목** |
| Supabase 테이블 생성 | **`CREATE TABLE` 미실행** — 현재 `/api/products` 호출 시 테이블 부재 오류 |
| 결제(PG) 연동 | Mock. `payment_method`만 기록 |
| CORRECTION_LOG 기록 | 2차. 그전까지 `correction_count`·`correction_rate`는 `0` |
| POINT_TRANSACTION | 2차. 그전까지 `point_earned`만 ORDERS에 기록 |
| `Idempotency-Key` | 2차. 그전까지 FE가 409 수신 시 `GET /orders/{id}`로 확인 |
| API 버저닝 (`/api/v1`) | 2차 |
| Swagger 접근 제한 (`/api/docs` 인증) | 2차 |
| 세트 / 프로모션 할인 | **범위 밖** (목업에서 제거) |
| 로그인 화면(S-00) · 직원 전환 · 화면 잠금 | 범위 밖 |
| 반품 / 환불 / 결제 후 정정 | 범위 밖. PAID는 되돌릴 수 없음 |
| 본사 대시보드(S-09) | 범위 밖 |

---

## 8. 부록 A — 공통 코드표

> 원본은 DB 설계서 v1.4 · 5장. 본 표는 사본이며 상충 시 DB 설계서를 따른다.
> `코드`는 2026-08-21 `backend/app/schemas/codes.py` 대조 결과다.

| 컬럼 | 허용값 | 코드 |
|---|---|---|
| `STAFF_ACCOUNT.role` | `STAFF` · `MANAGER` | ✅ |
| `PRODUCT.product_type` | `BREAD` · `DRINK` | ❌ 누락 |
| `PRODUCT.source_type` | `FACTORY` · `IN_STORE` | ✅ |
| `MEMBERSHIP_GRADE.grade_code` | `FRIENDS` · `FAMILY` · `MANIA` · `VIP` | ❌ BRONZE/SILVER/GOLD/VIP |
| `SCAN_SESSION.capture_type` | `BASIC` · `ADD` · `RETAKE` | ❌ 누락 |
| `SCAN_SESSION.status` | `CAPTURED` · `RECOGNIZING` · `COMPLETED` · `FAILED` · `MANUAL_FALLBACK` · `DISCARDED` | ❌ `DISCARDED` 누락 |
| `CORRECTION_LOG.correction_type` | `DELETE` · `QTY_CHANGE` · `RESELECT` · `MANUAL_ADD` | ✅ |
| `CORRECTION_LOG.corrected_by_type` | `CUSTOMER` · `STAFF` | ✅ |
| `ORDER_ITEM.source_type` | `AI_DETECTED` · `STAFF_CORRECTED` · `MANUAL_ADD` | ✅ |
| `ORDERS.status` | `PENDING` · `PAID` · `CANCELLED` (`PAYING`은 MVP 미사용) | ⚠️ `PAYING` 포함 |
| `ORDERS.payment_method` | `CARD` · `EASY_PAY` · `POINT` | ✅ |
| `POINT_TRANSACTION.txn_type` | `EARN` | ❌ `USE` 초과 |
| `NOTIFICATION.notif_type` | `STOCK_LOW` · `SYSTEM` | ✅ |

**스키마 · 설정 정정 대상**

| 위치 | 현재 | 정정 |
|---|---|---|
| `app/core/config.py` | `auth_disabled`가 `Settings` **클래스 바깥**에 선언 → `settings.auth_disabled` 호출 시 `AttributeError`로 **인증 API 전체가 500** | 클래스 본문 안으로 이동. `.env`에 `AUTH_DISABLED` 추가 (`.env.example`의 `false햐` 오타 정정) |
| `Product.stock_baseline_pct` 기본값 | `5` | **`20`** |
| `Order` 스키마 | `scan_session_id` 보유, `gross_amount` 없음 | `scan_session_id` 삭제, `gross_amount` 추가 |
| `StaffAccount` | `login_id` | `auth_user_id`(UUID) + `email` |
| `ProductCreate` / `ScanSessionCreate` | `store_id`·`staff_id` 필수 | 삭제 (서버 결정) |
| 전 라우트 | `response_model` 미지정 | 전부 지정 |

---

## 9. 확정 결정 기록

v1.1의 「미해결 쟁점」 10건 중 8건이 확정됐다. 남은 2건은 2차로 이관.

| # | 쟁점 | 결정 |
|---|---|---|
| 1 | 회원명 마스킹 | **마스킹 유지.** UX 설계서 반영 완료 |
| 2 | `PAYING` 상태 | **MVP 상태 기계에서 제외.** 결제 실패는 `402` + `PENDING` 유지 |
| 3 | 주문 생성 시점 | **계산 시작 시 선생성 유지** + 빈 주문 재사용 · 12시간 자동 취소 |
| 4 | 재고 일일 초기화 | **KST 06:00 배치** |
| 5 | 세트 규칙 데이터 | **세트 기능 폐기.** 관련 API·필드 전부 제거 |
| 6 | 메뉴 추천(FR-11) | **`GET /products/recommendations` 신설.** 서버가 TOP 3 계산 |
| 7 | S-07 판매 통계 범위 | **MVP 1차로 상향.** `GET /stats/sales` + 페이지네이션 |
| 8 | `correction_rate` 분모 | **판매 수량**으로 확정 |
| 9 | API 버저닝 | 2차 이관 |
| 10 | `/api/docs` 노출 | 2차 이관 (Swagger 인증) |

---

## 10. 변경 이력

| 버전 | 일자 | 변경 |
|---|---|---|
| v1.0 | 2026-08-20 | 최초 작성 |
| v1.1 | 2026-08-21 | 타임존·금액타입·에러포맷·정렬·멱등성·동시성 규약 신설, 엔드포인트 7종 추가, 공통 코드표 신설 (24건) |
| **v1.2** | **2026-08-21** | 아래 8건 |

1. **세트/프로모션 할인 전면 제거** (1.5, 4.5, 5장, 7장) — 목업에서 세트 메뉴가 빠짐. `discount`의 `kind` 파라미터, `set_discount_amount`·`staff_discount_amount` 필드, 대응표 "세트 자동 적용" 행 삭제
2. **`GET /api/products/recommendations` 신설** (2장, 4.2, 5장) — 메뉴 추천을 FE 하드코딩에서 서버 계산 **TOP 3**로 전환. 최근 7일 판매 상위, 재고 있음, 주문에 없는 상품
3. **`GET /api/stats/sales`를 2차 → MVP 1차로 상향** (2장, 4.9, 7장) — `date_from`/`date_to`, `group_by`, `product_type` 지원 + 목록 규약(`limit`/`offset`/`sort`) 적용
4. **재고 일일 초기화 규약 확정** (4.7) — 매일 **KST 06:00** 배치로 `produced_qty`·`sold_qty`·`remaining_qty` 초기화
5. **`correction_rate` 분모를 "판매 수량"으로 확정** (4.9)
6. **`ORDER_ITEM`에 `needs_review` 추가** (4.5) — 촬영 완료 확인 모달의 "확인 필요 N개"를 새로고침 후에도 집계할 수 있게
7. **API 버저닝 · Swagger 인증을 2차로 확정** (7장)
8. **문서 압축** — v1.1의 개정 사유 주석을 전부 제거하고 규약만 남김. 「미해결 쟁점」을 「확정 결정 기록」으로 대체

---

*스냅빵(뚜레쥬르 Vision AI 빵 인식) 프로젝트 문서와 `cj_404` 저장소 코드만을 근거로 작성했다.*

from typing import Literal

"""코드값 상수 (스냅빵 DB설계서 v2.2 · 5장 공통 코드표).

VARCHAR + 코드표 방식(ENUM 미사용)이라는 설계 원칙에 맞춰, 스키마 상에서는
DB 컬럼과 동일하게 문자열이지만 API 레이어에서는 Literal로 값 집합을 강제한다.

주의: DB에도 동일한 CHECK 제약이 걸려 있다(v2.1에서 31개 신설).
      여기에 값을 추가하면 DB 제약도 함께 수정해야 저장이 된다.
"""

StaffRole = Literal["STAFF", "MANAGER"]

ProductType = Literal["BREAD", "DRINK"]
ProductSourceType = Literal["FACTORY", "IN_STORE"]

MembershipGradeCode = Literal["FRIENDS", "FAMILY", "MANIA", "VIP"]

CaptureType = Literal["BASIC", "ADD", "RETAKE"]
ScanSessionStatus = Literal[
    "CAPTURED", "RECOGNIZING", "COMPLETED", "FAILED", "MANUAL_FALLBACK", "DISCARDED"
]

CorrectionType = Literal["DELETE", "QTY_CHANGE", "RESELECT", "MANUAL_ADD"]
CorrectedByType = Literal["CUSTOMER", "STAFF"]

OrderItemSourceType = Literal["AI_DETECTED", "STAFF_CORRECTED", "MANUAL_ADD"]
# PAYING은 DB CHECK에는 있으나 MVP 상태 기계에서는 사용하지 않는다(API명세서 v1.2 · 9장 #2).
OrderStatus = Literal["PENDING", "PAYING", "PAID", "CANCELLED"]
PaymentMethod = Literal["CARD", "EASY_PAY", "POINT"]

PointTxnType = Literal["EARN", "USE", "CANCEL"]
NotificationType = Literal["STOCK_LOW", "SYSTEM"]

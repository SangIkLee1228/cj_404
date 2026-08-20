from typing import Literal

"""코드값 상수 (스냅빵 DB설계서 v1.2, 6장 공통 코드표).

VARCHAR + 코드표 방식(ENUM 미사용)이라는 설계 원칙에 맞춰, 스키마 상에서는
DB 컬럼과 동일하게 문자열이지만 API 레이어에서는 Literal로 값 집합을 강제한다.
"""

StaffRole = Literal["STAFF", "MANAGER"]
ProductSourceType = Literal["FACTORY", "IN_STORE"]
MembershipGradeCode = Literal["BRONZE", "SILVER", "GOLD", "VIP"]
ScanSessionStatus = Literal["CAPTURED", "RECOGNIZING", "COMPLETED", "FAILED", "MANUAL_FALLBACK"]
CorrectionType = Literal["DELETE", "QTY_CHANGE", "RESELECT", "MANUAL_ADD"]
CorrectedByType = Literal["CUSTOMER", "STAFF"]
OrderItemSourceType = Literal["AI_DETECTED", "STAFF_CORRECTED", "MANUAL_ADD"]
OrderStatus = Literal["PENDING", "PAYING", "PAID", "CANCELLED"]
PaymentMethod = Literal["CARD", "EASY_PAY", "POINT"]
PointTxnType = Literal["EARN", "USE"]
NotificationType = Literal["STOCK_LOW", "SYSTEM"]

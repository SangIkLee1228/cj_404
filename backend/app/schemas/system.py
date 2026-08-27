from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel


class ModelVersion(BaseModel):
    """AI 인식 모델 버전/배포 이력 (FR-21/22, NFR-02/04). 화면 설계 대상은 아니고
    재학습 파이프라인 운영을 위해 DB 상에만 존재하는 독립 테이블 (ERD 미표기)."""

    model_version_id: int
    version_name: str
    description: str | None = None
    trained_dataset: str | None = None
    class_count: int | None = None
    map_score: Decimal | None = None
    is_active: bool = False
    released_at: datetime | None = None
    created_by: str | None = None
    created_at: datetime


class HealthResponse(BaseModel):
    '''GET /health 응답 (API 명세서 4.1)'''
    status: str = "ok"
    version: str


class ReadyResponse(BaseModel):
    '''GET /health/ready 응답. 의존 서비스별 상태를 checks 에 담는다.'''

    status: str
    checks: dict[str, str]

from fastapi import APIRouter

from app.api.routes import (
    dashboard,
    inventory,
    me,
    members,
    notifications,
    orders,
    products,
    scan_sessions,
    stats,
    storage,
)

# 모든 공개 API는 "/api" 아래로 모은다 - nginx가 "/api/*"만 backend로 프록시하기 때문에
# (nginx/nginx.conf) 여기서 붙이는 prefix가 실제 외부 URL과 일치해야 한다.
api_router = APIRouter(prefix="/api")
api_router.include_router(orders.router)
api_router.include_router(me.router)
api_router.include_router(storage.router)
api_router.include_router(products.router)
api_router.include_router(scan_sessions.router)
api_router.include_router(inventory.router)
api_router.include_router(notifications.router)
api_router.include_router(members.router)
api_router.include_router(dashboard.router)
api_router.include_router(stats.router)

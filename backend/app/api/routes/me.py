from fastapi import APIRouter, Depends

from app.core.security import CurrentUser, get_current_user

router = APIRouter(prefix="/me", tags=["auth"])


@router.get("")
def read_current_user(user: CurrentUser = Depends(get_current_user)):
    """Example protected route: proves Supabase Auth tokens issued to the frontend are accepted here."""
    return {"id": user.id, "email": user.email}

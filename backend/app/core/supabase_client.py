from functools import lru_cache

from supabase import Client, create_client

from app.core.config import get_settings


@lru_cache
def get_supabase() -> Client:
    """Service-role client for server-side DB/Storage access. Bypasses RLS - never expose this key to the frontend."""
    settings = get_settings()
    return create_client(settings.supabase_url, settings.supabase_service_role_key)

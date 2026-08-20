from __future__ import annotations

from datetime import datetime, timedelta, timezone

import bcrypt
import jwt

from .config import load_settings


settings = load_settings()
ALGORITHM = "HS256"


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))


def create_access_token(user_id: str, token_version: int = 0) -> tuple[str, int]:
    expires_in = settings.jwt_expire_minutes * 60
    expires_at = datetime.now(timezone.utc) + timedelta(seconds=expires_in)
    token = jwt.encode({"sub": user_id, "exp": expires_at, "type": "access", "ver": token_version}, settings.jwt_secret, algorithm=ALGORITHM)
    return token, expires_in


def decode_access_token(token: str) -> tuple[str, int]:
    payload = jwt.decode(token, settings.jwt_secret, algorithms=[ALGORITHM])
    if payload.get("type") != "access" or not payload.get("sub"):
        raise jwt.InvalidTokenError("Invalid access token")
    version = payload.get("ver", 0)
    if not isinstance(version, int) or version < 0:
        raise jwt.InvalidTokenError("Invalid access token version")
    return str(payload["sub"]), version

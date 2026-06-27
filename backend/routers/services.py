from fastapi import APIRouter, Depends
from database import get_pool
from auth import get_github_token
from models import ServiceOut

router = APIRouter()


@router.get("/services", response_model=list[ServiceOut])
async def get_services(token: str = Depends(get_github_token)):
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT id, name, language, repo_url FROM services ORDER BY id"
        )
    return [
        ServiceOut(id=r["id"], name=r["name"], language=r["language"], repo_url=r["repo_url"])
        for r in rows
    ]

from fastapi import APIRouter, Depends
from database import get_pool
from auth import get_github_token
from models import GraphOut, GraphNode, GraphEdge

router = APIRouter()


@router.get("/graph", response_model=GraphOut)
async def get_graph(token: str = Depends(get_github_token)):
    pool = await get_pool()
    async with pool.acquire() as conn:
        service_rows = await conn.fetch("SELECT id, name FROM services ORDER BY id")
        edge_rows = await conn.fetch(
            "SELECT ce.caller_service_id, e.service_id AS provider_service_id,"
            " e.path AS endpoint_path, e.method AS endpoint_method,"
            " ce.call_count, ce.last_seen_at"
            " FROM consumer_edges ce"
            " JOIN endpoints e ON e.id = ce.endpoint_id"
        )

    nodes = [GraphNode(id=str(r["id"]), name=r["name"]) for r in service_rows]
    edges = [
        GraphEdge(
            source=str(r["caller_service_id"]),
            target=str(r["provider_service_id"]),
            endpoint_path=r["endpoint_path"],
            endpoint_method=r["endpoint_method"],
            call_count=r["call_count"],
            last_seen_at=r["last_seen_at"],
        )
        for r in edge_rows
    ]
    return GraphOut(nodes=nodes, edges=edges)

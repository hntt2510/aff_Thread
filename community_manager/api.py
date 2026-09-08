from __future__ import annotations

import asyncio
import json
import os
import secrets
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

import uvicorn
from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.responses import FileResponse, RedirectResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles

from .db import Database, now
from .models import AccountInput, AffiliateRuleInput, DraftInput, DraftUpdate, MetricInput, ReplyInput, ScheduleInput, SourceInput, TrendInput
from .services import JobWorker, ThreadsService

ROOT = Path(__file__).resolve().parents[1]
STATIC = ROOT / "static"
DEFAULT_DB = ROOT / "instance" / "community.db"

def require(value: Any, label: str) -> Any:
    if not value: raise HTTPException(404, f"Không tìm thấy {label}.")
    return value

def normalized_schedule(db: Database, draft_id: str, value: str) -> str:
    try: requested = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc: raise HTTPException(400, "Thời gian phải là ISO 8601 có timezone.") from exc
    if requested.tzinfo is None: raise HTTPException(400, "Thời gian phải kèm timezone.")
    utc = requested.astimezone(timezone.utc)
    if utc < datetime.now(timezone.utc) - timedelta(minutes=15): raise HTTPException(409, "Không thể lên lịch quá 15 phút trong quá khứ.")
    draft = require(db.draft(draft_id), "nháp"); account = require(db.account(draft["account_id"]), "tài khoản")
    local_day = utc.astimezone(ZoneInfo("Asia/Bangkok")).date()
    scheduled = db.rows("SELECT p.scheduled_for FROM posts p WHERE p.account_id=? AND p.status IN ('scheduled','published')", (account["id"],))
    same_day, close = 0, []
    for post in scheduled:
        if not post.get("scheduled_for"): continue
        point = datetime.fromisoformat(post["scheduled_for"].replace("Z", "+00:00")).astimezone(timezone.utc)
        if point.astimezone(ZoneInfo("Asia/Bangkok")).date() == local_day: same_day += 1
        if abs((point - utc).total_seconds()) < account["min_post_gap_minutes"] * 60: close.append(point)
    if same_day >= account["daily_post_limit"]: raise HTTPException(409, "Account đã đạt số bài tối đa trong ngày này.")
    if close: raise HTTPException(409, f"Cần cách bài khác ít nhất {account['min_post_gap_minutes']} phút.")
    return utc.isoformat()

def create_app(db_path: Path | None = None) -> FastAPI:
    db = Database(db_path or Path(os.getenv("THREADS_COMMUNITY_DB", DEFAULT_DB)))
    threads = ThreadsService(db)
    worker = JobWorker(db, threads)
    @asynccontextmanager
    async def lifespan(app: FastAPI):
        db.initialize(); app.state.db, app.state.threads, app.state.worker = db, threads, worker
        await worker.start(); yield; await worker.stop()
    app = FastAPI(title="Threads Community Manager", version="0.1.0", lifespan=lifespan)
    app.mount("/static", StaticFiles(directory=STATIC), name="static")

    @app.get("/", include_in_schema=False)
    async def index() -> FileResponse: return FileResponse(STATIC / "index.html")

    @app.get("/api/v1/state")
    async def state() -> dict[str, Any]:
        jobs = db.jobs(); posts = db.posts(); rules = db.rules()
        return {"accounts":db.accounts(),"sources":db.rows("SELECT * FROM sources ORDER BY kind"),"trends":db.trends(),"drafts":db.drafts(),"posts":posts,"rules":rules,"jobs":jobs,"events":db.job_events(limit=100),"server_time":now(),"summary":{"running":sum(x["status"]=="running" for x in jobs),"queued":sum(x["status"]=="queued" for x in jobs),"failed":sum(x["status"]=="failed" for x in jobs),"pending_drafts":sum(x["status"]=="draft" for x in db.drafts()),"scheduled":sum(x["status"]=="scheduled" for x in posts),"affiliate_watching":sum(x["state"] in {"armed","watching"} for x in rules)}}

    @app.get("/api/v1/events")
    async def events(after: int = 0):
        async def stream():
            cursor = after
            while True:
                rows = db.job_events(after=cursor, limit=200)
                for event in rows:
                    cursor = max(cursor,event["id"])
                    yield f"id: {event['id']}\nevent: activity\ndata: {json.dumps(event,ensure_ascii=False)}\n\n"
                yield ": keepalive\n\n"; await asyncio.sleep(2)
        return StreamingResponse(stream(), media_type="text/event-stream", headers={"Cache-Control":"no-cache","X-Accel-Buffering":"no"})

    @app.get("/api/v1/accounts")
    async def list_accounts(): return db.accounts()
    @app.get("/api/v1/personas")
    async def list_personas(): return db.personas()
    @app.post("/api/v1/accounts", status_code=201)
    async def create_account(payload: AccountInput): return db.save_account(payload.model_dump())
    @app.put("/api/v1/accounts/{account_id}")
    async def update_account(account_id: str, payload: AccountInput):
        require(db.account(account_id),"tài khoản"); return db.save_account(payload.model_dump(),account_id)
    @app.post("/api/v1/accounts/{account_id}/pause")
    async def pause_account(account_id: str, paused: bool = True):
        require(db.account(account_id),"tài khoản")
        with db.connect() as con: con.execute("UPDATE accounts SET paused=?,updated_at=? WHERE id=?",(int(paused),now(),account_id))
        return db.account(account_id)
    @app.get("/api/v1/accounts/{account_id}/oauth/start")
    async def oauth_start(account_id: str):
        require(db.account(account_id),"tài khoản")
        if not threads.configured(): raise HTTPException(409,"Thiếu THREADS_APP_ID, THREADS_APP_SECRET hoặc THREADS_REDIRECT_URI.")
        state_value = secrets.token_urlsafe(24)
        db.create_oauth_state(account_id, state_value, (datetime.now(timezone.utc) + timedelta(minutes=10)).isoformat())
        with db.connect() as con: con.execute("UPDATE accounts SET oauth_status='connecting',updated_at=? WHERE id=?",(now(),account_id))
        return {"authorization_url":threads.auth_url(state_value),"state":state_value}
    @app.get("/api/v1/oauth/threads/callback")
    async def oauth_callback(code: str = "", state: str = "", error: str = ""):
        pending = db.consume_oauth_state(state)
        if not pending: raise HTTPException(400,"OAuth state không hợp lệ, đã dùng hoặc đã hết hạn.")
        account = require(db.account(pending["account_id"]), "tài khoản")
        if error:
            with db.connect() as con: con.execute("UPDATE accounts SET oauth_status='not_connected',updated_at=? WHERE id=?",(now(),account["id"]))
            return RedirectResponse("/?oauth_error=declined")
        if not code: raise HTTPException(400,"Meta không trả authorization code.")
        try:
            token = await threads.exchange(code)
            ref = threads.put_token(account["id"],token["access_token"])
            scopes = token.get("scope", [])
            if isinstance(scopes, str): scopes = [item for item in scopes.replace(" ", ",").split(",") if item]
            with db.connect() as con: con.execute("UPDATE accounts SET token_ref=?,oauth_status='connected',token_expiry=?,scopes=?,updated_at=? WHERE id=?",(ref,threads.token_expiry(token),json.dumps(scopes),now(),account["id"]))
            return RedirectResponse("/?oauth=connected")
        except Exception as exc:
            with db.connect() as con: con.execute("UPDATE accounts SET oauth_status='error',updated_at=? WHERE id=?",(now(),account["id"]))
            raise HTTPException(502,"Không đổi được OAuth token. Kiểm tra cấu hình Meta hoặc kết nối lại.") from exc

    @app.get("/api/v1/trends")
    async def list_trends(source: str = "", account_id: str = "", saved: str = ""): return db.trends(source,account_id,saved)
    @app.post("/api/v1/trends", status_code=201)
    async def create_trend(payload: TrendInput): return db.save_trend(payload.model_dump())
    @app.post("/api/v1/trends/{trend_id}/save")
    async def save_trend(trend_id: str, saved: bool = True): return require(db.set_trend_saved(trend_id,saved),"trend")
    @app.post("/api/v1/trends/{trend_id}/compose", status_code=202)
    async def compose(trend_id: str, account_id: str):
        require(db.trend(trend_id),"trend"); require(db.account(account_id),"tài khoản")
        return db.create_job("compose","Soạn 3 bài từ trend",{"trend_id":trend_id,"account_id":account_id},3)

    @app.post("/api/v1/sources/{source}/scan", status_code=202)
    async def scan(source: str):
        require(db.one("SELECT * FROM sources WHERE kind=?",(source,)),"nguồn")
        return db.create_job("scan",f"Quét xu hướng {source}",{"source":source})
    @app.put("/api/v1/sources/{source}")
    async def update_source(source: str, payload: SourceInput):
        if source != payload.kind: raise HTTPException(400,"Loại nguồn không khớp.")
        with db.connect() as con: con.execute("UPDATE sources SET keywords=?,enabled=?,updated_at=? WHERE kind=?",(json.dumps(payload.keywords,ensure_ascii=False),int(payload.enabled),now(),source))
        return require(db.one("SELECT * FROM sources WHERE kind=?",(source,)),"nguồn")

    @app.get("/api/v1/drafts")
    async def list_drafts(): return db.drafts()
    @app.get("/api/v1/drafts/{draft_id}")
    async def get_draft(draft_id: str):
        item=require(db.draft(draft_id),"nháp"); item["revisions"]=db.revisions(draft_id); return item
    @app.post("/api/v1/drafts",status_code=201)
    async def create_draft(payload: DraftInput): require(db.account(payload.account_id),"tài khoản"); return db.save_draft(payload.model_dump())
    @app.patch("/api/v1/drafts/{draft_id}")
    async def update_draft(draft_id: str,payload: DraftUpdate):
        old=require(db.draft(draft_id),"nháp"); data={**old,**payload.model_dump(exclude_none=True)}; return db.save_draft(data,draft_id)
    @app.post("/api/v1/drafts/{draft_id}/schedule")
    async def schedule(draft_id: str,payload: ScheduleInput):
        return require(db.schedule_draft(draft_id,normalized_schedule(db,draft_id,payload.scheduled_for)),"nháp")
    @app.post("/api/v1/drafts/{draft_id}/publish",status_code=202)
    async def publish_now(draft_id: str):
        post=require(db.schedule_draft(draft_id,normalized_schedule(db,draft_id,now())),"nháp")
        return db.create_job("publish","Đăng bài Threads",{"post_id":post["id"]},1)

    @app.get("/api/v1/posts")
    async def list_posts(): return db.posts()
    @app.post("/api/v1/posts/{post_id}/metrics",status_code=201)
    async def metric(post_id: str,payload: MetricInput): require(db.post(post_id),"bài đăng"); return db.add_metric(post_id,payload.model_dump())
    @app.post("/api/v1/posts/{post_id}/replies",status_code=201)
    async def reply(post_id: str,payload: ReplyInput): require(db.post(post_id),"bài đăng"); return db.add_reply(post_id,payload.model_dump())
    @app.get("/api/v1/posts/{post_id}/replies")
    async def list_replies(post_id: str): require(db.post(post_id),"bài đăng"); return db.replies(post_id)
    @app.post("/api/v1/posts/{post_id}/affiliate-rules",status_code=201)
    async def create_rule(post_id: str,payload: AffiliateRuleInput): require(db.post(post_id),"bài đăng"); return db.save_rule(post_id,payload.model_dump())
    @app.patch("/api/v1/affiliate-rules/{rule_id}")
    async def update_rule(rule_id: str,payload: AffiliateRuleInput):
        rule=require(db.rule(rule_id),"rule affiliate"); return db.save_rule(rule["post_id"],payload.model_dump(),rule_id)

    @app.get("/api/v1/jobs")
    async def list_jobs(): return db.jobs()
    @app.get("/api/v1/jobs/{job_id}")
    async def get_job(job_id: str): return require(db.get_job(job_id),"công việc")
    @app.get("/api/v1/jobs/{job_id}/events")
    async def job_events(job_id: str,after: int=0): require(db.get_job(job_id),"công việc"); return db.job_events(job_id,after)
    @app.post("/api/v1/jobs/{job_id}/{action}")
    async def control_job(job_id: str, action: str):
        job=require(db.get_job(job_id),"công việc")
        if action=="retry-failed" and job["status"] in {"failed","needs_review"}:
            db.update_job(job_id,status="queued",step="Đang chờ",error="",finished_at=None); db.event(job_id,"info","Thử lại","Đã đưa công việc vào hàng chờ"); return db.get_job(job_id)
        if action=="pause" and job["status"] == "running":
            db.update_job(job_id,status="paused",step="Đang tạm dừng"); db.event(job_id,"info","Đang tạm dừng","Công việc sẽ dừng ở checkpoint tiếp theo."); return db.get_job(job_id)
        if action=="resume" and job["status"] == "paused":
            db.update_job(job_id,status="running",step="Đang tiếp tục"); db.event(job_id,"info","Đang tiếp tục","Công việc đã tiếp tục từ checkpoint."); return db.get_job(job_id)
        if action=="stop" and job["status"] in {"queued","running","paused"}:
            worker.stopped.add(job_id); db.update_job(job_id,status="stopped",step="Đã dừng",finished_at=now()); db.event(job_id,"warning","Đã dừng","Người dùng đã dừng công việc"); return db.get_job(job_id)
        raise HTTPException(409,"Không thể thực hiện thao tác ở trạng thái hiện tại.")
    return app

app=create_app()
def main() -> None: uvicorn.run("community_manager.api:app",host="127.0.0.1",port=8876,reload=False)

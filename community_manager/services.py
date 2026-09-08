from __future__ import annotations

import asyncio
import os
import socket
from datetime import datetime, timedelta, timezone
from typing import Any
from urllib.parse import urlencode

import httpx
try:
    import keyring
except ModuleNotFoundError:  # Allows diagnostics before `uv sync`; production dependency is declared in pyproject.
    keyring = None

from .db import Database, now, uid
from .security import redact

KEYRING_SERVICE = "ThreadsCommunityManager"

class JobStopped(Exception): pass


class ThreadsService:
    API = "https://graph.threads.net"

    def __init__(self, db: Database): self.db = db
    def configured(self) -> bool: return bool(os.getenv("THREADS_APP_ID") and os.getenv("THREADS_APP_SECRET") and os.getenv("THREADS_REDIRECT_URI"))
    def auth_url(self, state: str) -> str:
        scopes = ["threads_basic", "threads_content_publish", "threads_manage_insights", "threads_read_replies", "threads_manage_replies"]
        if os.getenv("THREADS_ENABLE_KEYWORD_SEARCH", "").lower() in {"1", "true", "yes"}:
            scopes.append("threads_keyword_search")
        params = {"client_id":os.environ["THREADS_APP_ID"],"redirect_uri":os.environ["THREADS_REDIRECT_URI"],"response_type":"code","scope":",".join(scopes),"state":state}
        return "https://threads.net/oauth/authorize?" + urlencode(params)
    async def exchange(self, code: str) -> dict[str, Any]:
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post("https://graph.threads.net/oauth/access_token", data={"client_id":os.environ["THREADS_APP_ID"],"client_secret":os.environ["THREADS_APP_SECRET"],"grant_type":"authorization_code","redirect_uri":os.environ["THREADS_REDIRECT_URI"],"code":code})
            response.raise_for_status()
            short_lived = response.json()
            access_token = short_lived.get("access_token")
            if not access_token: raise RuntimeError("Meta không trả access token.")
            # Exchange immediately: the database never receives either token value.
            long_lived = await client.get(f"{self.API}/access_token", params={"grant_type":"th_exchange_token", "client_secret":os.environ["THREADS_APP_SECRET"], "access_token":access_token})
            long_lived.raise_for_status()
            result = long_lived.json()
            if not result.get("access_token"): raise RuntimeError("Meta không trả long-lived access token.")
            return result
    def put_token(self, account_id: str, token: str) -> str:
        if keyring is None: raise RuntimeError("Thiếu package keyring. Chạy `uv sync` trước khi kết nối Threads.")
        reference = f"account:{account_id}"
        keyring.set_password(KEYRING_SERVICE, reference, token)
        return reference
    def token(self, account: dict[str, Any]) -> str:
        if keyring is None: raise RuntimeError("Thiếu package keyring. Chạy `uv sync` trước khi đăng Threads.")
        if not account.get("token_ref"): raise RuntimeError("Tài khoản chưa kết nối Threads API.")
        value = keyring.get_password(KEYRING_SERVICE, account["token_ref"])
        if not value: raise RuntimeError("Không tìm thấy token trong Windows Credential Manager.")
        return value
    @staticmethod
    def token_expiry(token_data: dict[str, Any]) -> str | None:
        expires_in = token_data.get("expires_in")
        if not isinstance(expires_in, (int, float)): return None
        return (datetime.now(timezone.utc) + timedelta(seconds=expires_in)).isoformat()
    async def valid_token(self, account: dict[str, Any]) -> str:
        expiry = account.get("token_expiry")
        if expiry:
            try:
                renew_after = datetime.fromisoformat(expiry.replace("Z", "+00:00")) - timedelta(days=7)
                if datetime.now(timezone.utc) >= renew_after:
                    current = self.token(account)
                    async with httpx.AsyncClient(timeout=30) as client:
                        response = await client.get(f"{self.API}/refresh_access_token", params={"grant_type":"th_refresh_token", "access_token":current})
                        response.raise_for_status()
                        refreshed = response.json()
                    new_token = refreshed.get("access_token")
                    if not new_token: raise RuntimeError("Meta không trả token sau khi làm mới.")
                    ref = self.put_token(account["id"], new_token)
                    with self.db.connect() as con:
                        con.execute("UPDATE accounts SET token_ref=?,token_expiry=?,oauth_status='connected',updated_at=? WHERE id=?", (ref, self.token_expiry(refreshed), now(), account["id"]))
                    return new_token
            except ValueError:
                raise RuntimeError("Hạn access token không hợp lệ; hãy kết nối lại Threads.")
        return self.token(account)
    async def publish_text(self, account: dict[str, Any], draft: dict[str, Any]) -> dict[str, Any]:
        token = await self.valid_token(account)
        params = {"media_type":"TEXT", "text":draft["caption"]}
        if draft.get("media_url"): raise RuntimeError("Bản đầu chỉ publish text qua API; media cần URL HTTPS và adapter media riêng.")
        async with httpx.AsyncClient(timeout=45) as client:
            create = await client.post(f"{self.API}/me/threads", params=params, headers={"Authorization":f"Bearer {token}"})
            create.raise_for_status(); container_id = create.json().get("id")
            if not container_id: raise RuntimeError("Threads không trả container ID.")
            publish = await client.post(f"{self.API}/me/threads_publish", params={"creation_id":container_id}, headers={"Authorization":f"Bearer {token}"})
            publish.raise_for_status(); return {"container_id":container_id, **publish.json()}

    async def publish_reply(self, account: dict[str, Any], parent_id: str, text: str) -> dict[str, Any]:
        token = await self.valid_token(account)
        async with httpx.AsyncClient(timeout=45) as client:
            create = await client.post(f"{self.API}/me/threads", params={"media_type":"TEXT","text":text,"reply_to_id":parent_id}, headers={"Authorization":f"Bearer {token}"})
            create.raise_for_status(); container_id = create.json().get("id")
            if not container_id: raise RuntimeError("Threads không trả container ID cho comment.")
            publish = await client.post(f"{self.API}/me/threads_publish", params={"creation_id":container_id}, headers={"Authorization":f"Bearer {token}"})
            publish.raise_for_status(); return {"container_id":container_id, **publish.json()}

    async def keyword_search(self, account: dict[str, Any], keyword: str) -> list[dict[str, Any]]:
        token = await self.valid_token(account)
        fields = "id,permalink,username,text,timestamp,media_type,topic_tag,has_replies"
        async with httpx.AsyncClient(timeout=45) as client:
            response = await client.get(f"{self.API}/keyword_search", params={"q":keyword,"search_type":"TOP","search_mode":"KEYWORD","fields":fields,"limit":50}, headers={"Authorization":f"Bearer {token}"})
            response.raise_for_status()
            return list(response.json().get("data") or [])


class JobWorker:
    def __init__(self, db: Database, threads: ThreadsService):
        self.db, self.threads = db, threads
        self.owner = f"{socket.gethostname()}:{os.getpid()}"
        self.running = False
        self.paused: set[str] = set()
        self.stopped: set[str] = set()
        self.tasks: dict[str, asyncio.Task[Any]] = {}

    async def start(self) -> None:
        self.running = True
        self.recover()
        asyncio.create_task(self.loop(), name="community-job-worker")
        asyncio.create_task(self.scheduler(), name="community-scheduler")

    async def stop(self) -> None:
        self.running = False
        for task in self.tasks.values(): task.cancel()
        await asyncio.gather(*self.tasks.values(), return_exceptions=True)

    def recover(self) -> None:
        # Jobs were interrupted by a backend exit. Read-only and compose work can resume; publishing must be reviewed.
        for job in self.db.rows("SELECT id,kind FROM jobs WHERE status='running'"):
            status = "queued" if job["kind"] not in {"publish"} else "needs_review"
            self.db.update_job(job["id"], status=status, step="Cần tiếp tục" if status == "queued" else "Cần kiểm tra publish", lease_owner="", lease_until="")
            self.db.event(job["id"], "warning", "Khôi phục", "Backend đã dừng trước khi công việc hoàn tất.")

    async def loop(self) -> None:
        while self.running:
            if len([task for task in self.tasks.values() if not task.done()]) < 2:
                job = self.db.claim_job(self.owner)
                if job: self.tasks[job["id"]] = asyncio.create_task(self.run(job), name=f"job:{job['id']}")
            await asyncio.sleep(1)

    async def scheduler(self) -> None:
        while self.running:
            try:
                await self.enqueue_due_posts(); await self.evaluate_affiliate()
            except Exception as exc: self.db.event(None, "error", "Scheduler", redact(str(exc)))
            await asyncio.sleep(15)

    async def enqueue_due_posts(self) -> None:
        current = datetime.now(timezone.utc)
        for post in self.db.rows("SELECT * FROM posts WHERE status='scheduled' AND scheduled_for IS NOT NULL"):
            due = datetime.fromisoformat(post["scheduled_for"].replace("Z","+00:00"))
            if due > current: continue
            if current - due > timedelta(minutes=15):
                with self.db.connect() as con: con.execute("UPDATE posts SET status='missed',updated_at=? WHERE id=?", (now(),post["id"]))
                self.db.event(None,"warning","Lỡ lịch",f"Bài {post['id'][:8]} đã lỡ lịch hơn 15 phút."); continue
            existing = self.db.one("SELECT id FROM jobs WHERE kind='publish' AND payload LIKE ? AND status IN ('queued','running')", (f'%"post_id": "{post["id"]}"%',))
            if not existing: self.db.create_job("publish", "Đăng bài Threads", {"post_id":post["id"]}, 1)

    async def evaluate_affiliate(self) -> None:
        current = datetime.now(timezone.utc)
        for rule in self.db.rules():
            if not rule["active"] or rule["state"] not in {"armed","watching"}: continue
            if rule.get("expires_at") and datetime.fromisoformat(rule["expires_at"].replace("Z","+00:00")) < current:
                with self.db.connect() as con: con.execute("UPDATE affiliate_rules SET state='expired',updated_at=? WHERE id=?", (now(),rule["id"]))
                self.db.event(None,"info","Affiliate","Rule đã hết hạn.",{"rule_id":rule["id"]}); continue
            metric = self.db.latest_metric(rule["post_id"])
            if not metric: continue
            checks = [metric.get("views") is not None and metric["views"] >= rule["views_threshold"] for _ in [0] if rule.get("views_threshold") is not None]
            checks += [metric.get("replies") is not None and metric["replies"] >= rule["replies_threshold"] for _ in [0] if rule.get("replies_threshold") is not None]
            matched = bool(checks) and (all(checks) if rule["condition_mode"] == "all" else any(checks))
            if matched: self.db.create_job("affiliate_comment", "Đăng comment affiliate", {"rule_id":rule["id"]}, 1)

    async def run(self, job: dict[str, Any]) -> None:
        try:
            if job["kind"] == "compose": await self.compose(job)
            elif job["kind"] == "publish": await self.publish(job)
            elif job["kind"] == "affiliate_comment": await self.comment(job)
            elif job["kind"] == "scan": await self.scan(job)
            else: raise RuntimeError("Loại công việc không hỗ trợ.")
        except JobStopped:
            self.db.event(job["id"], "warning", "Đã dừng", "Công việc dừng tại checkpoint an toàn.")
        except asyncio.CancelledError: raise
        except Exception as exc:
            message = redact(str(exc)); self.db.update_job(job["id"],status="failed",step="Thất bại",error=message,finished_at=now())
            self.db.event(job["id"],"error","Thất bại",message)

    async def checkpoint(self, job: dict[str, Any]) -> None:
        while True:
            current = self.db.get_job(job["id"])
            if not current or current["status"] == "stopped": raise JobStopped()
            if current["status"] != "paused": return
            await asyncio.sleep(.5)

    def progress(self, job: dict[str, Any], step: str, processed: int = 0, success: int = 0, failed: int = 0, message: str = "") -> None:
        lease = (datetime.now(timezone.utc) + timedelta(seconds=60)).isoformat()
        self.db.update_job(job["id"],step=step,processed_items=processed,success_items=success,failed_items=failed,lease_until=lease)
        self.db.event(job["id"],"info",step,message or step,{"processed":processed,"total":job.get("total_items")})

    def complete(self, job: dict[str, Any], message: str = "Hoàn tất") -> None:
        self.db.update_job(job["id"],status="completed",step="Hoàn tất",processed_items=job.get("total_items") or job.get("processed_items",0),finished_at=now())
        self.db.event(job["id"],"info","Hoàn tất",message)

    async def compose(self, job: dict[str, Any]) -> None:
        payload = job["payload"]; trend = self.db.trend(payload["trend_id"])
        account = self.db.account(payload["account_id"])
        if not trend or not account: raise RuntimeError("Không tìm thấy trend hoặc tài khoản.")
        self.progress(job,"Đọc nguồn",0,message="Đang đọc trend đã chọn")
        await asyncio.sleep(.1)
        summary = trend["summary"].strip() or trend["title"]
        angles = [f"Điều mọi người thật sự muốn kể về: {trend['title']}", f"Một góc nhìn gần với người đọc của {account['name']}: {trend['title']}", f"Câu chuyện phía sau {trend['title']} mà cộng đồng có thể chia sẻ"]
        self.progress(job,"Chọn góc",1,message="Đã tạo ba góc thảo luận")
        for index, angle in enumerate(angles, 1):
            await self.checkpoint(job)
            caption = f"{summary}\n\n{angle}. Mọi người từng gặp chuyện này chưa?"
            self.db.save_draft({"account_id":account["id"],"trend_id":trend["id"],"title":trend["title"],"angle":angle,"caption":caption,"media_url":"","evidence_hint":f"Nếu cần chứng minh, chụp đúng nguồn: {trend['source_url'] or 'chưa có link nguồn'}"})
            self.progress(job,"Soạn nội dung",index,message=f"Đã lưu nháp {index}/3")
        with self.db.connect() as con: con.execute("UPDATE trends SET used_at=?,updated_at=? WHERE id=?",(now(),now(),trend["id"]))
        self.complete(job,"Đã tạo 3 nháp để bạn chỉnh và duyệt.")

    async def scan(self, job: dict[str, Any]) -> None:
        source = self.db.one("SELECT * FROM sources WHERE kind=?",(job["payload"]["source"],))
        if not source: raise RuntimeError("Không tìm thấy nguồn.")
        if source["kind"] != "threads":
            raise RuntimeError(f"Nguồn {source['kind']} chưa có adapter API được kết nối. Hãy nhập link/trend thủ công hoặc cấu hình adapter.")
        keywords = source.get("keywords") or []
        account = next((item for item in self.db.accounts() if item["oauth_status"] == "connected"), None)
        if not keywords: raise RuntimeError("Nguồn Threads chưa có từ khóa để quét.")
        if not account: raise RuntimeError("Cần ít nhất một account Threads đã kết nối OAuth.")
        self.db.update_job(job["id"], total_items=len(keywords))
        created = 0
        for index, keyword in enumerate(keywords, 1):
            await self.checkpoint(job)
            self.progress(job, "Thu thập", index - 1, message=f"Đang tìm: {keyword}")
            rows = await self.threads.keyword_search(account, keyword)
            for item in rows:
                text = str(item.get("text") or "").strip()
                if not text: continue
                title = text.splitlines()[0][:180]
                self.db.save_trend({"title":title,"summary":text[:3000],"source":"threads","source_market":"Vietnam","source_url":str(item.get("permalink") or ""),"evidence_note":f"Threads keyword: {keyword}","account_id":None})
                created += 1
            self.progress(job, "Gom chủ đề", index, success=index, message=f"Đã đọc {len(rows)} bài cho: {keyword}")
        with self.db.connect() as con: con.execute("UPDATE sources SET connection_status='api',last_checked_at=?,last_error='',updated_at=? WHERE kind='threads'",(now(),now()))
        self.complete(job, f"Đã lưu {created} tín hiệu Threads để xem và gom thủ công.")

    async def publish(self, job: dict[str, Any]) -> None:
        post = self.db.post(job["payload"]["post_id"])
        if not post: raise RuntimeError("Không tìm thấy bài cần đăng.")
        draft, account = self.db.draft(post["draft_id"]), self.db.account(post["account_id"])
        if not draft or not account: raise RuntimeError("Thiếu nội dung hoặc tài khoản.")
        if account["paused"]: raise RuntimeError("Tài khoản đang tạm dừng.")
        self.progress(job,"Kiểm tra tài khoản",0,message=f"Đang kiểm tra @{account['username'] or account['name']}")
        await self.checkpoint(job)
        with self.db.connect() as con:
            claimed = con.execute("UPDATE posts SET status='publishing',publish_lock=1,updated_at=? WHERE id=? AND status='scheduled' AND publish_lock=0",(now(),post["id"])).rowcount
        if not claimed: raise RuntimeError("Bài đã được xử lý hoặc đang được gửi.")
        self.progress(job,"Gửi đăng",0,message="Đã gửi yêu cầu đến Threads")
        result = await self.threads.publish_text(account, draft)
        external = result.get("id", "")
        with self.db.connect() as con:
            con.execute("UPDATE posts SET status='published',external_post_id=?,publish_container_id=?,published_at=?,updated_at=? WHERE id=?",(external,result.get("container_id",""),now(),now(),post["id"]))
            con.execute("UPDATE drafts SET status='published',updated_at=? WHERE id=?",(now(),draft["id"]))
        self.progress(job,"Xác nhận kết quả",1,1,message="Threads đã trả ID bài đăng")
        self.complete(job,"Đã đăng bài.")

    async def comment(self, job: dict[str, Any]) -> None:
        rule = self.db.rule(job["payload"]["rule_id"])
        if not rule: raise RuntimeError("Không tìm thấy rule affiliate.")
        if rule["state"] not in {"armed","watching"}: self.complete(job,"Rule không còn chờ kích hoạt."); return
        with self.db.connect() as con:
            claimed=con.execute("UPDATE affiliate_rules SET state='claiming',claimed_at=?,updated_at=? WHERE id=? AND state IN ('armed','watching')",(now(),now(),rule["id"])).rowcount
        if not claimed: self.complete(job,"Rule đã được xử lý."); return
        post = self.db.post(rule["post_id"])
        account = self.db.account(post["account_id"]) if post else None
        if not post or not account or post["status"] != "published" or not post["external_post_id"]:
            with self.db.connect() as con: con.execute("UPDATE affiliate_rules SET state='needs_review',updated_at=? WHERE id=?",(now(),rule["id"]))
            raise RuntimeError("Không có Threads post ID đã xác nhận để gửi comment affiliate.")
        self.progress(job,"Đang comment",0,message="Đang gửi comment đã duyệt đến Threads")
        await self.checkpoint(job)
        result = await self.threads.publish_reply(account, post["external_post_id"], rule["comment_text"])
        with self.db.connect() as con: con.execute("UPDATE affiliate_rules SET state='posted',comment_external_id=?,updated_at=? WHERE id=?",(result.get("id",""),now(),rule["id"]))
        self.progress(job,"Đã xác nhận",1,1,message="Threads đã trả ID comment affiliate")
        self.complete(job,"Đã đăng comment affiliate.")

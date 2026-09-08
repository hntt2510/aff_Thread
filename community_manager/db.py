from __future__ import annotations

import json
import sqlite3
import uuid
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Iterator


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def uid() -> str:
    return str(uuid.uuid4())


SCHEMA = """
CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS accounts (
 id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, username TEXT NOT NULL DEFAULT '', niche TEXT NOT NULL DEFAULT '', audience TEXT NOT NULL DEFAULT '', voice TEXT NOT NULL DEFAULT '', real_context TEXT NOT NULL DEFAULT '', preferred_topics TEXT NOT NULL DEFAULT '[]', avoided_topics TEXT NOT NULL DEFAULT '[]', daily_post_limit INTEGER NOT NULL DEFAULT 2, min_post_gap_minutes INTEGER NOT NULL DEFAULT 120, default_view_threshold INTEGER, default_reply_threshold INTEGER, oauth_status TEXT NOT NULL DEFAULT 'not_connected', token_ref TEXT NOT NULL DEFAULT '', token_expiry TEXT, scopes TEXT NOT NULL DEFAULT '[]', paused INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS oauth_states (
 state TEXT PRIMARY KEY, account_id TEXT NOT NULL, expires_at TEXT NOT NULL, consumed_at TEXT, created_at TEXT NOT NULL,
 FOREIGN KEY(account_id) REFERENCES accounts(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS personas (id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, niche TEXT NOT NULL, voice TEXT NOT NULL, description TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sources (
 id TEXT PRIMARY KEY, kind TEXT NOT NULL UNIQUE, keywords TEXT NOT NULL DEFAULT '[]', enabled INTEGER NOT NULL DEFAULT 1, connection_status TEXT NOT NULL DEFAULT 'not_connected', last_checked_at TEXT, last_error TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS trends (
 id TEXT PRIMARY KEY, title TEXT NOT NULL, summary TEXT NOT NULL DEFAULT '', source TEXT NOT NULL, source_market TEXT NOT NULL DEFAULT '', source_url TEXT NOT NULL DEFAULT '', evidence_note TEXT NOT NULL DEFAULT '', fit_label TEXT NOT NULL DEFAULT 'Cần xem', lifecycle TEXT NOT NULL DEFAULT 'Mới phát hiện', saved INTEGER NOT NULL DEFAULT 0, used_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS trend_accounts (trend_id TEXT NOT NULL, account_id TEXT NOT NULL, PRIMARY KEY(trend_id, account_id), FOREIGN KEY(trend_id) REFERENCES trends(id) ON DELETE CASCADE, FOREIGN KEY(account_id) REFERENCES accounts(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS drafts (
 id TEXT PRIMARY KEY, account_id TEXT NOT NULL, trend_id TEXT, title TEXT NOT NULL DEFAULT '', angle TEXT NOT NULL DEFAULT '', caption TEXT NOT NULL DEFAULT '', media_url TEXT NOT NULL DEFAULT '', evidence_hint TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'draft', approved_revision INTEGER, scheduled_for TEXT, published_post_id TEXT NOT NULL DEFAULT '', published_permalink TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL, FOREIGN KEY(account_id) REFERENCES accounts(id), FOREIGN KEY(trend_id) REFERENCES trends(id)
);
CREATE TABLE IF NOT EXISTS draft_revisions (id TEXT PRIMARY KEY, draft_id TEXT NOT NULL, revision INTEGER NOT NULL, angle TEXT NOT NULL, caption TEXT NOT NULL, media_url TEXT NOT NULL DEFAULT '', evidence_hint TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, UNIQUE(draft_id, revision), FOREIGN KEY(draft_id) REFERENCES drafts(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS posts (
 id TEXT PRIMARY KEY, draft_id TEXT NOT NULL UNIQUE, account_id TEXT NOT NULL, external_post_id TEXT NOT NULL DEFAULT '', permalink TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'scheduled', scheduled_for TEXT, published_at TEXT, publish_container_id TEXT NOT NULL DEFAULT '', publish_lock INTEGER NOT NULL DEFAULT 0, last_error TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL, FOREIGN KEY(draft_id) REFERENCES drafts(id), FOREIGN KEY(account_id) REFERENCES accounts(id)
);
CREATE TABLE IF NOT EXISTS metrics (id TEXT PRIMARY KEY, post_id TEXT NOT NULL, views INTEGER, likes INTEGER, replies INTEGER, quotes INTEGER, reposts INTEGER, shares INTEGER, observed_at TEXT NOT NULL, source TEXT NOT NULL DEFAULT 'manual', FOREIGN KEY(post_id) REFERENCES posts(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS replies (id TEXT PRIMARY KEY, post_id TEXT NOT NULL, source_reply_id TEXT NOT NULL DEFAULT '', author TEXT NOT NULL DEFAULT '', text TEXT NOT NULL, handled INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, UNIQUE(post_id, source_reply_id), FOREIGN KEY(post_id) REFERENCES posts(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS affiliate_rules (id TEXT PRIMARY KEY, post_id TEXT NOT NULL, product_name TEXT NOT NULL, affiliate_url TEXT NOT NULL, comment_text TEXT NOT NULL, views_threshold INTEGER, replies_threshold INTEGER, condition_mode TEXT NOT NULL DEFAULT 'all', expires_at TEXT, active INTEGER NOT NULL DEFAULT 0, state TEXT NOT NULL DEFAULT 'draft', claimed_at TEXT, comment_external_id TEXT NOT NULL DEFAULT '', comment_permalink TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL, FOREIGN KEY(post_id) REFERENCES posts(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, kind TEXT NOT NULL, title TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'queued', step TEXT NOT NULL DEFAULT 'Đang chờ', payload TEXT NOT NULL DEFAULT '{}', total_items INTEGER, processed_items INTEGER NOT NULL DEFAULT 0, success_items INTEGER NOT NULL DEFAULT 0, failed_items INTEGER NOT NULL DEFAULT 0, skipped_items INTEGER NOT NULL DEFAULT 0, checkpoint TEXT NOT NULL DEFAULT '{}', error TEXT NOT NULL DEFAULT '', lease_owner TEXT NOT NULL DEFAULT '', lease_until TEXT, created_at TEXT NOT NULL, started_at TEXT, finished_at TEXT, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS job_events (id INTEGER PRIMARY KEY AUTOINCREMENT, job_id TEXT, level TEXT NOT NULL, step TEXT NOT NULL, message TEXT NOT NULL, details TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL, FOREIGN KEY(job_id) REFERENCES jobs(id) ON DELETE CASCADE);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status, created_at);
CREATE INDEX IF NOT EXISTS idx_events_job ON job_events(job_id, id);
CREATE INDEX IF NOT EXISTS idx_posts_schedule ON posts(status, scheduled_for);
CREATE INDEX IF NOT EXISTS idx_oauth_states_expiry ON oauth_states(expires_at);
"""


class Database:
    def __init__(self, path: Path): self.path = path

    @contextmanager
    def connect(self) -> Iterator[sqlite3.Connection]:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        con = sqlite3.connect(self.path, timeout=30)
        con.row_factory = sqlite3.Row
        con.execute("PRAGMA foreign_keys = ON")
        con.execute("PRAGMA journal_mode = WAL")
        try:
            yield con
            con.commit()
        except Exception:
            con.rollback(); raise
        finally: con.close()

    def initialize(self) -> None:
        with self.connect() as con:
            con.executescript(SCHEMA)
            con.execute("INSERT OR IGNORE INTO schema_migrations VALUES(1, ?)", (now(),))
            for kind in ("threads", "tiktok_vn", "douyin", "bilibili"):
                con.execute("INSERT OR IGNORE INTO sources(id,kind,created_at,updated_at) VALUES(?,?,?,?)", (uid(), kind, now(), now()))
            seeds = [
                ("CHẮC GÌ BẠN ĐÃ BIẾT", "Đời sống, công việc, công nghệ, xã hội", "Gen Z gần gũi, có quan điểm", "Mở thảo luận từ điều nhiều người gặp."),
                ("GU CỦA NÀNG", "Beauty, skincare, outfit, thẩm mỹ", "Mềm, gần gũi, hơi lầy", "Chia sẻ routine và trải nghiệm, không viết như quảng cáo."),
                ("LỐI SỐNG KHỎE", "Thói quen, ngủ, ăn, vận động, stress", "Người thật đang thử sống tốt hơn", "Không đưa kết luận y khoa khi thiếu nguồn."),
                ("NHẬT KÝ GÓC AN YÊN", "Cozy, cảm xúc đời thường, sống chậm", "Bình yên, ít chữ", "Ưu tiên khoảnh khắc và kể chuyện nhỏ."),
            ]
            for name, niche, voice, description in seeds:
                con.execute("INSERT OR IGNORE INTO personas(id,name,niche,voice,description,created_at,updated_at) VALUES(?,?,?,?,?,?,?)",(uid(),name,niche,voice,description,now(),now()))

    @staticmethod
    def row(row: sqlite3.Row | None) -> dict[str, Any] | None:
        if row is None: return None
        item = dict(row)
        for key in ("preferred_topics", "avoided_topics", "keywords", "scopes", "payload", "checkpoint", "details"):
            if key in item:
                try: item[key] = json.loads(item[key] or "[]")
                except json.JSONDecodeError: item[key] = []
        for key in ("paused", "enabled", "saved", "active"):
            if key in item: item[key] = bool(item[key])
        return item

    def rows(self, sql: str, params: tuple[Any, ...] = ()) -> list[dict[str, Any]]:
        with self.connect() as con: return [self.row(row) or {} for row in con.execute(sql, params).fetchall()]
    def one(self, sql: str, params: tuple[Any, ...] = ()) -> dict[str, Any] | None:
        with self.connect() as con: return self.row(con.execute(sql, params).fetchone())

    def event(self, job_id: str | None, level: str, step: str, message: str, details: dict[str, Any] | None = None) -> int:
        with self.connect() as con:
            cur = con.execute("INSERT INTO job_events(job_id,level,step,message,details,created_at) VALUES(?,?,?,?,?,?)", (job_id,level,step,message,json.dumps(details or {},ensure_ascii=False),now()))
            return int(cur.lastrowid)

    def create_job(self, kind: str, title: str, payload: dict[str, Any], total: int | None = None) -> dict[str, Any]:
        job_id, stamp = uid(), now()
        with self.connect() as con:
            con.execute("INSERT INTO jobs(id,kind,title,payload,total_items,created_at,updated_at) VALUES(?,?,?,?,?,?,?)", (job_id,kind,title,json.dumps(payload,ensure_ascii=False),total,stamp,stamp))
            con.execute("INSERT INTO job_events(job_id,level,step,message,created_at) VALUES(?,?,?,?,?)", (job_id,"info","Đang chờ","Đã đưa vào hàng chờ",stamp))
        return self.get_job(job_id) or {}

    def get_job(self, job_id: str) -> dict[str, Any] | None: return self.one("SELECT * FROM jobs WHERE id=?", (job_id,))
    def jobs(self, limit: int = 100) -> list[dict[str, Any]]: return self.rows("SELECT * FROM jobs ORDER BY created_at DESC LIMIT ?", (limit,))
    def job_events(self, job_id: str | None = None, after: int = 0, limit: int = 300) -> list[dict[str, Any]]:
        if job_id: return self.rows("SELECT * FROM job_events WHERE job_id=? AND id>? ORDER BY id LIMIT ?", (job_id,after,limit))
        return self.rows("SELECT * FROM job_events WHERE id>? ORDER BY id LIMIT ?", (after,limit))

    def update_job(self, job_id: str, **values: Any) -> None:
        values["updated_at"] = now()
        keys = list(values); params = [json.dumps(values[k],ensure_ascii=False) if k in {"payload","checkpoint"} and isinstance(values[k],dict) else values[k] for k in keys]
        with self.connect() as con: con.execute(f"UPDATE jobs SET {','.join(f'{k}=?' for k in keys)} WHERE id=?", (*params,job_id))

    def claim_job(self, worker: str) -> dict[str, Any] | None:
        with self.connect() as con:
            row = con.execute("SELECT id FROM jobs WHERE status='queued' ORDER BY created_at LIMIT 1").fetchone()
            if not row: return None
            stamp = now(); lease = (datetime.now(timezone.utc) + timedelta(seconds=60)).isoformat(); cur = con.execute("UPDATE jobs SET status='running',step='Đang bắt đầu',lease_owner=?,lease_until=?,started_at=COALESCE(started_at,?),updated_at=? WHERE id=? AND status='queued'", (worker,lease,stamp,stamp,row["id"]))
            if not cur.rowcount: return None
            con.execute("INSERT INTO job_events(job_id,level,step,message,created_at) VALUES(?,?,?,?,?)",(row["id"],"info","Đang bắt đầu","Worker đã nhận công việc",stamp))
        return self.get_job(row["id"])

    def account(self, account_id: str) -> dict[str, Any] | None: return self.one("SELECT * FROM accounts WHERE id=?", (account_id,))
    def accounts(self) -> list[dict[str, Any]]: return self.rows("SELECT * FROM accounts ORDER BY name")
    def personas(self) -> list[dict[str, Any]]: return self.rows("SELECT * FROM personas ORDER BY name")
    def create_oauth_state(self, account_id: str, state: str, expires_at: str) -> None:
        with self.connect() as con:
            con.execute("DELETE FROM oauth_states WHERE expires_at<? OR account_id=?", (now(), account_id))
            con.execute("INSERT INTO oauth_states(state,account_id,expires_at,created_at) VALUES(?,?,?,?)", (state, account_id, expires_at, now()))
    def consume_oauth_state(self, state: str) -> dict[str, Any] | None:
        # Claiming the state in the same transaction prevents callback replay.
        with self.connect() as con:
            row = con.execute("SELECT * FROM oauth_states WHERE state=? AND consumed_at IS NULL AND expires_at>?", (state, now())).fetchone()
            if not row: return None
            con.execute("UPDATE oauth_states SET consumed_at=? WHERE state=? AND consumed_at IS NULL", (now(), state))
            return self.row(row)
    def save_account(self, data: dict[str, Any], account_id: str | None = None) -> dict[str, Any]:
        stamp = now(); account_id = account_id or uid(); columns = ["name","username","niche","audience","voice","real_context","preferred_topics","avoided_topics","daily_post_limit","min_post_gap_minutes","default_view_threshold","default_reply_threshold"]
        values = [json.dumps(data[x],ensure_ascii=False) if x in {"preferred_topics","avoided_topics"} else data[x] for x in columns]
        with self.connect() as con:
            if self.account(account_id): con.execute(f"UPDATE accounts SET {','.join(f'{x}=?' for x in columns)},updated_at=? WHERE id=?", (*values,stamp,account_id))
            else: con.execute(f"INSERT INTO accounts(id,{','.join(columns)},created_at,updated_at) VALUES(?,{','.join('?' for _ in columns)},?,?)",(account_id,*values,stamp,stamp))
        return self.account(account_id) or {}

    def save_trend(self, data: dict[str, Any]) -> dict[str, Any]:
        trend_id, stamp = uid(), now()
        with self.connect() as con:
            con.execute("INSERT INTO trends(id,title,summary,source,source_market,source_url,evidence_note,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)", (trend_id,data["title"],data["summary"],data["source"],data["source_market"],data["source_url"],data["evidence_note"],stamp,stamp))
            if data.get("account_id"): con.execute("INSERT INTO trend_accounts(trend_id,account_id) VALUES(?,?)", (trend_id,data["account_id"]))
        return self.trend(trend_id) or {}

    def trend(self, trend_id: str) -> dict[str, Any] | None:
        value = self.one("SELECT * FROM trends WHERE id=?", (trend_id,))
        if value: value["account_ids"] = [x["account_id"] for x in self.rows("SELECT account_id FROM trend_accounts WHERE trend_id=?", (trend_id,))]
        return value
    def trends(self, source: str = "", account_id: str = "", saved: str = "") -> list[dict[str, Any]]:
        sql, params = "SELECT DISTINCT t.* FROM trends t", []
        if account_id: sql += " JOIN trend_accounts ta ON ta.trend_id=t.id"
        clauses = []
        if source: clauses.append("t.source=?"); params.append(source)
        if account_id: clauses.append("ta.account_id=?"); params.append(account_id)
        if saved in {"true","false"}: clauses.append("t.saved=?"); params.append(int(saved == "true"))
        if clauses: sql += " WHERE " + " AND ".join(clauses)
        sql += " ORDER BY t.updated_at DESC"
        return [self.trend(x["id"]) or {} for x in self.rows(sql, tuple(params))]
    def set_trend_saved(self, trend_id: str, saved: bool) -> dict[str, Any] | None:
        with self.connect() as con: con.execute("UPDATE trends SET saved=?,updated_at=? WHERE id=?", (int(saved),now(),trend_id))
        return self.trend(trend_id)

    def save_draft(self, data: dict[str, Any], draft_id: str | None = None) -> dict[str, Any]:
        draft_id, stamp = draft_id or uid(), now()
        columns = ["account_id","trend_id","title","angle","caption","media_url","evidence_hint"]
        values = [data.get(x, "") for x in columns]
        with self.connect() as con:
            existing = con.execute("SELECT status FROM drafts WHERE id=?", (draft_id,)).fetchone()
            if existing:
                con.execute(f"UPDATE drafts SET {','.join(f'{x}=?' for x in columns)},status=CASE WHEN status IN ('scheduled','published') THEN 'draft' ELSE status END,scheduled_for=NULL,updated_at=? WHERE id=?", (*values,stamp,draft_id))
            else:
                con.execute(f"INSERT INTO drafts(id,{','.join(columns)},created_at,updated_at) VALUES(?,{','.join('?' for _ in columns)},?,?)",(draft_id,*values,stamp,stamp))
            revision = con.execute("SELECT COALESCE(MAX(revision),0)+1 value FROM draft_revisions WHERE draft_id=?",(draft_id,)).fetchone()["value"]
            con.execute("INSERT INTO draft_revisions(id,draft_id,revision,angle,caption,media_url,evidence_hint,created_at) VALUES(?,?,?,?,?,?,?,?)", (uid(),draft_id,revision,data.get("angle", ""),data.get("caption", ""),data.get("media_url", ""),data.get("evidence_hint", ""),stamp))
        return self.draft(draft_id) or {}
    def draft(self, draft_id: str) -> dict[str, Any] | None: return self.one("SELECT * FROM drafts WHERE id=?", (draft_id,))
    def drafts(self) -> list[dict[str, Any]]: return self.rows("SELECT d.*,a.name account_name,t.title trend_title FROM drafts d JOIN accounts a ON a.id=d.account_id LEFT JOIN trends t ON t.id=d.trend_id ORDER BY d.updated_at DESC")
    def revisions(self, draft_id: str) -> list[dict[str, Any]]: return self.rows("SELECT * FROM draft_revisions WHERE draft_id=? ORDER BY revision DESC",(draft_id,))
    def schedule_draft(self, draft_id: str, scheduled_for: str) -> dict[str, Any] | None:
        draft = self.draft(draft_id)
        if not draft: return None
        revision = self.one("SELECT revision FROM draft_revisions WHERE draft_id=? ORDER BY revision DESC LIMIT 1",(draft_id,))
        post_id, stamp = uid(), now()
        with self.connect() as con:
            con.execute("UPDATE drafts SET status='scheduled',scheduled_for=?,approved_revision=?,updated_at=? WHERE id=?",(scheduled_for,(revision or {}).get("revision"),stamp,draft_id))
            con.execute("INSERT INTO posts(id,draft_id,account_id,status,scheduled_for,created_at,updated_at) VALUES(?,?,?,'scheduled',?,?,?) ON CONFLICT(draft_id) DO UPDATE SET status='scheduled',scheduled_for=excluded.scheduled_for,updated_at=excluded.updated_at", (post_id,draft_id,draft["account_id"],scheduled_for,stamp,stamp))
        return self.post_for_draft(draft_id)
    def post_for_draft(self, draft_id: str) -> dict[str, Any] | None: return self.one("SELECT * FROM posts WHERE draft_id=?",(draft_id,))
    def post(self, post_id: str) -> dict[str, Any] | None: return self.one("SELECT * FROM posts WHERE id=?",(post_id,))
    def posts(self) -> list[dict[str, Any]]:
        rows = self.rows("SELECT p.*,d.title,d.caption,d.angle,a.name account_name FROM posts p JOIN drafts d ON d.id=p.draft_id JOIN accounts a ON a.id=p.account_id ORDER BY COALESCE(p.published_at,p.scheduled_for,p.created_at) DESC")
        for item in rows:
            item["latest_metric"] = self.latest_metric(item["id"])
            item["reply_count"] = int((self.one("SELECT COUNT(*) count FROM replies WHERE post_id=?",(item["id"],)) or {"count":0})["count"])
            item["affiliate_rules"] = self.rules(item["id"])
        return rows

    def add_metric(self, post_id: str, data: dict[str, Any], source: str = "manual") -> dict[str, Any]:
        metric_id = uid(); observed = data.get("observed_at") or now()
        with self.connect() as con: con.execute("INSERT INTO metrics(id,post_id,views,likes,replies,quotes,reposts,shares,observed_at,source) VALUES(?,?,?,?,?,?,?,?,?,?)",(metric_id,post_id,data.get("views"),data.get("likes"),data.get("replies"),data.get("quotes"),data.get("reposts"),data.get("shares"),observed,source))
        return self.one("SELECT * FROM metrics WHERE id=?",(metric_id,)) or {}
    def latest_metric(self, post_id: str) -> dict[str, Any] | None: return self.one("SELECT * FROM metrics WHERE post_id=? ORDER BY observed_at DESC LIMIT 1",(post_id,))
    def add_reply(self, post_id: str, data: dict[str, Any]) -> dict[str, Any]:
        reply_id, stamp = uid(), now()
        with self.connect() as con: con.execute("INSERT OR IGNORE INTO replies(id,post_id,source_reply_id,author,text,created_at) VALUES(?,?,?,?,?,?)",(reply_id,post_id,data.get("source_reply_id") or reply_id,data.get("author",""),data["text"],stamp))
        return self.one("SELECT * FROM replies WHERE id=?",(reply_id,)) or {}
    def replies(self, post_id: str) -> list[dict[str, Any]]: return self.rows("SELECT * FROM replies WHERE post_id=? ORDER BY created_at DESC",(post_id,))

    def rule(self, rule_id: str) -> dict[str, Any] | None: return self.one("SELECT * FROM affiliate_rules WHERE id=?",(rule_id,))
    def rules(self, post_id: str = "") -> list[dict[str, Any]]:
        return self.rows("SELECT r.*,p.permalink,d.title FROM affiliate_rules r JOIN posts p ON p.id=r.post_id JOIN drafts d ON d.id=p.draft_id " + ("WHERE r.post_id=? " if post_id else "") + "ORDER BY r.created_at DESC", (post_id,) if post_id else ())
    def save_rule(self, post_id: str, data: dict[str, Any], rule_id: str | None = None) -> dict[str, Any]:
        rule_id, stamp = rule_id or uid(), now(); cols=["product_name","affiliate_url","comment_text","views_threshold","replies_threshold","condition_mode","expires_at","active"]
        vals=[int(data[x]) if x=="active" else data[x] for x in cols]
        with self.connect() as con:
            if self.rule(rule_id): con.execute(f"UPDATE affiliate_rules SET {','.join(f'{x}=?' for x in cols)},state='armed',claimed_at=NULL,updated_at=? WHERE id=?",(*vals,stamp,rule_id))
            else: con.execute(f"INSERT INTO affiliate_rules(id,post_id,{','.join(cols)},state,created_at,updated_at) VALUES(?,?,{','.join('?' for _ in cols)},'armed',?,?)",(rule_id,post_id,*vals,stamp,stamp))
        return self.rule(rule_id) or {}

from pathlib import Path

from community_manager.db import Database


def account_payload(name: str = "Hub"):
    return {"name":name,"username":"hub","niche":"life","audience":"vn","voice":"near","real_context":"","preferred_topics":[],"avoided_topics":[],"daily_post_limit":2,"min_post_gap_minutes":120,"default_view_threshold":None,"default_reply_threshold":None}


def test_trend_draft_schedule_and_revision(tmp_path: Path):
    db = Database(tmp_path / "manager.db"); db.initialize()
    account = db.save_account(account_payload())
    trend = db.save_trend({"title":"Một chủ đề đang bàn","summary":"Nhiều người có trải nghiệm","source":"manual","source_market":"Vietnam","source_url":"","evidence_note":"","account_id":account["id"]})
    draft = db.save_draft({"account_id":account["id"],"trend_id":trend["id"],"title":trend["title"],"angle":"Góc trải nghiệm","caption":"Caption 1","media_url":"","evidence_hint":""})
    changed = db.save_draft({**draft,"caption":"Caption 2"},draft["id"])
    assert changed["caption"] == "Caption 2"
    assert len(db.revisions(draft["id"])) == 2
    post = db.schedule_draft(draft["id"],"2026-12-01T01:00:00+00:00")
    assert post and post["status"] == "scheduled"


def test_jobs_and_events_are_persistent(tmp_path: Path):
    db = Database(tmp_path / "manager.db"); db.initialize()
    job = db.create_job("compose","Soạn bài",{"trend_id":"x"},3)
    claimed = db.claim_job("test-worker")
    assert claimed and claimed["id"] == job["id"] and claimed["status"] == "running"
    db.update_job(job["id"],processed_items=2,step="Soạn nội dung")
    db.event(job["id"],"info","Soạn nội dung","Đã lưu nháp 2/3")
    assert db.get_job(job["id"])["processed_items"] == 2
    assert any(x["message"] == "Đã lưu nháp 2/3" for x in db.job_events(job["id"]))

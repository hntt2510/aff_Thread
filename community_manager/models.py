from __future__ import annotations

from pydantic import BaseModel, Field

class AccountInput(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    username: str = Field(default="", max_length=80)
    niche: str = Field(default="", max_length=300)
    audience: str = Field(default="", max_length=300)
    voice: str = Field(default="", max_length=500)
    real_context: str = Field(default="", max_length=3000)
    preferred_topics: list[str] = Field(default_factory=list)
    avoided_topics: list[str] = Field(default_factory=list)
    daily_post_limit: int = Field(default=2, ge=1, le=20)
    min_post_gap_minutes: int = Field(default=120, ge=15, le=1440)
    default_view_threshold: int | None = Field(default=None, ge=0)
    default_reply_threshold: int | None = Field(default=None, ge=0)

class TrendInput(BaseModel):
    title: str = Field(min_length=3, max_length=300)
    summary: str = Field(default="", max_length=4000)
    source: str = Field(default="manual", pattern="^(manual|threads|tiktok_vn|douyin|bilibili)$")
    source_market: str = Field(default="Vietnam", max_length=80)
    source_url: str = Field(default="", max_length=2000)
    evidence_note: str = Field(default="", max_length=3000)
    account_id: str | None = None

class DraftInput(BaseModel):
    account_id: str
    trend_id: str | None = None
    title: str = Field(default="", max_length=300)
    angle: str = Field(default="", max_length=1000)
    caption: str = Field(default="", max_length=3000)
    media_url: str = Field(default="", max_length=2000)
    evidence_hint: str = Field(default="", max_length=2000)

class DraftUpdate(BaseModel):
    angle: str | None = Field(default=None, max_length=1000)
    caption: str | None = Field(default=None, max_length=3000)
    media_url: str | None = Field(default=None, max_length=2000)
    evidence_hint: str | None = Field(default=None, max_length=2000)

class ScheduleInput(BaseModel):
    scheduled_for: str

class AffiliateRuleInput(BaseModel):
    product_name: str = Field(min_length=1, max_length=300)
    affiliate_url: str = Field(min_length=8, max_length=2000)
    comment_text: str = Field(min_length=3, max_length=2000)
    views_threshold: int | None = Field(default=None, ge=0)
    replies_threshold: int | None = Field(default=None, ge=0)
    condition_mode: str = Field(default="all", pattern="^(all|any)$")
    expires_at: str | None = None
    active: bool = False

class MetricInput(BaseModel):
    views: int | None = Field(default=None, ge=0)
    likes: int | None = Field(default=None, ge=0)
    replies: int | None = Field(default=None, ge=0)
    quotes: int | None = Field(default=None, ge=0)
    reposts: int | None = Field(default=None, ge=0)
    shares: int | None = Field(default=None, ge=0)
    observed_at: str | None = None

class ReplyInput(BaseModel):
    author: str = Field(default="", max_length=100)
    text: str = Field(min_length=1, max_length=3000)
    source_reply_id: str = Field(default="", max_length=200)

class SourceInput(BaseModel):
    kind: str = Field(pattern="^(threads|tiktok_vn|douyin|bilibili)$")
    keywords: list[str] = Field(default_factory=list)
    enabled: bool = True


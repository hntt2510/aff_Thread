"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import {
  History,
  Send,
  Calendar,
  AlertTriangle,
  RefreshCw,
  Clock,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  Plus,
  Play,
  XCircle,
  RotateCw,
  CheckCircle2,
} from "lucide-react";
import type { PostWithAccount } from "@/services/post.service";
import { formatInTimezone, parseLocalDateTimeToUtc, DEFAULT_TIMEZONE } from "@/lib/date/timezone";
import { PostStatus } from "@/lib/posts/lifecycle";

const TABS: { label: string; value: string }[] = [
  { label: "All", value: "ALL" },
  { label: "Scheduled", value: "SCHEDULED" },
  { label: "Published", value: "PUBLISHED" },
  { label: "Failed", value: "FAILED" },
  { label: "Cancelled", value: "CANCELLED" },
  { label: "Draft", value: "DRAFT" },
];

function PostsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialStatus = searchParams.get("status") || "ALL";

  const [activeTab, setActiveTab] = useState<string>(initialStatus);
  const [posts, setPosts] = useState<PostWithAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [expandedPostId, setExpandedPostId] = useState<string | null>(null);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  // Reschedule inline modal state
  const [reschedulingPostId, setReschedulingPostId] = useState<string | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [rescheduleTime, setRescheduleTime] = useState("09:00");

  const fetchPosts = useCallback(async () => {
    try {
      setError(null);
      const url = activeTab === "ALL" ? "/api/posts" : `/api/posts?status=${activeTab}`;
      const res = await fetch(url);
      const data = await res.json();
      if (res.ok && data.posts) {
        setPosts(data.posts);
      } else {
        setError(data.error || "Failed to load posts");
      }
    } catch {
      setError("Network error while loading post history");
    } finally {
      setLoading(false);
    }
  }, [activeTab]);

  useEffect(() => {
    setLoading(true);
    fetchPosts();
  }, [fetchPosts]);

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    if (tab === "ALL") {
      router.push("/posts");
    } else {
      router.push(`/posts?status=${tab}`);
    }
  };

  const handleCancelPost = async (postId: string) => {
    if (!confirm("Are you sure you want to cancel this scheduled post?")) return;

    setActionLoadingId(postId);
    setActionMessage(null);
    setError(null);

    try {
      const res = await fetch(`/api/posts/${postId}/cancel`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to cancel post");
      } else {
        setActionMessage("Post cancelled successfully");
        fetchPosts();
      }
    } catch {
      setError("Network error while cancelling post");
    } finally {
      setActionLoadingId(null);
    }
  };

  const handlePublishNow = async (postId: string) => {
    if (!confirm("Publish this scheduled post immediately to Threads?")) return;

    setActionLoadingId(postId);
    setActionMessage(null);
    setError(null);

    try {
      const res = await fetch(`/api/posts/${postId}/publish-now`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to publish post immediately");
      } else {
        setActionMessage("Post published immediately to Threads!");
        fetchPosts();
      }
    } catch {
      setError("Network error while publishing post");
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleRetryPost = async (postId: string) => {
    setActionLoadingId(postId);
    setActionMessage(null);
    setError(null);

    try {
      const res = await fetch(`/api/posts/${postId}/retry`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Retry attempt failed");
      } else {
        setActionMessage("Post retry initiated successfully!");
        fetchPosts();
      }
    } catch {
      setError("Network error while retrying post");
    } finally {
      setActionLoadingId(null);
    }
  };

  const submitReschedule = async (postId: string) => {
    if (!rescheduleDate || !rescheduleTime) {
      setError("Please provide date and time to reschedule");
      return;
    }

    try {
      const utcDate = parseLocalDateTimeToUtc(rescheduleDate, rescheduleTime, DEFAULT_TIMEZONE);
      if (utcDate.getTime() <= Date.now()) {
        setError("Rescheduled time must be in the future");
        return;
      }

      setActionLoadingId(postId);
      setError(null);

      const res = await fetch(`/api/posts/${postId}/reschedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scheduledAt: utcDate.toISOString() }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to reschedule post");
      } else {
        setActionMessage(`Post rescheduled for ${formatInTimezone(utcDate)}`);
        setReschedulingPostId(null);
        fetchPosts();
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Invalid reschedule format");
    } finally {
      setActionLoadingId(null);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "PUBLISHED":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            Published
          </span>
        );
      case "SCHEDULED":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-sky-50 text-sky-700 border border-sky-200">
            <Clock className="w-3 h-3 text-sky-500" />
            Scheduled
          </span>
        );
      case "PUBLISHING":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-200">
            <RefreshCw className="w-3 h-3 animate-spin text-indigo-500" />
            Publishing
          </span>
        );
      case "CANCELLED":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200">
            <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
            Cancelled
          </span>
        );
      case "DRAFT":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
            Draft
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-rose-50 text-rose-700 border border-rose-200">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
            Failed
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2.5">
            <History className="w-6 h-6 text-slate-900" />
            Post History & Queue
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Audit trail of manual publications, automated queue schedules, and attempt statuses
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              setLoading(true);
              fetchPosts();
            }}
            className="inline-flex items-center gap-2 px-3 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-lg text-sm font-medium transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
          <Link
            href="/create"
            className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-sm font-medium transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" />
            New Post
          </Link>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-1 overflow-x-auto pb-1 border-b border-slate-200">
        {TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => handleTabChange(tab.value)}
            className={`px-4 py-2 text-sm font-medium rounded-lg whitespace-nowrap transition-colors ${
              activeTab === tab.value
                ? "bg-slate-900 text-white"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Feedback Messages */}
      {actionMessage && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-3 text-emerald-800 text-sm">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
          <span>{actionMessage}</span>
        </div>
      )}

      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-3 text-rose-700 text-sm">
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <div className="flex-1">{error}</div>
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center text-slate-400">
          <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-slate-400" />
          Loading posts...
        </div>
      ) : posts.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center shadow-sm">
          <div className="w-12 h-12 bg-slate-100 text-slate-400 rounded-full flex items-center justify-center mx-auto mb-4">
            <Send className="w-6 h-6" />
          </div>
          <h3 className="text-base font-semibold text-slate-900">
            No {activeTab === "ALL" ? "" : activeTab.toLowerCase()} posts found
          </h3>
          <p className="text-sm text-slate-500 max-w-sm mx-auto mt-1 mb-6">
            {activeTab === "SCHEDULED"
              ? "You do not have any pending posts scheduled in the publishing queue."
              : "Create a new text post or schedule delivery to Threads."}
          </p>
          <Link
            href="/create"
            className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            Create Post
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {posts.map((post) => {
            const isExpanded = expandedPostId === post.id;
            const isActionLoading = actionLoadingId === post.id;
            const isRescheduling = reschedulingPostId === post.id;

            return (
              <div
                key={post.id}
                className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm hover:border-slate-300 transition-all space-y-3"
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                  {/* Account Identity */}
                  <div className="flex items-center gap-3">
                    {post.account?.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={post.account.avatarUrl}
                        alt={post.account.username}
                        className="w-10 h-10 rounded-full object-cover border border-slate-200"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center font-bold text-xs text-slate-600">
                        {post.account?.username?.slice(0, 2).toUpperCase() || "??"}
                      </div>
                    )}
                    <div>
                      <div className="font-semibold text-slate-900 text-sm flex items-center gap-1.5">
                        <span>{post.account?.displayName || "Unknown Account"}</span>
                        {post.account?.isDisconnected && (
                          <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-normal border border-slate-200">
                            Disconnected
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-500">
                        @{post.account?.username || "unknown"}
                      </div>
                    </div>
                  </div>

                  {/* Status, Attempts & Timestamps */}
                  <div className="flex flex-wrap items-center gap-2.5">
                    {getStatusBadge(post.status)}

                    {post.publishAttempts > 0 && post.status !== "PUBLISHED" && (
                      <span className="text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-600 font-mono">
                        Attempt {post.publishAttempts}/3
                      </span>
                    )}

                    {post.scheduledAt && post.status === "SCHEDULED" && (
                      <span className="text-xs text-sky-700 bg-sky-50 px-2 py-0.5 rounded border border-sky-200 flex items-center gap-1">
                        <Clock className="w-3 h-3 text-sky-500" />
                        Due: {formatInTimezone(post.scheduledAt)}
                      </span>
                    )}

                    {post.publishedAt && (
                      <span className="text-xs text-slate-400 flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" />
                        {new Date(post.publishedAt).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                          month: "short",
                          day: "numeric",
                        })}
                      </span>
                    )}
                  </div>
                </div>

                {/* Post Text Preview */}
                <p className="text-sm text-slate-800 whitespace-pre-wrap bg-slate-50/70 p-3.5 rounded-lg border border-slate-100 font-normal">
                  {post.text}
                </p>

                {/* Reschedule Inline Form */}
                {isRescheduling && (
                  <div className="p-3 bg-sky-50 border border-sky-200 rounded-lg space-y-2 text-xs">
                    <div className="font-semibold text-sky-900 flex items-center justify-between">
                      <span>Reschedule Post (Asia/Ho_Chi_Minh UTC+7)</span>
                      <button
                        type="button"
                        onClick={() => setReschedulingPostId(null)}
                        className="text-sky-700 hover:text-sky-950 font-bold"
                      >
                        ✕
                      </button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <input
                        type="date"
                        value={rescheduleDate}
                        onChange={(e) => setRescheduleDate(e.target.value)}
                        className="px-2.5 py-1.5 bg-white border border-sky-300 rounded text-xs text-slate-900"
                      />
                      <input
                        type="time"
                        value={rescheduleTime}
                        onChange={(e) => setRescheduleTime(e.target.value)}
                        className="px-2.5 py-1.5 bg-white border border-sky-300 rounded text-xs text-slate-900"
                      />
                    </div>
                    <div className="flex justify-end gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setReschedulingPostId(null)}
                        className="px-3 py-1 bg-white border border-slate-200 rounded text-slate-600 hover:bg-slate-50 text-xs"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        disabled={isActionLoading}
                        onClick={() => submitReschedule(post.id)}
                        className="px-3 py-1 bg-sky-700 text-white rounded hover:bg-sky-800 text-xs font-medium flex items-center gap-1"
                      >
                        {isActionLoading && <RefreshCw className="w-3 h-3 animate-spin" />}
                        Save Schedule
                      </button>
                    </div>
                  </div>
                )}

                {/* Actions & Audit Bar */}
                <div className="pt-2 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                  {/* Left: Operational Action Buttons */}
                  <div className="flex flex-wrap items-center gap-2">
                    {post.status === "SCHEDULED" && (
                      <>
                        <button
                          type="button"
                          disabled={isActionLoading}
                          onClick={() => handlePublishNow(post.id)}
                          className="inline-flex items-center gap-1.5 px-3 py-1 bg-slate-900 hover:bg-slate-800 text-white rounded-md font-medium transition-colors disabled:opacity-50"
                        >
                          {isActionLoading ? (
                            <RefreshCw className="w-3 h-3 animate-spin" />
                          ) : (
                            <Play className="w-3 h-3" />
                          )}
                          Publish Now
                        </button>

                        <button
                          type="button"
                          disabled={isActionLoading}
                          onClick={() => {
                            setReschedulingPostId(post.id);
                            if (post.scheduledAt) {
                              const d = new Date(post.scheduledAt);
                              setRescheduleDate(d.toISOString().split("T")[0]);
                            }
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-md font-medium transition-colors"
                        >
                          <Calendar className="w-3 h-3" />
                          Reschedule
                        </button>

                        <button
                          type="button"
                          disabled={isActionLoading}
                          onClick={() => handleCancelPost(post.id)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 bg-white hover:bg-rose-50 border border-rose-200 text-rose-700 rounded-md font-medium transition-colors disabled:opacity-50"
                        >
                          <XCircle className="w-3 h-3 text-rose-500" />
                          Cancel
                        </button>
                      </>
                    )}

                    {post.status === "FAILED" && (
                      <>
                        <button
                          type="button"
                          disabled={isActionLoading}
                          onClick={() => handleRetryPost(post.id)}
                          className="inline-flex items-center gap-1.5 px-3 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-md font-medium transition-colors disabled:opacity-50"
                        >
                          {isActionLoading ? (
                            <RefreshCw className="w-3 h-3 animate-spin" />
                          ) : (
                            <RotateCw className="w-3 h-3" />
                          )}
                          Retry Now
                        </button>

                        <button
                          type="button"
                          disabled={isActionLoading}
                          onClick={() => handleCancelPost(post.id)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 bg-white hover:bg-slate-50 border border-slate-200 text-slate-600 rounded-md font-medium transition-colors disabled:opacity-50"
                        >
                          Discard
                        </button>
                      </>
                    )}
                  </div>

                  {/* Right: Technical Audit Toggle */}
                  <div className="flex items-center justify-between sm:justify-end gap-3 text-slate-500">
                    {post.threadsPostId && (
                      <span className="font-mono text-[11px] text-emerald-700">
                        Post ID: {post.threadsPostId}
                      </span>
                    )}

                    <button
                      type="button"
                      onClick={() => setExpandedPostId(isExpanded ? null : post.id)}
                      className="inline-flex items-center gap-1 font-medium text-slate-600 hover:text-slate-900"
                    >
                      {isExpanded ? (
                        <>
                          Hide Details <ChevronUp className="w-3.5 h-3.5" />
                        </>
                      ) : (
                        <>
                          Audit Details <ChevronDown className="w-3.5 h-3.5" />
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Expanded Details Pane */}
                {isExpanded && (
                  <div className="mt-3 pt-3 border-t border-slate-200/80 bg-slate-50 p-4 rounded-lg space-y-2.5 text-xs">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div>
                        <span className="font-semibold text-slate-600 block">Record ID:</span>
                        <span className="font-mono text-slate-500 select-all">{post.id}</span>
                      </div>
                      <div>
                        <span className="font-semibold text-slate-600 block">Created At:</span>
                        <span className="text-slate-500">{new Date(post.createdAt).toISOString()}</span>
                      </div>
                      {post.scheduledAt && (
                        <div>
                          <span className="font-semibold text-slate-600 block">Scheduled At:</span>
                          <span className="text-slate-500">{new Date(post.scheduledAt).toISOString()}</span>
                        </div>
                      )}
                      {post.publishedAt && (
                        <div>
                          <span className="font-semibold text-slate-600 block">Published At:</span>
                          <span className="text-slate-500">{new Date(post.publishedAt).toISOString()}</span>
                        </div>
                      )}
                      {post.containerId && (
                        <div>
                          <span className="font-semibold text-slate-600 block">Container ID:</span>
                          <span className="font-mono text-slate-500 select-all">{post.containerId}</span>
                        </div>
                      )}
                      {post.threadsPostId && (
                        <div>
                          <span className="font-semibold text-slate-600 block">Threads Post ID:</span>
                          <span className="font-mono text-slate-500 select-all">{post.threadsPostId}</span>
                        </div>
                      )}
                      {post.publishAttempts > 0 && (
                        <div>
                          <span className="font-semibold text-slate-600 block">Attempts:</span>
                          <span className="text-slate-500">{post.publishAttempts} / 3</span>
                        </div>
                      )}
                    </div>

                    {/* Failure details if FAILED */}
                    {post.status === "FAILED" && (
                      <div className="mt-3 p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-800 space-y-1">
                        <div className="font-semibold flex items-center gap-1.5">
                          <AlertTriangle className="w-4 h-4 text-rose-600" />
                          Failure Reason ({post.errorCode || "ERROR"})
                        </div>
                        <p className="text-xs text-rose-700">{post.errorMessage || post.lastError}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function PostsPage() {
  return (
    <React.Suspense
      fallback={
        <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center text-slate-400">
          <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-slate-400" />
          Loading posts...
        </div>
      }
    >
      <PostsContent />
    </React.Suspense>
  );
}

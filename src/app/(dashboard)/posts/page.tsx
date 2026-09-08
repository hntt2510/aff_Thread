"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  History,
  Send,
  AlertTriangle,
  RefreshCw,
  Clock,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  Plus,
} from "lucide-react";
import type { PostWithAccount } from "@/services/post.service";

export default function PostsPage() {
  const [posts, setPosts] = useState<PostWithAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedPostId, setExpandedPostId] = useState<string | null>(null);

  const fetchPosts = useCallback(async () => {
    try {
      setError(null);
      const res = await fetch("/api/posts");
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
  }, []);

  useEffect(() => {
    fetchPosts();
  }, [fetchPosts]);

  const toggleExpand = (id: string) => {
    setExpandedPostId((prev) => (prev === id ? null : id));
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "PUBLISHED":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
            Published
          </span>
        );
      case "PUBLISHING":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-200">
            <RefreshCw className="w-3 h-3 animate-spin text-indigo-500" />
            Publishing
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-rose-50 text-rose-700 border border-rose-200">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
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
            Post History
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Audit trail of all manual Threads publications with container IDs and status
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

      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-3 text-rose-700 text-sm">
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <div className="flex-1">{error}</div>
        </div>
      )}

      {loading ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center text-slate-400">
          <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-slate-400" />
          Loading post history...
        </div>
      ) : posts.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center shadow-sm">
          <div className="w-12 h-12 bg-slate-100 text-slate-400 rounded-full flex items-center justify-center mx-auto mb-4">
            <Send className="w-6 h-6" />
          </div>
          <h3 className="text-base font-semibold text-slate-900">No posts published yet</h3>
          <p className="text-sm text-slate-500 max-w-sm mx-auto mt-1 mb-6">
            Create your first manual Threads post using one of your connected tester accounts.
          </p>
          <Link
            href="/create"
            className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            Create First Post
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {posts.map((post) => {
            const isExpanded = expandedPostId === post.id;
            return (
              <div
                key={post.id}
                className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm hover:border-slate-300 transition-all space-y-3"
              >
                <div className="flex items-start justify-between gap-4">
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

                  {/* Status & Timestamp */}
                  <div className="flex items-center gap-3">
                    {getStatusBadge(post.status)}
                    <span className="text-xs text-slate-400 flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" />
                      {new Date(post.createdAt).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                  </div>
                </div>

                {/* Post Text Preview */}
                <p className="text-sm text-slate-800 whitespace-pre-wrap bg-slate-50/70 p-3.5 rounded-lg border border-slate-100 font-normal">
                  {post.text}
                </p>

                {/* Expansion Toggle */}
                <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                  <div className="flex items-center gap-4">
                    {post.containerId && (
                      <span className="font-mono text-[11px] text-slate-400">
                        Container: {post.containerId.slice(0, 14)}...
                      </span>
                    )}
                    {post.threadsPostId && (
                      <span className="font-mono text-[11px] text-emerald-700">
                        Post ID: {post.threadsPostId}
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => toggleExpand(post.id)}
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

                {/* Expanded Details Pane */}
                {isExpanded && (
                  <div className="mt-3 pt-3 border-t border-slate-200/80 bg-slate-50 p-4 rounded-lg space-y-2.5 text-xs">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div>
                        <span className="font-semibold text-slate-600 block">Internal Record ID:</span>
                        <span className="font-mono text-slate-500 select-all">{post.id}</span>
                      </div>
                      <div>
                        <span className="font-semibold text-slate-600 block">Created At:</span>
                        <span className="text-slate-500">{new Date(post.createdAt).toISOString()}</span>
                      </div>
                      {post.containerId && (
                        <div>
                          <span className="font-semibold text-slate-600 block">Meta Container ID:</span>
                          <span className="font-mono text-slate-500 select-all">{post.containerId}</span>
                        </div>
                      )}
                      {post.threadsPostId && (
                        <div>
                          <span className="font-semibold text-slate-600 block">Meta Threads Post ID:</span>
                          <span className="font-mono text-slate-500 select-all">{post.threadsPostId}</span>
                        </div>
                      )}
                      {post.publishedAt && (
                        <div>
                          <span className="font-semibold text-slate-600 block">Published At:</span>
                          <span className="text-slate-500">{new Date(post.publishedAt).toISOString()}</span>
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
                        <p className="text-xs text-rose-700">{post.errorMessage}</p>
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

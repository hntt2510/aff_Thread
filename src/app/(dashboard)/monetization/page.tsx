"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import {
  TrendingUp,
  DollarSign,
  Eye,
  Heart,
  MessageCircle,
  Repeat,
  Quote,
  Share2,
  RefreshCw,
  Plus,
  Play,
  XCircle,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Clock,
  Sparkles,
  Link2,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  HelpCircle,
  Activity,
  ArrowRight,
  ShieldCheck,
  Search,
} from "lucide-react";

interface PostItem {
  post: {
    id: string;
    text: string | null;
    status: string;
    mediaType: string;
    threadsPostId: string | null;
    publishedAt: string | null;
    createdAt: string;
    account: {
      id: string;
      username: string;
    } | null;
  };
  monetizationState: {
    id: string;
    status: string;
    score: number;
    scoreVersion: string;
    scoreBreakdown: any;
    isEligible: boolean;
    lastEvaluatedAt: string;
  } | null;
  latestSnapshot: {
    id: string;
    views: number;
    likes: number;
    replies: number;
    reposts: number;
    quotes: number;
    shares: number | null;
    capturedAt: string;
  } | null;
  latestPlan: {
    id: string;
    status: string;
    source: string;
    createdAt: string;
    replies: Array<{
      id: string;
      sequenceOrder: number;
      replyText: string;
      status: string;
      threadsReplyId: string | null;
      publishAttempts: number;
      lastError: string | null;
      isAmbiguous: boolean;
      publishedAt: string | null;
      links: Array<{
        id: string;
        destinationUrl: string;
        platform: string | null;
        affiliateType: string;
        isDirectShopee: boolean;
      }>;
    }>;
  } | null;
}

interface StatsCounts {
  watching: number;
  eligible: number;
  planned: number;
  monetized: number;
  repliesReady: number;
  repliesPublished: number;
  repliesAmbiguous: number;
  repliesFailed: number;
}

function MonetizationContent() {
  const searchParams = useSearchParams();
  const preselectedPostId = searchParams.get("postId");

  const [posts, setPosts] = useState<PostItem[]>([]);
  const [counts, setCounts] = useState<StatsCounts | null>(null);
  const [loading, setLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(true);
  const [triggerLoading, setTriggerLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [expandedPostId, setExpandedPostId] = useState<string | null>(null);

  // Plan creation modal
  const [showModal, setShowModal] = useState(false);
  const [selectedPost, setSelectedPost] = useState<PostItem | null>(null);
  const [modalReplies, setModalReplies] = useState<
    Array<{
      sequenceOrder: number;
      delayMinutes: number;
      replyText: string;
      directUrl: string;
    }>
  >([
    {
      sequenceOrder: 1,
      delayMinutes: 0,
      replyText: "",
      directUrl: "",
    },
  ]);
  const [submittingPlan, setSubmittingPlan] = useState(false);

  const fetchStats = useCallback(async () => {
    try {
      setStatsLoading(true);
      const res = await fetch("/api/monetization/stats");
      const data = await res.json();
      if (res.ok && data.success) {
        setCounts(data.counts);
      }
    } catch {
      // Ignore stats fetch failure on background
    } finally {
      setStatsLoading(false);
    }
  }, []);

  const fetchPosts = useCallback(async () => {
    try {
      setLoading(true);
      setActionError(null);
      const url = new URL("/api/monetization", window.location.origin);
      if (activeTab !== "ALL") {
        url.searchParams.set("status", activeTab);
      }
      if (searchQuery.trim()) {
        url.searchParams.set("search", searchQuery.trim());
      }
      const res = await fetch(url.toString());
      const data = await res.json();
      if (res.ok && data.success) {
        setPosts(data.posts);
      } else {
        setActionError(data.error || "Failed to load monetization data");
      }
    } catch {
      setActionError("Network error loading monetization posts");
    } finally {
      setLoading(false);
    }
  }, [activeTab, searchQuery]);

  useEffect(() => {
    fetchStats();
    fetchPosts();
  }, [fetchStats, fetchPosts]);

  // If preselected postId is present, auto-open modal when loaded
  useEffect(() => {
    if (preselectedPostId && posts.length > 0 && !showModal) {
      const target = posts.find((p) => p.post.id === preselectedPostId);
      if (target) {
        openPlanModal(target);
      }
    }
  }, [preselectedPostId, posts, showModal]);

  const handleRunNow = async () => {
    try {
      setTriggerLoading(true);
      setActionMessage(null);
      setActionError(null);
      const res = await fetch("/api/monetization/trigger", { method: "POST" });
      const data = await res.json();
      if (res.ok && data.success) {
        const r = data.result;
        setActionMessage(
          `Monetization engine completed: Collected ${r.collected} insights, evaluated ${r.evaluated} posts, published ${r.repliesPublished} replies.`
        );
        fetchStats();
        fetchPosts();
      } else {
        setActionError(data.error || "Failed to trigger monetization pass");
      }
    } catch {
      setActionError("Network error while triggering monetization engine");
    } finally {
      setTriggerLoading(false);
    }
  };

  const handlePublishReplyNow = async (replyId: string) => {
    try {
      setActionLoadingId(replyId);
      setActionMessage(null);
      setActionError(null);
      const res = await fetch(`/api/monetization/replies/${replyId}/publish-now`, {
        method: "POST",
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setActionMessage(`Reply published successfully! Threads ID: ${data.reply?.threadsReplyId}`);
        fetchStats();
        fetchPosts();
      } else {
        setActionError(data.error || "Failed to publish reply");
      }
    } catch {
      setActionError("Network error while publishing reply");
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleReconcileReply = async (replyId: string) => {
    try {
      setActionLoadingId(replyId);
      setActionMessage(null);
      setActionError(null);
      const res = await fetch(`/api/monetization/replies/${replyId}/reconcile`, {
        method: "POST",
      });
      const data = await res.json();
      if (res.ok && data.success) {
        if (data.matched) {
          setActionMessage(`Reconciliation success: Matched published comment on Threads (${data.threadsReplyId})!`);
        } else {
          setActionMessage("Reconciliation result: No matching published comment found on Threads.");
        }
        fetchStats();
        fetchPosts();
      } else {
        setActionError(data.error || "Reconciliation failed");
      }
    } catch {
      setActionError("Network error during reconciliation");
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleCancelPlan = async (planId: string) => {
    if (!confirm("Are you sure you want to cancel this monetization plan?")) return;
    try {
      setActionLoadingId(planId);
      setActionMessage(null);
      setActionError(null);
      const res = await fetch(`/api/monetization/plans/${planId}/cancel`, {
        method: "POST",
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setActionMessage("Monetization plan cancelled.");
        fetchStats();
        fetchPosts();
      } else {
        setActionError(data.error || "Failed to cancel plan");
      }
    } catch {
      setActionError("Network error cancelling plan");
    } finally {
      setActionLoadingId(null);
    }
  };

  const openPlanModal = (item: PostItem) => {
    setSelectedPost(item);
    setModalReplies([
      {
        sequenceOrder: 1,
        delayMinutes: 0,
        replyText: "",
        directUrl: "",
      },
    ]);
    setShowModal(true);
  };

  const handleAddReplyToModal = () => {
    setModalReplies((prev) => [
      ...prev,
      {
        sequenceOrder: prev.length + 1,
        delayMinutes: 5,
        replyText: "",
        directUrl: "",
      },
    ]);
  };

  const handleRemoveReplyFromModal = (index: number) => {
    setModalReplies((prev) => {
      const filtered = prev.filter((_, i) => i !== index);
      return filtered.map((item, idx) => ({
        ...item,
        sequenceOrder: idx + 1,
      }));
    });
  };

  const handleSubmitPlan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPost) return;

    for (const r of modalReplies) {
      if (!r.replyText.trim()) {
        alert("Each reply must contain text.");
        return;
      }
      if (r.replyText.length > 500) {
        alert(`Reply #${r.sequenceOrder} exceeds 500 characters limit.`);
        return;
      }
    }

    try {
      setSubmittingPlan(true);
      const payload = {
        postId: selectedPost.post.id,
        source: "MANUAL",
        replies: modalReplies.map((r) => ({
          sequenceOrder: r.sequenceOrder,
          delayMinutes: r.delayMinutes,
          replyText: r.replyText.trim(),
          links: r.directUrl.trim()
            ? [
                {
                  url: r.directUrl.trim(),
                  platform: "shopee",
                  affiliateType: "DIRECT",
                  isDirectShopee: r.directUrl.includes("shopee.vn"),
                },
              ]
            : [],
        })),
      };

      const res = await fetch("/api/monetization/plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setShowModal(false);
        setActionMessage("Monetization plan created successfully!");
        fetchStats();
        fetchPosts();
      } else {
        alert(data.error || "Failed to create monetization plan");
      }
    } catch {
      alert("Network error creating plan");
    } finally {
      setSubmittingPlan(false);
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 70) return "text-emerald-700 bg-emerald-50 border-emerald-200";
    if (score >= 40) return "text-amber-700 bg-amber-50 border-amber-200";
    return "text-slate-600 bg-slate-100 border-slate-200";
  };

  const getStateBadge = (status?: string) => {
    switch (status) {
      case "ELIGIBLE":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-300">
            <Sparkles className="w-3 h-3" /> Eligible
          </span>
        );
      case "PLANNED":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-sky-100 text-sky-800 border border-sky-300">
            <Clock className="w-3 h-3" /> Planned
          </span>
        );
      case "MONETIZING":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-100 text-indigo-800 border border-indigo-300">
            <Activity className="w-3 h-3 animate-pulse" /> Monetizing
          </span>
        );
      case "MONETIZED":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-600 text-white shadow-sm">
            <ShieldCheck className="w-3 h-3" /> Monetized
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200">
            <Eye className="w-3 h-3" /> Watching
          </span>
        );
    }
  };

  const getReplyStatusBadge = (status: string, isAmbiguous: boolean) => {
    if (isAmbiguous || status === "AMBIGUOUS") {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-100 text-amber-900 border border-amber-300">
          <AlertTriangle className="w-3 h-3 text-amber-600" /> Ambiguous
        </span>
      );
    }
    switch (status) {
      case "PUBLISHED":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Published
          </span>
        );
      case "READY":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-blue-50 text-blue-700 border border-blue-200">
            <Clock className="w-3 h-3 text-blue-600" /> Ready
          </span>
        );
      case "PUBLISHING":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-purple-50 text-purple-700 border border-purple-200 animate-pulse">
            <Activity className="w-3 h-3 text-purple-600" /> Publishing
          </span>
        );
      case "FAILED":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-rose-50 text-rose-700 border border-rose-200">
            <XCircle className="w-3 h-3 text-rose-600" /> Failed
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-600">
            Pending
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Title Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2.5">
            <DollarSign className="w-7 h-7 text-emerald-600" />
            Threads Monetization Core
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Meta Threads post insights collection, programmatic scoring engine, and multi-sequence affiliate reply publisher
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              fetchStats();
              fetchPosts();
            }}
            className="inline-flex items-center gap-2 px-3 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-lg text-sm font-medium transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
          <button
            onClick={handleRunNow}
            disabled={triggerLoading}
            className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium transition-colors shadow-sm disabled:opacity-50"
          >
            <TrendingUp className={`w-4 h-4 ${triggerLoading ? "animate-spin" : ""}`} />
            {triggerLoading ? "Processing Engine..." : "Run Engine Now"}
          </button>
        </div>
      </div>

      {/* KPI Overview Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 sm:gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <div className="text-xs font-medium text-slate-500 flex items-center gap-1">
            <Eye className="w-3.5 h-3.5 text-slate-400" /> Watching
          </div>
          <div className="text-2xl font-bold text-slate-900 mt-1.5">
            {statsLoading ? "—" : counts?.watching ?? 0}
          </div>
        </div>

        <div className="bg-white border border-emerald-100 bg-emerald-50/20 rounded-xl p-4 shadow-sm">
          <div className="text-xs font-medium text-emerald-700 flex items-center gap-1">
            <Sparkles className="w-3.5 h-3.5 text-emerald-500" /> Eligible
          </div>
          <div className="text-2xl font-bold text-emerald-800 mt-1.5">
            {statsLoading ? "—" : counts?.eligible ?? 0}
          </div>
        </div>

        <div className="bg-white border border-sky-100 bg-sky-50/20 rounded-xl p-4 shadow-sm">
          <div className="text-xs font-medium text-sky-700 flex items-center gap-1">
            <Clock className="w-3.5 h-3.5 text-sky-500" /> Planned
          </div>
          <div className="text-2xl font-bold text-sky-800 mt-1.5">
            {statsLoading ? "—" : counts?.planned ?? 0}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <div className="text-xs font-medium text-emerald-600 flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" /> Monetized
          </div>
          <div className="text-2xl font-bold text-emerald-700 mt-1.5">
            {statsLoading ? "—" : counts?.monetized ?? 0}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <div className="text-xs font-medium text-slate-500 flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> Replies Live
          </div>
          <div className="text-2xl font-bold text-slate-900 mt-1.5">
            {statsLoading ? "—" : counts?.repliesPublished ?? 0}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <div className="text-xs font-medium text-amber-600 flex items-center gap-1">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-500" /> Attention
          </div>
          <div className="text-2xl font-bold text-amber-700 mt-1.5">
            {statsLoading
              ? "—"
              : (counts?.repliesAmbiguous ?? 0) + (counts?.repliesFailed ?? 0)}
          </div>
        </div>
      </div>

      {/* Action Messages */}
      {actionMessage && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-3 text-emerald-800 text-sm">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
          <span>{actionMessage}</span>
        </div>
      )}

      {actionError && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-3 text-rose-700 text-sm">
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <div className="flex-1">{actionError}</div>
        </div>
      )}

      {/* Tabs & Search */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-2">
        <div className="flex items-center gap-1 overflow-x-auto pb-1">
          {["ALL", "ELIGIBLE", "PLANNED", "MONETIZED", "ATTENTION"].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-3.5 py-1.5 text-xs sm:text-sm font-medium rounded-lg whitespace-nowrap transition-colors ${
                activeTab === tab
                  ? "bg-slate-900 text-white"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
              }`}
            >
              {tab === "ALL"
                ? "All Posts"
                : tab === "ATTENTION"
                ? "Needs Attention"
                : tab.charAt(0) + tab.slice(1).toLowerCase()}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search posts or text..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs sm:text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
          />
        </div>
      </div>

      {/* Posts List */}
      {loading ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center text-slate-400">
          <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-slate-400" />
          Loading monetization posts...
        </div>
      ) : posts.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center">
          <div className="w-12 h-12 bg-slate-100 text-slate-400 rounded-full flex items-center justify-center mx-auto mb-3">
            <DollarSign className="w-6 h-6" />
          </div>
          <h3 className="text-base font-semibold text-slate-900">No monetization records</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
            Once posts are published to Threads, the engine collects insights and scores them automatically.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {posts.map((item) => {
            const isExpanded = expandedPostId === item.post.id;
            const score = item.monetizationState?.score ?? 0;
            const breakdown = item.monetizationState?.scoreBreakdown;
            const plan = item.latestPlan;

            return (
              <div
                key={item.post.id}
                className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4 hover:border-slate-300 transition-colors"
              >
                {/* Header row: Account, State, Score */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-slate-900 text-white flex items-center justify-center font-bold text-xs">
                      {item.post.account?.username?.charAt(0).toUpperCase() || "T"}
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-slate-900">
                        @{item.post.account?.username || "unknown"}
                      </div>
                      <div className="text-xs text-slate-400">
                        Post ID: {item.post.threadsPostId || item.post.id}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5">
                    {getStateBadge(item.monetizationState?.status)}

                    <div
                      className={`px-2.5 py-1 rounded-lg border text-xs font-bold font-mono ${getScoreColor(
                        score
                      )}`}
                      title="Monetization Potential Score (0 - 100)"
                    >
                      Score: {score}
                    </div>

                    {!plan && (
                      <button
                        onClick={() => openPlanModal(item)}
                        className="inline-flex items-center gap-1.5 px-3 py-1 bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium rounded-lg transition-colors shadow-sm"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Plan Monetization
                      </button>
                    )}
                  </div>
                </div>

                {/* Post Text Preview */}
                {item.post.text && (
                  <p className="text-sm text-slate-800 whitespace-pre-wrap bg-slate-50/70 p-3 rounded-lg border border-slate-100 font-normal">
                    {item.post.text}
                  </p>
                )}

                {/* Metrics Breakdown Bar */}
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 bg-slate-50 p-2.5 rounded-lg border border-slate-200 text-xs">
                  <div className="flex items-center gap-1.5 text-slate-700">
                    <Eye className="w-3.5 h-3.5 text-slate-400" />
                    <span>Views:</span>
                    <span className="font-semibold text-slate-900">
                      {item.latestSnapshot?.views?.toLocaleString() ?? 0}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 text-slate-700">
                    <Heart className="w-3.5 h-3.5 text-rose-500" />
                    <span>Likes:</span>
                    <span className="font-semibold text-slate-900">
                      {item.latestSnapshot?.likes?.toLocaleString() ?? 0}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 text-slate-700">
                    <MessageCircle className="w-3.5 h-3.5 text-sky-500" />
                    <span>Replies:</span>
                    <span className="font-semibold text-slate-900">
                      {item.latestSnapshot?.replies?.toLocaleString() ?? 0}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 text-slate-700">
                    <Repeat className="w-3.5 h-3.5 text-emerald-500" />
                    <span>Reposts:</span>
                    <span className="font-semibold text-slate-900">
                      {item.latestSnapshot?.reposts?.toLocaleString() ?? 0}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 text-slate-700">
                    <Quote className="w-3.5 h-3.5 text-purple-500" />
                    <span>Quotes:</span>
                    <span className="font-semibold text-slate-900">
                      {item.latestSnapshot?.quotes?.toLocaleString() ?? 0}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 text-slate-700">
                    <Share2 className="w-3.5 h-3.5 text-indigo-500" />
                    <span>Shares:</span>
                    <span className="font-semibold text-slate-900">
                      {item.latestSnapshot?.shares !== null && item.latestSnapshot?.shares !== undefined
                        ? item.latestSnapshot.shares.toLocaleString()
                        : "N/A"}
                    </span>
                  </div>
                </div>

                {/* Plan & Multi-Reply Status */}
                {plan && (
                  <div className="border border-slate-200 rounded-lg p-3.5 bg-slate-50/50 space-y-3">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-900">
                          Active Monetization Plan ({plan.replies.length} {plan.replies.length === 1 ? "reply" : "replies"})
                        </span>
                        <span className="px-2 py-0.5 rounded bg-slate-200 text-slate-700 font-mono text-[10px]">
                          {plan.status}
                        </span>
                      </div>

                      {plan.status !== "CANCELLED" && plan.status !== "COMPLETED" && (
                        <button
                          onClick={() => handleCancelPlan(plan.id)}
                          disabled={actionLoadingId === plan.id}
                          className="text-rose-600 hover:text-rose-800 font-medium text-xs inline-flex items-center gap-1"
                        >
                          <XCircle className="w-3 h-3" /> Cancel Plan
                        </button>
                      )}
                    </div>

                    <div className="space-y-2">
                      {plan.replies.map((reply) => {
                        const isLoading = actionLoadingId === reply.id;
                        return (
                          <div
                            key={reply.id}
                            className="bg-white border border-slate-200 rounded-lg p-3 text-xs space-y-2 shadow-xs"
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-slate-800">
                                  Reply #{reply.sequenceOrder}
                                </span>
                                {getReplyStatusBadge(reply.status, reply.isAmbiguous)}
                                {reply.threadsReplyId && (
                                  <span className="font-mono text-[10px] text-emerald-700">
                                    ID: {reply.threadsReplyId}
                                  </span>
                                )}
                              </div>

                              <div className="flex items-center gap-2">
                                {reply.isAmbiguous && (
                                  <button
                                    onClick={() => handleReconcileReply(reply.id)}
                                    disabled={isLoading}
                                    className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded text-xs font-semibold shadow-xs transition-colors"
                                  >
                                    Reconcile Status
                                  </button>
                                )}

                                {reply.status === "READY" && (
                                  <button
                                    onClick={() => handlePublishReplyNow(reply.id)}
                                    disabled={isLoading}
                                    className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-xs font-semibold shadow-xs transition-colors flex items-center gap-1"
                                  >
                                    <Play className="w-3 h-3" />
                                    Publish Now
                                  </button>
                                )}
                              </div>
                            </div>

                            <p className="text-slate-800 whitespace-pre-wrap bg-slate-50 p-2 rounded border border-slate-100 font-sans">
                              {reply.replyText}
                            </p>

                            {reply.links && reply.links.length > 0 && (
                              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                                {reply.links.map((link) => (
                                  <div
                                    key={link.id}
                                    className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded border border-emerald-200 bg-emerald-50 text-emerald-800 text-[11px]"
                                  >
                                    <Link2 className="w-3 h-3 text-emerald-600" />
                                    <span className="font-mono truncate max-w-xs">{link.destinationUrl}</span>
                                    {link.isDirectShopee && (
                                      <span className="px-1 py-0.2 rounded bg-orange-100 text-orange-800 text-[9px] font-bold">
                                        Direct Shopee
                                      </span>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}

                            {reply.lastError && (
                              <div className="text-rose-600 bg-rose-50 p-2 rounded text-[11px] border border-rose-200">
                                Error: {reply.lastError}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Technical Audit / Score Breakdown Toggle */}
                <div className="flex items-center justify-between text-xs text-slate-500 pt-2 border-t border-slate-100">
                  <div className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    <span>
                      Last checked:{" "}
                      {item.monetizationState?.lastEvaluatedAt
                        ? new Date(item.monetizationState.lastEvaluatedAt).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                            month: "short",
                            day: "numeric",
                          })
                        : "Never"}
                    </span>
                  </div>

                  <button
                    onClick={() => setExpandedPostId(isExpanded ? null : item.post.id)}
                    className="inline-flex items-center gap-1 font-medium text-slate-600 hover:text-slate-900"
                  >
                    {isExpanded ? (
                      <>
                        Hide Breakdown <ChevronUp className="w-3.5 h-3.5" />
                      </>
                    ) : (
                      <>
                        Scoring Breakdown <ChevronDown className="w-3.5 h-3.5" />
                      </>
                    )}
                  </button>
                </div>

                {/* Score Breakdown Expanded Panel */}
                {isExpanded && breakdown && (
                  <div className="p-3 bg-slate-900 text-slate-100 rounded-lg text-xs space-y-2 font-mono">
                    <div className="text-slate-300 font-bold flex items-center justify-between">
                      <span>Algorithm Scoring Components (v1)</span>
                      <span>Total: {score}/100</span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-1 text-slate-300">
                      <div>Reach: {breakdown.reachScore ?? 0} pts</div>
                      <div>Engagement: {breakdown.engagementScore ?? 0} pts</div>
                      <div>Conversation: {breakdown.conversationScore ?? 0} pts</div>
                      <div>Amplification: {breakdown.amplificationScore ?? 0} pts</div>
                      <div>Velocity: {breakdown.velocityScore ?? 0} pts</div>
                    </div>
                    {breakdown.reason && (
                      <div className="text-slate-400 text-[11px] pt-1 border-t border-slate-800">
                        {breakdown.reason}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Plan Creation Modal */}
      {showModal && selectedPost && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full p-6 space-y-5 my-8">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <DollarSign className="w-5 h-5 text-emerald-600" />
                  Create Monetization Plan
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Plan automated multi-reply affiliate comments for @{selectedPost.post.account?.username}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="text-slate-400 hover:text-slate-600 text-lg font-bold"
              >
                ✕
              </button>
            </div>

            {/* Target Post Preview */}
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs space-y-1">
              <span className="font-semibold text-slate-700">Target Post:</span>
              <p className="text-slate-800 line-clamp-3 italic">
                &ldquo;{selectedPost.post.text || "Media post"}&rdquo;
              </p>
            </div>

            <form onSubmit={handleSubmitPlan} className="space-y-4">
              <div className="space-y-4 max-h-[50vh] overflow-y-auto pr-1">
                {modalReplies.map((reply, index) => (
                  <div
                    key={index}
                    className="p-4 border border-slate-200 rounded-xl space-y-3 bg-slate-50/40"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                        <span className="w-5 h-5 rounded-full bg-slate-900 text-white flex items-center justify-center text-[10px]">
                          {reply.sequenceOrder}
                        </span>
                        Reply #{reply.sequenceOrder}
                      </span>
                      {modalReplies.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveReplyFromModal(index)}
                          className="text-xs text-rose-600 hover:text-rose-800 font-medium"
                        >
                          Remove
                        </button>
                      )}
                    </div>

                    {index > 0 && (
                      <div className="flex items-center gap-2 text-xs">
                        <label className="text-slate-600">Delay after previous reply:</label>
                        <input
                          type="number"
                          min="0"
                          max="1440"
                          value={reply.delayMinutes}
                          onChange={(e) => {
                            const val = parseInt(e.target.value, 10) || 0;
                            setModalReplies((prev) =>
                              prev.map((r, i) => (i === index ? { ...r, delayMinutes: val } : r))
                            );
                          }}
                          className="w-20 px-2 py-1 border border-slate-200 rounded text-xs"
                        />
                        <span className="text-slate-500">minutes</span>
                      </div>
                    )}

                    <div>
                      <div className="flex items-center justify-between text-xs text-slate-600 mb-1">
                        <label className="font-medium">Reply Text</label>
                        <span
                          className={`font-mono text-[11px] ${
                            reply.replyText.length > 500 ? "text-rose-600 font-bold" : "text-slate-400"
                          }`}
                        >
                          {reply.replyText.length}/500
                        </span>
                      </div>
                      <textarea
                        required
                        rows={3}
                        value={reply.replyText}
                        onChange={(e) => {
                          const val = e.target.value;
                          setModalReplies((prev) =>
                            prev.map((r, i) => (i === index ? { ...r, replyText: val } : r))
                          );
                        }}
                        placeholder="Write your value-first reply or recommendation here..."
                        className="w-full px-3 py-2 text-xs sm:text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">
                        Direct Shopee / Affiliate Link (Optional)
                      </label>
                      <input
                        type="url"
                        value={reply.directUrl}
                        onChange={(e) => {
                          const val = e.target.value;
                          setModalReplies((prev) =>
                            prev.map((r, i) => (i === index ? { ...r, directUrl: val } : r))
                          );
                        }}
                        placeholder="https://s.shopee.vn/..."
                        className="w-full px-3 py-1.5 text-xs sm:text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 font-mono"
                      />
                      <p className="text-[11px] text-slate-500 mt-1">
                        ℹ️ Direct Shopee URLs (e.g. <code className="bg-slate-100 px-1 rounded">https://s.shopee.vn/...</code>) are preserved verbatim and will NOT be wrapped by /r/[slug] redirects.
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={handleAddReplyToModal}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 hover:text-slate-950 border border-slate-300 rounded-lg px-3 py-1.5 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Follow-up Reply
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="px-4 py-2 text-xs sm:text-sm font-medium text-slate-600 hover:text-slate-800"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submittingPlan}
                    className="px-4 py-2 text-xs sm:text-sm font-medium bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors shadow-sm disabled:opacity-50 flex items-center gap-2"
                  >
                    {submittingPlan ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" /> Saving Plan...
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-4 h-4" /> Activate Plan
                      </>
                    )}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default function MonetizationPage() {
  return (
    <React.Suspense
      fallback={
        <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center text-slate-400">
          <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-slate-400" />
          Loading monetization dashboard...
        </div>
      }
    >
      <MonetizationContent />
    </React.Suspense>
  );
}

"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Video,
  Play,
  Flame,
  Search,
  RefreshCw,
  Sparkles,
  ExternalLink,
  Eye,
  Heart,
  Share2,
  Check,
  AlertCircle,
  Clock,
  Layers,
  ShoppingBag,
  Send,
  MessageSquare,
  Copy,
  ChevronRight,
  User,
  X,
} from "lucide-react";
import type { ViralContentCandidate } from "@/services/trends/tiktok-trend.service";

interface AccountOption {
  id: string;
  username: string;
  displayName: string | null;
  status: string;
}

const QUICK_SEARCH_CHIPS = [
  { label: "Trending VN 🔥", query: "", region: "VN" },
  { label: "Skincare / Mỹ phẩm 💄", query: "skincare review", region: "VN" },
  { label: "Đồ gia dụng thông minh 🍳", query: "đồ gia dụng thông minh", region: "VN" },
  { label: "Phụ kiện công nghệ 🎧", query: "phụ kiện công nghệ hay", region: "VN" },
  { label: "Thời trang / OOTD 👗", query: "phối đồ outfit", region: "VN" },
];

export interface MatchedProductDraft {
  id: string;
  name: string;
  price: number;
  shopVoucherCode?: string;
  shopDiscountAmount?: number;
  replyReviewer: string;
  replyCombo: string;
  recommendedPersona: "HELPFUL_REVIEWER" | "COMBO_VALUE_HACKER";
  affiliateUrl: string;
}

export default function TrendDiscoveryTab() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRegion, setSelectedRegion] = useState("VN");
  const [candidates, setCandidates] = useState<ViralContentCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  // Accounts list
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>("");

  // Bait Post Modal State
  const [selectedCandidate, setSelectedCandidate] = useState<ViralContentCandidate | null>(null);
  const [preparingBait, setPreparingBait] = useState(false);
  const [rewrittenCaption, setRewrittenCaption] = useState("");
  const [matchedProduct, setMatchedProduct] = useState<MatchedProductDraft | null>(null);
  const [activePersona, setActivePersona] = useState<"HELPFUL_REVIEWER" | "COMBO_VALUE_HACKER">("HELPFUL_REVIEWER");
  const [customReplyText, setCustomReplyText] = useState("");
  const [savingDraft, setSavingDraft] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);

  // Preview Video Player Modal
  const [previewVideoUrl, setPreviewVideoUrl] = useState<string | null>(null);

  // Fetch accounts on mount
  useEffect(() => {
    async function loadAccounts() {
      try {
        const res = await fetch("/api/accounts");
        const data = await res.json();
        if (res.ok && data.accounts) {
          setAccounts(data.accounts);
          const active = data.accounts.find((a: AccountOption) => a.status === "ACTIVE") || data.accounts[0];
          if (active) setSelectedAccountId(active.id);
        }
      } catch {
        // ignore
      }
    }
    loadAccounts();
  }, []);

  // Fetch trending or searched videos
  const fetchViralVideos = useCallback(
    async (overrideQuery?: string, overrideRegion?: string) => {
      const q = overrideQuery !== undefined ? overrideQuery : searchQuery;
      const r = overrideRegion !== undefined ? overrideRegion : selectedRegion;
      const trimmedQuery = (q || "").trim();

      setLoading(true);
      setError(null);
      setHasSearched(true);
      try {
        const bodyPayload: {
          query?: string;
          region: string;
          count: number;
          minViews: number;
          minLikes: number;
        } = {
          region: r || "VN",
          count: 20,
          minViews: 40000,
          minLikes: 1500,
        };

        // When user has typed text, send it trimmed. Do NOT send null or empty string.
        if (trimmedQuery) {
          bodyPayload.query = trimmedQuery;
        }

        const res = await fetch("/api/trends/fetch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(bodyPayload),
        });

        const data = await res.json();
        if (res.ok && data.success) {
          setCandidates(data.data || data.candidates || []);
        } else {
          setError(data.error || "Failed to fetch viral videos");
        }
      } catch {
        setError("Network error connecting to trend discovery API");
      } finally {
        setLoading(false);
      }
    },
    [searchQuery, selectedRegion]
  );

  // Auto-fetch initial trending list on mount
  useEffect(() => {
    fetchViralVideos("", "VN");
  }, [fetchViralVideos]);

  // Open "Use as Bait Post" modal and prepare suggestions
  const handleOpenBaitModal = async (candidate: ViralContentCandidate) => {
    setSelectedCandidate(candidate);
    setPreparingBait(true);
    setSaveSuccess(null);

    try {
      const res = await fetch("/api/trends/generate-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          videoTitle: candidate.title,
          videoUrl: candidate.videoUrl,
          coverUrl: candidate.coverUrl,
          videoId: candidate.id,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success && data.draft) {
        setRewrittenCaption(data.draft.baitCaption || candidate.suggestedThreadsCaption || candidate.title);
        const matched = data.draft.matchedProduct as MatchedProductDraft | null;
        setMatchedProduct(matched);
        if (matched) {
          const rec = matched.recommendedPersona || "HELPFUL_REVIEWER";
          setActivePersona(rec);
          setCustomReplyText(
            rec === "COMBO_VALUE_HACKER" ? matched.replyCombo : matched.replyReviewer
          );
        } else {
          setCustomReplyText("");
        }
      } else {
        setRewrittenCaption(candidate.suggestedThreadsCaption || candidate.title);
        setMatchedProduct(null);
        setCustomReplyText("");
      }
    } catch {
      setRewrittenCaption(candidate.suggestedThreadsCaption || candidate.title);
      setMatchedProduct(null);
      setCustomReplyText("");
    } finally {
      setPreparingBait(false);
    }
  };

  const handleSelectPersona = (persona: "HELPFUL_REVIEWER" | "COMBO_VALUE_HACKER") => {
    setActivePersona(persona);
    if (matchedProduct) {
      setCustomReplyText(
        persona === "COMBO_VALUE_HACKER" ? matchedProduct.replyCombo : matchedProduct.replyReviewer
      );
    }
  };

  // Save to Draft Posts (and create Draft Monetization Plan)
  const handleSaveDraftPost = async () => {
    if (!selectedCandidate) return;
    setSavingDraft(true);
    setSaveSuccess(null);

    try {
      // 1. Create DRAFT Post with Video Media
      const postRes = await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId: selectedAccountId,
          text: rewrittenCaption.trim(),
          mediaType: "VIDEO",
          mediaItems: [
            {
              mediaKind: "VIDEO",
              sourceUrl: selectedCandidate.videoUrl,
              altText: selectedCandidate.title.slice(0, 100),
            },
          ],
          mode: "draft",
        }),
      });

      const postData = await postRes.json();
      if (!postRes.ok || !postData.post) {
        throw new Error(postData.error || "Failed to save draft post");
      }

      const createdPostId = postData.post.id;

      // 2. If matched deal exists and custom reply text is provided, create Draft Monetization Plan
      if (matchedProduct && customReplyText.trim()) {
        const affUrl = matchedProduct.affiliateUrl;
        await fetch("/api/shopee/matcher/create-plan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            postId: createdPostId,
            replyText: customReplyText.trim(),
            directAffiliateUrl: affUrl,
          }),
        });
      }

      setSaveSuccess(
        `Draft post created successfully with ID: ${createdPostId}! Attached video and monetization comment plan.`
      );
    } catch (err: any) {
      setError(err.message || "Failed to create draft post");
    } finally {
      setSavingDraft(false);
    }
  };

  const formatNumber = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}k`;
    return num.toString();
  };

  const formatK = (val: number | null | undefined): string => {
    if (val === null || val === undefined || isNaN(val) || val <= 0) return "0k";
    const k = val / 1000;
    return k % 1 === 0 ? `${k}k` : `${k.toFixed(1)}k`;
  };

  return (
    <div className="space-y-6">
      {/* Header & Description */}
      <div className="bg-gradient-to-r from-purple-900 via-indigo-900 to-slate-900 p-6 rounded-2xl text-white shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 bg-purple-500/20 text-purple-200 text-xs font-semibold px-2.5 py-1 rounded-full mb-2 border border-purple-500/30">
            <Sparkles className="w-3.5 h-3.5" /> TikTok / Douyin Viral Feed
          </div>
          <h2 className="text-xl sm:text-2xl font-black tracking-tight">
            Manual Trend Discovery & Bait Post Ingestion
          </h2>
          <p className="text-xs sm:text-sm text-slate-300 mt-1 max-w-2xl">
            Tải video xu hướng TikTok không logo (Clean Watermark-free MP4), chọn clip triệu view làm bài mồi (Bait Post) trên Threads, và tự động gắn link tiếp thị Shopee tối ưu.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="bg-white/10 backdrop-blur-xs px-4 py-2 rounded-xl text-center border border-white/10">
            <div className="text-xs text-slate-300">Viral Candidates</div>
            <div className="text-xl font-black text-white">{candidates.length}</div>
          </div>
        </div>
      </div>

      {/* Search & Filter Controls */}
      <div className="bg-white p-4 sm:p-5 border border-slate-200 rounded-2xl shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row items-center gap-3">
          <div className="relative flex-1 w-full">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && fetchViralVideos(searchQuery, selectedRegion)}
              placeholder="Nhập từ khóa tìm kiếm (VD: skincare, đồ gia dụng, review, tai nghe bluetooth)..."
              className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-purple-500 focus:bg-white transition-all"
            />
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <select
              value={selectedRegion}
              onChange={(e) => {
                const newRegion = e.target.value;
                setSelectedRegion(newRegion);
                fetchViralVideos(searchQuery, newRegion);
              }}
              className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-purple-500"
            >
              <option value="VN">🇻🇳 Việt Nam (VN)</option>
              <option value="TH">🇹🇭 Thái Lan (TH)</option>
              <option value="ID">🇮🇩 Indonesia (ID)</option>
              <option value="US">🇺🇸 Hoa Kỳ (US)</option>
            </select>

            <button
              onClick={() => fetchViralVideos(searchQuery, selectedRegion)}
              disabled={loading}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-2.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white font-semibold rounded-xl text-sm shadow-sm transition-all"
            >
              {loading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" /> Đang tải...
                </>
              ) : (
                <>
                  <Flame className="w-4 h-4" /> Fetch Viral Videos
                </>
              )}
            </button>
          </div>
        </div>

        {/* Quick Suggestion Chips */}
        <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
          <span className="text-slate-400 font-medium">Gợi ý nhanh:</span>
          {QUICK_SEARCH_CHIPS.map((chip) => (
            <button
              key={chip.label}
              onClick={() => {
                setSearchQuery(chip.query);
                setSelectedRegion(chip.region);
                fetchViralVideos(chip.query, chip.region);
              }}
              className={`px-2.5 py-1 rounded-lg border transition-colors ${
                searchQuery === chip.query
                  ? "bg-purple-50 border-purple-300 text-purple-700 font-bold"
                  : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
              }`}
            >
              {chip.label}
            </button>
          ))}
        </div>
      </div>

      {/* Error Notice */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Video Grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, idx) => (
            <div key={idx} className="bg-white border border-slate-200 rounded-2xl overflow-hidden animate-pulse">
              <div className="aspect-[9/16] bg-slate-200 w-full" />
              <div className="p-3 space-y-2">
                <div className="h-4 bg-slate-200 rounded-md w-3/4" />
                <div className="h-3 bg-slate-200 rounded-md w-1/2" />
              </div>
            </div>
          ))}
        </div>
      ) : candidates.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center space-y-3">
          <div className="w-12 h-12 bg-purple-50 text-purple-600 rounded-full flex items-center justify-center mx-auto">
            <Video className="w-6 h-6 stroke-1" />
          </div>
          <h3 className="font-bold text-slate-800">Không tìm thấy video xu hướng</h3>
          <p className="text-slate-500 text-sm max-w-md mx-auto">
            {hasSearched
              ? "Hãy thử đổi từ khóa khác hoặc chuyển sang vùng khác để tìm thêm video có tương tác cao."
              : "Bấm nút 'Fetch Viral Videos' ở trên để nạp danh sách video xu hướng."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {candidates.map((cand) => (
            <div
              key={cand.id}
              className="bg-white border border-slate-200/90 rounded-2xl shadow-xs hover:shadow-md transition-all duration-200 overflow-hidden flex flex-col group"
            >
              {/* Thumbnail Container */}
              <div className="aspect-[9/14] relative bg-slate-900 overflow-hidden">
                {cand.coverUrl ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={cand.coverUrl}
                    alt={cand.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 opacity-90 group-hover:opacity-100"
                    loading="lazy"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-slate-500 bg-slate-800">
                    <Video className="w-8 h-8" />
                  </div>
                )}

                {/* Overlays */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent pointer-events-none" />

                {/* View/Like Badges */}
                <div className="absolute top-2.5 left-2.5 flex flex-wrap gap-1.5 pointer-events-none">
                  <span className="bg-black/60 backdrop-blur-xs text-white text-[11px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 border border-white/10">
                    <Eye className="w-3 h-3 text-emerald-400" /> {formatNumber(cand.stats.views)}
                  </span>
                  <span className="bg-black/60 backdrop-blur-xs text-white text-[11px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 border border-white/10">
                    <Heart className="w-3 h-3 text-rose-400 fill-rose-400" /> {formatNumber(cand.stats.likes)}
                  </span>
                </div>

                {/* Duration Badge */}
                {cand.duration > 0 && (
                  <div className="absolute top-2.5 right-2.5 pointer-events-none">
                    <span className="bg-black/70 backdrop-blur-xs text-white text-[10px] font-mono px-1.5 py-0.5 rounded-md border border-white/10">
                      {Math.floor(cand.duration / 60)}:{(cand.duration % 60).toString().padStart(2, "0")}
                    </span>
                  </div>
                )}

                {/* Play Preview Button */}
                <button
                  onClick={() => setPreviewVideoUrl(cand.videoUrl)}
                  className="absolute inset-0 m-auto w-12 h-12 bg-white/20 hover:bg-white/40 backdrop-blur-xs rounded-full flex items-center justify-center text-white transition-all transform group-hover:scale-110 shadow-lg"
                  title="Xem video không logo"
                >
                  <Play className="w-5 h-5 fill-white ml-0.5" />
                </button>

                {/* Author Info bottom left */}
                <div className="absolute bottom-2.5 left-2.5 right-2.5 pointer-events-none">
                  <p className="text-white text-xs font-bold truncate">@{cand.author.uniqueId}</p>
                  <p className="text-slate-300 text-[11px] truncate opacity-90">{cand.author.nickname}</p>
                </div>
              </div>

              {/* Caption & Action */}
              <div className="p-3.5 flex flex-col flex-1 justify-between gap-3 bg-white">
                <p className="text-xs text-slate-700 font-medium line-clamp-2 leading-relaxed" title={cand.title}>
                  {cand.title || "(Không có caption)"}
                </p>

                <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
                  <span className="text-[11px] text-slate-400 font-mono">ID: {cand.id.slice(-6)}</span>

                  <button
                    onClick={() => handleOpenBaitModal(cand)}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white text-xs font-bold rounded-lg shadow-xs transition-all"
                  >
                    🚀 Use as Bait Post
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Video Preview Modal */}
      {previewVideoUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-4">
          <div className="relative bg-slate-900 rounded-2xl overflow-hidden max-w-sm w-full shadow-2xl border border-white/10">
            <button
              onClick={() => setPreviewVideoUrl(null)}
              className="absolute top-3 right-3 z-10 w-8 h-8 bg-black/60 hover:bg-black/80 text-white rounded-full flex items-center justify-center"
            >
              <X className="w-4 h-4" />
            </button>
            <video
              src={previewVideoUrl}
              controls
              autoPlay
              playsInline
              className="w-full max-h-[80vh] object-contain"
            />
          </div>
        </div>
      )}

      {/* USE AS BAIT POST MODAL */}
      {selectedCandidate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-3 sm:p-6 overflow-y-auto">
          <div className="bg-white rounded-2xl w-full max-w-4xl max-h-[92vh] overflow-y-auto shadow-2xl border border-slate-200 flex flex-col">
            {/* Modal Header */}
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50 sticky top-0 z-10">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 bg-purple-600 text-white rounded-lg flex items-center justify-center font-bold">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Transform into Threads Bait Post & Monetize
                  </h3>
                  <p className="text-xs text-slate-500">
                    Clip ID: {selectedCandidate.id} • @{selectedCandidate.author.uniqueId}
                  </p>
                </div>
              </div>

              <button
                onClick={() => setSelectedCandidate(null)}
                className="w-8 h-8 rounded-lg hover:bg-slate-200 text-slate-500 flex items-center justify-center"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 grid grid-cols-1 md:grid-cols-12 gap-6">
              {/* Left Column: Video Preview & Stats */}
              <div className="md:col-span-4 space-y-4">
                <div className="aspect-[9/14] bg-slate-950 rounded-xl overflow-hidden relative shadow-inner">
                  <video
                    src={selectedCandidate.videoUrl}
                    poster={selectedCandidate.coverUrl}
                    controls
                    playsInline
                    className="w-full h-full object-cover"
                  />
                </div>

                <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 text-xs space-y-2">
                  <div className="font-bold text-slate-800 flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-purple-600" /> Tác giả gốc:
                  </div>
                  <div className="text-slate-600 truncate">@{selectedCandidate.author.uniqueId}</div>
                  <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-200 text-center font-bold">
                    <div>
                      <div className="text-[10px] text-slate-400 font-normal">Views</div>
                      <div className="text-emerald-600">{formatNumber(selectedCandidate.stats.views)}</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-400 font-normal">Likes</div>
                      <div className="text-rose-600">{formatNumber(selectedCandidate.stats.likes)}</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-400 font-normal">Shares</div>
                      <div className="text-blue-600">{formatNumber(selectedCandidate.stats.shares)}</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Column: AI Caption, Accounts & Deal Matcher */}
              <div className="md:col-span-8 space-y-5">
                {preparingBait ? (
                  <div className="p-8 text-center space-y-3 bg-purple-50/50 rounded-xl border border-purple-100">
                    <RefreshCw className="w-6 h-6 text-purple-600 animate-spin mx-auto" />
                    <p className="text-sm font-semibold text-purple-900">
                      Đang phân tích caption & đối soát deal phù hợp từ Weekly Pool...
                    </p>
                  </div>
                ) : (
                  <>
                    {/* 1. Account Selector */}
                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                        Tài khoản Threads đăng bài
                      </label>
                      <select
                        value={selectedAccountId}
                        onChange={(e) => setSelectedAccountId(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:outline-hidden focus:ring-2 focus:ring-purple-500"
                      >
                        {accounts.map((acc) => (
                          <option key={acc.id} value={acc.id}>
                            @{acc.username} {acc.displayName ? `(${acc.displayName})` : ""} - {acc.status}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* 2. AI Rewritten Caption for Threads */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                          <Sparkles className="w-3.5 h-3.5 text-purple-600" /> Caption mồi tương tác (Threads Hook)
                        </label>
                        <span
                          className={`text-xs font-mono font-medium ${
                            rewrittenCaption.length > 500 ? "text-red-500 font-bold" : "text-slate-400"
                          }`}
                        >
                          {rewrittenCaption.length}/500
                        </span>
                      </div>
                      <textarea
                        rows={4}
                        value={rewrittenCaption}
                        onChange={(e) => setRewrittenCaption(e.target.value)}
                        className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-purple-500 focus:bg-white"
                        placeholder="Nội dung bài viết trên Threads..."
                      />
                    </div>

                    {/* 3. Matched Deal from Weekly Pool */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                          <ShoppingBag className="w-3.5 h-3.5 text-orange-600" /> Sản phẩm tiếp thị phù hợp (Weekly Pool)
                        </label>
                        {matchedProduct && (
                          <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-orange-100 text-orange-700">
                            🎯 Best Deal Match
                          </span>
                        )}
                      </div>

                      {!matchedProduct ? (
                        <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800">
                          Chưa tìm thấy deal tương ứng từ Weekly Pool. Bạn vẫn có thể lưu bài Draft video này.
                        </div>
                      ) : (
                        <div className="p-3 bg-white border-2 border-orange-400/80 rounded-xl shadow-xs space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-xs font-bold text-slate-800 truncate" title={matchedProduct.name}>
                              {matchedProduct.name}
                            </p>
                            <div className="text-xs font-bold text-orange-600 shrink-0">
                              {matchedProduct.price ? `${matchedProduct.price.toLocaleString("vi-VN")}đ` : "Ưu đãi"}
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center gap-2 text-[11px]">
                            {matchedProduct.shopVoucherCode && (
                              <span className="bg-purple-100 text-purple-700 font-mono font-bold px-2 py-0.5 rounded-md flex items-center gap-1 border border-purple-200">
                                🎟 Mã shop: {matchedProduct.shopVoucherCode}
                                {matchedProduct.shopDiscountAmount ? ` (giảm ${formatK(matchedProduct.shopDiscountAmount)})` : ""}
                              </span>
                            )}
                            {matchedProduct.affiliateUrl && (
                              <span className="text-indigo-600 font-mono font-medium truncate max-w-sm flex items-center gap-1 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                                <ExternalLink className="w-3 h-3 shrink-0" /> {matchedProduct.affiliateUrl}
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* 4. Persona Switcher & Comment Preview */}
                    {matchedProduct && (
                      <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                            <MessageSquare className="w-3.5 h-3.5 text-indigo-600" /> Mẫu bình luận Affiliate tự động
                          </label>

                          <div className="flex items-center gap-1 bg-white p-1 rounded-lg border border-slate-200">
                            <button
                              type="button"
                              onClick={() => handleSelectPersona("HELPFUL_REVIEWER")}
                              className={`px-2.5 py-1 rounded-md text-xs font-bold transition-all ${
                                activePersona === "HELPFUL_REVIEWER"
                                  ? "bg-indigo-600 text-white shadow-xs"
                                  : "text-slate-600 hover:text-slate-900"
                              }`}
                            >
                              💬 Review Trúng Đích
                            </button>
                            <button
                              type="button"
                              onClick={() => handleSelectPersona("COMBO_VALUE_HACKER")}
                              className={`px-2.5 py-1 rounded-md text-xs font-bold transition-all ${
                                activePersona === "COMBO_VALUE_HACKER"
                                  ? "bg-indigo-600 text-white shadow-xs"
                                  : "text-slate-600 hover:text-slate-900"
                              }`}
                            >
                              🧮 Tính Giá Combo
                            </button>
                          </div>
                        </div>

                        <textarea
                          rows={3}
                          value={customReplyText}
                          onChange={(e) => setCustomReplyText(e.target.value)}
                          className="w-full p-2.5 bg-white border border-slate-200 rounded-lg text-xs font-mono text-slate-700 leading-relaxed focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                          placeholder="Nội dung bình luận chứa link tiếp thị..."
                        />
                      </div>
                    )}

                    {/* Save Success Notice */}
                    {saveSuccess && (
                      <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                          <span>{saveSuccess}</span>
                        </div>
                        <a
                          href="/posts?status=DRAFT"
                          className="font-bold underline text-emerald-700 hover:text-emerald-900 shrink-0"
                        >
                          Xem bài Draft →
                        </a>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-5 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-3 sticky bottom-0 z-10">
              <button
                type="button"
                onClick={() => setSelectedCandidate(null)}
                className="px-4 py-2 text-sm font-semibold text-slate-600 hover:text-slate-800 rounded-xl hover:bg-slate-200"
              >
                Hủy bỏ
              </button>

              <button
                type="button"
                onClick={handleSaveDraftPost}
                disabled={savingDraft || preparingBait || !rewrittenCaption.trim()}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 disabled:opacity-50 text-white font-bold rounded-xl text-sm shadow-md transition-all"
              >
                {savingDraft ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" /> Đang lưu...
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" /> Save to Draft Posts
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

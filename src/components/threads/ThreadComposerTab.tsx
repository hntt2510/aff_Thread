"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  PenSquare,
  Sparkles,
  RefreshCw,
  Copy,
  Check,
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  Flame,
  Tag,
  ShieldCheck,
  HelpCircle,
  Rocket,
  Clipboard,
  FileText,
  SlidersHorizontal,
  ChevronDown,
  ChevronUp,
  Link as LinkIcon,
  Wand2,
} from "lucide-react";
import {
  type ThreadArchetype,
  type ThreadNiche,
  sanitizeProductTitle,
  inferNiche,
} from "@/lib/threads/thread-composer-utils";
import {
  buildThreadsComposerPrompt,
  parseGeminiResponse,
} from "@/lib/threads/thread-prompt-builder";

interface AccountOption {
  id: string;
  username: string;
  displayName: string;
}

interface ThreadComposerTabProps {
  poolProducts?: Array<{
    product: { id: string; title: string; category: string | null; productUrl: string };
    offer?: { affiliateUrl: string; commissionRate?: string | null } | null;
  }>;
  topOffers?: Array<{
    productId: string;
    productTitle: string;
    affiliateUrl: string;
    commissionRate: number;
    price: number;
  }>;
}

const ARCHETYPES: Array<{
  id: ThreadArchetype;
  label: string;
  hookExample: string;
  desc: string;
}> = [
  {
    id: "REGRET_EXPERIENCE",
    label: "Biết thế mua sớm hơn ⏳",
    hookExample: "Nói thật là tui hối hận vì không chịu tìm hiểu vụ này sớm hơn cả năm trời...",
    desc: "Kể về nỗi đau/vật lộn khi chưa dùng, khoảnh khắc nhận ra giải pháp và tiếc vì không làm sớm hơn.",
  },
  {
    id: "UNPOPULAR_OPINION",
    label: "Góc nhìn trái chiều / Tranh luận 🔥",
    hookExample: "Góc nhìn hơi trái chiều một tí nhưng mng cứ thần thánh hóa đồ đắt đỏ chứ tui thấy...",
    desc: "Quan điểm ngược dòng hợp lý, kích thích người đọc vào tranh luận sôi nổi ở phần bình luận.",
  },
  {
    id: "CURATED_LIST",
    label: "List đồ cứu rỗi / Top 3 chân ái 📋",
    hookExample: "Top những món cứu rỗi làn da/góc làm việc mùa này mà tui ước biết sớm...",
    desc: "Danh sách giá trị cao giải quyết vấn đề, giấu tên món đỉnh nhất để kích thích bấm xem bình luận.",
  },
];

const NICHES: Array<{ id: ThreadNiche; label: string; desc: string }> = [
  { id: "SKINCARE", label: "Skincare / Mỹ phẩm 💄", desc: "Phục hồi, mụn, kem chống nắng, dưỡng ẩm bình dân" },
  { id: "OFFICE_LIFESTYLE", label: "Dân Văn Phòng / Setup 💼", desc: "Đau lưng mỏi cổ, công thái học, bàn làm việc, trà ấm" },
  { id: "FASHION", label: "Thời Trang & Phụ Kiện 👗", desc: "Phối đồ basic, quần hack chân, phong cách tối giản" },
];

export default function ThreadComposerTab({ poolProducts = [], topOffers = [] }: ThreadComposerTabProps) {
  // Input fields
  const [productName, setProductName] = useState("");
  const [affiliateUrl, setAffiliateUrl] = useState("");
  const [niche, setNiche] = useState<ThreadNiche>("SKINCARE");
  const [archetype, setArchetype] = useState<ThreadArchetype>("REGRET_EXPERIENCE");
  const [voucherCode, setVoucherCode] = useState("");
  const [voucherDiscount, setVoucherDiscount] = useState("");
  const [priceFormatted, setPriceFormatted] = useState("");
  const [painPoints, setPainPoints] = useState("");

  // Gemini Web URL Config
  const [geminiWebUrl, setGeminiWebUrl] = useState("https://gemini.google.com/app");
  const [showGeminiConfig, setShowGeminiConfig] = useState(false);

  // Prompt generation & Clipboard state
  const [generatedPromptText, setGeneratedPromptText] = useState("");
  const [showPromptPreview, setShowPromptPreview] = useState(false);
  const [promptCopied, setPromptCopied] = useState(false);
  const [promptStatusMessage, setPromptStatusMessage] = useState<string | null>(null);

  // Import & Editor state
  const [rawGeminiInput, setRawGeminiInput] = useState("");
  const [editableMainPost, setEditableMainPost] = useState("");
  const [editableFirstReply, setEditableFirstReply] = useState("");
  const [copiedMain, setCopiedMain] = useState(false);
  const [copiedReply, setCopiedReply] = useState(false);
  const [smartSplitSuccess, setSmartSplitSuccess] = useState(false);

  // UI status & error
  const [error, setError] = useState<string | null>(null);

  // Draft & Publishing
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>("");
  const [savingPlan, setSavingPlan] = useState(false);
  const [draftSavedPostId, setDraftSavedPostId] = useState<string | null>(null);
  const [draftSuccessMsg, setDraftSuccessMsg] = useState<string | null>(null);
  const [publishingNow, setPublishingNow] = useState(false);
  const [publishStageMsg, setPublishStageMsg] = useState<string | null>(null);
  const [publishedThreadUrl, setPublishedThreadUrl] = useState<string | null>(null);
  const [replyTimingMode, setReplyTimingMode] = useState<"DELAY_60" | "DELAY_120" | "MANUAL" | "METRIC_MILESTONE">("DELAY_60");

  // Load accounts and custom Gemini URL on mount
  useEffect(() => {
    async function loadInitialData() {
      try {
        const res = await fetch("/api/accounts");
        const data = await res.json();
        if (res.ok && data.accounts && data.accounts.length > 0) {
          setAccounts(data.accounts);
          setSelectedAccountId(data.accounts[0].id);
        }
      } catch (e) {
        console.warn("Could not load Threads accounts:", e);
      }

      try {
        const localGemUrl = localStorage.getItem("gemini_web_url");
        if (localGemUrl) {
          setGeminiWebUrl(localGemUrl);
        } else {
          const sRes = await fetch("/api/settings");
          const sData = await sRes.json();
          if (sRes.ok && sData.settings) {
            const gemSetting = sData.settings.find((s: any) => s.key === "GEMINI_CUSTOM_URL");
            if (gemSetting?.hasValue && gemSetting.maskedValue) {
              setGeminiWebUrl(gemSetting.maskedValue);
            }
          }
        }
      } catch (e) {
        console.warn("Could not load custom Gemini URL:", e);
      }
    }
    loadInitialData();
  }, []);

  const handleQuickSelectPool = (item: any) => {
    const rawTitle = item.product.title || "";
    const cleanTitle = sanitizeProductTitle(rawTitle) || rawTitle;
    setProductName(cleanTitle);
    setAffiliateUrl(item.offer?.affiliateUrl || item.product.productUrl || "");
    const inferred = inferNiche(item.product.category, rawTitle);
    setNiche(inferred);
  };

  const handleQuickSelectTopOffer = (offer: any) => {
    const rawTitle = offer.productTitle || "";
    const cleanTitle = sanitizeProductTitle(rawTitle) || rawTitle;
    setProductName(cleanTitle);
    setAffiliateUrl(offer.affiliateUrl);
    const inferred = inferNiche(undefined, rawTitle);
    setNiche(inferred);
    if (offer.price > 0) {
      setPriceFormatted(new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(offer.price));
    }
  };

  const handleOpenGeminiWithPrompt = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!productName.trim()) {
      setError("Vui lòng nhập tên sản phẩm chốt đơn.");
      return;
    }
    if (!affiliateUrl.trim()) {
      setError("Vui lòng nhập đường dẫn Affiliate Shopee.");
      return;
    }

    try {
      setError(null);
      setDraftSuccessMsg(null);
      setPublishedThreadUrl(null);

      const prompt = buildThreadsComposerPrompt({
        productName: productName.trim(),
        affiliateUrl: affiliateUrl.trim(),
        niche,
        archetype,
        voucherCode: voucherCode.trim() || undefined,
        voucherDiscount: voucherDiscount.trim() || undefined,
        priceFormatted: priceFormatted.trim() || undefined,
        painPoints: painPoints.trim() ? [painPoints.trim()] : undefined,
      });

      setGeneratedPromptText(prompt);

      // 1. Copy prompt to clipboard
      try {
        await navigator.clipboard.writeText(prompt);
        setPromptCopied(true);
        setTimeout(() => setPromptCopied(false), 3500);
      } catch (clipErr) {
        console.warn("Clipboard write failed or blocked:", clipErr);
      }

      // 2. Open Gemini Web / Gem in a new browser tab
      const targetUrl = geminiWebUrl.trim() || "https://gemini.google.com/app";
      window.open(targetUrl, "_blank", "noopener,noreferrer");

      // 3. Informative feedback
      setPromptStatusMessage(
        "⚡ Đã copy prompt vào clipboard & đang mở Gemini Web! Bạn hãy dán (Ctrl+V) vào Gemini, sau đó copy kết quả về dán vào bảng bên phải."
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    }
  };

  const handleApplyRawGeminiText = () => {
    if (!rawGeminiInput.trim()) {
      setError("Vui lòng dán nội dung từ Gemini vào ô dán nhanh.");
      return;
    }

    const parsed = parseGeminiResponse(rawGeminiInput);
    if (!parsed.mainPost && !parsed.firstReply) {
      setError("Không nhận diện được cấu trúc bài viết. Vui lòng kiểm tra lại nội dung đã copy.");
      return;
    }

    setEditableMainPost(parsed.mainPost);
    if (parsed.firstReply) {
      setEditableFirstReply(parsed.firstReply);
    }
    setError(null);
    setSmartSplitSuccess(true);
    setTimeout(() => setSmartSplitSuccess(false), 3000);
  };

  const handleCopyText = (text: string, isReply: boolean) => {
    navigator.clipboard.writeText(text);
    if (isReply) {
      setCopiedReply(true);
      setTimeout(() => setCopiedReply(false), 2000);
    } else {
      setCopiedMain(true);
      setTimeout(() => setCopiedMain(false), 2000);
    }
  };

  const handleInsertAffiliateLinkToReply = () => {
    if (!affiliateUrl.trim()) return;
    if (editableFirstReply.includes(affiliateUrl.trim())) return;
    const addition = `\n\n👉 Link tui mua chính hãng ở đây nhé mng: ${affiliateUrl.trim()}`;
    setEditableFirstReply((prev) => (prev ? `${prev.trim()}${addition}` : addition.trim()));
  };

  const handleSavePlan = async () => {
    if (!selectedAccountId) {
      setError("Vui lòng chọn tài khoản Threads để tạo bản nháp.");
      return;
    }
    if (!editableMainPost.trim()) {
      setError("Vui lòng nhập hoặc dán nội dung Bài viết chính (Main Post).");
      return;
    }
    if (!editableFirstReply.trim()) {
      setError("Vui lòng nhập hoặc dán nội dung Bình luận chốt đơn (First Reply).");
      return;
    }
    if (editableMainPost.length > 500) {
      setError(`Bài viết chính hiện có ${editableMainPost.length} ký tự, vượt quá giới hạn 500 ký tự của Threads. Vui lòng rút gọn bớt.`);
      return;
    }

    try {
      setSavingPlan(true);
      setError(null);

      // 1. Create draft post in /api/posts
      const postRes = await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId: selectedAccountId,
          text: editableMainPost.trim(),
          mediaType: "TEXT",
          mediaItems: [],
          mode: "draft",
        }),
      });

      const postData = await postRes.json();
      if (!postRes.ok || !postData.post?.id) {
        throw new Error(postData.error || "Lỗi tạo bài viết nháp.");
      }

      const createdPostId = postData.post.id;

      // 2. Attach first reply draft via /api/shopee/matcher/create-plan
      const triggerMode =
        replyTimingMode === "METRIC_MILESTONE"
          ? "ON_METRIC_REACHED"
          : replyTimingMode === "MANUAL"
          ? "MANUAL"
          : "DELAY";

      const scheduledAt =
        replyTimingMode === "DELAY_60"
          ? new Date(Date.now() + 60 * 60 * 1000).toISOString()
          : replyTimingMode === "DELAY_120"
          ? new Date(Date.now() + 120 * 60 * 1000).toISOString()
          : undefined;

      const planRes = await fetch("/api/shopee/matcher/create-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          postId: createdPostId,
          replyText: editableFirstReply.trim(),
          directAffiliateUrl: affiliateUrl.trim(),
          triggerMode,
          targetViews: replyTimingMode === "METRIC_MILESTONE" ? 300 : undefined,
          targetReplies: replyTimingMode === "METRIC_MILESTONE" ? 2 : undefined,
          maxWaitHours: replyTimingMode === "METRIC_MILESTONE" ? 12 : undefined,
          scheduledAt,
        }),
      });

      const planData = await planRes.json();
      if (!planRes.ok || !planData.success) {
        console.warn("Could not create reply plan:", planData.error);
      }

      setDraftSavedPostId(createdPostId);
      setDraftSuccessMsg("Đã lưu bài viết & lập kế hoạch chốt đơn thành công!");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setSavingPlan(false);
    }
  };

  const handlePublishNow = async () => {
    if (!selectedAccountId) {
      setError("Vui lòng chọn tài khoản Threads để đăng bài.");
      return;
    }
    if (!editableMainPost.trim()) {
      setError("Nội dung bài viết chính không được để trống.");
      return;
    }
    if (editableMainPost.length > 480) {
      setError(`Bài viết chính hiện có ${editableMainPost.length} ký tự, vượt quá giới hạn 480 ký tự cho phép. Vui lòng rút gọn bớt trước khi xuất bản.`);
      return;
    }

    try {
      setPublishingNow(true);
      setError(null);
      setPublishedThreadUrl(null);

      const triggerMode =
        replyTimingMode === "METRIC_MILESTONE"
          ? "ON_METRIC_REACHED"
          : replyTimingMode === "MANUAL"
          ? "MANUAL"
          : "DELAY";

      const delayReplyMinutes =
        replyTimingMode === "DELAY_60" ? 60 : replyTimingMode === "DELAY_120" ? 120 : undefined;
      const manualReplyOnly = replyTimingMode === "MANUAL";
      const targetViews = replyTimingMode === "METRIC_MILESTONE" ? 300 : undefined;
      const targetReplies = replyTimingMode === "METRIC_MILESTONE" ? 2 : undefined;
      const maxWaitHours = replyTimingMode === "METRIC_MILESTONE" ? 12 : undefined;

      const payload = draftSavedPostId
        ? {
            postId: draftSavedPostId,
            delayReplyMinutes,
            manualReplyOnly,
            triggerMode,
            targetViews,
            targetReplies,
            maxWaitHours,
          }
        : {
            accountId: selectedAccountId,
            mainPostText: editableMainPost.trim(),
            firstReplyText: editableFirstReply.trim() || undefined,
            directAffiliateUrl: affiliateUrl.trim() || undefined,
            delayReplyMinutes,
            manualReplyOnly,
            triggerMode,
            targetViews,
            targetReplies,
            maxWaitHours,
          };

      const res = await fetch("/api/threads/publish-now", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Không thể xuất bản bài mồi lên Threads.");
      }

      setPublishedThreadUrl(data.threadUrl);
      setDraftSuccessMsg(null);
      if (data.postId) {
        setDraftSavedPostId(data.postId);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setPublishingNow(false);
      setPublishStageMsg(null);
    }
  };

  const hasQuestionMark = editableMainPost.includes("?");
  const hasAffiliateLinkInReply = affiliateUrl.trim() ? editableFirstReply.includes(affiliateUrl.trim()) : true;

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white rounded-2xl p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/20 text-indigo-300 text-xs font-semibold border border-indigo-500/30">
              <Sparkles className="w-3.5 h-3.5" />
              Web-Redirect Prompt Workflow & Manual Import
            </div>
            <h2 className="text-xl font-bold tracking-tight">Threads Copywriting & Deal Publisher</h2>
            <p className="text-xs text-slate-300 max-w-2xl leading-relaxed">
              Tạo prompt tối ưu kể chuyện Gen Z, sao chép 1-click và mở tab Gemini Web/Gem. Dán kết quả về để xuất bản bài mồi thuần text và tự động gieo bình luận chốt deal có gắn link affiliate.
            </p>
          </div>
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => setShowGeminiConfig(!showGeminiConfig)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium bg-white/10 hover:bg-white/20 text-white transition-colors border border-white/10"
              title="Cấu hình đường dẫn Gemini Web / Custom Gem"
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-indigo-300" />
              <span>Gem URL</span>
            </button>
            <Link
              href="/settings"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium bg-white/10 hover:bg-white/20 text-white transition-colors border border-white/10"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Cài đặt hệ thống
            </Link>
          </div>
        </div>

        {/* Expandable Gem URL configuration */}
        {showGeminiConfig && (
          <div className="mt-4 pt-4 border-t border-white/10 flex flex-col sm:flex-row items-start sm:items-center gap-3 animate-in fade-in duration-200">
            <div className="flex-1 w-full">
              <label className="block text-[11px] font-medium text-slate-300 mb-1">
                Đường dẫn Gemini Web / Custom Gem của bạn:
              </label>
              <input
                type="url"
                value={geminiWebUrl}
                onChange={(e) => {
                  setGeminiWebUrl(e.target.value);
                  localStorage.setItem("gemini_web_url", e.target.value);
                }}
                placeholder="https://gemini.google.com/app hoặc link Gem riêng"
                className="w-full text-xs bg-slate-800/80 border border-slate-700 rounded-xl px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-400 font-mono"
              />
            </div>
            <button
              type="button"
              onClick={() => {
                setGeminiWebUrl("https://gemini.google.com/app");
                localStorage.removeItem("gemini_web_url");
              }}
              className="mt-5 text-xs text-indigo-300 hover:text-white underline shrink-0"
            >
              Đặt lại mặc định
            </button>
          </div>
        )}
      </div>

      {/* Quick Select Candidate Deal */}
      {(poolProducts.length > 0 || topOffers.length > 0) && (
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
              <Tag className="w-3.5 h-3.5 text-orange-500" />
              Chọn nhanh sản phẩm từ Pool hoặc Top Offers
            </span>
            <span className="text-[11px] text-slate-400">Click để tự động điền form</span>
          </div>

          <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
            {poolProducts.slice(0, 5).map((p) => (
              <button
                key={p.product.id}
                type="button"
                onClick={() => handleQuickSelectPool(p)}
                className="shrink-0 px-3 py-1.5 rounded-lg bg-slate-50 hover:bg-indigo-50 border border-slate-200 hover:border-indigo-300 text-slate-700 text-left transition-colors max-w-[200px] truncate"
                title={p.product.title}
              >
                <span className="font-medium truncate block">{p.product.title}</span>
              </button>
            ))}

            {topOffers.slice(0, 5).map((o) => (
              <button
                key={o.productId}
                type="button"
                onClick={() => handleQuickSelectTopOffer(o)}
                className="shrink-0 px-3 py-1.5 rounded-lg bg-orange-50 hover:bg-orange-100 border border-orange-200 text-orange-800 text-left transition-colors max-w-[200px] truncate flex items-center gap-1.5"
                title={o.productTitle}
              >
                <Flame className="w-3 h-3 text-orange-500 shrink-0" />
                <span className="font-medium truncate block">{o.productTitle}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Main Composer Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Col: Setup & Action Button */}
        <form onSubmit={handleOpenGeminiWithPrompt} className="lg:col-span-5 bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-5">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <PenSquare className="w-4 h-4 text-indigo-600" />
              1. Thiết lập chiến dịch & Tạo Prompt
            </h3>
            <span className="text-[11px] text-slate-400">Bước 1/2</span>
          </div>

          {/* Archetype Selector */}
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-slate-700">
              Phong cách Copywriting (Archetype)
            </label>
            <div className="space-y-2">
              {ARCHETYPES.map((arch) => (
                <div
                  key={arch.id}
                  onClick={() => setArchetype(arch.id)}
                  className={`p-3 rounded-xl border cursor-pointer transition-all ${
                    archetype === arch.id
                      ? "bg-indigo-50/70 border-indigo-500 text-slate-900 shadow-xs"
                      : "bg-slate-50/50 border-slate-200 hover:border-slate-300 text-slate-700"
                  }`}
                >
                  <div className="flex items-center justify-between font-semibold text-xs mb-1">
                    <span>{arch.label}</span>
                    {archetype === arch.id && <Check className="w-4 h-4 text-indigo-600" />}
                  </div>
                  <p className="text-[11px] text-slate-500 line-clamp-2">{arch.desc}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Niche Selector */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Chủ đề / Niche
            </label>
            <div className="grid grid-cols-3 gap-2">
              {NICHES.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => setNiche(n.id)}
                  className={`py-2 px-2.5 rounded-xl border text-center text-xs font-medium transition-all ${
                    niche === n.id
                      ? "bg-slate-900 text-white border-slate-900 shadow-xs"
                      : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {n.label}
                </button>
              ))}
            </div>
          </div>

          {/* Product Name & Link */}
          <div className="space-y-3 pt-2 border-t border-slate-100">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Tên sản phẩm chốt đơn <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={productName}
                onChange={(e) => setProductName(e.target.value)}
                placeholder="VD: Kem dưỡng phục hồi B5 La Roche-Posay..."
                required
                className="w-full text-xs sm:text-sm border border-slate-300 rounded-xl px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <p className="text-[10px] text-slate-400 mt-1">
                * Prompt sẽ tự động giữ bí mật tên sản phẩm trong Main Post và chỉ tiết lộ ở First Reply.
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Đường dẫn Affiliate Shopee <span className="text-red-500">*</span>
              </label>
              <input
                type="url"
                value={affiliateUrl}
                onChange={(e) => setAffiliateUrl(e.target.value)}
                placeholder="https://s.shopee.vn/..."
                required
                className="w-full text-xs sm:text-sm border border-slate-300 rounded-xl px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
              />
            </div>
          </div>

          {/* Voucher & Price (Optional) */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Mã Voucher (nếu có)
              </label>
              <input
                type="text"
                value={voucherCode}
                onChange={(e) => setVoucherCode(e.target.value.toUpperCase())}
                placeholder="VD: LAZ20K, SHOPEE50"
                className="w-full text-xs border border-slate-300 rounded-xl px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Mức giá tham khảo
              </label>
              <input
                type="text"
                value={priceFormatted}
                onChange={(e) => setPriceFormatted(e.target.value)}
                placeholder="VD: 189.000đ"
                className="w-full text-xs border border-slate-300 rounded-xl px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          {/* Pain Point Note */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Ghi chú nỗi đau / Trải nghiệm cá nhân (tùy chọn)
            </label>
            <textarea
              rows={2}
              value={painPoints}
              onChange={(e) => setPainPoints(e.target.value)}
              placeholder="VD: Da treatment bị bong tróc đỏ rát, bôi gì cũng xót..."
              className="w-full text-xs border border-slate-300 rounded-xl p-2.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* Action Button: Mở Gemini & Tạo Prompt */}
          <div className="pt-2 space-y-2">
            <button
              type="submit"
              className="w-full py-3.5 bg-gradient-to-r from-indigo-600 via-indigo-700 to-purple-700 hover:from-indigo-700 hover:to-purple-800 text-white rounded-xl text-xs sm:text-sm font-bold transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-2 active:scale-[0.99]"
            >
              <Sparkles className="w-4 h-4 text-amber-300 animate-pulse" />
              <span>⚡ Mở Gemini & Tạo Prompt</span>
              <ExternalLink className="w-3.5 h-3.5 text-indigo-200" />
            </button>
            <p className="text-[11px] text-slate-500 text-center leading-relaxed">
              Tự động đóng gói prompt chuẩn Gen Z, copy vào Clipboard và mở tab Gemini Web để bạn paste (Ctrl+V) tạo bài.
            </p>
          </div>
        </form>

        {/* Right Col: Import, Editor & Plan Workflow */}
        <div className="lg:col-span-7 space-y-4">
          {/* Error Message */}
          {error && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3 text-red-700 text-xs sm:text-sm animate-in fade-in duration-200">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <div className="flex-1">{error}</div>
            </div>
          )}

          {/* Prompt Copied Status Notification */}
          {promptStatusMessage && (
            <div className="p-4 bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-200 rounded-xl space-y-2 text-indigo-950 text-xs sm:text-sm animate-in fade-in duration-200">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2.5">
                  <CheckCircle2 className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
                  <div className="leading-relaxed font-medium">{promptStatusMessage}</div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowPromptPreview(!showPromptPreview)}
                  className="px-2.5 py-1 text-xs text-indigo-700 hover:text-indigo-900 bg-white border border-indigo-200 rounded-lg hover:bg-indigo-50 transition-colors shrink-0 flex items-center gap-1"
                >
                  {showPromptPreview ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  {showPromptPreview ? "Ẩn Prompt" : "Xem Prompt"}
                </button>
              </div>

              {showPromptPreview && generatedPromptText && (
                <div className="mt-3 pt-3 border-t border-indigo-200/60 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-mono text-slate-600 uppercase font-semibold">
                      Nội dung Prompt đã copy vào clipboard:
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(generatedPromptText);
                        setPromptCopied(true);
                        setTimeout(() => setPromptCopied(false), 2000);
                      }}
                      className="inline-flex items-center gap-1 text-[11px] text-indigo-700 font-semibold hover:underline"
                    >
                      {promptCopied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                      {promptCopied ? "Đã copy lại!" : "Copy lại"}
                    </button>
                  </div>
                  <pre className="text-[11px] bg-white/80 border border-indigo-100 rounded-lg p-3 text-slate-800 whitespace-pre-wrap font-mono max-h-48 overflow-y-auto leading-relaxed">
                    {generatedPromptText}
                  </pre>
                </div>
              )}
            </div>
          )}

          {/* Draft Saved Success Message */}
          {draftSuccessMsg && (
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between gap-3 text-emerald-800 text-xs sm:text-sm animate-in fade-in duration-200">
              <div className="flex items-center gap-2 font-medium">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                {draftSuccessMsg}
              </div>
              <Link
                href="/posts"
                className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-semibold hover:bg-emerald-700 transition-colors shrink-0"
              >
                Xem tại Quản lý bài viết &rarr;
              </Link>
            </div>
          )}

          {/* Publishing Stage Message */}
          {publishStageMsg && (
            <div className="p-4 bg-indigo-50 border border-indigo-200 rounded-xl flex items-center gap-3 text-indigo-900 text-xs sm:text-sm">
              <RefreshCw className="w-5 h-5 text-indigo-600 animate-spin shrink-0" />
              <div className="flex-1">
                <span className="font-semibold block">Đang xuất bản lên Threads:</span>
                <span className="text-indigo-700 text-xs">{publishStageMsg}</span>
              </div>
            </div>
          )}

          {/* Published Thread URL */}
          {publishedThreadUrl && (
            <div className="p-4 bg-gradient-to-r from-emerald-50 via-teal-50 to-indigo-50 border border-emerald-300 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-emerald-950 shadow-xs animate-in fade-in duration-200">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                  <Rocket className="w-5 h-5" />
                </div>
                <div>
                  <div className="font-bold text-xs sm:text-sm text-emerald-950">
                    Bài viết đã xuất bản trực tiếp lên Meta Threads! 🚀
                  </div>
                  <div className="text-[11px] text-emerald-700 font-mono truncate max-w-sm sm:max-w-md mt-0.5">
                    {publishedThreadUrl}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 w-full sm:w-auto mt-2 sm:mt-0">
                <a
                  href={publishedThreadUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold transition-colors shadow-xs"
                >
                  <span>Xem trên Threads</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
                <Link
                  href="/posts"
                  className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-lg text-xs font-medium transition-colors"
                >
                  Quản lý bài
                </Link>
              </div>
            </div>
          )}

          {/* Smart Paste / Import Box */}
          <div className="bg-gradient-to-r from-indigo-50/50 via-slate-50 to-purple-50/50 border border-indigo-100 rounded-2xl p-4 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg bg-indigo-600 text-white flex items-center justify-center text-xs font-bold shadow-xs">
                  <Wand2 className="w-3.5 h-3.5" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                    Dán nhanh toàn bộ kết quả từ Gemini (Tự động tách)
                  </h4>
                  <p className="text-[11px] text-slate-500">
                    Sao chép toàn bộ phản hồi từ Gemini và dán vào đây để tự động điền Main Post & First Reply
                  </p>
                </div>
              </div>
              {smartSplitSuccess && (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200 animate-in fade-in">
                  <Check className="w-3.5 h-3.5" /> Đã tách thành công!
                </span>
              )}
            </div>

            <textarea
              rows={3}
              value={rawGeminiInput}
              onChange={(e) => setRawGeminiInput(e.target.value)}
              placeholder="Dán (Ctrl+V) toàn bộ câu trả lời từ Gemini vào đây (chứa === MAIN POST === và === FIRST REPLY ===)..."
              className="w-full text-xs font-mono border border-slate-200 rounded-xl p-3 bg-white text-slate-800 leading-relaxed focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />

            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={async () => {
                  try {
                    const clipText = await navigator.clipboard.readText();
                    if (clipText) setRawGeminiInput(clipText);
                  } catch {
                    // Fallback to manual paste
                  }
                }}
                className="text-[11px] text-slate-600 hover:text-indigo-600 flex items-center gap-1"
              >
                <Clipboard className="w-3.5 h-3.5" /> Dán từ Clipboard
              </button>

              <button
                type="button"
                onClick={handleApplyRawGeminiText}
                disabled={!rawGeminiInput.trim()}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-xs font-semibold transition-all shadow-xs flex items-center gap-1.5"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                <span>⚡ Tách & Áp dụng nội dung</span>
              </button>
            </div>
          </div>

          {/* Main Post Card */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-indigo-500"></span>
                <span className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                  Bài Đăng Chính (Main Post - 100% Pure Text)
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={`text-[11px] px-2.5 py-0.5 rounded-full font-mono transition-colors ${
                    editableMainPost.length > 480
                      ? "bg-rose-100 text-rose-700 font-bold border border-rose-300 animate-pulse"
                      : editableMainPost.length > 420
                      ? "bg-amber-100 text-amber-800 border border-amber-300 font-semibold"
                      : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {editableMainPost.length} / 450 ký tự {editableMainPost.length > 480 && "(Quá giới hạn!)"}
                </span>
                <button
                  type="button"
                  onClick={() => handleCopyText(editableMainPost, false)}
                  className="p-1.5 text-slate-500 hover:text-slate-900 rounded-lg hover:bg-slate-100 transition-colors"
                  title="Sao chép nội dung bài chính"
                >
                  {copiedMain ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Badges */}
            <div className="flex flex-wrap items-center gap-2 text-[11px]">
              <span className="inline-flex items-center gap-1 text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                <ShieldCheck className="w-3 h-3" /> Thuần văn bản, không kèm link
              </span>
              <span
                className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border ${
                  hasQuestionMark
                    ? "text-indigo-700 bg-indigo-50 border-indigo-200"
                    : "text-amber-700 bg-amber-50 border-amber-200"
                }`}
              >
                <HelpCircle className="w-3 h-3" />
                {hasQuestionMark ? "Đã có câu hỏi chốt bài" : "Nên có câu hỏi xin lời khuyên cuối bài (?)"}
              </span>
            </div>

            <textarea
              rows={6}
              value={editableMainPost}
              onChange={(e) => setEditableMainPost(e.target.value)}
              placeholder="Dán hoặc viết nội dung bài mồi chính tại đây (tập trung vào nỗi đau/vấn đề, không nhắc tên sản phẩm, kết bài bằng câu hỏi nhờ tư vấn)..."
              className={`w-full text-xs sm:text-sm border rounded-xl p-3.5 leading-relaxed focus:outline-none focus:ring-2 font-sans transition-colors ${
                editableMainPost.length > 480
                  ? "border-rose-300 focus:ring-rose-500 bg-rose-50/20 text-rose-950"
                  : "border-slate-200 focus:ring-indigo-500 text-slate-800"
              }`}
            />

            {editableMainPost.length > 480 && (
              <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs flex items-center gap-2 font-medium">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>
                  Bài viết đang dài {editableMainPost.length} ký tự (vượt quá mức 480 ký tự cho phép). Vui lòng rút gọn bớt để đảm bảo đủ điều kiện đăng lên Threads.
                </span>
              </div>
            )}
          </div>

          {/* First Reply Card */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                <span className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                  Bình Luận Chốt Deal (First Reply Payoff)
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleCopyText(editableFirstReply, true)}
                  className="p-1.5 text-slate-500 hover:text-slate-900 rounded-lg hover:bg-slate-100 transition-colors"
                  title="Sao chép bình luận"
                >
                  {copiedReply ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Badges & Actions */}
            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
              <span
                className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border ${
                  hasAffiliateLinkInReply
                    ? "text-emerald-700 bg-emerald-50 border-emerald-200"
                    : "text-amber-700 bg-amber-50 border-amber-200"
                }`}
              >
                <LinkIcon className="w-3 h-3" />
                {hasAffiliateLinkInReply ? "Đã có link Shopee Affiliate" : "Chưa có link affiliate trong bình luận"}
              </span>

              {!hasAffiliateLinkInReply && affiliateUrl.trim() && (
                <button
                  type="button"
                  onClick={handleInsertAffiliateLinkToReply}
                  className="text-indigo-600 hover:text-indigo-800 font-semibold underline"
                >
                  + Chèn link affiliate vào cuối
                </button>
              )}
            </div>

            <textarea
              rows={5}
              value={editableFirstReply}
              onChange={(e) => setEditableFirstReply(e.target.value)}
              placeholder="Dán hoặc viết nội dung bình luận chốt deal tại đây (mở đầu tự nhiên: 'U là trời, biết ngay mng sẽ hỏi mà! Tui hay xài em...', voucher, giá và link Shopee)..."
              className="w-full text-xs sm:text-sm border border-slate-200 rounded-xl p-3.5 text-slate-800 leading-relaxed focus:outline-none focus:ring-2 focus:ring-indigo-500 font-sans"
            />
          </div>

          {/* Draft & Publish Action Box */}
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-4">
            <div className="w-full">
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Chọn tài khoản Threads để lưu kế hoạch / đăng bài
              </label>
              <select
                value={selectedAccountId}
                onChange={(e) => setSelectedAccountId(e.target.value)}
                className="w-full text-xs border border-slate-300 rounded-xl px-3 py-2 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {accounts.length === 0 && <option value="">Chưa kết nối tài khoản Threads</option>}
                {accounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    @{acc.username} ({acc.displayName})
                  </option>
                ))}
              </select>
            </div>

            {/* Reply Seeding Timing Controls */}
            <div className="space-y-1.5 pt-1 border-t border-slate-200/60">
              <label className="block text-[11px] font-semibold text-slate-700">
                Thời điểm gieo bình luận chốt deal (Reply Seeding):
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                <button
                  type="button"
                  onClick={() => setReplyTimingMode("DELAY_60")}
                  className={`px-3 py-2 rounded-xl text-left border text-xs transition-all ${
                    replyTimingMode === "DELAY_60"
                      ? "bg-indigo-50 border-indigo-400 text-indigo-900 font-semibold ring-1 ring-indigo-400"
                      : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  <span className="block font-medium">🕒 Sau 60 phút</span>
                  <span className="text-[10px] text-slate-400 block font-normal">Đợi bài có view tự nhiên</span>
                </button>
                <button
                  type="button"
                  onClick={() => setReplyTimingMode("DELAY_120")}
                  className={`px-3 py-2 rounded-xl text-left border text-xs transition-all ${
                    replyTimingMode === "DELAY_120"
                      ? "bg-indigo-50 border-indigo-400 text-indigo-900 font-semibold ring-1 ring-indigo-400"
                      : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  <span className="block font-medium">🕒 Sau 120 phút</span>
                  <span className="text-[10px] text-slate-400 block font-normal">An toàn reach tối đa</span>
                </button>
                <button
                  type="button"
                  onClick={() => setReplyTimingMode("METRIC_MILESTONE")}
                  className={`px-3 py-2 rounded-xl text-left border text-xs transition-all ${
                    replyTimingMode === "METRIC_MILESTONE"
                      ? "bg-indigo-50 border-indigo-400 text-indigo-900 font-semibold ring-1 ring-indigo-400"
                      : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  <span className="block font-medium">🎯 Khi đạt mốc</span>
                  <span className="text-[10px] text-slate-400 block font-normal">≥ 300 views hoặc ≥ 2 cmt</span>
                </button>
                <button
                  type="button"
                  onClick={() => setReplyTimingMode("MANUAL")}
                  className={`px-3 py-2 rounded-xl text-left border text-xs transition-all ${
                    replyTimingMode === "MANUAL"
                      ? "bg-indigo-50 border-indigo-400 text-indigo-900 font-semibold ring-1 ring-indigo-400"
                      : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  <span className="block font-medium">✋ Thả thủ công</span>
                  <span className="text-[10px] text-slate-400 block font-normal">Bấm thả trong Posts khi viral</span>
                </button>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-end gap-3 pt-2 border-t border-slate-200/80">
              <button
                type="button"
                onClick={handleSavePlan}
                disabled={
                  savingPlan ||
                  publishingNow ||
                  !selectedAccountId ||
                  !editableMainPost.trim() ||
                  !editableFirstReply.trim() ||
                  editableMainPost.length > 500
                }
                className="w-full sm:w-auto px-4 py-2.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-xl text-xs font-semibold transition-all shadow-xs flex items-center justify-center gap-2 shrink-0 disabled:opacity-50"
              >
                {savingPlan ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Đang lưu kế hoạch...
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4 text-emerald-600" />
                    Lưu bài viết & Lập kế hoạch (Save Plan)
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handlePublishNow}
                disabled={
                  savingPlan ||
                  publishingNow ||
                  !selectedAccountId ||
                  editableMainPost.length > 480 ||
                  !editableMainPost.trim()
                }
                className="w-full sm:w-auto px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 text-white rounded-xl text-xs font-bold transition-all shadow-sm flex items-center justify-center gap-2 shrink-0 disabled:opacity-50"
              >
                {publishingNow ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Đang đăng bài mồi...
                  </>
                ) : (
                  <>
                    <Rocket className="w-4 h-4 text-amber-300" />
                    🚀 Đăng bài mồi ngay (Publish Bait Post)
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

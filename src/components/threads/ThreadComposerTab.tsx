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
  Share2,
  ExternalLink,
  Flame,
  Layers,
  Tag,
  ShieldCheck,
  MessageSquare,
  ArrowRight,
  HelpCircle,
} from "lucide-react";
import type {
  ThreadArchetype,
  ThreadNiche,
  ComposedThreadResult,
} from "@/services/threads/text-thread-composer.service";

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

  // UI state
  const [composing, setComposing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ComposedThreadResult | null>(null);
  const [editableMainPost, setEditableMainPost] = useState("");
  const [editableFirstReply, setEditableFirstReply] = useState("");
  const [copiedMain, setCopiedMain] = useState(false);
  const [copiedReply, setCopiedReply] = useState(false);

  // Draft saving
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>("");
  const [savingDraft, setSavingDraft] = useState(false);
  const [draftSavedPostId, setDraftSavedPostId] = useState<string | null>(null);
  const [draftSuccessMsg, setDraftSuccessMsg] = useState<string | null>(null);

  // Fetch accounts on mount for drafting
  useEffect(() => {
    async function loadAccounts() {
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
    }
    loadAccounts();
  }, []);

  const handleQuickSelectPool = (item: any) => {
    setProductName(item.product.title);
    setAffiliateUrl(item.offer?.affiliateUrl || item.product.productUrl || "");
    if (item.product.category?.toLowerCase().includes("thời trang")) {
      setNiche("FASHION");
    } else if (item.product.category?.toLowerCase().includes("văn phòng") || item.product.category?.toLowerCase().includes("gia dụng")) {
      setNiche("OFFICE_LIFESTYLE");
    } else {
      setNiche("SKINCARE");
    }
  };

  const handleQuickSelectTopOffer = (offer: any) => {
    setProductName(offer.productTitle);
    setAffiliateUrl(offer.affiliateUrl);
    if (offer.price > 0) {
      setPriceFormatted(new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(offer.price));
    }
  };

  const handleCompose = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!productName.trim()) {
      setError("Vui lòng nhập tên sản phẩm.");
      return;
    }
    if (!affiliateUrl.trim()) {
      setError("Vui lòng nhập đường link affiliate.");
      return;
    }

    try {
      setComposing(true);
      setError(null);
      setDraftSavedPostId(null);
      setDraftSuccessMsg(null);

      const res = await fetch("/api/threads/compose-text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productName: productName.trim(),
          affiliateUrl: affiliateUrl.trim(),
          niche,
          archetype,
          voucherCode: voucherCode.trim() || undefined,
          voucherDiscount: voucherDiscount.trim() || undefined,
          priceFormatted: priceFormatted.trim() || undefined,
          painPoints: painPoints.trim() ? [painPoints.trim()] : undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Không thể tạo nội dung");
      }

      setResult(data.data);
      setEditableMainPost(data.data.mainPost);
      setEditableFirstReply(data.data.firstReply);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setComposing(false);
    }
  };

  const handleCopy = (text: string, isReply: boolean) => {
    navigator.clipboard.writeText(text);
    if (isReply) {
      setCopiedReply(true);
      setTimeout(() => setCopiedReply(false), 2000);
    } else {
      setCopiedMain(true);
      setTimeout(() => setCopiedMain(false), 2000);
    }
  };

  const handleSaveDraft = async () => {
    if (!selectedAccountId) {
      setError("Vui lòng chọn tài khoản Threads để tạo bản nháp.");
      return;
    }
    if (!editableMainPost.trim() || !editableFirstReply.trim()) {
      setError("Nội dung bài viết không được để trống.");
      return;
    }
    if (editableMainPost.length > 500) {
      setError(`Bài viết chính hiện có ${editableMainPost.length} ký tự, vượt quá giới hạn 500 ký tự của Threads. Vui lòng rút gọn bớt.`);
      return;
    }

    try {
      setSavingDraft(true);
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
      const planRes = await fetch("/api/shopee/matcher/create-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          postId: createdPostId,
          replyText: editableFirstReply.trim(),
          directAffiliateUrl: affiliateUrl.trim(),
        }),
      });

      const planData = await planRes.json();
      if (!planRes.ok || !planData.success) {
        console.warn("Could not create reply plan:", planData.error);
      }

      setDraftSavedPostId(createdPostId);
      setDraftSuccessMsg("Đã lưu bản nháp thành công kèm kế hoạch trả lời chốt đơn!");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setSavingDraft(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white rounded-2xl p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/20 text-indigo-300 text-xs font-semibold border border-indigo-500/30">
              <Sparkles className="w-3.5 h-3.5" />
              Product-First → Story-Driven Copywriting
            </div>
            <h2 className="text-xl font-bold tracking-tight">High-Converting Text Thread Composer</h2>
            <p className="text-xs text-slate-300 max-w-2xl leading-relaxed">
              Tạo bài viết Threads thuần văn bản (100% không chèn link bài chính để tránh bóp reach), kết bài bằng câu hỏi kích thích hàng chục ngàn bình luận, và tự động chuẩn bị bình luận chốt đơn đính kèm link affiliate.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/settings"
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-medium bg-white/10 hover:bg-white/20 text-white transition-colors border border-white/10"
            >
              Cấu hình Gemini Key
            </Link>
          </div>
        </div>
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

      {/* Main Composer Form */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Col: Setup & Config */}
        <form onSubmit={handleCompose} className="lg:col-span-5 bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-5">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <PenSquare className="w-4 h-4 text-indigo-600" />
              Thiết lập chiến dịch bài viết
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
                * Tên sản phẩm sẽ được giữ bí mật trong Main Post và chỉ tiết lộ ở First Reply.
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

          {/* Submit Button */}
          <button
            type="submit"
            disabled={composing}
            className="w-full py-3 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 text-white rounded-xl text-xs sm:text-sm font-semibold transition-all shadow-sm flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {composing ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                Đang viết bài Threads với AI...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                Tạo Bài Đăng Threads (Gemini 2.5)
              </>
            )}
          </button>
        </form>

        {/* Right Col: Output & Draft Management */}
        <div className="lg:col-span-7 space-y-4">
          {error && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3 text-red-700 text-xs sm:text-sm">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <div className="flex-1">{error}</div>
            </div>
          )}

          {draftSuccessMsg && (
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between gap-3 text-emerald-800 text-xs sm:text-sm">
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

          {!result && !composing && (
            <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center text-slate-400 space-y-3">
              <MessageSquare className="w-12 h-12 mx-auto text-slate-300" />
              <h4 className="font-semibold text-slate-700 text-sm">Chưa có bài viết nào được tạo</h4>
              <p className="text-xs text-slate-400 max-w-sm mx-auto leading-relaxed">
                Điền thông tin sản phẩm và click &quot;Tạo Bài Đăng Threads&quot; ở cột bên trái để AI tự động thiết kế bài storytelling và bình luận chốt sale.
              </p>
            </div>
          )}

          {composing && (
            <div className="bg-white border border-slate-200 rounded-2xl p-16 text-center text-slate-400 space-y-3">
              <RefreshCw className="w-8 h-8 animate-spin mx-auto text-indigo-600" />
              <p className="text-sm font-semibold text-slate-800">Đang tạo nội dung Threads...</p>
              <p className="text-xs text-slate-400">
                Áp dụng quy chuẩn Gen Z tiếng Việt, kiểm duyệt từ khóa bán hàng và tối ưu câu hỏi tranh luận.
              </p>
            </div>
          )}

          {result && (
            <div className="space-y-4 animate-in fade-in duration-300">
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
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-mono">
                      {editableMainPost.length} / 500 ký tự
                    </span>
                    <button
                      type="button"
                      onClick={() => handleCopy(editableMainPost, false)}
                      className="p-1.5 text-slate-500 hover:text-slate-900 rounded-lg hover:bg-slate-100 transition-colors"
                      title="Sao chép nội dung"
                    >
                      {copiedMain ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Badges */}
                <div className="flex flex-wrap items-center gap-2 text-[11px]">
                  <span className="inline-flex items-center gap-1 text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                    <ShieldCheck className="w-3 h-3" /> Không lộ tên sản phẩm / link
                  </span>
                  <span className="inline-flex items-center gap-1 text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-200">
                    <HelpCircle className="w-3 h-3" /> Kết thúc bằng câu hỏi tương tác
                  </span>
                </div>

                <textarea
                  rows={6}
                  value={editableMainPost}
                  onChange={(e) => setEditableMainPost(e.target.value)}
                  className="w-full text-xs sm:text-sm border border-slate-200 rounded-xl p-3.5 text-slate-800 leading-relaxed focus:outline-none focus:ring-2 focus:ring-indigo-500 font-sans"
                />
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
                      onClick={() => handleCopy(editableFirstReply, true)}
                      className="p-1.5 text-slate-500 hover:text-slate-900 rounded-lg hover:bg-slate-100 transition-colors"
                      title="Sao chép bình luận"
                    >
                      {copiedReply ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <textarea
                  rows={5}
                  value={editableFirstReply}
                  onChange={(e) => setEditableFirstReply(e.target.value)}
                  className="w-full text-xs sm:text-sm border border-slate-200 rounded-xl p-3.5 text-slate-800 leading-relaxed focus:outline-none focus:ring-2 focus:ring-indigo-500 font-sans"
                />
              </div>

              {/* Save as Draft Post Action Box */}
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="w-full sm:w-auto flex-1">
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Chọn tài khoản Threads để lưu nháp
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

                <button
                  type="button"
                  onClick={handleSaveDraft}
                  disabled={savingDraft || !selectedAccountId}
                  className="w-full sm:w-auto px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold transition-all shadow-xs flex items-center justify-center gap-2 shrink-0 disabled:opacity-50 mt-auto"
                >
                  {savingDraft ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Đang lưu...
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4 text-emerald-400" />
                      Lưu Draft & Tạo Kế Hoạch Reply
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams } from "next/navigation";
import {
  ShoppingBag,
  Sparkles,
  RefreshCw,
  Plus,
  Play,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Clock,
  ExternalLink,
  Copy,
  Check,
  Search,
  Filter,
  Layers,
  ArrowRight,
  TrendingUp,
  Tag,
  Calculator,
  Flame,
  ShieldAlert,
  Percent,
  FileSpreadsheet,
  Upload,
  Calendar,
  Eye,
  Loader2,
  Radio,
} from "lucide-react";

interface ProductItem {
  id: string;
  provider: string;
  externalProductId: string | null;
  title: string;
  category: string | null;
  productUrl: string;
  imageUrl: string | null;
  currency: string;
  isActive: boolean;
  firstSeenAt: string;
  lastSeenAt: string;
  latestOffer: {
    id: string;
    capturedWeek: string;
    affiliateUrl: string;
    commissionRate: string | null;
    commissionAmount: number | null;
    soldCount: number | null;
    capturedAt: string;
  } | null;
}

interface PoolItem {
  poolItem: {
    id: string;
    weekStart: string;
    rank: number;
    catalogScore: number;
    reasonJson: string | null;
    selectedAt: string;
  };
  product: {
    id: string;
    title: string;
    category: string | null;
    productUrl: string;
    imageUrl: string | null;
  };
  offer: {
    id: string;
    affiliateUrl: string;
    commissionRate: string | null;
    commissionAmount: number | null;
    soldCount: number | null;
  } | null;
}

interface DealObservationItem {
  observation: {
    id: string;
    observedAt: string;
    observedPrice: number | null;
    originalPrice: number | null;
    voucherCode: string | null;
    voucherDiscountPercent: string | null;
    voucherDiscountAmount: number | null;
    voucherMaxDiscount: number | null;
    voucherMinSpend: number | null;
    voucherValidFrom: string | null;
    voucherValidUntil: string | null;
    flashSale: boolean | null;
    freeShipping: boolean | null;
    rawMetadataJson: string | null;
  };
  product: {
    id: string;
    title: string;
    category: string | null;
  };
}

function ShopeeDealsContent() {
  const searchParams = useSearchParams();
  const initialTab = searchParams.get("tab") || "WEEKLY_POOL";

  const [activeTab, setActiveTab] = useState<string>(initialTab);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);

  // Tab 1: Weekly Pool State
  const [selectedWeek, setSelectedWeek] = useState<string>("");
  const [availableWeeks, setAvailableWeeks] = useState<string[]>([]);
  const [poolItems, setPoolItems] = useState<PoolItem[]>([]);
  const [generatingPool, setGeneratingPool] = useState(false);

  // Tab 2: Products Catalog State
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedProductId, setExpandedProductId] = useState<string | null>(null);
  const [productDetail, setProductDetail] = useState<any>(null);

  // Tab 3: Deal Observation & Interactive Calculator State
  const [dealObservations, setDealObservations] = useState<DealObservationItem[]>([]);
  const [calcProductId, setCalcProductId] = useState("");
  const [calcBasePrice, setCalcBasePrice] = useState("100000");
  const [calcOriginalPrice, setCalcOriginalPrice] = useState("150000");
  const [calcVoucherType, setCalcVoucherType] = useState<"PERCENT" | "FIXED">("PERCENT");
  const [calcVoucherValue, setCalcVoucherValue] = useState("30");
  const [calcMaxDiscount, setCalcMaxDiscount] = useState("50000");
  const [calcMinSpend, setCalcMinSpend] = useState("0");
  const [calcValidFrom, setCalcValidFrom] = useState("");
  const [calcValidUntil, setCalcValidUntil] = useState("");
  const [calcFlashSale, setCalcFlashSale] = useState(false);
  const [calcFreeShipping, setCalcFreeShipping] = useState(true);
  const [savingObservation, setSavingObservation] = useState(false);

  // Authoritative Server-Side Calculation Preview State
  const [calculationResult, setCalculationResult] = useState<any>(null);
  const [calculating, setCalculating] = useState(false);
  const [calcError, setCalcError] = useState<string | null>(null);
  const calcRequestIdRef = useRef(0);

  // Tab 4: Matcher Playground State
  const [publishedPosts, setPublishedPosts] = useState<any[]>([]);
  const [selectedPostId, setSelectedPostId] = useState("");
  const [matcherResults, setMatcherResults] = useState<any>(null);
  const [runningMatcher, setRunningMatcher] = useState(false);
  const [creatingDraftPlan, setCreatingDraftPlan] = useState(false);

  // Tab 5: Imports State
  const [csvText, setCsvText] = useState("");
  const [importPreview, setImportPreview] = useState<any>(null);
  const [validatingCsv, setValidatingCsv] = useState(false);
  const [confirmingImport, setConfirmingImport] = useState(false);

  // Shopee Worker Acquisition Audit State
  const [acquisitionData, setAcquisitionData] = useState<{
    lastRun: {
      id: string;
      externalRunId: string | null;
      acquisitionBatchId: string;
      startedAt: string;
      completedAt: string | null;
      provider: string;
      status: string;
      productsSeen: number;
      productsValid: number;
      productsImported: number;
      productsRejected: number;
      warningCount: number;
      source: string;
      errorSummary: string | null;
    } | null;
    recentRuns: any[];
  } | null>(null);
  const [loadingAcquisition, setLoadingAcquisition] = useState(false);

  // Helpers
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedUrl(text);
    setTimeout(() => setCopiedUrl(null), 2000);
  };

  const formatVnd = (val: number | null | undefined): string => {
    if (val === null || val === undefined || isNaN(val)) return "—";
    return `${val.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".")}đ`;
  };

  // --- Fetchers ---
  const fetchWeeklyPool = useCallback(async (week?: string) => {
    try {
      setLoading(true);
      const url = week ? `/api/shopee/weekly-pool?week=${week}` : "/api/shopee/weekly-pool";
      const res = await fetch(url);
      const data = await res.json();
      if (res.ok && data.success) {
        setPoolItems(data.pool);
        setSelectedWeek(data.week);
        setAvailableWeeks(data.availableWeeks || []);
      }
    } catch {
      setError("Failed to load weekly pool");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchProducts = useCallback(async () => {
    try {
      setLoading(true);
      const url = searchQuery ? `/api/shopee/products?search=${encodeURIComponent(searchQuery)}` : "/api/shopee/products";
      const res = await fetch(url);
      const data = await res.json();
      if (res.ok && data.success) {
        setProducts(data.products);
      }
    } catch {
      setError("Failed to load products");
    } finally {
      setLoading(false);
    }
  }, [searchQuery]);

  const fetchDeals = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/shopee/deals?limit=25");
      const data = await res.json();
      if (res.ok && data.success) {
        setDealObservations(data.observations);
      }
    } catch {
      setError("Failed to load deals");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchPublishedPosts = useCallback(async () => {
    try {
      const res = await fetch("/api/posts?status=PUBLISHED");
      const data = await res.json();
      if (res.ok && data.posts) {
        setPublishedPosts(data.posts);
        if (data.posts.length > 0 && !selectedPostId) {
          setSelectedPostId(data.posts[0].id);
        }
      }
    } catch {
      // Ignore
    }
  }, [selectedPostId]);

  const fetchAcquisitionStatus = useCallback(async () => {
    try {
      setLoadingAcquisition(true);
      const res = await fetch("/api/shopee/acquisition?limit=5");
      const data = await res.json();
      if (res.ok && data.success) {
        setAcquisitionData(data);
      }
    } catch {
      // best-effort
    } finally {
      setLoadingAcquisition(false);
    }
  }, []);

  useEffect(() => {
    fetchAcquisitionStatus();
    if (activeTab === "WEEKLY_POOL") fetchWeeklyPool();
    if (activeTab === "PRODUCTS") fetchProducts();
    if (activeTab === "DEALS") {
      fetchDeals();
      fetchProducts();
    }
    if (activeTab === "MATCHER") {
      fetchPublishedPosts();
      fetchWeeklyPool();
    }
  }, [activeTab, fetchWeeklyPool, fetchProducts, fetchDeals, fetchPublishedPosts, fetchAcquisitionStatus]);

  // --- Handlers ---
  const handleGeneratePool = async () => {
    try {
      setGeneratingPool(true);
      setActionSuccess(null);
      setError(null);
      const res = await fetch("/api/shopee/weekly-pool/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ week: selectedWeek }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setActionSuccess(`Weekly pool generated successfully! Curated ${data.count} candidate products.`);
        fetchWeeklyPool(selectedWeek);
      } else {
        setError(data.error || "Failed to generate pool");
      }
    } catch {
      setError("Network error generating weekly pool");
    } finally {
      setGeneratingPool(false);
    }
  };

  // Server-Authoritative Calculator Preview (debounced, race-condition safe)
  useEffect(() => {
    const requestId = ++calcRequestIdRef.current;
    const controller = new AbortController();

    const basePriceNum = parseInt(calcBasePrice, 10);
    if (!calcBasePrice || isNaN(basePriceNum) || basePriceNum <= 0) {
      setCalculationResult(null);
      setCalculating(false);
      setCalcError(null);
      return;
    }

    setCalculating(true);
    setCalcError(null);

    const timer = setTimeout(async () => {
      try {
        const res = await fetch("/api/shopee/deals/calculate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            observedPrice: basePriceNum,
            originalPrice: calcOriginalPrice ? parseInt(calcOriginalPrice, 10) : undefined,
            voucherDiscountType: calcVoucherType,
            voucherDiscountPercent: calcVoucherType === "PERCENT" && calcVoucherValue ? parseFloat(calcVoucherValue) : undefined,
            voucherDiscountAmount: calcVoucherType === "FIXED" && calcVoucherValue ? parseInt(calcVoucherValue, 10) : undefined,
            voucherMaxDiscount: calcMaxDiscount ? parseInt(calcMaxDiscount, 10) : undefined,
            voucherMinSpend: calcMinSpend ? parseInt(calcMinSpend, 10) : undefined,
            voucherValidFrom: calcValidFrom || undefined,
            voucherValidUntil: calcValidUntil || undefined,
            flashSale: calcFlashSale,
            freeShipping: calcFreeShipping,
          }),
        });

        if (requestId !== calcRequestIdRef.current) {
          return;
        }

        const data = await res.json();
        if (res.ok && data.success) {
          setCalculationResult(data);
          setCalcError(null);
        } else {
          setCalcError(data.error || "Failed to calculate deal preview");
        }
      } catch (err: any) {
        if (err?.name === "AbortError") return;
        if (requestId === calcRequestIdRef.current) {
          setCalcError("Network error while calculating deal preview");
        }
      } finally {
        if (requestId === calcRequestIdRef.current) {
          setCalculating(false);
        }
      }
    }, 350);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [
    calcBasePrice,
    calcOriginalPrice,
    calcVoucherType,
    calcVoucherValue,
    calcMaxDiscount,
    calcMinSpend,
    calcValidFrom,
    calcValidUntil,
    calcFlashSale,
    calcFreeShipping,
  ]);

  const handleSaveObservation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!calcProductId) {
      alert("Please select or enter a product ID");
      return;
    }

    try {
      setSavingObservation(true);
      const res = await fetch("/api/shopee/deals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: calcProductId,
          observedPrice: parseInt(calcBasePrice, 10),
          originalPrice: calcOriginalPrice ? parseInt(calcOriginalPrice, 10) : undefined,
          voucherDiscountType: calcVoucherType,
          voucherDiscountPercent: calcVoucherType === "PERCENT" ? parseFloat(calcVoucherValue) : undefined,
          voucherDiscountAmount: calcVoucherType === "FIXED" ? parseInt(calcVoucherValue, 10) : undefined,
          voucherMaxDiscount: calcMaxDiscount ? parseInt(calcMaxDiscount, 10) : undefined,
          voucherMinSpend: calcMinSpend ? parseInt(calcMinSpend, 10) : undefined,
          voucherValidFrom: calcValidFrom || undefined,
          voucherValidUntil: calcValidUntil || undefined,
          flashSale: calcFlashSale,
          freeShipping: calcFreeShipping,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setActionSuccess(`Deal observation saved! Deterministic price: ${formatVnd(data.calculation.estimatedFinalPrice)}`);
        fetchDeals();
      } else {
        alert(data.error || "Failed to save deal observation");
      }
    } catch {
      alert("Network error saving observation");
    } finally {
      setSavingObservation(false);
    }
  };

  const handleRunMatcher = async () => {
    if (!selectedPostId) {
      alert("Please select a target post");
      return;
    }
    try {
      setRunningMatcher(true);
      setError(null);
      const res = await fetch("/api/shopee/matcher/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postId: selectedPostId, topN: 3 }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setMatcherResults(data);
      } else {
        setError(data.error || "Matcher failed");
      }
    } catch {
      setError("Network error running matcher");
    } finally {
      setRunningMatcher(false);
    }
  };

  const handleCreateDraftPlan = async (matchItem: any) => {
    if (!matcherResults?.replyPreview?.text) return;
    try {
      setCreatingDraftPlan(true);
      const res = await fetch("/api/shopee/matcher/create-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          postId: selectedPostId,
          replyText: matcherResults.replyPreview.text,
          directAffiliateUrl: matchItem.product.affiliateUrl,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setActionSuccess("Draft monetization plan created successfully! Inspect under /monetization.");
      } else {
        alert(data.error || "Failed to create draft plan");
      }
    } catch {
      alert("Network error creating draft plan");
    } finally {
      setCreatingDraftPlan(false);
    }
  };

  const handleValidateCsv = async () => {
    if (!csvText.trim()) {
      alert("Please enter CSV content");
      return;
    }
    try {
      setValidatingCsv(true);
      setError(null);
      const res = await fetch("/api/shopee/products/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "PREVIEW", csvContent: csvText }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setImportPreview(data.preview);
      } else {
        setError(data.error || "CSV validation failed");
      }
    } catch {
      setError("Network error validating CSV");
    } finally {
      setValidatingCsv(false);
    }
  };

  const handleConfirmImport = async () => {
    try {
      setConfirmingImport(true);
      setError(null);
      const res = await fetch("/api/shopee/products/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "CONFIRM", csvContent: csvText }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setActionSuccess(
          `Import confirmed! Inserted ${data.result.insertedProducts} products, updated ${data.result.updatedProducts}, created ${data.result.createdOffers} weekly offer snapshots.`
        );
        setImportPreview(null);
        setCsvText("");
      } else {
        setError(data.error || "Import failed");
      }
    } catch {
      setError("Network error confirming import");
    } finally {
      setConfirmingImport(false);
    }
  };

  const loadSampleCsv = () => {
    setCsvText(`title,product_url,affiliate_url,category,commission_rate,sold_count
Tai nghe bluetooth Baseus Bowie M2,https://shopee.vn/product/123/456,https://s.shopee.vn/baseus_m2,Công nghệ,15%,12000
Nồi chiên không dầu Philips HD9200 4.1L,https://shopee.vn/product/789/101,https://s.shopee.vn/philips_hd92,Gia dụng,12%,5400
Bàn phím cơ không dây Xinmeng M71,https://shopee.vn/product/202/303,https://s.shopee.vn/xinmeng_m71,Công nghệ,18%,3200
Áo thun cotton unisex form rộng oversize,https://shopee.vn/product/404/505,https://s.shopee.vn/aothun_oversize,Thời trang nam,20%,18500
Son kem lì Black Rouge Air Fit Velvet Tint,https://shopee.vn/product/606/707,https://s.shopee.vn/blackrouge_tint,Mỹ phẩm,16%,25000`);
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2.5">
            <ShoppingBag className="w-7 h-7 text-orange-600" />
            Shopee Deal Intelligence
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Weekly product pools, time-sensitive deal observations, deterministic price calculations & product matching
          </p>
        </div>
      </div>

      {/* Notifications */}
      {actionSuccess && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-3 text-emerald-800 text-sm">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
          <span>{actionSuccess}</span>
        </div>
      )}

      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-3 text-rose-700 text-sm">
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <div className="flex-1">{error}</div>
        </div>
      )}

      {/* Shopee Session Worker Acquisition Status */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Radio className="w-4 h-4 text-orange-600" />
            <span className="text-xs font-bold uppercase tracking-wider text-slate-700">Catalog Acquisition Status</span>
            {acquisitionData?.lastRun ? (
              <span
                className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                  acquisitionData.lastRun.status === "SUCCESS"
                    ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                    : acquisitionData.lastRun.status === "PARTIAL"
                    ? "bg-amber-50 text-amber-700 border border-amber-200"
                    : "bg-rose-50 text-rose-700 border border-rose-200"
                }`}
              >
                {acquisitionData.lastRun.status}
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-600">
                NO DATA
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span>Source: <strong className="text-slate-700">{acquisitionData?.lastRun?.source || "Shopee Session Worker"}</strong></span>
            <button
              onClick={fetchAcquisitionStatus}
              disabled={loadingAcquisition}
              className="p-1 text-slate-400 hover:text-slate-600 rounded transition-colors"
              title="Refresh Acquisition Status"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingAcquisition ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-xs">
          <div>
            <span className="text-slate-400 text-[11px] block">Last Acquisition:</span>
            <span className="font-semibold text-slate-800">
              {acquisitionData?.lastRun?.startedAt
                ? new Date(acquisitionData.lastRun.startedAt).toLocaleString("vi-VN")
                : "Unavailable"}
            </span>
          </div>
          <div>
            <span className="text-slate-400 text-[11px] block">Last Completed:</span>
            <span className="font-semibold text-slate-800">
              {acquisitionData?.lastRun?.completedAt
                ? new Date(acquisitionData.lastRun.completedAt).toLocaleString("vi-VN")
                : "—"}
            </span>
          </div>
          <div>
            <span className="text-slate-400 text-[11px] block">Products Seen:</span>
            <span className="font-semibold text-slate-800">
              {acquisitionData?.lastRun?.productsSeen ?? "—"}
            </span>
          </div>
          <div>
            <span className="text-slate-400 text-[11px] block">Products Imported:</span>
            <span className="font-semibold text-emerald-700">
              {acquisitionData?.lastRun?.productsImported ?? "—"}
            </span>
          </div>
          <div>
            <span className="text-slate-400 text-[11px] block">Warnings / Rejected:</span>
            <span className="font-semibold text-slate-700">
              {acquisitionData?.lastRun
                ? `${acquisitionData.lastRun.warningCount} / ${acquisitionData.lastRun.productsRejected}`
                : "—"}
            </span>
          </div>
          <div>
            <span className="text-slate-400 text-[11px] block">Weekly Pool Size:</span>
            <span className="font-semibold text-orange-600">
              {poolItems.length} items
            </span>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-1 overflow-x-auto border-b border-slate-200 pb-2 text-xs sm:text-sm font-medium">
        {[
          { id: "WEEKLY_POOL", label: "Weekly Pool", icon: Layers },
          { id: "PRODUCTS", label: "Catalog Products", icon: Tag },
          { id: "DEALS", label: "Deals & Calculator", icon: Calculator },
          { id: "MATCHER", label: "Matcher Playground", icon: Sparkles },
          { id: "IMPORTS", label: "Catalog Import", icon: FileSpreadsheet },
        ].map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg whitespace-nowrap transition-colors ${
                activeTab === tab.id
                  ? "bg-slate-900 text-white shadow-xs"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* TAB 1: WEEKLY POOL */}
      {activeTab === "WEEKLY_POOL" && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 border border-slate-200 rounded-xl shadow-xs">
            <div className="flex items-center gap-3">
              <span className="text-xs font-semibold text-slate-700">Week:</span>
              <select
                value={selectedWeek}
                onChange={(e) => {
                  setSelectedWeek(e.target.value);
                  fetchWeeklyPool(e.target.value);
                }}
                className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs sm:text-sm font-mono focus:outline-none"
              >
                {availableWeeks.map((w) => (
                  <option key={w} value={w}>
                    {w}
                  </option>
                ))}
                {!availableWeeks.includes(selectedWeek) && selectedWeek && (
                  <option value={selectedWeek}>{selectedWeek} (Current)</option>
                )}
              </select>
              <span className="text-xs text-slate-500">({poolItems.length} curated candidates)</span>
            </div>

            <button
              onClick={handleGeneratePool}
              disabled={generatingPool}
              className="inline-flex items-center gap-2 px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white text-xs sm:text-sm font-medium rounded-lg transition-colors shadow-xs disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${generatingPool ? "animate-spin" : ""}`} />
              {generatingPool ? "Curating Pool..." : "Generate Weekly Pool (~60)"}
            </button>
          </div>

          {loading ? (
            <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center text-slate-400">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" /> Loading weekly pool...
            </div>
          ) : poolItems.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center">
              <Layers className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <h3 className="font-semibold text-slate-900">No products in this weekly pool</h3>
              <p className="text-xs text-slate-500 mt-1">
                Click &ldquo;Generate Weekly Pool&rdquo; above or import products via CSV to populate this pool.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {poolItems.map((item) => (
                <div
                  key={item.poolItem.id}
                  className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs space-y-3 hover:border-slate-300 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="w-6 h-6 rounded-full bg-slate-900 text-white flex items-center justify-center font-bold text-xs">
                      #{item.poolItem.rank}
                    </span>
                    <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-orange-50 text-orange-700 border border-orange-200">
                      Score: {item.poolItem.catalogScore}
                    </span>
                  </div>

                  <div>
                    <span className="text-[10px] uppercase font-semibold text-slate-400">
                      {item.product.category || "General"}
                    </span>
                    <h4 className="text-sm font-semibold text-slate-900 line-clamp-2 mt-0.5">
                      {item.product.title}
                    </h4>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs bg-slate-50 p-2 rounded-lg border border-slate-100">
                    <div>
                      <span className="text-slate-500 text-[10px]">Commission:</span>
                      <div className="font-semibold text-emerald-700">
                        {item.offer?.commissionRate ? `${(parseFloat(item.offer.commissionRate) * 100).toFixed(1)}%` : "—"}
                      </div>
                    </div>
                    <div>
                      <span className="text-slate-500 text-[10px]">Sold Count:</span>
                      <div className="font-semibold text-slate-800">
                        {item.offer?.soldCount ? item.offer.soldCount.toLocaleString() : "—"}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1 text-xs">
                    <span className="text-[10px] text-slate-400 font-mono truncate max-w-[150px]">
                      {item.offer?.affiliateUrl}
                    </span>
                    {item.offer?.affiliateUrl && (
                      <button
                        onClick={() => copyToClipboard(item.offer!.affiliateUrl)}
                        className="inline-flex items-center gap-1 text-orange-600 hover:text-orange-800 font-medium"
                      >
                        {copiedUrl === item.offer.affiliateUrl ? (
                          <>
                            <Check className="w-3 h-3" /> Copied
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" /> Copy Direct Link
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: PRODUCTS */}
      {activeTab === "PRODUCTS" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4 bg-white p-4 border border-slate-200 rounded-xl shadow-xs">
            <div className="relative w-full sm:w-80">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search catalog products..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-xs sm:text-sm border border-slate-200 rounded-lg focus:outline-none"
              />
            </div>
            <span className="text-xs text-slate-500">{products.length} products loaded</span>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-medium">
                <tr>
                  <th className="p-3">Product Title</th>
                  <th className="p-3">Category</th>
                  <th className="p-3">Commission</th>
                  <th className="p-3">Sold</th>
                  <th className="p-3">Direct Affiliate Link</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {products.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50/60">
                    <td className="p-3 font-medium text-slate-900 max-w-xs truncate">{p.title}</td>
                    <td className="p-3 text-slate-600">{p.category || "—"}</td>
                    <td className="p-3 font-semibold text-emerald-700">
                      {p.latestOffer?.commissionRate ? `${(parseFloat(p.latestOffer.commissionRate) * 100).toFixed(1)}%` : "—"}
                    </td>
                    <td className="p-3 text-slate-700">{p.latestOffer?.soldCount ? p.latestOffer.soldCount.toLocaleString() : "—"}</td>
                    <td className="p-3 font-mono text-[11px] text-orange-600 truncate max-w-xs">
                      {p.latestOffer?.affiliateUrl || "—"}
                    </td>
                    <td className="p-3 text-right">
                      {p.latestOffer?.affiliateUrl && (
                        <button
                          onClick={() => copyToClipboard(p.latestOffer!.affiliateUrl)}
                          className="p-1 hover:bg-slate-200 rounded text-slate-600"
                          title="Copy Direct Link"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: DEALS & CALCULATOR */}
      {activeTab === "DEALS" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Interactive Live Calculator Form */}
          <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
              <Calculator className="w-5 h-5 text-orange-600" />
              <div>
                <h3 className="font-bold text-slate-900 text-sm">Deterministic Deal Calculator</h3>
                <p className="text-[11px] text-slate-500">Simulate final price and record verified deal observations</p>
              </div>
            </div>

            <form onSubmit={handleSaveObservation} className="space-y-3.5 text-xs">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Select Catalog Product *</label>
                <select
                  required
                  value={calcProductId}
                  onChange={(e) => setCalcProductId(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:outline-none"
                >
                  <option value="">-- Choose Product --</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Base Observed Price (VND) *</label>
                  <input
                    type="number"
                    required
                    value={calcBasePrice}
                    onChange={(e) => setCalcBasePrice(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Original Price (VND)</label>
                  <input
                    type="number"
                    value={calcOriginalPrice}
                    onChange={(e) => setCalcOriginalPrice(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Voucher Type</label>
                  <select
                    value={calcVoucherType}
                    onChange={(e) => setCalcVoucherType(e.target.value as any)}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs"
                  >
                    <option value="PERCENT">Percentage (%)</option>
                    <option value="FIXED">Fixed Amount (VND)</option>
                  </select>
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">
                    Voucher Value ({calcVoucherType === "PERCENT" ? "%" : "VND"})
                  </label>
                  <input
                    type="number"
                    value={calcVoucherValue}
                    onChange={(e) => setCalcVoucherValue(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Max Discount Cap (VND)</label>
                  <input
                    type="number"
                    value={calcMaxDiscount}
                    onChange={(e) => setCalcMaxDiscount(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Min Spend Requirement (VND)</label>
                  <input
                    type="number"
                    value={calcMinSpend}
                    onChange={(e) => setCalcMinSpend(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Valid From (Activation)</label>
                  <input
                    type="datetime-local"
                    value={calcValidFrom}
                    onChange={(e) => setCalcValidFrom(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Valid Until (Expiry)</label>
                  <input
                    type="datetime-local"
                    value={calcValidUntil}
                    onChange={(e) => setCalcValidUntil(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs"
                  />
                </div>
              </div>

              <div className="flex items-center gap-4 pt-1">
                <label className="flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={calcFlashSale}
                    onChange={(e) => setCalcFlashSale(e.target.checked)}
                    className="rounded"
                  />
                  Flash Sale
                </label>
                <label className="flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={calcFreeShipping}
                    onChange={(e) => setCalcFreeShipping(e.target.checked)}
                    className="rounded"
                  />
                  Free Shipping
                </label>
              </div>

              <button
                type="submit"
                disabled={savingObservation}
                className="w-full mt-2 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg font-medium text-xs transition-colors shadow-xs disabled:opacity-50"
              >
                {savingObservation ? "Saving..." : "Save Deal Observation"}
              </button>
            </form>
          </div>

          {/* Right Column: Live Server-Authoritative Preview */}
          <div className="lg:col-span-6 space-y-4">
            <div className="bg-slate-900 text-white rounded-xl p-5 space-y-4 shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-xs uppercase tracking-wider text-slate-400">
                    Authoritative Server Preview
                  </span>
                  {calculating && (
                    <span className="flex items-center gap-1 text-[11px] text-orange-400">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      <span>Calculating...</span>
                    </span>
                  )}
                </div>
                {calculationResult && (
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                      calculationResult.state === "ACTIVE"
                        ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                        : calculationResult.state === "UPCOMING"
                        ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                        : "bg-rose-500/20 text-rose-400 border border-rose-500/30"
                    }`}
                  >
                    {calculationResult.state}
                  </span>
                )}
              </div>

              {calcError && (
                <div className="p-3 bg-rose-950/60 border border-rose-500/40 rounded-lg text-rose-300 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
                  <span>{calcError}</span>
                </div>
              )}

              {calculationResult ? (
                <>
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <span className="text-slate-400">Base Price:</span>
                      <div className="text-lg font-bold">{formatVnd(calculationResult.basePrice)}</div>
                    </div>
                    <div>
                      <span className="text-slate-400">Discount Amount:</span>
                      <div className="text-lg font-bold text-emerald-400">-{formatVnd(calculationResult.discountAmount)}</div>
                    </div>
                  </div>

                  <div className="p-3 bg-slate-800 rounded-lg border border-slate-700 flex items-center justify-between">
                    <div>
                      <span className="text-xs text-slate-400">Estimated Final Deal Price:</span>
                      <div className="text-2xl font-black text-orange-400 mt-0.5">
                        {formatVnd(calculationResult.estimatedFinalPrice)}
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-xs text-slate-400">Deal Opportunity:</span>
                      <div className="text-lg font-bold text-emerald-300">{calculationResult.dealScore}/100</div>
                    </div>
                  </div>

                  {calculationResult.warning && (
                    <div className="p-3 bg-amber-950/60 border border-amber-500/40 rounded-lg text-amber-300 text-xs flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                      <span>{calculationResult.warning}</span>
                    </div>
                  )}

                  <div className="text-[11px] text-slate-500 flex items-center justify-between pt-1 border-t border-slate-800">
                    <span>Engine: {calculationResult.calculationVersion}</span>
                    <span>Confidence: {Math.round(calculationResult.confidence * 100)}%</span>
                  </div>
                </>
              ) : (
                <div className="py-8 text-center text-xs text-slate-500 space-y-1">
                  <Calculator className="w-6 h-6 text-slate-600 mx-auto mb-1" />
                  <div>Enter a base price to calculate server-authoritative deal facts.</div>
                  <div className="text-[11px] text-slate-600">Calculated on server by FinalPriceCalculator.</div>
                </div>
              )}
            </div>

            {/* List of Recent Observations */}
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs space-y-3">
              <h4 className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-slate-400" /> Recent Observations ({dealObservations.length})
              </h4>

              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {dealObservations.map((obs) => (
                  <div key={obs.observation.id} className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-800 truncate max-w-xs">
                        {obs.product.title}
                      </span>
                      <span className="font-bold text-orange-600">
                        {formatVnd(obs.observation.observedPrice)}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500 flex items-center gap-3">
                      <span>Voucher: {obs.observation.voucherDiscountPercent ? `${obs.observation.voucherDiscountPercent}%` : "None"}</span>
                      <span>At: {new Date(obs.observation.observedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: MATCHER PLAYGROUND */}
      {activeTab === "MATCHER" && (
        <div className="space-y-5">
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
              <Sparkles className="w-5 h-5 text-orange-600" />
              <div>
                <h3 className="font-bold text-slate-900 text-sm">Product Matcher Playground</h3>
                <p className="text-[11px] text-slate-500">
                  Select a live Threads post and match it with the highest scoring candidates from the Weekly Pool
                </p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <select
                value={selectedPostId}
                onChange={(e) => setSelectedPostId(e.target.value)}
                className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-xs sm:text-sm focus:outline-none"
              >
                {publishedPosts.map((post) => (
                  <option key={post.id} value={post.id}>
                    @{post.account?.username}: &ldquo;{post.text?.substring(0, 60)}...&rdquo;
                  </option>
                ))}
              </select>

              <button
                onClick={handleRunMatcher}
                disabled={runningMatcher}
                className="inline-flex items-center gap-2 px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs sm:text-sm font-medium rounded-lg transition-colors shadow-xs disabled:opacity-50"
              >
                <Sparkles className={`w-4 h-4 ${runningMatcher ? "animate-spin" : ""}`} />
                {runningMatcher ? "Matching..." : "Run Matcher"}
              </button>
            </div>
          </div>

          {/* Matcher Results Display */}
          {matcherResults && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
              {/* Left: Top 3 Candidates */}
              <div className="lg:col-span-7 space-y-3">
                <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider">
                  Top Ranked Candidates ({matcherResults.rankedMatches?.length || 0})
                </h4>

                {matcherResults.rankedMatches?.map((match: any) => (
                  <div
                    key={match.product.id}
                    className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs space-y-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full bg-slate-900 text-white flex items-center justify-center font-bold text-xs">
                          #{match.rank}
                        </span>
                        <h5 className="font-bold text-slate-900 text-sm truncate max-w-sm">
                          {match.product.title}
                        </h5>
                      </div>
                      <span className="px-2 py-0.5 rounded text-xs font-black bg-emerald-50 text-emerald-800 border border-emerald-200">
                        Match: {match.totalMatchScore}
                      </span>
                    </div>

                    {/* Breakdown */}
                    <div className="grid grid-cols-4 gap-2 text-center text-xs bg-slate-50 p-2 rounded-lg border border-slate-100">
                      <div>
                        <span className="text-[10px] text-slate-400">Relevance</span>
                        <div className="font-bold text-slate-800">{match.components.relevance}</div>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400">Catalog</span>
                        <div className="font-bold text-slate-800">{match.components.catalog}</div>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400">Deal Opp</span>
                        <div className="font-bold text-slate-800">{match.components.deal}</div>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400">Perf</span>
                        <div className="font-bold text-slate-800">{match.components.performance}</div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-xs pt-1">
                      <span className="text-[11px] text-slate-500 truncate max-w-[240px]">
                        Keywords: [{match.matchedKeywords?.join(", ") || "none"}]
                      </span>
                      <span className="font-mono text-[10px] text-orange-600 truncate max-w-[150px]">
                        {match.product.affiliateUrl}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Right: Reply Preview & Draft Plan Creator */}
              <div className="lg:col-span-5 space-y-4">
                <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                    <span className="font-bold text-xs uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                      <Flame className="w-4 h-4 text-orange-600" />
                      Generated Reply Preview
                    </span>
                    <span className="text-[10px] px-2 py-0.5 bg-orange-100 text-orange-800 font-bold rounded">
                      Direct Shopee Link
                    </span>
                  </div>

                  <p className="text-xs text-slate-800 whitespace-pre-wrap bg-slate-50 p-3.5 rounded-lg border border-slate-200 font-mono">
                    {matcherResults.replyPreview?.text}
                  </p>

                  <div className="pt-1">
                    <button
                      onClick={() => handleCreateDraftPlan(matcherResults.rankedMatches[0])}
                      disabled={creatingDraftPlan}
                      className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium text-xs transition-colors shadow-xs flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      <Plus className="w-4 h-4" />
                      {creatingDraftPlan ? "Creating Plan..." : "Create Draft Monetization Plan"}
                    </button>
                    <p className="text-[10px] text-slate-400 text-center mt-1.5">
                      ℹ️ Creates a DRAFT plan in the monetization queue. Never publishes automatically without operator review.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 5: IMPORTS */}
      {activeTab === "IMPORTS" && (
        <div className="space-y-5">
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-orange-600" />
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">Shopee Product Catalog CSV Ingestion</h3>
                  <p className="text-[11px] text-slate-500">
                    Paste 50–70 products in CSV format. Preview and validate before committing to database.
                  </p>
                </div>
              </div>

              <button
                onClick={loadSampleCsv}
                className="text-xs text-orange-600 hover:text-orange-800 font-semibold border border-orange-200 rounded-lg px-3 py-1.5 transition-colors"
              >
                Load Sample CSV
              </button>
            </div>

            <textarea
              rows={8}
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
              placeholder="title,product_url,affiliate_url,category,commission_rate,sold_count&#10;Tai nghe bluetooth,https://shopee.vn/...,https://s.shopee.vn/...,Công nghệ,15%,5000"
              className="w-full p-3 text-xs font-mono border border-slate-300 rounded-lg focus:outline-none"
            />

            <div className="flex items-center justify-between pt-1">
              <span className="text-[11px] text-slate-400">
                Required columns: <code>title</code>, <code>product_url</code>, <code>affiliate_url</code>
              </span>
              <button
                onClick={handleValidateCsv}
                disabled={validatingCsv || !csvText.trim()}
                className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium rounded-lg transition-colors shadow-xs disabled:opacity-50 flex items-center gap-2"
              >
                <Upload className="w-3.5 h-3.5" />
                {validatingCsv ? "Validating..." : "Validate CSV Preview"}
              </button>
            </div>
          </div>

          {/* Import Preview Card */}
          {importPreview && (
            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider">
                  Validation Preview Summary
                </h4>
                <div className="flex items-center gap-3 text-xs">
                  <span className="text-emerald-700 font-bold">Valid: {importPreview.validCount}</span>
                  <span className="text-amber-700 font-bold">Warnings: {importPreview.warningsCount}</span>
                  <span className="text-rose-700 font-bold">Rejected: {importPreview.rejectedCount}</span>
                  <span className="text-slate-600 font-bold">Duplicates: {importPreview.duplicateCount}</span>
                </div>
              </div>

              {/* Sample Valid Rows */}
              {importPreview.sampleValidRows?.length > 0 && (
                <div className="space-y-2">
                  <span className="text-[11px] font-semibold text-slate-600">Sample Valid Rows (First 5):</span>
                  <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs space-y-1.5">
                    {importPreview.sampleValidRows.map((r: any, idx: number) => (
                      <div key={idx} className="flex items-center justify-between text-[11px]">
                        <span className="font-medium text-slate-800 truncate max-w-sm">{r.title}</span>
                        <span className="font-mono text-orange-600 truncate max-w-xs">{r.affiliateUrl}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Rejection Reasons */}
              {importPreview.rejections?.length > 0 && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-800 text-xs space-y-1">
                  <span className="font-bold flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5 text-rose-600" /> Rejection Errors:
                  </span>
                  {importPreview.rejections.map((rej: any, idx: number) => (
                    <div key={idx} className="text-[11px]">
                      Row {rej.row}: {rej.reason}
                    </div>
                  ))}
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  onClick={() => setImportPreview(null)}
                  className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-800"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmImport}
                  disabled={confirmingImport || importPreview.validCount === 0}
                  className="px-5 py-2 bg-orange-600 hover:bg-orange-700 text-white text-xs font-medium rounded-lg transition-colors shadow-xs disabled:opacity-50 flex items-center gap-2"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  {confirmingImport ? "Ingesting..." : `Confirm & Ingest (${importPreview.validCount} Products)`}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function ShopeePage() {
  return (
    <React.Suspense
      fallback={
        <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center text-slate-400">
          <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-slate-400" />
          Loading Shopee Deal Intelligence...
        </div>
      }
    >
      <ShopeeDealsContent />
    </React.Suspense>
  );
}

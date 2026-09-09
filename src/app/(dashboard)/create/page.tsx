"use client";

import React, { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  PenSquare,
  Send,
  Calendar,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  Users,
  ArrowRight,
  ArrowUp,
  ArrowDown,
  Clock,
  Type,
  Image as ImageIcon,
  Video as VideoIcon,
  Layers,
  Plus,
  Trash2,
  Link2,
  FolderOpen,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import type { SafeAccount } from "@/services/account.service";
import type { PostMediaType } from "@/lib/posts/lifecycle";
import type { MediaItemInput } from "@/lib/media/types";
import type { MediaAsset } from "@/db/schema";
import {
  parseLocalDateTimeToUtc,
  validateScheduledTime,
  formatInTimezone,
  DEFAULT_TIMEZONE,
} from "@/lib/date/timezone";
import MediaUploader, { formatBytes } from "@/components/media/MediaUploader";
import MediaLibraryModal from "@/components/media/MediaLibraryModal";

interface AffiliateLinkOption {
  id: string;
  publicSlug: string;
  destinationUrl: string;
  label: string | null;
  network: string | null;
}

interface CarouselSlideState {
  id: string;
  mediaKind: "IMAGE" | "VIDEO";
  sourceUrl: string;
  altText: string;
  mediaAssetId?: string;
  asset?: MediaAsset | null;
  isUploading?: boolean;
  inputMode: "upload" | "url";
}

function CreatePostForm() {
  const searchParams = useSearchParams();
  const initialAssetId = searchParams.get("mediaAssetId");

  const [accounts, setAccounts] = useState<SafeAccount[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [selectedAccountId, setSelectedAccountId] = useState<string>("");
  const [mediaType, setMediaType] = useState<PostMediaType>("TEXT");
  const [text, setText] = useState("");
  const [mode, setMode] = useState<"now" | "schedule">("now");

  // Single Image State
  const [imageAsset, setImageAsset] = useState<MediaAsset | null>(null);
  const [singleImageUrl, setSingleImageUrl] = useState("");
  const [singleImageAlt, setSingleImageAlt] = useState("");
  const [isImageUploading, setIsImageUploading] = useState(false);
  const [showManualImageUrl, setShowManualImageUrl] = useState(false);

  // Single Video State
  const [videoAsset, setVideoAsset] = useState<MediaAsset | null>(null);
  const [singleVideoUrl, setSingleVideoUrl] = useState("");
  const [singleVideoAlt, setSingleVideoAlt] = useState("");
  const [isVideoUploading, setIsVideoUploading] = useState(false);
  const [showManualVideoUrl, setShowManualVideoUrl] = useState(false);

  // Carousel State (2 to 10 items)
  const [carouselItems, setCarouselItems] = useState<CarouselSlideState[]>([
    {
      id: "slide-1",
      mediaKind: "IMAGE",
      sourceUrl: "",
      altText: "",
      inputMode: "upload",
    },
    {
      id: "slide-2",
      mediaKind: "IMAGE",
      sourceUrl: "",
      altText: "",
      inputMode: "upload",
    },
  ]);

  // Media Library Modal
  const [libraryModalOpen, setLibraryModalOpen] = useState(false);
  const [libraryTarget, setLibraryTarget] = useState<
    | { type: "single_image" }
    | { type: "single_video" }
    | { type: "carousel"; index: number }
    | null
  >(null);

  // Affiliate links helper
  const [affiliateLinks, setAffiliateLinks] = useState<AffiliateLinkOption[]>([]);
  const [selectedAffiliateLinkId, setSelectedAffiliateLinkId] = useState<string>("");

  // Scheduling inputs (default to tomorrow 09:00 local time)
  const [scheduleDate, setScheduleDate] = useState("");
  const [scheduleTime, setScheduleTime] = useState("09:00");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successPost, setSuccessPost] = useState<{
    id: string;
    threadsPostId?: string;
    status: string;
    scheduledAt?: string;
    mediaType?: string;
  } | null>(null);

  // Load accounts and affiliate links
  useEffect(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const yyyy = tomorrow.getFullYear();
    const mm = String(tomorrow.getMonth() + 1).padStart(2, "0");
    const dd = String(tomorrow.getDate()).padStart(2, "0");
    setScheduleDate(`${yyyy}-${mm}-${dd}`);

    async function fetchData() {
      try {
        const [accRes, affRes] = await Promise.all([
          fetch("/api/accounts"),
          fetch("/api/affiliate/links"),
        ]);

        const accData = await accRes.json();
        if (accRes.ok && accData.accounts) {
          setAccounts(accData.accounts);
          const activeAccounts = accData.accounts.filter(
            (acc: SafeAccount) => acc.status === "ACTIVE"
          );
          if (activeAccounts.length > 0) {
            setSelectedAccountId(activeAccounts[0].id);
          }
        }

        const affData = await affRes.json();
        if (affRes.ok && affData.links) {
          setAffiliateLinks(affData.links);
        }
      } catch {
        setError("Failed to load initial workspace data");
      } finally {
        setLoadingAccounts(false);
      }
    }
    fetchData();
  }, []);

  // Prepopulate media asset if query param ?mediaAssetId=xyz is present
  useEffect(() => {
    if (!initialAssetId) return;

    async function loadInitialAsset() {
      try {
        const res = await fetch(`/api/media/${initialAssetId}`);
        const data = await res.json();
        if (res.ok && data.success && data.asset) {
          const asset: MediaAsset = data.asset;
          if (asset.resourceType === "video") {
            setMediaType("VIDEO");
            setVideoAsset(asset);
            setSingleVideoUrl(asset.secureUrl);
          } else {
            setMediaType("IMAGE");
            setImageAsset(asset);
            setSingleImageUrl(asset.secureUrl);
          }
        }
      } catch {
        // Fallback silently if asset cannot be pre-fetched
      }
    }

    loadInitialAsset();
  }, [initialAssetId]);

  const charCount = text.length;
  const isOverLimit = charCount > 500;
  const activeAccounts = accounts.filter((a) => a.status === "ACTIVE");

  // Any media currently uploading?
  const isAnyUploading =
    isImageUploading ||
    isVideoUploading ||
    carouselItems.some((item) => item.isUploading);

  // Carousel Handlers
  const handleAddCarouselItem = () => {
    if (carouselItems.length >= 10) return;
    setCarouselItems((prev) => [
      ...prev,
      {
        id: `slide-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        mediaKind: "IMAGE",
        sourceUrl: "",
        altText: "",
        inputMode: "upload",
      },
    ]);
  };

  const handleRemoveCarouselItem = (index: number) => {
    if (carouselItems.length <= 2) return;
    setCarouselItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleMoveCarouselItem = (index: number, direction: "up" | "down") => {
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= carouselItems.length) return;

    setCarouselItems((prev) => {
      const next = [...prev];
      const temp = next[index];
      next[index] = next[targetIndex];
      next[targetIndex] = temp;
      return next;
    });
  };

  const handleUpdateCarouselSlide = (
    index: number,
    updates: Partial<CarouselSlideState>
  ) => {
    setCarouselItems((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], ...updates };
      return next;
    });
  };

  // Open Media Library Modal
  const handleOpenLibrary = (
    target:
      | { type: "single_image" }
      | { type: "single_video" }
      | { type: "carousel"; index: number }
  ) => {
    setLibraryTarget(target);
    setLibraryModalOpen(true);
  };

  const handleSelectFromLibrary = (asset: MediaAsset) => {
    if (!libraryTarget) return;

    if (libraryTarget.type === "single_image") {
      setImageAsset(asset);
      setSingleImageUrl(asset.secureUrl);
    } else if (libraryTarget.type === "single_video") {
      setVideoAsset(asset);
      setSingleVideoUrl(asset.secureUrl);
    } else if (libraryTarget.type === "carousel") {
      const idx = libraryTarget.index;
      handleUpdateCarouselSlide(idx, {
        asset,
        mediaAssetId: asset.id,
        sourceUrl: asset.secureUrl,
        mediaKind: asset.resourceType === "video" ? "VIDEO" : "IMAGE",
      });
    }

    setLibraryModalOpen(false);
    setLibraryTarget(null);
  };

  // Insert affiliate link into text
  const handleInsertAffiliateLink = () => {
    if (!selectedAffiliateLinkId) return;
    const linkObj = affiliateLinks.find((l) => l.id === selectedAffiliateLinkId);
    if (!linkObj) return;

    const trackingUrl = `https://affthread-chi.vercel.app/r/${linkObj.publicSlug}`;
    const newText = text ? `${text.trim()} ${trackingUrl}` : trackingUrl;
    setText(newText);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting || isAnyUploading) return;

    if (!selectedAccountId) {
      setError("Please select a Threads account to publish with");
      return;
    }

    if (mediaType === "TEXT" && !text.trim()) {
      setError("Post content cannot be empty for text posts");
      return;
    }

    if (isOverLimit) {
      setError("Post content exceeds Threads 500-character limit");
      return;
    }

    // Build media items
    let payloadMediaItems: MediaItemInput[] = [];

    if (mediaType === "IMAGE") {
      if (!singleImageUrl.trim()) {
        setError("Please upload an image or provide a valid image URL");
        return;
      }
      payloadMediaItems = [
        {
          mediaKind: "IMAGE",
          sourceUrl: singleImageUrl.trim(),
          altText: singleImageAlt.trim() || undefined,
          mediaAssetId: imageAsset?.id,
        },
      ];
    } else if (mediaType === "VIDEO") {
      if (!singleVideoUrl.trim()) {
        setError("Please upload a video or provide a valid video URL");
        return;
      }
      payloadMediaItems = [
        {
          mediaKind: "VIDEO",
          sourceUrl: singleVideoUrl.trim(),
          altText: singleVideoAlt.trim() || undefined,
          mediaAssetId: videoAsset?.id,
        },
      ];
    } else if (mediaType === "CAROUSEL") {
      if (carouselItems.length < 2 || carouselItems.length > 10) {
        setError("Carousel must have between 2 and 10 items");
        return;
      }
      for (let i = 0; i < carouselItems.length; i++) {
        if (!carouselItems[i].sourceUrl.trim()) {
          setError(`Carousel slide #${i + 1} is missing a media attachment or URL`);
          return;
        }
      }
      payloadMediaItems = carouselItems.map((item, i) => ({
        mediaKind: item.mediaKind,
        sourceUrl: item.sourceUrl.trim(),
        altText: item.altText.trim() || undefined,
        position: i,
        mediaAssetId: item.mediaAssetId || item.asset?.id,
      }));
    }

    let isoScheduledAt: string | undefined;

    if (mode === "schedule") {
      if (!scheduleDate || !scheduleTime) {
        setError("Please provide both date and time for scheduling");
        return;
      }
      try {
        const utcDate = parseLocalDateTimeToUtc(scheduleDate, scheduleTime, DEFAULT_TIMEZONE);
        const val = validateScheduledTime(utcDate, 60);
        if (!val.valid) {
          setError(val.error || "Scheduled time must be at least 1 minute in the future");
          return;
        }
        isoScheduledAt = utcDate.toISOString();
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Invalid date or time format");
        return;
      }
    }

    setIsSubmitting(true);
    setError(null);
    setSuccessPost(null);

    try {
      const affiliateLinkIds = selectedAffiliateLinkId ? [selectedAffiliateLinkId] : undefined;

      const res = await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId: selectedAccountId,
          text: text.trim(),
          mediaType,
          mediaItems: payloadMediaItems,
          affiliateLinkIds,
          mode,
          scheduledAt: isoScheduledAt,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to submit post");
      } else {
        setSuccessPost(data.post);
        setText("");
        setSingleImageUrl("");
        setSingleImageAlt("");
        setImageAsset(null);
        setSingleVideoUrl("");
        setSingleVideoAlt("");
        setVideoAsset(null);
        setCarouselItems([
          {
            id: `slide-${Date.now()}-1`,
            mediaKind: "IMAGE",
            sourceUrl: "",
            altText: "",
            inputMode: "upload",
          },
          {
            id: `slide-${Date.now()}-2`,
            mediaKind: "IMAGE",
            sourceUrl: "",
            altText: "",
            inputMode: "upload",
          },
        ]);
      }
    } catch {
      setError("Network error while submitting post. Please check your connection.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2.5">
          <PenSquare className="w-6 h-6 text-slate-900" />
          Publishing Workspace
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Publish or schedule multi-format Threads posts (Text, Image, Video, Carousel) with Cloudinary media ingestion & tracked affiliate links
        </p>
      </div>

      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-3 text-rose-700 text-sm">
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <div className="flex-1">{error}</div>
        </div>
      )}

      {successPost && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-start justify-between gap-3 text-emerald-800 text-sm">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 flex-shrink-0 text-emerald-600 mt-0.5" />
            <div>
              {successPost.status === "SCHEDULED" ? (
                <>
                  <p className="font-semibold">Post scheduled successfully!</p>
                  {successPost.scheduledAt && (
                    <p className="text-xs text-emerald-700 mt-0.5">
                      Scheduled for: {formatInTimezone(successPost.scheduledAt)} ({DEFAULT_TIMEZONE})
                    </p>
                  )}
                </>
              ) : (
                <>
                  <p className="font-semibold">Post published successfully!</p>
                  {successPost.threadsPostId && (
                    <p className="text-xs text-emerald-700 mt-0.5">
                      Threads Post ID: {successPost.threadsPostId}
                    </p>
                  )}
                </>
              )}
            </div>
          </div>
          <Link
            href={successPost.status === "SCHEDULED" ? "/posts?status=SCHEDULED" : "/posts"}
            className="text-xs font-semibold text-emerald-800 hover:text-emerald-950 flex items-center gap-1 underline underline-offset-2 flex-shrink-0"
          >
            {successPost.status === "SCHEDULED" ? "View Queue" : "View History"}{" "}
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      )}

      {loadingAccounts ? (
        <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-slate-400">
          <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2" />
          Loading workspace...
        </div>
      ) : activeAccounts.length === 0 ? (
        <div className="bg-white border border-amber-200 rounded-xl p-6 text-center space-y-3 bg-amber-50/50">
          <div className="w-10 h-10 bg-amber-100 text-amber-700 rounded-full flex items-center justify-center mx-auto">
            <Users className="w-5 h-5" />
          </div>
          <h3 className="text-base font-semibold text-slate-900">
            No Active Accounts Available
          </h3>
          <p className="text-sm text-slate-600 max-w-sm mx-auto">
            You must have at least one active, verified Threads account to publish or schedule.
          </p>
          <div>
            <Link
              href="/accounts"
              className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium rounded-lg transition-colors"
            >
              Manage Accounts
            </Link>
          </div>
        </div>
      ) : (
        <form
          onSubmit={handleSubmit}
          className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-6"
        >
          {/* Target Account Selector */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">
              Publishing Account <span className="text-rose-500">*</span>
            </label>
            <select
              value={selectedAccountId}
              onChange={(e) => setSelectedAccountId(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-900 transition-colors"
            >
              {activeAccounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  @{acc.username} ({acc.displayName})
                </option>
              ))}
            </select>
          </div>

          {/* Content Format Tabs */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              Content Format
            </label>
            <div className="grid grid-cols-4 gap-2">
              <button
                type="button"
                onClick={() => setMediaType("TEXT")}
                className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg border text-sm font-medium transition-all ${
                  mediaType === "TEXT"
                    ? "bg-slate-900 border-slate-900 text-white shadow-sm"
                    : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                }`}
              >
                <Type className="w-4 h-4" />
                Text
              </button>
              <button
                type="button"
                onClick={() => setMediaType("IMAGE")}
                className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg border text-sm font-medium transition-all ${
                  mediaType === "IMAGE"
                    ? "bg-slate-900 border-slate-900 text-white shadow-sm"
                    : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                }`}
              >
                <ImageIcon className="w-4 h-4" />
                Image
              </button>
              <button
                type="button"
                onClick={() => setMediaType("VIDEO")}
                className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg border text-sm font-medium transition-all ${
                  mediaType === "VIDEO"
                    ? "bg-slate-900 border-slate-900 text-white shadow-sm"
                    : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                }`}
              >
                <VideoIcon className="w-4 h-4" />
                Video
              </button>
              <button
                type="button"
                onClick={() => setMediaType("CAROUSEL")}
                className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg border text-sm font-medium transition-all ${
                  mediaType === "CAROUSEL"
                    ? "bg-slate-900 border-slate-900 text-white shadow-sm"
                    : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                }`}
              >
                <Layers className="w-4 h-4" />
                Carousel
              </button>
            </div>
          </div>

          {/* Dynamic Media Section: IMAGE */}
          {mediaType === "IMAGE" && (
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
                  Image Attachment
                </h4>
                <button
                  type="button"
                  onClick={() => handleOpenLibrary({ type: "single_image" })}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 hover:text-slate-950 bg-white border border-slate-200 hover:border-slate-300 px-2.5 py-1 rounded-lg transition-colors shadow-2xs"
                >
                  <FolderOpen className="w-3.5 h-3.5 text-slate-500" />
                  Select from Media Library
                </button>
              </div>

              {/* Direct Uploader */}
              <MediaUploader
                resourceType="image"
                accountId={selectedAccountId}
                initialAsset={imageAsset}
                onUploadStart={() => setIsImageUploading(true)}
                onUploadComplete={(asset) => {
                  setImageAsset(asset);
                  setSingleImageUrl(asset.secureUrl);
                  setIsImageUploading(false);
                }}
                onError={() => setIsImageUploading(false)}
                onRemove={() => {
                  setImageAsset(null);
                  setSingleImageUrl("");
                }}
              />

              {/* Alt Text */}
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Alt Text (Accessibility)
                </label>
                <input
                  type="text"
                  placeholder="Describe what is in this image..."
                  value={singleImageAlt}
                  onChange={(e) => setSingleImageAlt(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:border-slate-900"
                />
              </div>

              {/* Collapsible: Manual Public HTTPS URL */}
              <div className="border-t border-slate-200/80 pt-3">
                <button
                  type="button"
                  onClick={() => setShowManualImageUrl(!showManualImageUrl)}
                  className="flex items-center justify-between w-full text-xs font-medium text-slate-500 hover:text-slate-800 transition-colors"
                >
                  <span>Advanced: Use existing public HTTPS URL</span>
                  {showManualImageUrl ? (
                    <ChevronUp className="w-3.5 h-3.5" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5" />
                  )}
                </button>

                {showManualImageUrl && (
                  <div className="mt-2.5 space-y-2">
                    <input
                      type="url"
                      placeholder="https://images.unsplash.com/photo-..."
                      value={singleImageUrl}
                      onChange={(e) => {
                        setSingleImageUrl(e.target.value);
                        setImageAsset(null);
                      }}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:border-slate-900"
                    />
                    <p className="text-[11px] text-slate-400">
                      If provided manually, this HTTPS URL will be passed directly to Threads image container API.
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Dynamic Media Section: VIDEO */}
          {mediaType === "VIDEO" && (
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
                  Video Attachment
                </h4>
                <button
                  type="button"
                  onClick={() => handleOpenLibrary({ type: "single_video" })}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 hover:text-slate-950 bg-white border border-slate-200 hover:border-slate-300 px-2.5 py-1 rounded-lg transition-colors shadow-2xs"
                >
                  <FolderOpen className="w-3.5 h-3.5 text-slate-500" />
                  Select from Media Library
                </button>
              </div>

              {/* Direct Uploader */}
              <MediaUploader
                resourceType="video"
                accountId={selectedAccountId}
                initialAsset={videoAsset}
                onUploadStart={() => setIsVideoUploading(true)}
                onUploadComplete={(asset) => {
                  setVideoAsset(asset);
                  setSingleVideoUrl(asset.secureUrl);
                  setIsVideoUploading(false);
                }}
                onError={() => setIsVideoUploading(false)}
                onRemove={() => {
                  setVideoAsset(null);
                  setSingleVideoUrl("");
                }}
              />

              {/* Alt Text */}
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Alt Text (Optional)
                </label>
                <input
                  type="text"
                  placeholder="Describe what is in this video..."
                  value={singleVideoAlt}
                  onChange={(e) => setSingleVideoAlt(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:border-slate-900"
                />
              </div>

              {/* Informational Callout */}
              <p className="text-xs text-slate-500 bg-amber-50/80 p-2.5 rounded-lg border border-amber-200/60 text-amber-800">
                ℹ️ Note: Video containers require asynchronous transcoding on Meta servers. If processing takes longer than 12s, the post is safely deferred to the 1-minute queue scheduler without timeout errors.
              </p>

              {/* Collapsible: Manual Public HTTPS URL */}
              <div className="border-t border-slate-200/80 pt-3">
                <button
                  type="button"
                  onClick={() => setShowManualVideoUrl(!showManualVideoUrl)}
                  className="flex items-center justify-between w-full text-xs font-medium text-slate-500 hover:text-slate-800 transition-colors"
                >
                  <span>Advanced: Use existing public HTTPS URL</span>
                  {showManualVideoUrl ? (
                    <ChevronUp className="w-3.5 h-3.5" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5" />
                  )}
                </button>

                {showManualVideoUrl && (
                  <div className="mt-2.5 space-y-2">
                    <input
                      type="url"
                      placeholder="https://example.com/video.mp4"
                      value={singleVideoUrl}
                      onChange={(e) => {
                        setSingleVideoUrl(e.target.value);
                        setVideoAsset(null);
                      }}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:border-slate-900"
                    />
                    <p className="text-[11px] text-slate-400">
                      Must be a publicly accessible direct HTTPS link to an MP4 or MOV container.
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Dynamic Media Section: CAROUSEL */}
          {mediaType === "CAROUSEL" && (
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
                    Carousel Slides ({carouselItems.length} of 10 items)
                  </h4>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Reorder slides using the arrows. Minimum 2, maximum 10 items.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleAddCarouselItem}
                  disabled={carouselItems.length >= 10}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-white rounded-lg text-xs font-medium transition-colors shadow-2xs"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Slide
                </button>
              </div>

              <div className="space-y-3.5">
                {carouselItems.map((slide, idx) => (
                  <div
                    key={slide.id}
                    className="p-4 bg-white border border-slate-200 rounded-xl space-y-3 shadow-2xs relative"
                  >
                    {/* Slide Top Bar */}
                    <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-700 font-bold text-xs flex items-center justify-center">
                          {idx + 1}
                        </span>
                        <span className="text-xs font-semibold text-slate-800">
                          Slide #{idx + 1}
                        </span>
                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-medium">
                          {slide.mediaKind}
                        </span>
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleMoveCarouselItem(idx, "up")}
                          disabled={idx === 0}
                          className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-20 transition-colors"
                          title="Move Slide Up"
                        >
                          <ArrowUp className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleMoveCarouselItem(idx, "down")}
                          disabled={idx === carouselItems.length - 1}
                          className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-20 transition-colors"
                          title="Move Slide Down"
                        >
                          <ArrowDown className="w-4 h-4" />
                        </button>
                        {carouselItems.length > 2 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveCarouselItem(idx)}
                            className="p-1 text-rose-500 hover:text-rose-700 transition-colors ml-1"
                            title="Remove Slide"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Media Type Selection for Slide */}
                    <div className="flex items-center gap-3 text-xs">
                      <label className="font-medium text-slate-600">Slide Type:</label>
                      <div className="inline-flex rounded-lg border border-slate-200 p-0.5 bg-slate-50">
                        <button
                          type="button"
                          onClick={() => handleUpdateCarouselSlide(idx, { mediaKind: "IMAGE" })}
                          className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                            slide.mediaKind === "IMAGE"
                              ? "bg-white text-slate-900 shadow-2xs"
                              : "text-slate-600 hover:text-slate-900"
                          }`}
                        >
                          Image
                        </button>
                        <button
                          type="button"
                          onClick={() => handleUpdateCarouselSlide(idx, { mediaKind: "VIDEO" })}
                          className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                            slide.mediaKind === "VIDEO"
                              ? "bg-white text-slate-900 shadow-2xs"
                              : "text-slate-600 hover:text-slate-900"
                          }`}
                        >
                          Video
                        </button>
                      </div>

                      <div className="ml-auto">
                        <button
                          type="button"
                          onClick={() =>
                            handleOpenLibrary({
                              type: "carousel",
                              index: idx,
                            })
                          }
                          className="inline-flex items-center gap-1 text-xs text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-2.5 py-1 rounded-md transition-colors"
                        >
                          <FolderOpen className="w-3.5 h-3.5" />
                          Choose from Library
                        </button>
                      </div>
                    </div>

                    {/* Slide Uploader or URL Input */}
                    {slide.sourceUrl ? (
                      <div className="flex items-center gap-3 p-2 bg-slate-50 border border-slate-200 rounded-lg">
                        {slide.mediaKind === "IMAGE" ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={slide.sourceUrl}
                            alt="Slide Preview"
                            className="w-16 h-16 object-cover rounded border border-slate-200 flex-shrink-0 bg-white"
                          />
                        ) : (
                          <div className="w-16 h-16 bg-slate-800 text-white rounded flex items-center justify-center flex-shrink-0">
                            <VideoIcon className="w-6 h-6" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-mono truncate text-slate-800">
                            {slide.asset?.originalFilename || slide.sourceUrl}
                          </p>
                          {slide.asset?.bytes && (
                            <p className="text-[11px] text-slate-500 mt-0.5">
                              {formatBytes(slide.asset.bytes)} • {slide.asset.width}x{slide.asset.height}
                            </p>
                          )}
                          <p className="text-[11px] text-emerald-600 font-medium mt-0.5">
                            Ready for publishing
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            handleUpdateCarouselSlide(idx, {
                              sourceUrl: "",
                              asset: null,
                              mediaAssetId: undefined,
                            })
                          }
                          className="text-xs text-rose-600 hover:text-rose-800 px-2.5 py-1 rounded hover:bg-rose-50 transition-colors font-medium"
                        >
                          Change
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <MediaUploader
                          resourceType={slide.mediaKind === "VIDEO" ? "video" : "image"}
                          accountId={selectedAccountId}
                          onUploadStart={() =>
                            handleUpdateCarouselSlide(idx, { isUploading: true })
                          }
                          onUploadComplete={(asset) => {
                            handleUpdateCarouselSlide(idx, {
                              asset,
                              sourceUrl: asset.secureUrl,
                              mediaAssetId: asset.id,
                              isUploading: false,
                            });
                          }}
                          onError={() =>
                            handleUpdateCarouselSlide(idx, { isUploading: false })
                          }
                          onRemove={() =>
                            handleUpdateCarouselSlide(idx, {
                              sourceUrl: "",
                              asset: null,
                              mediaAssetId: undefined,
                            })
                          }
                        />

                        {/* Collapsible Direct URL */}
                        <div className="pt-1">
                          <input
                            type="url"
                            placeholder="Or enter public HTTPS URL..."
                            value={slide.sourceUrl}
                            onChange={(e) =>
                              handleUpdateCarouselSlide(idx, {
                                sourceUrl: e.target.value,
                                asset: null,
                                mediaAssetId: undefined,
                              })
                            }
                            className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded text-xs text-slate-800 focus:outline-none focus:border-slate-900"
                          />
                        </div>
                      </div>
                    )}

                    {/* Alt Text for Slide */}
                    <div>
                      <input
                        type="text"
                        placeholder="Slide alt text (accessibility)..."
                        value={slide.altText}
                        onChange={(e) =>
                          handleUpdateCarouselSlide(idx, { altText: e.target.value })
                        }
                        className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:border-slate-900"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Post Caption / Text */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-sm font-semibold text-slate-700">
                Post Text / Caption{" "}
                {mediaType === "TEXT" && <span className="text-rose-500">*</span>}
              </label>
              <span
                className={`text-xs font-mono ${
                  isOverLimit
                    ? "text-rose-600 font-bold"
                    : charCount > 450
                    ? "text-amber-600 font-semibold"
                    : "text-slate-400"
                }`}
              >
                {charCount}/500
              </span>
            </div>
            <textarea
              rows={4}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={
                mediaType === "TEXT"
                  ? "Write your post text here..."
                  : "Write an optional caption for your media..."
              }
              className={`w-full px-3.5 py-2.5 bg-slate-50 border rounded-lg text-sm text-slate-800 focus:outline-none transition-colors ${
                isOverLimit
                  ? "border-rose-300 focus:ring-2 focus:ring-rose-500/10 focus:border-rose-500 bg-rose-50/20"
                  : "border-slate-200 focus:ring-2 focus:ring-slate-900/10 focus:border-slate-900"
              }`}
            />
          </div>

          {/* Affiliate Link Insertion Toolbar */}
          {affiliateLinks.length > 0 && (
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2 flex-1">
                <Link2 className="w-4 h-4 text-slate-500 flex-shrink-0" />
                <span className="font-medium text-slate-700">Tracked Link:</span>
                <select
                  value={selectedAffiliateLinkId}
                  onChange={(e) => setSelectedAffiliateLinkId(e.target.value)}
                  className="px-2 py-1 bg-white border border-slate-200 rounded text-slate-700 max-w-xs truncate"
                >
                  <option value="">-- Associate Tracked Link --</option>
                  {affiliateLinks.map((link) => (
                    <option key={link.id} value={link.id}>
                      {link.label || link.publicSlug} ({link.network || "Custom"})
                    </option>
                  ))}
                </select>
              </div>
              {selectedAffiliateLinkId && (
                <button
                  type="button"
                  onClick={handleInsertAffiliateLink}
                  className="px-2.5 py-1 bg-white border border-slate-300 hover:bg-slate-100 text-slate-800 rounded font-medium transition-colors flex items-center gap-1 shadow-2xs"
                >
                  Insert /r Link
                </button>
              )}
            </div>
          )}

          {/* Publishing Mode Toggle */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              Publishing Schedule
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setMode("now")}
                className={`flex items-center justify-center gap-2.5 py-3 px-4 rounded-xl border text-sm font-medium transition-all ${
                  mode === "now"
                    ? "bg-slate-900 border-slate-900 text-white shadow-sm"
                    : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                }`}
              >
                <Send className="w-4 h-4" />
                Publish Now
              </button>

              <button
                type="button"
                onClick={() => setMode("schedule")}
                className={`flex items-center justify-center gap-2.5 py-3 px-4 rounded-xl border text-sm font-medium transition-all ${
                  mode === "schedule"
                    ? "bg-slate-900 border-slate-900 text-white shadow-sm"
                    : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                }`}
              >
                <Calendar className="w-4 h-4" />
                Schedule for Later
              </button>
            </div>
          </div>

          {/* Schedule Date & Time Controls */}
          {mode === "schedule" && (
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-4">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                <Clock className="w-4 h-4" />
                Delivery Time ({DEFAULT_TIMEZONE} Timezone)
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">
                    Date
                  </label>
                  <input
                    type="date"
                    value={scheduleDate}
                    onChange={(e) => setScheduleDate(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:border-slate-900"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">
                    Time (24h)
                  </label>
                  <input
                    type="time"
                    value={scheduleTime}
                    onChange={(e) => setScheduleTime(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:border-slate-900"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Submit Button */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={
                isSubmitting ||
                isAnyUploading ||
                isOverLimit ||
                (mediaType === "TEXT" && !text.trim())
              }
              className={`w-full py-3 px-4 rounded-xl text-white font-medium text-sm flex items-center justify-center gap-2 transition-all shadow-sm ${
                isSubmitting ||
                isAnyUploading ||
                isOverLimit ||
                (mediaType === "TEXT" && !text.trim())
                  ? "bg-slate-300 cursor-not-allowed"
                  : "bg-slate-900 hover:bg-slate-800 active:scale-[0.99]"
              }`}
            >
              {isSubmitting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  {mode === "now" ? "Publishing to Threads..." : "Scheduling Delivery..."}
                </>
              ) : isAnyUploading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Uploading media files...
                </>
              ) : mode === "now" ? (
                <>
                  <Send className="w-4 h-4" />
                  Publish Now
                </>
              ) : (
                <>
                  <Calendar className="w-4 h-4" />
                  Confirm Schedule
                </>
              )}
            </button>
          </div>
        </form>
      )}

      {/* Media Library Modal */}
      <MediaLibraryModal
        isOpen={libraryModalOpen}
        allowedResourceType={
          libraryTarget?.type === "single_image"
            ? "image"
            : libraryTarget?.type === "single_video"
            ? "video"
            : "all"
        }
        onClose={() => {
          setLibraryModalOpen(false);
          setLibraryTarget(null);
        }}
        onSelect={handleSelectFromLibrary}
      />
    </div>
  );
}

export default function CreatePostPage() {
  return (
    <Suspense
      fallback={
        <div className="max-w-3xl mx-auto p-12 text-center text-slate-400">
          <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" />
          Loading workspace...
        </div>
      }
    >
      <CreatePostForm />
    </Suspense>
  );
}

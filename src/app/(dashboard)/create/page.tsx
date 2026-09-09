"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  PenSquare,
  Send,
  Calendar,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  Users,
  ArrowRight,
  Clock,
  Globe,
  Type,
  Image as ImageIcon,
  Video as VideoIcon,
  Layers,
  Plus,
  Trash2,
  Link2,
  ExternalLink,
} from "lucide-react";
import type { SafeAccount } from "@/services/account.service";
import type { PostMediaType } from "@/lib/posts/lifecycle";
import type { MediaItemInput } from "@/lib/media/types";
import {
  parseLocalDateTimeToUtc,
  validateScheduledTime,
  formatInTimezone,
  DEFAULT_TIMEZONE,
} from "@/lib/date/timezone";

interface AffiliateLinkOption {
  id: string;
  publicSlug: string;
  destinationUrl: string;
  label: string | null;
  network: string | null;
}

export default function CreatePostPage() {
  const [accounts, setAccounts] = useState<SafeAccount[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [selectedAccountId, setSelectedAccountId] = useState<string>("");
  const [mediaType, setMediaType] = useState<PostMediaType>("TEXT");
  const [text, setText] = useState("");
  const [mode, setMode] = useState<"now" | "schedule">("now");

  // Media inputs
  const [singleImageUrl, setSingleImageUrl] = useState("");
  const [singleImageAlt, setSingleImageAlt] = useState("");

  const [singleVideoUrl, setSingleVideoUrl] = useState("");
  const [singleVideoAlt, setSingleVideoAlt] = useState("");

  const [carouselItems, setCarouselItems] = useState<MediaItemInput[]>([
    { mediaKind: "IMAGE", sourceUrl: "", altText: "" },
    { mediaKind: "IMAGE", sourceUrl: "", altText: "" },
  ]);

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

  useEffect(() => {
    // Set default date to tomorrow in local format
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

  const charCount = text.length;
  const isOverLimit = charCount > 500;
  const activeAccounts = accounts.filter((a) => a.status === "ACTIVE");

  // Carousel handlers
  const handleAddCarouselItem = () => {
    if (carouselItems.length >= 10) return;
    setCarouselItems([
      ...carouselItems,
      { mediaKind: "IMAGE", sourceUrl: "", altText: "" },
    ]);
  };

  const handleRemoveCarouselItem = (index: number) => {
    if (carouselItems.length <= 2) return;
    setCarouselItems(carouselItems.filter((_, i) => i !== index));
  };

  const handleUpdateCarouselItem = (
    index: number,
    field: keyof MediaItemInput,
    val: string
  ) => {
    const updated = [...carouselItems];
    updated[index] = { ...updated[index], [field]: val };
    setCarouselItems(updated);
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
    if (isSubmitting) return;

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
        setError("Please provide a valid image URL");
        return;
      }
      payloadMediaItems = [
        {
          mediaKind: "IMAGE",
          sourceUrl: singleImageUrl.trim(),
          altText: singleImageAlt.trim() || undefined,
        },
      ];
    } else if (mediaType === "VIDEO") {
      if (!singleVideoUrl.trim()) {
        setError("Please provide a valid video URL");
        return;
      }
      payloadMediaItems = [
        {
          mediaKind: "VIDEO",
          sourceUrl: singleVideoUrl.trim(),
          altText: singleVideoAlt.trim() || undefined,
        },
      ];
    } else if (mediaType === "CAROUSEL") {
      if (carouselItems.length < 2 || carouselItems.length > 10) {
        setError("Carousel must have between 2 and 10 items");
        return;
      }
      for (let i = 0; i < carouselItems.length; i++) {
        if (!carouselItems[i].sourceUrl.trim()) {
          setError(`Carousel item #${i + 1} is missing a source URL`);
          return;
        }
      }
      payloadMediaItems = carouselItems.map((item, i) => ({
        mediaKind: item.mediaKind,
        sourceUrl: item.sourceUrl.trim(),
        altText: item.altText?.trim() || undefined,
        position: i,
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
        setSingleVideoUrl("");
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
          Publish or schedule multi-format Threads posts (Text, Image, Video, Carousel) with tracked affiliate links
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
                      Scheduled for: {formatInTimezone(successPost.scheduledAt)} (Asia/Ho_Chi_Minh)
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

          {/* Dynamic Media Inputs */}
          {mediaType === "IMAGE" && (
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
              <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Image Attachment
              </h4>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Public HTTPS Image URL <span className="text-rose-500">*</span>
                </label>
                <input
                  type="url"
                  placeholder="https://images.unsplash.com/photo-..."
                  value={singleImageUrl}
                  onChange={(e) => setSingleImageUrl(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:border-slate-900"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Alt Text (Accessibility)
                </label>
                <input
                  type="text"
                  placeholder="Description of image..."
                  value={singleImageAlt}
                  onChange={(e) => setSingleImageAlt(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:border-slate-900"
                />
              </div>
              {singleImageUrl && (
                <div className="mt-2">
                  <p className="text-xs font-medium text-slate-500 mb-1">Preview:</p>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={singleImageUrl}
                    alt="Preview"
                    className="max-h-48 rounded-lg border border-slate-200 object-cover"
                    onError={(e) => (e.currentTarget.style.display = "none")}
                  />
                </div>
              )}
            </div>
          )}

          {mediaType === "VIDEO" && (
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
              <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Video Attachment
              </h4>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Public HTTPS Video URL (MP4 / MOV) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="url"
                  placeholder="https://example.com/video.mp4"
                  value={singleVideoUrl}
                  onChange={(e) => setSingleVideoUrl(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:border-slate-900"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Alt Text (Optional)
                </label>
                <input
                  type="text"
                  placeholder="Description of video..."
                  value={singleVideoAlt}
                  onChange={(e) => setSingleVideoAlt(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:border-slate-900"
                />
              </div>
              <p className="text-xs text-slate-500 bg-amber-50 p-2.5 rounded-lg border border-amber-100 text-amber-800">
                ℹ️ Note: Video containers require asynchronous transcoding on Meta servers. If processing takes longer than 12s, the post is safely deferred to the 1-minute queue scheduler without timeout errors.
              </p>
            </div>
          )}

          {mediaType === "CAROUSEL" && (
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Carousel Slides (2 to 10 items)
                </h4>
                <button
                  type="button"
                  onClick={handleAddCarouselItem}
                  disabled={carouselItems.length >= 10}
                  className="inline-flex items-center gap-1 text-xs font-medium text-slate-700 hover:text-slate-900 disabled:opacity-40"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Slide
                </button>
              </div>

              <div className="space-y-3">
                {carouselItems.map((item, idx) => (
                  <div
                    key={idx}
                    className="p-3 bg-white border border-slate-200 rounded-lg space-y-2 relative"
                  >
                    <div className="flex items-center justify-between text-xs font-medium text-slate-700">
                      <span>Slide #{idx + 1}</span>
                      {carouselItems.length > 2 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveCarouselItem(idx)}
                          className="text-rose-600 hover:text-rose-800 p-1"
                          title="Remove Slide"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-4 gap-2">
                      <select
                        value={item.mediaKind}
                        onChange={(e) =>
                          handleUpdateCarouselItem(
                            idx,
                            "mediaKind",
                            e.target.value as "IMAGE" | "VIDEO"
                          )
                        }
                        className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded text-xs text-slate-800"
                      >
                        <option value="IMAGE">Image</option>
                        <option value="VIDEO">Video</option>
                      </select>
                      <input
                        type="url"
                        placeholder="Public HTTPS URL..."
                        value={item.sourceUrl}
                        onChange={(e) =>
                          handleUpdateCarouselItem(idx, "sourceUrl", e.target.value)
                        }
                        className="col-span-3 px-2.5 py-1.5 bg-white border border-slate-200 rounded text-xs text-slate-800"
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
              disabled={isSubmitting || isOverLimit || (mediaType === "TEXT" && !text.trim())}
              className={`w-full py-3 px-4 rounded-xl text-white font-medium text-sm flex items-center justify-center gap-2 transition-all shadow-sm ${
                isSubmitting || isOverLimit || (mediaType === "TEXT" && !text.trim())
                  ? "bg-slate-300 cursor-not-allowed"
                  : "bg-slate-900 hover:bg-slate-800 active:scale-[0.99]"
              }`}
            >
              {isSubmitting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  {mode === "now" ? "Publishing to Threads..." : "Scheduling Delivery..."}
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
    </div>
  );
}

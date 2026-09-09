"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Image as ImageIcon,
  Video as VideoIcon,
  Search,
  Trash2,
  Copy,
  Check,
  Plus,
  RefreshCw,
  ExternalLink,
  Layers,
  HardDrive,
  Film,
  AlertCircle,
} from "lucide-react";
import type { MediaAsset } from "@/db/schema";
import { formatBytes } from "@/components/media/MediaUploader";

interface AssetWithUsage extends MediaAsset {
  usageCount: number;
}

export default function MediaLibraryPage() {
  const [assets, setAssets] = useState<AssetWithUsage[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<"all" | "image" | "video">("all");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const fetchAssets = useCallback(async () => {
    setLoading(true);
    setActionError(null);
    try {
      const params = new URLSearchParams({ limit: "48" });
      if (filterType !== "all") params.set("resourceType", filterType);
      if (search.trim()) params.set("search", search.trim());

      const res = await fetch(`/api/media?${params.toString()}`);
      const data = await res.json();
      if (res.ok && data.success) {
        setAssets(data.assets || []);
      } else {
        setActionError(data.error || "Failed to load media library");
      }
    } catch {
      setActionError("Failed to communicate with server");
    } finally {
      setLoading(false);
    }
  }, [filterType, search]);

  useEffect(() => {
    fetchAssets();
  }, [fetchAssets]);

  const handleCopyUrl = (asset: AssetWithUsage) => {
    navigator.clipboard.writeText(asset.secureUrl);
    setCopiedId(asset.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleDelete = async (asset: AssetWithUsage) => {
    if (asset.usageCount > 0) {
      alert(`Cannot delete asset: it is currently referenced by ${asset.usageCount} post(s).`);
      return;
    }

    if (!confirm(`Are you sure you want to permanently delete "${asset.originalFilename || asset.publicId}" from Cloudinary?`)) {
      return;
    }

    setDeletingId(asset.id);
    setActionError(null);

    try {
      const res = await fetch(`/api/media/${asset.id}`, { method: "DELETE" });
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to delete asset");
      }

      setAssets((prev) => prev.filter((a) => a.id !== asset.id));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setActionError(msg);
    } finally {
      setDeletingId(null);
    }
  };

  // Calculate metrics
  const totalCount = assets.length;
  const imageCount = assets.filter((a) => a.resourceType === "image").length;
  const videoCount = assets.filter((a) => a.resourceType === "video").length;
  const totalBytes = assets.reduce((sum, a) => sum + (a.bytes || 0), 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2.5">
            <ImageIcon className="w-7 h-7 text-slate-900" />
            Media Library
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Browse and manage Cloudinary media assets across all publishing accounts
          </p>
        </div>

        <Link
          href="/create"
          className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 text-white text-sm font-semibold rounded-lg hover:bg-slate-800 transition-colors shadow-sm self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          Create Post with Media
        </Link>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Total Assets</span>
            <Layers className="w-4 h-4 text-slate-400" />
          </div>
          <p className="text-2xl font-bold text-slate-900 mt-2">{totalCount}</p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Images</span>
            <ImageIcon className="w-4 h-4 text-blue-500" />
          </div>
          <p className="text-2xl font-bold text-slate-900 mt-2">{imageCount}</p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Videos</span>
            <Film className="w-4 h-4 text-purple-500" />
          </div>
          <p className="text-2xl font-bold text-slate-900 mt-2">{videoCount}</p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Storage Used</span>
            <HardDrive className="w-4 h-4 text-emerald-500" />
          </div>
          <p className="text-2xl font-bold text-slate-900 mt-2">{formatBytes(totalBytes)}</p>
        </div>
      </div>

      {/* Action Error Alert */}
      {actionError && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm flex items-start gap-3">
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5 text-red-500" />
          <div className="flex-1">
            <p className="font-medium">{actionError}</p>
          </div>
          <button onClick={() => setActionError(null)} className="text-red-400 hover:text-red-600">
            &times;
          </button>
        </div>
      )}

      {/* Search & Filter Toolbar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by filename or ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 focus:bg-white"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-start">
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
            <button
              onClick={() => setFilterType("all")}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                filterType === "all" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              All ({totalCount})
            </button>
            <button
              onClick={() => setFilterType("image")}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                filterType === "image" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Images ({imageCount})
            </button>
            <button
              onClick={() => setFilterType("video")}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                filterType === "video" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Videos ({videoCount})
            </button>
          </div>

          <button
            onClick={fetchAssets}
            disabled={loading}
            className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Asset Grid */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 bg-white rounded-xl border border-slate-200 shadow-sm text-slate-400">
          <RefreshCw className="w-8 h-8 animate-spin mb-3 text-slate-400" />
          <p className="text-sm font-medium">Loading media assets...</p>
        </div>
      ) : assets.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-xl border border-slate-200 shadow-sm">
          <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4 text-slate-400">
            <ImageIcon className="w-8 h-8" />
          </div>
          <h3 className="text-base font-semibold text-slate-900">No media assets found</h3>
          <p className="text-sm text-slate-500 max-w-sm mx-auto mt-1">
            {search ? "No files match your search criteria." : "You haven't uploaded any media yet. Create a post to add media."}
          </p>
          <div className="mt-5">
            <Link
              href="/create"
              className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 text-white text-sm font-semibold rounded-lg hover:bg-slate-800 transition-colors shadow-sm"
            >
              <Plus className="w-4 h-4" />
              Upload in Composer
            </Link>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
          {assets.map((asset) => {
            const isDeleting = deletingId === asset.id;
            const isCopied = copiedId === asset.id;

            return (
              <div
                key={asset.id}
                className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col hover:border-slate-300 transition-all group"
              >
                {/* Media Preview Thumbnail */}
                <div className="relative aspect-video bg-slate-950 overflow-hidden flex items-center justify-center">
                  {asset.resourceType === "image" ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={asset.secureUrl}
                      alt={asset.originalFilename || "Asset"}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                      loading="lazy"
                    />
                  ) : (
                    <video src={asset.secureUrl} className="w-full h-full object-cover" />
                  )}

                  {/* Resource Badge */}
                  <span className="absolute top-2 left-2 px-2 py-0.5 rounded bg-slate-900/80 text-white text-[10px] font-semibold uppercase backdrop-blur-sm shadow">
                    {asset.resourceType}
                  </span>

                  {/* Usage Badge */}
                  {asset.usageCount > 0 ? (
                    <span className="absolute top-2 right-2 px-2 py-0.5 rounded bg-blue-600/90 text-white text-[10px] font-semibold backdrop-blur-sm shadow">
                      {asset.usageCount} post{asset.usageCount > 1 ? "s" : ""}
                    </span>
                  ) : (
                    <span className="absolute top-2 right-2 px-2 py-0.5 rounded bg-slate-700/80 text-slate-300 text-[10px] font-medium backdrop-blur-sm shadow">
                      Unused
                    </span>
                  )}
                </div>

                {/* Details */}
                <div className="p-4 flex-1 flex flex-col justify-between">
                  <div>
                    <h4
                      className="text-sm font-semibold text-slate-900 truncate"
                      title={asset.originalFilename || asset.publicId}
                    >
                      {asset.originalFilename || asset.publicId.split("/").pop()}
                    </h4>

                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500 mt-1">
                      <span>{formatBytes(asset.bytes)}</span>
                      {asset.width && asset.height ? (
                        <span>
                          &middot; {asset.width}&times;{asset.height}px
                        </span>
                      ) : null}
                      {asset.format ? <span>&middot; {asset.format.toUpperCase()}</span> : null}
                      {asset.durationSeconds ? <span>&middot; {asset.durationSeconds}s</span> : null}
                    </div>

                    <p className="text-[11px] text-slate-400 mt-2">
                      Uploaded {new Date(asset.createdAt).toLocaleDateString()}
                    </p>
                  </div>

                  {/* Actions */}
                  <div className="pt-3 mt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleCopyUrl(asset)}
                        className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors text-xs flex items-center gap-1"
                        title="Copy CDN URL"
                      >
                        {isCopied ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-600" />
                            <span className="text-emerald-600 font-medium">Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            <span>Copy</span>
                          </>
                        )}
                      </button>

                      <a
                        href={asset.secureUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
                        title="Open direct URL"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>

                    <div className="flex items-center gap-1">
                      <Link
                        href={`/create?mediaAssetId=${asset.id}`}
                        className="px-2.5 py-1 bg-slate-100 text-slate-700 hover:bg-slate-900 hover:text-white rounded-lg text-xs font-semibold transition-colors"
                      >
                        Use
                      </Link>

                      <button
                        onClick={() => handleDelete(asset)}
                        disabled={isDeleting || asset.usageCount > 0}
                        className={`p-1.5 rounded-lg transition-colors ${
                          asset.usageCount > 0
                            ? "text-slate-300 cursor-not-allowed"
                            : "text-slate-400 hover:text-red-600 hover:bg-red-50"
                        }`}
                        title={
                          asset.usageCount > 0
                            ? `Cannot delete: referenced by ${asset.usageCount} post(s)`
                            : "Delete asset"
                        }
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

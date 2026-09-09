"use client";

import React, { useState, useEffect } from "react";
import { X, Search, Image as ImageIcon, Video as VideoIcon, Check, RefreshCw } from "lucide-react";
import type { MediaAsset } from "@/db/schema";
import { formatBytes } from "./MediaUploader";

export interface MediaLibraryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (asset: MediaAsset) => void;
  allowedResourceType?: "image" | "video" | "all";
}

export default function MediaLibraryModal({
  isOpen,
  onClose,
  onSelect,
  allowedResourceType = "all",
}: MediaLibraryModalProps) {
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [resourceFilter, setResourceFilter] = useState<"all" | "image" | "video">(
    allowedResourceType === "all" ? "all" : allowedResourceType
  );
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    async function loadAssets() {
      setLoading(true);
      try {
        const queryParams = new URLSearchParams({ limit: "50" });
        if (resourceFilter !== "all") queryParams.set("resourceType", resourceFilter);
        if (search.trim()) queryParams.set("search", search.trim());

        const res = await fetch(`/api/media?${queryParams.toString()}`);
        const data = await res.json();
        if (isMounted && data.success && data.assets) {
          setAssets(data.assets);
        }
      } catch {
        // Silently fail on network error
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadAssets();
    return () => {
      isMounted = false;
    };
  }, [isOpen, resourceFilter, search]);

  if (!isOpen) return null;

  const handleSelectAsset = (asset: MediaAsset) => {
    setSelectedAssetId(asset.id);
    onSelect(asset);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden border border-slate-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div>
            <h3 className="text-lg font-bold text-slate-900">Select Media from Library</h3>
            <p className="text-xs text-slate-500">Reuse previously uploaded Cloudinary images and videos</p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-2 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Toolbar: Search & Filter */}
        <div className="p-4 border-b border-slate-100 bg-slate-50 flex flex-wrap items-center justify-between gap-3">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by filename or ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
            />
          </div>

          {allowedResourceType === "all" && (
            <div className="flex items-center gap-1 bg-white border border-slate-200 p-1 rounded-lg">
              <button
                onClick={() => setResourceFilter("all")}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                  resourceFilter === "all" ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                All
              </button>
              <button
                onClick={() => setResourceFilter("image")}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                  resourceFilter === "image" ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                Images
              </button>
              <button
                onClick={() => setResourceFilter("video")}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                  resourceFilter === "video" ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                Videos
              </button>
            </div>
          )}
        </div>

        {/* Body: Asset Grid */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-slate-400">
              <RefreshCw className="w-6 h-6 animate-spin mr-2" />
              <span>Loading media assets...</span>
            </div>
          ) : assets.length === 0 ? (
            <div className="text-center py-16 text-slate-400">
              <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-3 text-slate-500">
                <ImageIcon className="w-6 h-6" />
              </div>
              <p className="text-sm font-medium text-slate-600">No media assets found</p>
              <p className="text-xs text-slate-400 mt-1">
                Upload new media through the composer to build your library.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {assets.map((asset) => {
                const isSelected = selectedAssetId === asset.id;
                return (
                  <div
                    key={asset.id}
                    onClick={() => handleSelectAsset(asset)}
                    className={`group relative rounded-xl border overflow-hidden cursor-pointer bg-white transition-all hover:shadow-md hover:scale-[1.02] ${
                      isSelected
                        ? "border-slate-900 ring-2 ring-slate-900"
                        : "border-slate-200 hover:border-slate-300"
                    }`}
                  >
                    {/* Media Thumbnail */}
                    <div className="w-full aspect-square bg-slate-900 overflow-hidden flex items-center justify-center relative">
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

                      {/* Resource Type Tag */}
                      <span className="absolute top-2 left-2 px-1.5 py-0.5 rounded bg-slate-900/80 text-white text-[10px] font-semibold uppercase backdrop-blur-sm">
                        {asset.resourceType}
                      </span>

                      {isSelected && (
                        <div className="absolute inset-0 bg-slate-900/40 flex items-center justify-center text-white">
                          <Check className="w-8 h-8 drop-shadow-md" />
                        </div>
                      )}
                    </div>

                    {/* Info */}
                    <div className="p-2.5">
                      <p
                        className="text-xs font-semibold text-slate-900 truncate"
                        title={asset.originalFilename || asset.publicId}
                      >
                        {asset.originalFilename || asset.publicId.split("/").pop()}
                      </p>
                      <div className="flex items-center justify-between text-[10px] text-slate-500 mt-1">
                        <span>{formatBytes(asset.bytes)}</span>
                        {asset.width && asset.height ? (
                          <span>
                            {asset.width}&times;{asset.height}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-100 bg-slate-50 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

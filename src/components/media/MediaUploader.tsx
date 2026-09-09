"use client";

import React, { useState, useRef } from "react";
import {
  UploadCloud,
  Image as ImageIcon,
  Video as VideoIcon,
  X,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  FileText,
} from "lucide-react";
import type { MediaAsset } from "@/db/schema";

export interface MediaUploaderProps {
  resourceType: "image" | "video";
  accountId?: string;
  onUploadStart?: () => void;
  onUploadComplete: (asset: MediaAsset) => void;
  onError?: (error: string) => void;
  onRemove?: () => void;
  initialAsset?: MediaAsset | null;
  disabled?: boolean;
}

export function formatBytes(bytes?: number | null): string {
  if (!bytes || bytes <= 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export default function MediaUploader({
  resourceType,
  accountId,
  onUploadStart,
  onUploadComplete,
  onError,
  onRemove,
  initialAsset = null,
  disabled = false,
}: MediaUploaderProps) {
  const [dragOver, setDragOver] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(initialAsset?.secureUrl || null);
  const [uploadProgress, setUploadProgress] = useState<number>(initialAsset ? 100 : 0);
  const [status, setStatus] = useState<"IDLE" | "SIGNING" | "UPLOADING" | "READY" | "FAILED">(
    initialAsset ? "READY" : "IDLE"
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [currentAsset, setCurrentAsset] = useState<MediaAsset | null>(initialAsset);
  const [fileDetails, setFileDetails] = useState<{
    name: string;
    size: number;
    width?: number;
    height?: number;
    duration?: number;
  } | null>(
    initialAsset
      ? {
          name: initialAsset.originalFilename || initialAsset.publicId,
          size: initialAsset.bytes || 0,
          width: initialAsset.width || undefined,
          height: initialAsset.height || undefined,
          duration: initialAsset.durationSeconds || undefined,
        }
      : null
  );

  const fileInputRef = useRef<HTMLInputElement>(null);
  const xhrRef = useRef<XMLHttpRequest | null>(null);

  const handleFileSelect = (file: File) => {
    if (disabled) return;

    // Validate resource type against file MIME
    if (resourceType === "image" && !file.type.startsWith("image/")) {
      setErrorMessage("Selected file is not an image. Please choose a JPG, PNG, or WebP image.");
      return;
    }
    if (resourceType === "video" && !file.type.startsWith("video/")) {
      setErrorMessage("Selected file is not a video. Please choose an MP4 or MOV video.");
      return;
    }

    // Size sanity check (e.g. 20MB for images, 150MB for video)
    const maxBytes = resourceType === "image" ? 25 * 1024 * 1024 : 150 * 1024 * 1024;
    if (file.size > maxBytes) {
      setErrorMessage(
        `File size exceeds ${resourceType === "image" ? "25MB" : "150MB"} limit (current: ${formatBytes(file.size)})`
      );
      return;
    }

    // Generate local preview URL
    const localUrl = URL.createObjectURL(file);
    setPreviewUrl(localUrl);
    setFileDetails({
      name: file.name,
      size: file.size,
    });
    setErrorMessage(null);

    // Extract dimensions client-side if possible
    if (resourceType === "image") {
      const img = new Image();
      img.src = localUrl;
      img.onload = () => {
        setFileDetails((prev) => (prev ? { ...prev, width: img.naturalWidth, height: img.naturalHeight } : null));
      };
    } else if (resourceType === "video") {
      const vid = document.createElement("video");
      vid.src = localUrl;
      vid.onloadedmetadata = () => {
        setFileDetails((prev) =>
          prev
            ? {
                ...prev,
                width: vid.videoWidth,
                height: vid.videoHeight,
                duration: Math.round(vid.duration),
              }
            : null
        );
      };
    }

    // Start direct Cloudinary signed upload
    uploadToCloudinary(file);
  };

  const uploadToCloudinary = async (file: File) => {
    try {
      onUploadStart?.();
      setStatus("SIGNING");
      setUploadProgress(0);

      // Step 1: Request signed upload params from our backend
      const signRes = await fetch("/api/media/sign-upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId,
          resourceType,
          filename: file.name,
        }),
      });

      const signData = await signRes.json();
      if (!signRes.ok || !signData.success) {
        throw new Error(signData.error || "Failed to generate upload signature");
      }

      const { uploadUrl, apiKey, timestamp, signature, folder, publicId } = signData;

      // Step 2: Upload directly to Cloudinary using XMLHttpRequest for real progress
      setStatus("UPLOADING");

      const formData = new FormData();
      formData.append("file", file);
      formData.append("api_key", apiKey);
      formData.append("timestamp", String(timestamp));
      formData.append("signature", signature);
      formData.append("folder", folder);
      formData.append("public_id", publicId);

      const xhr = new XMLHttpRequest();
      xhrRef.current = xhr;

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const percent = Math.round((event.loaded / event.total) * 100);
          setUploadProgress(percent);
        }
      };

      xhr.onload = async () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const cloudRes = JSON.parse(xhr.responseText);

            // Step 3: Register verified upload in backend
            const regRes = await fetch("/api/media/register", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                accountId,
                publicId: cloudRes.public_id,
                resourceType,
                secureUrl: cloudRes.secure_url,
                originalFilename: file.name,
                bytes: cloudRes.bytes || file.size,
                width: cloudRes.width,
                height: cloudRes.height,
                format: cloudRes.format,
                durationSeconds: cloudRes.duration ? Math.round(cloudRes.duration) : undefined,
              }),
            });

            const regData = await regRes.json();
            if (!regRes.ok || !regData.success) {
              throw new Error(regData.error || "Failed to register media asset in database");
            }

            setCurrentAsset(regData.asset);
            setStatus("READY");
            setUploadProgress(100);
            onUploadComplete(regData.asset);
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            setErrorMessage(msg);
            setStatus("FAILED");
            onError?.(msg);
          }
        } else {
          let errText = `Upload failed with status ${xhr.status}`;
          try {
            const errObj = JSON.parse(xhr.responseText);
            if (errObj.error?.message) errText = errObj.error.message;
          } catch {
            // ignore
          }
          setErrorMessage(errText);
          setStatus("FAILED");
          onError?.(errText);
        }
      };

      xhr.onerror = () => {
        const netErr = "Network error occurred during Cloudinary upload";
        setErrorMessage(netErr);
        setStatus("FAILED");
        onError?.(netErr);
      };

      xhr.open("POST", uploadUrl);
      xhr.send(formData);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMessage(msg);
      setStatus("FAILED");
      onError?.(msg);
    }
  };

  const handleCancelOrRemove = () => {
    if (xhrRef.current) {
      xhrRef.current.abort();
      xhrRef.current = null;
    }
    setPreviewUrl(null);
    setCurrentAsset(null);
    setFileDetails(null);
    setStatus("IDLE");
    setUploadProgress(0);
    setErrorMessage(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    if (onRemove) onRemove();
  };

  return (
    <div className="w-full">
      <input
        ref={fileInputRef}
        type="file"
        accept={resourceType === "image" ? "image/jpeg,image/png,image/webp" : "video/mp4,video/quicktime"}
        className="hidden"
        onChange={(e) => {
          if (e.target.files && e.target.files[0]) {
            handleFileSelect(e.target.files[0]);
          }
        }}
        disabled={disabled}
      />

      {/* No file selected state: Drag & Drop Zone */}
      {!previewUrl && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            if (!disabled) setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            if (!disabled && e.dataTransfer.files && e.dataTransfer.files[0]) {
              handleFileSelect(e.dataTransfer.files[0]);
            }
          }}
          onClick={() => {
            if (!disabled && fileInputRef.current) {
              fileInputRef.current.click();
            }
          }}
          className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all ${
            dragOver
              ? "border-slate-900 bg-slate-100 scale-[1.01]"
              : "border-slate-300 hover:border-slate-400 bg-slate-50/50 hover:bg-slate-50"
          } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
        >
          <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-white shadow-sm flex items-center justify-center text-slate-700">
            {resourceType === "image" ? <ImageIcon className="w-6 h-6" /> : <VideoIcon className="w-6 h-6" />}
          </div>
          <p className="text-sm font-semibold text-slate-800">
            Drag & drop your {resourceType} here, or <span className="text-blue-600 hover:underline">browse</span>
          </p>
          <p className="text-xs text-slate-500 mt-1">
            {resourceType === "image"
              ? "JPG, PNG, or WebP up to 25MB"
              : "MP4 or MOV up to 150MB"}
          </p>
        </div>
      )}

      {/* Preview & Upload Progress State */}
      {previewUrl && (
        <div className="border border-slate-200 rounded-xl p-4 bg-white shadow-sm">
          <div className="flex items-start gap-4">
            {/* Thumbnail Preview */}
            <div className="relative w-28 h-28 rounded-lg overflow-hidden bg-slate-900 flex-shrink-0 flex items-center justify-center">
              {resourceType === "image" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={previewUrl} alt="Preview" className="w-full h-full object-cover" />
              ) : (
                <video src={previewUrl} className="w-full h-full object-cover" />
              )}
              {status === "READY" && (
                <div className="absolute top-1 right-1 bg-emerald-500 text-white p-0.5 rounded-full shadow">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
              )}
            </div>

            {/* Metadata & Progress Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-slate-900 truncate" title={fileDetails?.name}>
                  {fileDetails?.name || "Uploaded Asset"}
                </p>
                <button
                  type="button"
                  onClick={handleCancelOrRemove}
                  disabled={disabled}
                  className="text-slate-400 hover:text-red-600 p-1 rounded-md hover:bg-red-50 transition-colors"
                  title="Remove"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Badges / Metrics */}
              <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-slate-500">
                <span className="px-2 py-0.5 bg-slate-100 rounded text-slate-600 font-medium uppercase">
                  {resourceType}
                </span>
                {fileDetails?.size ? <span>{formatBytes(fileDetails.size)}</span> : null}
                {fileDetails?.width && fileDetails?.height ? (
                  <span>
                    &middot; {fileDetails.width} &times; {fileDetails.height}px
                  </span>
                ) : null}
                {fileDetails?.duration ? <span>&middot; {fileDetails.duration}s</span> : null}
              </div>

              {/* Progress Bar & Status */}
              <div className="mt-3">
                {status === "UPLOADING" || status === "SIGNING" ? (
                  <div>
                    <div className="flex justify-between text-xs font-medium text-slate-600 mb-1">
                      <span>{status === "SIGNING" ? "Preparing secure upload..." : "Uploading to Cloudinary..."}</span>
                      <span>{uploadProgress}%</span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                      <div
                        className="bg-slate-900 h-2 rounded-full transition-all duration-150"
                        style={{ width: `${uploadProgress}%` }}
                      />
                    </div>
                  </div>
                ) : status === "READY" ? (
                  <div className="flex items-center gap-1.5 text-xs text-emerald-600 font-medium">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Upload complete & verified</span>
                  </div>
                ) : status === "FAILED" ? (
                  <div className="flex items-center gap-1.5 text-xs text-red-600 font-medium">
                    <AlertCircle className="w-3.5 h-3.5" />
                    <span>Upload failed</span>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="ml-2 underline hover:text-red-700"
                    >
                      Retry
                    </button>
                  </div>
                ) : null}
              </div>

              {/* Error Details */}
              {errorMessage && (
                <p className="text-xs text-red-600 mt-1.5 break-words bg-red-50 p-1.5 rounded">
                  {errorMessage}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

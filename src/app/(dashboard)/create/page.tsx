"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  PenSquare,
  Send,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  Users,
  ArrowRight,
} from "lucide-react";
import type { SafeAccount } from "@/services/account.service";

export default function CreatePostPage() {
  const [accounts, setAccounts] = useState<SafeAccount[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [selectedAccountId, setSelectedAccountId] = useState<string>("");
  const [text, setText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successPost, setSuccessPost] = useState<{ id: string; threadsPostId?: string } | null>(null);

  useEffect(() => {
    async function fetchAccounts() {
      try {
        const res = await fetch("/api/accounts");
        const data = await res.json();
        if (res.ok && data.accounts) {
          setAccounts(data.accounts);
          const activeAccounts = data.accounts.filter(
            (acc: SafeAccount) => acc.status === "ACTIVE"
          );
          if (activeAccounts.length > 0) {
            setSelectedAccountId(activeAccounts[0].id);
          }
        }
      } catch {
        setError("Failed to load connected accounts");
      } finally {
        setLoadingAccounts(false);
      }
    }
    fetchAccounts();
  }, []);

  const charCount = text.length;
  const isOverLimit = charCount > 500;
  const activeAccounts = accounts.filter((a) => a.status === "ACTIVE");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return; // Prevent double submit

    if (!selectedAccountId) {
      setError("Please select a Threads account to publish with");
      return;
    }

    if (!text.trim()) {
      setError("Post content cannot be empty or whitespace");
      return;
    }

    if (isOverLimit) {
      setError("Post content exceeds Threads 500-character limit");
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setSuccessPost(null);

    try {
      const res = await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId: selectedAccountId,
          text: text.trim(),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to publish post");
      } else {
        setSuccessPost(data.post);
        setText(""); // Clear input on success
      }
    } catch {
      setError("Network connection error while submitting post");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2.5">
          <PenSquare className="w-6 h-6 text-slate-900" />
          Create Post
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Publish manual text updates to Threads using official Graph API containers
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
              <p className="font-semibold">Post published successfully!</p>
              {successPost.threadsPostId && (
                <p className="text-xs text-emerald-700 mt-0.5">
                  Threads Post ID: {successPost.threadsPostId}
                </p>
              )}
            </div>
          </div>
          <Link
            href="/posts"
            className="text-xs font-semibold text-emerald-800 hover:text-emerald-950 flex items-center gap-1 underline underline-offset-2"
          >
            View History <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      )}

      {loadingAccounts ? (
        <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-slate-400">
          <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2" />
          Loading accounts...
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
            You must have at least one active, verified Threads account to publish.
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
        <form onSubmit={handleSubmit} className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 shadow-sm space-y-6">
          {/* Account Selector */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Publishing Account
            </label>
            <select
              value={selectedAccountId}
              onChange={(e) => setSelectedAccountId(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent font-medium"
            >
              {activeAccounts.map((account) => (
                <option key={account.id} value={account.id}>
                  @{account.username} ({account.displayName})
                </option>
              ))}
            </select>
            <p className="text-xs text-slate-400 mt-1.5">
              Only active accounts with valid tokens appear in this list.
            </p>
          </div>

          {/* Post Content */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="block text-sm font-medium text-slate-700">
                Post Content
              </label>
              <span
                className={`text-xs font-mono font-medium ${
                  isOverLimit ? "text-rose-600 font-bold" : charCount > 450 ? "text-amber-600" : "text-slate-400"
                }`}
              >
                {charCount} / 500
              </span>
            </div>
            <textarea
              rows={6}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="What's on your mind? Share an affiliate recommendation, tip, or question..."
              className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition-all placeholder:text-slate-400 resize-y"
            />
          </div>

          {/* Submit Action */}
          <div className="pt-2 flex items-center justify-between border-t border-slate-100">
            <span className="text-xs text-slate-400">
              Uses official two-stage container publishing
            </span>
            <button
              type="submit"
              disabled={isSubmitting || !text.trim() || isOverLimit || !selectedAccountId}
              className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium rounded-lg shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" /> Publishing...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" /> Publish Now
                </>
              )}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

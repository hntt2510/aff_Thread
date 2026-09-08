import React from "react";
import Link from "next/link";
import { Users, Send, AlertTriangle, ArrowRight, ShieldCheck } from "lucide-react";
import { db } from "@/db";
import { threadsAccounts, posts } from "@/db/schema";
import { eq, count } from "drizzle-orm";

export const dynamic = "force-dynamic";

async function getStats() {
  try {
    const [accountsResult] = await db
      .select({ count: count() })
      .from(threadsAccounts)
      .where(eq(threadsAccounts.status, "ACTIVE"));

    const [publishedResult] = await db
      .select({ count: count() })
      .from(posts)
      .where(eq(posts.status, "PUBLISHED"));

    const [failedResult] = await db
      .select({ count: count() })
      .from(posts)
      .where(eq(posts.status, "FAILED"));

    return {
      connectedAccounts: Number(accountsResult?.count || 0),
      publishedPosts: Number(publishedResult?.count || 0),
      failedPosts: Number(failedResult?.count || 0),
    };
  } catch {
    return {
      connectedAccounts: 0,
      publishedPosts: 0,
      failedPosts: 0,
    };
  }
}

export default async function DashboardPage() {
  const stats = await getStats();

  return (
    <div className="space-y-8">
      {/* Welcome Banner */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <div className="flex items-center gap-2 text-sm text-slate-500 font-medium mb-1">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            Admin Environment
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
            Overview
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Manage connected Threads tester accounts and publish affiliate text posts safely.
          </p>
        </div>
        <div className="flex gap-3">
          <Link
            href="/create"
            className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium rounded-lg shadow-sm transition-colors flex items-center gap-2"
          >
            Create Post
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>

      {/* Real Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        {/* Connected Accounts */}
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-500">Connected Accounts</span>
            <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-lg flex items-center justify-center">
              <Users className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4">
            <div className="text-3xl font-bold text-slate-900">{stats.connectedAccounts}</div>
            <p className="text-xs text-slate-400 mt-1">Active verified Threads accounts</p>
          </div>
          <div className="mt-4 pt-4 border-t border-slate-100">
            <Link
              href="/accounts"
              className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 flex items-center gap-1"
            >
              Manage accounts &rarr;
            </Link>
          </div>
        </div>

        {/* Published Posts */}
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-500">Published Posts</span>
            <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-lg flex items-center justify-center">
              <Send className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4">
            <div className="text-3xl font-bold text-slate-900">{stats.publishedPosts}</div>
            <p className="text-xs text-slate-400 mt-1">Successfully published via Graph API</p>
          </div>
          <div className="mt-4 pt-4 border-t border-slate-100">
            <Link
              href="/posts"
              className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 flex items-center gap-1"
            >
              View history &rarr;
            </Link>
          </div>
        </div>

        {/* Failed Posts */}
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-500">Failed Posts</span>
            <div className="w-10 h-10 bg-rose-50 text-rose-600 rounded-lg flex items-center justify-center">
              <AlertTriangle className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4">
            <div className="text-3xl font-bold text-slate-900">{stats.failedPosts}</div>
            <p className="text-xs text-slate-400 mt-1">Failed container or publish calls</p>
          </div>
          <div className="mt-4 pt-4 border-t border-slate-100">
            <Link
              href="/posts"
              className="text-xs font-semibold text-rose-600 hover:text-rose-700 flex items-center gap-1"
            >
              Inspect errors &rarr;
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

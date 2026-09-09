import React from "react";
import Link from "next/link";
import {
  Users,
  Send,
  Calendar,
  AlertTriangle,
  ArrowRight,
  ShieldCheck,
  Clock,
  ExternalLink,
  Plus,
} from "lucide-react";
import { db } from "@/db";
import { threadsAccounts, posts } from "@/db/schema";
import { eq, count } from "drizzle-orm";
import { ensureDatabaseSchema } from "@/db/migrate";
import { postService, PostWithAccount } from "@/services/post.service";
import { formatInTimezone } from "@/lib/date/timezone";

export const dynamic = "force-dynamic";

async function getDashboardData() {
  try {
    await ensureDatabaseSchema();

    const [accountsResult] = await db
      .select({ count: count() })
      .from(threadsAccounts)
      .where(eq(threadsAccounts.status, "ACTIVE"));

    const [publishedResult] = await db
      .select({ count: count() })
      .from(posts)
      .where(eq(posts.status, "PUBLISHED"));

    const [scheduledResult] = await db
      .select({ count: count() })
      .from(posts)
      .where(eq(posts.status, "SCHEDULED"));

    const [failedResult] = await db
      .select({ count: count() })
      .from(posts)
      .where(eq(posts.status, "FAILED"));

    const upcomingPosts = await postService.listUpcomingScheduled(5);
    const recentActivity = await postService.listPosts({ limit: 5 });

    return {
      connectedAccounts: Number(accountsResult?.count || 0),
      publishedPosts: Number(publishedResult?.count || 0),
      scheduledPosts: Number(scheduledResult?.count || 0),
      failedPosts: Number(failedResult?.count || 0),
      upcomingPosts,
      recentActivity,
    };
  } catch {
    return {
      connectedAccounts: 0,
      publishedPosts: 0,
      scheduledPosts: 0,
      failedPosts: 0,
      upcomingPosts: [] as PostWithAccount[],
      recentActivity: [] as PostWithAccount[],
    };
  }
}

function getStatusBadge(status: string) {
  switch (status) {
    case "PUBLISHED":
      return (
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          Published
        </span>
      );
    case "SCHEDULED":
      return (
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-sky-50 text-sky-700 border border-sky-200">
          <span className="w-1.5 h-1.5 rounded-full bg-sky-500" />
          Scheduled
        </span>
      );
    case "PUBLISHING":
      return (
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-200">
          <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
          Publishing
        </span>
      );
    case "CANCELLED":
      return (
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200">
          <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
          Cancelled
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-rose-50 text-rose-700 border border-rose-200">
          <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
          Failed
        </span>
      );
  }
}

export default async function DashboardPage() {
  const data = await getDashboardData();

  return (
    <div className="space-y-8">
      {/* Welcome Banner */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <div className="flex items-center gap-2 text-sm text-slate-500 font-medium mb-1">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            Admin Publishing Workspace
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
            Publishing Overview
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Manage connected Threads accounts, immediate text publications, and automated scheduling.
          </p>
        </div>
        <div className="flex gap-3">
          <Link
            href="/create"
            className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium rounded-lg shadow-sm transition-colors flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Create Post
          </Link>
        </div>
      </div>

      {/* 4 Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {/* Connected Accounts */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-500">Connected Accounts</span>
            <div className="w-9 h-9 bg-indigo-50 text-indigo-600 rounded-lg flex items-center justify-center">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-slate-900">{data.connectedAccounts}</div>
            <p className="text-xs text-slate-400 mt-0.5">Active verified accounts</p>
          </div>
          <div className="mt-3 pt-3 border-t border-slate-100">
            <Link
              href="/accounts"
              className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 flex items-center gap-1"
            >
              Manage accounts &rarr;
            </Link>
          </div>
        </div>

        {/* Published Posts */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-500">Published Posts</span>
            <div className="w-9 h-9 bg-emerald-50 text-emerald-600 rounded-lg flex items-center justify-center">
              <Send className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-slate-900">{data.publishedPosts}</div>
            <p className="text-xs text-slate-400 mt-0.5">Confirmed via Threads API</p>
          </div>
          <div className="mt-3 pt-3 border-t border-slate-100">
            <Link
              href="/posts?status=PUBLISHED"
              className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 flex items-center gap-1"
            >
              View published &rarr;
            </Link>
          </div>
        </div>

        {/* Scheduled Posts */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-500">Scheduled Posts</span>
            <div className="w-9 h-9 bg-sky-50 text-sky-600 rounded-lg flex items-center justify-center">
              <Calendar className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-slate-900">{data.scheduledPosts}</div>
            <p className="text-xs text-slate-400 mt-0.5">Queued in scheduler</p>
          </div>
          <div className="mt-3 pt-3 border-t border-slate-100">
            <Link
              href="/posts?status=SCHEDULED"
              className="text-xs font-semibold text-sky-600 hover:text-sky-700 flex items-center gap-1"
            >
              View queue &rarr;
            </Link>
          </div>
        </div>

        {/* Failed Posts */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-500">Failed Posts</span>
            <div className="w-9 h-9 bg-rose-50 text-rose-600 rounded-lg flex items-center justify-center">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-slate-900">{data.failedPosts}</div>
            <p className="text-xs text-slate-400 mt-0.5">Requires review or retry</p>
          </div>
          <div className="mt-3 pt-3 border-t border-slate-100">
            <Link
              href="/posts?status=FAILED"
              className="text-xs font-semibold text-rose-600 hover:text-rose-700 flex items-center gap-1"
            >
              Inspect failures &rarr;
            </Link>
          </div>
        </div>
      </div>

      {/* Sections: Upcoming Scheduled Posts & Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Upcoming Scheduled Queue */}
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-sky-600" />
                <h2 className="text-base font-semibold text-slate-900">Upcoming Queue</h2>
              </div>
              <Link
                href="/posts?status=SCHEDULED"
                className="text-xs font-medium text-sky-600 hover:text-sky-800 flex items-center gap-1"
              >
                Full Queue <ArrowRight className="w-3 h-3" />
              </Link>
            </div>

            {data.upcomingPosts.length === 0 ? (
              <div className="text-center py-10 px-4 bg-slate-50/70 border border-dashed border-slate-200 rounded-xl">
                <Calendar className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="text-sm font-medium text-slate-600">No scheduled posts queued</p>
                <p className="text-xs text-slate-400 mt-0.5 mb-4">
                  Schedule upcoming affiliate recommendations to publish automatically.
                </p>
                <Link
                  href="/create"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-medium transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" /> Schedule Post
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                {data.upcomingPosts.map((post) => (
                  <div
                    key={post.id}
                    className="p-3.5 bg-slate-50/80 border border-slate-100 rounded-lg space-y-2 hover:border-slate-200 transition-colors"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-800">
                        @{post.account?.username || post.accountUsername}
                      </span>
                      <span className="font-mono text-slate-500 flex items-center gap-1">
                        <Clock className="w-3 h-3 text-sky-500" />
                        {post.scheduledAt ? formatInTimezone(post.scheduledAt) : "N/A"}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 line-clamp-2">{post.text}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 text-right">
            <span className="text-[11px] text-slate-400">
              Times displayed in Asia/Ho_Chi_Minh (UTC+7)
            </span>
          </div>
        </div>

        {/* Recent Activity */}
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Send className="w-4 h-4 text-emerald-600" />
                <h2 className="text-base font-semibold text-slate-900">Recent Activity</h2>
              </div>
              <Link
                href="/posts"
                className="text-xs font-medium text-slate-600 hover:text-slate-900 flex items-center gap-1"
              >
                All Posts <ArrowRight className="w-3 h-3" />
              </Link>
            </div>

            {data.recentActivity.length === 0 ? (
              <div className="text-center py-10 px-4 bg-slate-50/70 border border-dashed border-slate-200 rounded-xl">
                <Send className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="text-sm font-medium text-slate-600">No recent activity</p>
                <p className="text-xs text-slate-400 mt-0.5">
                  Publish your first update to see real-time activity here.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {data.recentActivity.map((post) => (
                  <div
                    key={post.id}
                    className="p-3.5 bg-slate-50/80 border border-slate-100 rounded-lg space-y-2 hover:border-slate-200 transition-colors"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-800">
                        @{post.account?.username || post.accountUsername}
                      </span>
                      <div className="flex items-center gap-2">
                        {getStatusBadge(post.status)}
                        <span className="text-slate-400">
                          {new Date(post.createdAt).toLocaleDateString([], {
                            month: "short",
                            day: "numeric",
                          })}
                        </span>
                      </div>
                    </div>
                    <p className="text-xs text-slate-600 line-clamp-2">{post.text}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
            <span>Audit trail preserved permanently</span>
            <Link href="/posts" className="hover:text-slate-600 font-medium">
              View History &rarr;
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

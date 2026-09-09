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
  Activity,
  Link2,
  MousePointerClick,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { db } from "@/db";
import { threadsAccounts, posts } from "@/db/schema";
import { eq, count } from "drizzle-orm";
import { postService, PostWithAccount } from "@/services/post.service";
import { schedulerService, SchedulerHealth } from "@/services/scheduler.service";
import { affiliateService, AffiliateAnalytics } from "@/services/affiliate.service";
import { formatInTimezone } from "@/lib/date/timezone";

export const dynamic = "force-dynamic";

async function getDashboardData() {
  try {
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
    const schedulerHealth = await schedulerService.getSchedulerHealth();
    const affiliateAnalytics = await affiliateService.getAnalytics();

    return {
      connectedAccounts: Number(accountsResult?.count || 0),
      publishedPosts: Number(publishedResult?.count || 0),
      scheduledPosts: Number(scheduledResult?.count || 0),
      failedPosts: Number(failedResult?.count || 0),
      upcomingPosts,
      recentActivity,
      schedulerHealth,
      affiliateAnalytics,
    };
  } catch {
    return {
      connectedAccounts: 0,
      publishedPosts: 0,
      scheduledPosts: 0,
      failedPosts: 0,
      upcomingPosts: [] as PostWithAccount[],
      recentActivity: [] as PostWithAccount[],
      schedulerHealth: {
        status: "UNKNOWN",
        lastRun: null,
        lastSeenMinutesAgo: null,
      } as SchedulerHealth,
      affiliateAnalytics: null as AffiliateAnalytics | null,
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

function getSchedulerHealthBadge(status: string) {
  switch (status) {
    case "HEALTHY":
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          Healthy (1-min cron active)
        </span>
      );
    case "DEGRADED":
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
          <span className="w-2 h-2 rounded-full bg-amber-500" />
          Degraded (delayed runs)
        </span>
      );
    case "STALE":
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
          <span className="w-2 h-2 rounded-full bg-rose-500" />
          Stale (&gt;10 min silent)
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 border border-slate-200">
          <span className="w-2 h-2 rounded-full bg-slate-400" />
          Unknown (awaiting first run)
        </span>
      );
  }
}

export default async function DashboardPage() {
  const data = await getDashboardData();
  const { schedulerHealth, affiliateAnalytics } = data;

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
            Manage multi-format publications, automated delivery, and affiliate tracking.
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

      {/* Scheduler Health & Affiliate Highlights */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Scheduler Health Card */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="w-5 h-5 text-indigo-600" />
              <h3 className="text-base font-semibold text-slate-900">Scheduler Health</h3>
            </div>
            {getSchedulerHealthBadge(schedulerHealth.status)}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs bg-slate-50 p-3.5 rounded-lg border border-slate-100">
            <div>
              <span className="text-slate-500 block">Primary Runner</span>
              <span className="font-semibold text-slate-800">cron-job.org (1m)</span>
            </div>
            <div>
              <span className="text-slate-500 block">Last Seen</span>
              <span className="font-semibold text-slate-800">
                {schedulerHealth.lastSeenMinutesAgo !== null
                  ? `${schedulerHealth.lastSeenMinutesAgo}m ago`
                  : "Never"}
              </span>
            </div>
            <div>
              <span className="text-slate-500 block">Source</span>
              <span className="font-mono text-slate-800">
                {schedulerHealth.lastRun?.triggerSource || "N/A"}
              </span>
            </div>
            {schedulerHealth.lastRun && (
              <>
                <div>
                  <span className="text-slate-500 block">Last Duration</span>
                  <span className="font-mono text-slate-800">
                    {schedulerHealth.lastRun.durationMs}ms
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">Claimed / Done</span>
                  <span className="font-semibold text-emerald-700">
                    {schedulerHealth.lastRun.claimed} / {schedulerHealth.lastRun.published}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">Stale Recovered</span>
                  <span className="font-mono text-slate-800">
                    {schedulerHealth.lastRun.staleRecovered}
                  </span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Affiliate Quick Overview */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Link2 className="w-5 h-5 text-emerald-600" />
              <h3 className="text-base font-semibold text-slate-900">Affiliate Tracking</h3>
            </div>
            <Link
              href="/affiliate"
              className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
            >
              Manager <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs bg-slate-50 p-3.5 rounded-lg border border-slate-100">
            <div>
              <span className="text-slate-500 block">Total Clicks</span>
              <span className="text-base font-bold text-slate-900">
                {affiliateAnalytics?.summary.totalClicks ?? 0}
              </span>
            </div>
            <div>
              <span className="text-slate-500 block">Human Clicks</span>
              <span className="text-base font-bold text-emerald-600">
                {affiliateAnalytics?.summary.humanClicks ?? 0}
              </span>
            </div>
            <div>
              <span className="text-slate-500 block">Active Links</span>
              <span className="text-base font-bold text-slate-900">
                {affiliateAnalytics?.summary.totalLinks ?? 0}
              </span>
            </div>
          </div>
          {affiliateAnalytics?.topLinks?.[0] && (
            <p className="text-xs text-slate-500 truncate">
              🔥 Top Link: <span className="font-semibold text-slate-800">{affiliateAnalytics.topLinks[0].label || `/r/${affiliateAnalytics.topLinks[0].publicSlug}`}</span> ({affiliateAnalytics.topLinks[0].totalClicks} clicks)
            </p>
          )}
        </div>
      </div>

      {/* 4 Standard Metric Cards */}
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
                <p className="text-xs text-slate-400 max-w-xs mx-auto mt-1 mb-4">
                  Schedule posts to be automatically published by the 1-minute queue scheduler.
                </p>
                <Link
                  href="/create"
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium rounded-lg transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Schedule Post
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                {data.upcomingPosts.map((post) => (
                  <div
                    key={post.id}
                    className="p-3.5 bg-slate-50 border border-slate-200/80 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-slate-900 text-sm">
                          @{post.account?.username}
                        </span>
                        <span className="text-xs text-slate-400">•</span>
                        <span className="text-xs text-sky-700 bg-sky-50 px-2 py-0.5 rounded border border-sky-100 flex items-center gap-1">
                          <Clock className="w-3 h-3 text-sky-500" />
                          {post.scheduledAt ? formatInTimezone(post.scheduledAt) : "N/A"}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 line-clamp-1">{post.text}</p>
                    </div>
                    <div>{getStatusBadge(post.status)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Recent Publications & History */}
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Send className="w-4 h-4 text-slate-700" />
                <h2 className="text-base font-semibold text-slate-900">Recent Activity</h2>
              </div>
              <Link
                href="/posts"
                className="text-xs font-medium text-slate-600 hover:text-slate-900 flex items-center gap-1"
              >
                View History <ArrowRight className="w-3 h-3" />
              </Link>
            </div>

            {data.recentActivity.length === 0 ? (
              <div className="text-center py-10 px-4 bg-slate-50/70 border border-dashed border-slate-200 rounded-xl">
                <Send className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="text-sm font-medium text-slate-600">No activity recorded yet</p>
                <p className="text-xs text-slate-400 max-w-xs mx-auto mt-1 mb-4">
                  Create your first publication to begin managing Threads content.
                </p>
                <Link
                  href="/create"
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium rounded-lg transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Create Post
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                {data.recentActivity.map((post) => (
                  <div
                    key={post.id}
                    className="p-3.5 bg-slate-50 border border-slate-200/80 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-slate-900 text-sm">
                          @{post.account?.username}
                        </span>
                        {post.publishedAt && (
                          <>
                            <span className="text-xs text-slate-400">•</span>
                            <span className="text-xs text-slate-500">
                              {new Date(post.publishedAt).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                          </>
                        )}
                      </div>
                      <p className="text-xs text-slate-600 line-clamp-1">{post.text}</p>
                    </div>
                    <div>{getStatusBadge(post.status)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Link2,
  ExternalLink,
  Plus,
  RefreshCw,
  Copy,
  Check,
  Globe,
  BarChart3,
  MousePointerClick,
  Bot,
  FolderGit2,
  AlertCircle,
  CheckCircle2,
  Search,
} from "lucide-react";
import type { AffiliateAnalytics } from "@/services/affiliate.service";

interface LinkItem {
  id: string;
  destinationUrl: string;
  publicSlug: string;
  label: string | null;
  network: string | null;
  subId: string | null;
  status: string;
  campaignName: string | null;
  clickCount: number;
  createdAt: string;
}

interface CampaignItem {
  id: string;
  name: string;
  network: string | null;
  description: string | null;
  status: string;
  createdAt: string;
}

export default function AffiliatePage() {
  const [activeTab, setActiveTab] = useState<"links" | "analytics" | "campaigns">("links");
  const [links, setLinks] = useState<LinkItem[]>([]);
  const [campaigns, setCampaigns] = useState<CampaignItem[]>([]);
  const [analytics, setAnalytics] = useState<AffiliateAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null);

  // Modals state
  const [showCreateLinkModal, setShowCreateLinkModal] = useState(false);
  const [showCreateCampaignModal, setShowCreateCampaignModal] = useState(false);

  // New Link form state
  const [newLinkDest, setNewLinkDest] = useState("");
  const [newLinkLabel, setNewLinkLabel] = useState("");
  const [newLinkCampaignId, setNewLinkCampaignId] = useState("");
  const [newLinkNetwork, setNewLinkNetwork] = useState("");
  const [newLinkSlug, setNewLinkSlug] = useState("");
  const [creatingLink, setCreatingLink] = useState(false);

  // New Campaign form state
  const [newCampaignName, setNewCampaignName] = useState("");
  const [newCampaignNetwork, setNewCampaignNetwork] = useState("");
  const [newCampaignDesc, setNewCampaignDesc] = useState("");
  const [creatingCampaign, setCreatingCampaign] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      setError(null);
      const [linksRes, campaignsRes, analyticsRes] = await Promise.all([
        fetch("/api/affiliate/links"),
        fetch("/api/affiliate/campaigns"),
        fetch("/api/affiliate/analytics"),
      ]);

      const linksData = await linksRes.json();
      const campaignsData = await campaignsRes.json();
      const analyticsData = await analyticsRes.json();

      if (linksRes.ok) setLinks(linksData.links || []);
      if (campaignsRes.ok) setCampaigns(campaignsData.campaigns || []);
      if (analyticsRes.ok) setAnalytics(analyticsData);
    } catch {
      setError("Failed to load affiliate tracking data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleCopyLink = (slug: string) => {
    const fullUrl = `https://affthread-chi.vercel.app/r/${slug}`;
    navigator.clipboard.writeText(fullUrl);
    setCopiedSlug(slug);
    setTimeout(() => setCopiedSlug(null), 2000);
  };

  const handleCreateLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLinkDest.trim()) return;

    setCreatingLink(true);
    setError(null);

    try {
      const res = await fetch("/api/affiliate/links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          destinationUrl: newLinkDest.trim(),
          label: newLinkLabel.trim() || undefined,
          campaignId: newLinkCampaignId || undefined,
          network: newLinkNetwork.trim() || undefined,
          publicSlug: newLinkSlug.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to create affiliate link");
      } else {
        setShowCreateLinkModal(false);
        setNewLinkDest("");
        setNewLinkLabel("");
        setNewLinkSlug("");
        setNewLinkNetwork("");
        fetchData();
      }
    } catch {
      setError("Network error while creating link");
    } finally {
      setCreatingLink(false);
    }
  };

  const handleCreateCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCampaignName.trim()) return;

    setCreatingCampaign(true);
    setError(null);

    try {
      const res = await fetch("/api/affiliate/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newCampaignName.trim(),
          network: newCampaignNetwork.trim() || undefined,
          description: newCampaignDesc.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to create campaign");
      } else {
        setShowCreateCampaignModal(false);
        setNewCampaignName("");
        setNewCampaignNetwork("");
        setNewCampaignDesc("");
        fetchData();
      }
    } catch {
      setError("Network error while creating campaign");
    } finally {
      setCreatingCampaign(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2.5">
            <Link2 className="w-6 h-6 text-slate-900" />
            Affiliate Management
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Create tracked redirect links, monitor campaigns, and inspect bot-filtered click attribution
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => {
              setLoading(true);
              fetchData();
            }}
            className="inline-flex items-center gap-2 px-3 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-lg text-sm font-medium transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
          <button
            onClick={() => setShowCreateCampaignModal(true)}
            className="inline-flex items-center gap-2 px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 rounded-lg text-sm font-medium transition-colors"
          >
            <FolderGit2 className="w-4 h-4" />
            New Campaign
          </button>
          <button
            onClick={() => setShowCreateLinkModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-sm font-medium transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" />
            New Tracked Link
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-3 text-rose-700 text-sm">
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <div className="flex-1">{error}</div>
        </div>
      )}

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Total Clicks
            </span>
            <MousePointerClick className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-2xl font-bold text-slate-900 mt-2">
            {analytics?.summary.totalClicks ?? 0}
          </div>
          <div className="text-xs text-slate-500 mt-1 flex items-center gap-1.5">
            <span className="font-medium text-emerald-600">{analytics?.summary.humanClicks ?? 0} human</span>
            <span>•</span>
            <span>{analytics?.summary.botClicks ?? 0} bot</span>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Human Clicks (7d)
            </span>
            <BarChart3 className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-bold text-slate-900 mt-2">
            {analytics?.summary.clicksLast7Days ?? 0}
          </div>
          <div className="text-xs text-slate-500 mt-1">Real visitor traffic</div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Tracked Links
            </span>
            <Link2 className="w-4 h-4 text-blue-600" />
          </div>
          <div className="text-2xl font-bold text-slate-900 mt-2">
            {links.length}
          </div>
          <div className="text-xs text-slate-500 mt-1">Active /r/ redirect endpoints</div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Campaigns
            </span>
            <FolderGit2 className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="text-2xl font-bold text-slate-900 mt-2">
            {campaigns.length}
          </div>
          <div className="text-xs text-slate-500 mt-1">Organized networks</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-1">
        <button
          onClick={() => setActiveTab("links")}
          className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
            activeTab === "links"
              ? "bg-slate-900 text-white"
              : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
          }`}
        >
          Tracked Links ({links.length})
        </button>
        <button
          onClick={() => setActiveTab("analytics")}
          className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
            activeTab === "analytics"
              ? "bg-slate-900 text-white"
              : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
          }`}
        >
          Analytics & Clicks
        </button>
        <button
          onClick={() => setActiveTab("campaigns")}
          className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
            activeTab === "campaigns"
              ? "bg-slate-900 text-white"
              : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
          }`}
        >
          Campaigns ({campaigns.length})
        </button>
      </div>

      {/* Tab: Tracked Links */}
      {activeTab === "links" && (
        <div className="bg-white border border-slate-200 rounded-xl shadow-2xs overflow-hidden">
          {links.length === 0 ? (
            <div className="p-12 text-center text-slate-500 space-y-3">
              <Link2 className="w-8 h-8 mx-auto text-slate-400" />
              <p className="font-semibold text-slate-900">No tracked links created yet</p>
              <p className="text-sm">Create your first tracked link to start attributing clicks from Threads.</p>
              <button
                onClick={() => setShowCreateLinkModal(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-medium"
              >
                <Plus className="w-4 h-4" /> Create Link
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-600">
                <thead className="bg-slate-50 text-xs uppercase font-semibold text-slate-500 border-b border-slate-200">
                  <tr>
                    <th className="px-5 py-3.5">Label & Slug</th>
                    <th className="px-5 py-3.5">Destination</th>
                    <th className="px-5 py-3.5">Campaign & Network</th>
                    <th className="px-5 py-3.5">Clicks</th>
                    <th className="px-5 py-3.5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {links.map((link) => (
                    <tr key={link.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="px-5 py-4">
                        <div className="font-semibold text-slate-900">
                          {link.label || "Untitled Link"}
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <code className="text-xs bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded font-mono">
                            /r/{link.publicSlug}
                          </code>
                          <button
                            onClick={() => handleCopyLink(link.publicSlug)}
                            className="text-slate-400 hover:text-slate-700 p-0.5"
                            title="Copy tracking URL"
                          >
                            {copiedSlug === link.publicSlug ? (
                              <Check className="w-3.5 h-3.5 text-emerald-600" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <a
                          href={link.destinationUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-sky-600 hover:underline max-w-xs truncate block flex items-center gap-1"
                        >
                          <span className="truncate">{link.destinationUrl}</span>
                          <ExternalLink className="w-3 h-3 flex-shrink-0" />
                        </a>
                      </td>
                      <td className="px-5 py-4 text-xs">
                        <span className="font-medium text-slate-800 block">
                          {link.campaignName || "None"}
                        </span>
                        <span className="text-slate-400">{link.network || "Custom"}</span>
                      </td>
                      <td className="px-5 py-4 font-semibold text-slate-900">
                        {link.clickCount}
                      </td>
                      <td className="px-5 py-4 text-right">
                        <button
                          onClick={() => handleCopyLink(link.publicSlug)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-xs font-medium transition-colors"
                        >
                          {copiedSlug === link.publicSlug ? "Copied!" : "Copy Link"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Tab: Analytics */}
      {activeTab === "analytics" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Top Links */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs space-y-4">
              <h3 className="text-base font-semibold text-slate-900">Top Performing Links</h3>
              {analytics?.topLinks && analytics.topLinks.length > 0 ? (
                <div className="space-y-3">
                  {analytics.topLinks.map((tl) => (
                    <div
                      key={tl.id}
                      className="flex items-center justify-between p-3 bg-slate-50 rounded-lg text-sm"
                    >
                      <div className="truncate pr-3">
                        <p className="font-medium text-slate-900 truncate">
                          {tl.label || `/r/${tl.publicSlug}`}
                        </p>
                        <p className="text-xs text-slate-500 font-mono">/r/{tl.publicSlug}</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <span className="text-sm font-bold text-slate-900">
                          {tl.totalClicks} clicks
                        </span>
                        <span className="text-xs text-emerald-600 block">
                          {tl.humanClicks} human
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-400">No clicks recorded yet</p>
              )}
            </div>

            {/* Top Referers */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs space-y-4">
              <h3 className="text-base font-semibold text-slate-900">Top Traffic Referers</h3>
              {analytics?.topReferers && analytics.topReferers.length > 0 ? (
                <div className="space-y-3">
                  {analytics.topReferers.map((ref, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between p-3 bg-slate-50 rounded-lg text-sm"
                    >
                      <span className="font-mono text-xs text-slate-800">{ref.domain}</span>
                      <span className="font-bold text-slate-900">{ref.clicks} clicks</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-400">No referer data recorded yet</p>
              )}
            </div>
          </div>

          {/* Recent Clicks Stream */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs space-y-4">
            <h3 className="text-base font-semibold text-slate-900">Recent Click Stream (Last 20)</h3>
            {analytics?.recentClicks && analytics.recentClicks.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-600">
                  <thead className="bg-slate-50 text-slate-500 border-b border-slate-200 uppercase font-semibold">
                    <tr>
                      <th className="px-4 py-2.5">Time</th>
                      <th className="px-4 py-2.5">Link</th>
                      <th className="px-4 py-2.5">Client Type</th>
                      <th className="px-4 py-2.5">Referer</th>
                      <th className="px-4 py-2.5">Country</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {analytics.recentClicks.map((c) => (
                      <tr key={c.id} className="hover:bg-slate-50">
                        <td className="px-4 py-2 text-slate-500 whitespace-nowrap">
                          {new Date(c.clickedAt).toLocaleTimeString()}
                        </td>
                        <td className="px-4 py-2 font-mono font-medium text-slate-800">
                          /r/{c.linkSlug}
                        </td>
                        <td className="px-4 py-2">
                          {c.isBot ? (
                            <span className="px-2 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 font-medium">
                              Bot
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 font-medium">
                              {c.userAgentClass || "Human"}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2 text-slate-500 truncate max-w-xs">
                          {c.refererDomain || "Direct"}
                        </td>
                        <td className="px-4 py-2 text-slate-500">
                          {c.country || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-slate-400">No clicks recorded yet</p>
            )}
          </div>
        </div>
      )}

      {/* Tab: Campaigns */}
      {activeTab === "campaigns" && (
        <div className="bg-white border border-slate-200 rounded-xl shadow-2xs overflow-hidden">
          {campaigns.length === 0 ? (
            <div className="p-12 text-center text-slate-500 space-y-3">
              <FolderGit2 className="w-8 h-8 mx-auto text-slate-400" />
              <p className="font-semibold text-slate-900">No campaigns created yet</p>
              <p className="text-sm">Organize your affiliate links by creating a campaign.</p>
              <button
                onClick={() => setShowCreateCampaignModal(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-medium"
              >
                <Plus className="w-4 h-4" /> Create Campaign
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-600">
                <thead className="bg-slate-50 text-xs uppercase font-semibold text-slate-500 border-b border-slate-200">
                  <tr>
                    <th className="px-5 py-3.5">Campaign Name</th>
                    <th className="px-5 py-3.5">Network</th>
                    <th className="px-5 py-3.5">Description</th>
                    <th className="px-5 py-3.5">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {campaigns.map((camp) => (
                    <tr key={camp.id} className="hover:bg-slate-50/70">
                      <td className="px-5 py-4 font-semibold text-slate-900">
                        {camp.name}
                      </td>
                      <td className="px-5 py-4 text-xs text-slate-500">
                        {camp.network || "Custom"}
                      </td>
                      <td className="px-5 py-4 text-xs text-slate-500 max-w-sm truncate">
                        {camp.description || "—"}
                      </td>
                      <td className="px-5 py-4">
                        <span className="px-2 py-0.5 rounded text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                          {camp.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Modal: Create Link */}
      {showCreateLinkModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl">
            <h3 className="text-lg font-bold text-slate-900">Create Tracked Redirect Link</h3>
            <form onSubmit={handleCreateLink} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Destination URL <span className="text-rose-500">*</span>
                </label>
                <input
                  type="url"
                  required
                  placeholder="https://shopee.vn/product/..."
                  value={newLinkDest}
                  onChange={(e) => setNewLinkDest(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:border-slate-900"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Label (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Wireless Earbuds Promo"
                  value={newLinkLabel}
                  onChange={(e) => setNewLinkLabel(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:border-slate-900"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Custom Slug (Optional)
                </label>
                <div className="flex items-center">
                  <span className="px-2.5 py-2 bg-slate-100 border border-r-0 border-slate-200 rounded-l-lg text-xs text-slate-500">
                    /r/
                  </span>
                  <input
                    type="text"
                    placeholder="earbuds-deal (or leave blank for auto)"
                    value={newLinkSlug}
                    onChange={(e) => setNewLinkSlug(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-r-lg text-sm text-slate-800 focus:outline-none focus:border-slate-900"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Campaign
                  </label>
                  <select
                    value={newLinkCampaignId}
                    onChange={(e) => setNewLinkCampaignId(e.target.value)}
                    className="w-full px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800"
                  >
                    <option value="">None</option>
                    {campaigns.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Network
                  </label>
                  <input
                    type="text"
                    placeholder="Shopee, TikTok, Custom..."
                    value={newLinkNetwork}
                    onChange={(e) => setNewLinkNetwork(e.target.value)}
                    className="w-full px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowCreateLinkModal(false)}
                  className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingLink}
                  className="px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-medium hover:bg-slate-800 disabled:opacity-50"
                >
                  {creatingLink ? "Creating..." : "Save Link"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Create Campaign */}
      {showCreateCampaignModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl">
            <h3 className="text-lg font-bold text-slate-900">Create Affiliate Campaign</h3>
            <form onSubmit={handleCreateCampaign} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Campaign Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Mega Summer Sale"
                  value={newCampaignName}
                  onChange={(e) => setNewCampaignName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:border-slate-900"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Network (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Shopee, TikTok Shop, Lazada"
                  value={newCampaignNetwork}
                  onChange={(e) => setNewCampaignNetwork(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:border-slate-900"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Description
                </label>
                <textarea
                  rows={3}
                  placeholder="Notes about products, target commission rate..."
                  value={newCampaignDesc}
                  onChange={(e) => setNewCampaignDesc(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:border-slate-900"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowCreateCampaignModal(false)}
                  className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingCampaign}
                  className="px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-medium hover:bg-slate-800 disabled:opacity-50"
                >
                  {creatingCampaign ? "Creating..." : "Save Campaign"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

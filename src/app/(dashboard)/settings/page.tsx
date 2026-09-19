"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  KeyRound,
  Plus,
  RefreshCw,
  Trash2,
  Check,
  AlertCircle,
  ShieldCheck,
  Sparkles,
  Server,
  Eye,
  EyeOff,
  Bot,
  ExternalLink,
} from "lucide-react";

interface MaskedSetting {
  key: string;
  maskedValue: string;
  hasValue: boolean;
  source: "DATABASE" | "ENVIRONMENT";
  description: string | null;
  updatedAt: string | null;
}

const PRESET_KEYS = [
  {
    key: "GEMINI_API_KEY",
    label: "Google Gemini API Key",
    desc: "Used for AI thread copywriting with Gemini 2.5 Flash / 1.5 Flash",
    placeholder: "AIzaSy...",
  },
  {
    key: "GEMINI_MODEL",
    label: "Gemini Model Name",
    desc: "Target model for thread composition (default: gemini-2.5-flash)",
    placeholder: "gemini-2.5-flash",
  },
  {
    key: "GEMINI_CUSTOM_URL",
    label: "Gemini Web / Gem URL",
    desc: "Đường dẫn ứng dụng Gemini Web hoặc Custom Gem viết bài Threads (mặc định: https://gemini.google.com/app)",
    placeholder: "https://gemini.google.com/app",
  },
  {
    key: "OPENAI_API_KEY",
    label: "OpenAI API Key",
    desc: "Optional fallback LLM provider",
    placeholder: "sk-proj-...",
  },
  {
    key: "TIKW_API_KEY",
    label: "TikW API Key",
    desc: "Optional API token for rapid TikTok trend scraping",
    placeholder: "tikw_...",
  },
];

export default function SettingsPage() {
  const [settings, setSettings] = useState<MaskedSetting[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Modal / Form state
  const [showModal, setShowModal] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState<string>("GEMINI_API_KEY");
  const [customKey, setCustomKey] = useState("");
  const [value, setValue] = useState("");
  const [description, setDescription] = useState("");
  const [showSecret, setShowSecret] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deletingKey, setDeletingKey] = useState<string | null>(null);

  const fetchSettings = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/settings");
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to load system settings");
      }
      setSettings(data.settings || []);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const handleOpenPreset = (presetKey: string) => {
    const preset = PRESET_KEYS.find((p) => p.key === presetKey);
    setSelectedPreset(presetKey);
    setCustomKey(presetKey === "CUSTOM" ? "" : presetKey);
    setDescription(preset?.desc || "");
    setValue("");
    setShowModal(true);
  };

  const handleSaveSetting = async (e: React.FormEvent) => {
    e.preventDefault();
    const finalKey = selectedPreset === "CUSTOM" ? customKey.trim().toUpperCase() : selectedPreset;
    if (!finalKey) {
      setError("Setting key is required");
      return;
    }
    if (!value.trim()) {
      setError("Setting value is required");
      return;
    }

    try {
      setSubmitting(true);
      setError(null);
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: finalKey,
          value: value.trim(),
          description: description.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to save setting");
      }

      setSuccessMessage(`Saved ${finalKey} securely (encrypted with AES-256-GCM).`);
      setTimeout(() => setSuccessMessage(null), 4000);
      setShowModal(false);
      setValue("");
      setDescription("");
      await fetchSettings();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteSetting = async (key: string) => {
    if (!confirm(`Are you sure you want to delete "${key}" from the database?`)) {
      return;
    }

    try {
      setDeletingKey(key);
      setError(null);
      const res = await fetch(`/api/settings?key=${encodeURIComponent(key)}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to delete setting");
      }

      setSuccessMessage(`Deleted ${key} from database.`);
      setTimeout(() => setSuccessMessage(null), 4000);
      await fetchSettings();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setDeletingKey(null);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2.5">
            <KeyRound className="w-7 h-7 text-indigo-600" />
            System Settings & API Keys
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Securely configure AI engines (Gemini, OpenAI) and external API tokens encrypted with AES-256-GCM.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => fetchSettings()}
            disabled={loading}
            className="p-2 text-slate-600 hover:text-slate-900 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50"
            title="Refresh settings"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
          <button
            onClick={() => handleOpenPreset("GEMINI_API_KEY")}
            className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-medium hover:bg-slate-800 transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" />
            Configure Key
          </button>
        </div>
      </div>

      {/* Alerts */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3 text-red-700 text-sm">
          <AlertCircle className="w-5 h-5 mt-0.5 shrink-0" />
          <div className="flex-1">{error}</div>
          <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700">
            &times;
          </button>
        </div>
      )}

      {successMessage && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-3 text-emerald-700 text-sm">
          <Check className="w-5 h-5 shrink-0" />
          <div className="flex-1 font-medium">{successMessage}</div>
        </div>
      )}

      {/* Security Info Banner */}
      <div className="bg-gradient-to-r from-indigo-50/80 to-blue-50/80 border border-indigo-100 rounded-2xl p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-sm">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Zero-Plaintext Vault</h3>
            <p className="text-xs text-slate-600 mt-0.5 max-w-2xl">
              All credentials are encrypted with <strong>AES-256-GCM</strong> using your application&apos;s master encryption key before persisting to PostgreSQL. Plaintext values are never rendered to browsers or logged.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 self-stretch sm:self-auto shrink-0 text-xs text-indigo-700 font-medium">
          <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse"></span>
          Database Fallback Enabled
        </div>
      </div>

      {/* Quick Setup Cards for Recommended Keys */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {PRESET_KEYS.map((preset) => {
          const currentSetting = settings.find((s) => s.key === preset.key);
          const isConfigured = !!currentSetting?.hasValue;

          return (
            <div
              key={preset.key}
              className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col justify-between hover:border-slate-300 transition-all shadow-sm"
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    {preset.key.startsWith("GEMINI") ? (
                      <Sparkles className="w-4 h-4 text-amber-500" />
                    ) : (
                      <Bot className="w-4 h-4 text-slate-600" />
                    )}
                    <span className="font-semibold text-xs text-slate-900">{preset.label}</span>
                  </div>
                  <span
                    className={`px-2 py-0.5 text-[10px] font-semibold rounded-full uppercase tracking-wider ${
                      isConfigured
                        ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                        : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {isConfigured ? "Ready" : "Missing"}
                  </span>
                </div>
                <p className="text-xs text-slate-500 line-clamp-2 mb-3">{preset.desc}</p>
              </div>

              <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                <span className="text-[11px] font-mono text-slate-400 truncate max-w-[120px]">
                  {currentSetting?.maskedValue || "Not set"}
                </span>
                <button
                  onClick={() => handleOpenPreset(preset.key)}
                  className="text-xs text-indigo-600 hover:text-indigo-700 font-medium hover:underline"
                >
                  {isConfigured ? "Update" : "Setup"}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Active Settings Table */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Configured Settings & Keys</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Live keys available to server-side AI engines and background jobs.
            </p>
          </div>
          <button
            onClick={() => handleOpenPreset("CUSTOM")}
            className="text-xs font-medium text-slate-600 hover:text-slate-900 border border-slate-200 px-3 py-1.5 rounded-lg hover:bg-slate-50 transition-colors"
          >
            + Add Custom Key
          </button>
        </div>

        {loading ? (
          <div className="p-12 text-center text-slate-400 flex flex-col items-center gap-2">
            <RefreshCw className="w-6 h-6 animate-spin text-slate-400" />
            <span className="text-sm">Loading settings...</span>
          </div>
        ) : settings.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            <KeyRound className="w-10 h-10 mx-auto text-slate-300 mb-2" />
            <p className="text-sm font-medium text-slate-600">No settings configured yet.</p>
            <p className="text-xs text-slate-400 mt-1">
              Add your Google Gemini API key to activate AI-driven Thread composition.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/50 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  <th className="px-5 py-3">Key Name</th>
                  <th className="px-5 py-3">Source</th>
                  <th className="px-5 py-3">Masked Secret</th>
                  <th className="px-5 py-3">Description</th>
                  <th className="px-5 py-3">Last Updated</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {settings.map((item) => (
                  <tr key={item.key} className="hover:bg-slate-50/70 transition-colors">
                    <td className="px-5 py-3.5 font-mono text-xs font-semibold text-slate-900">
                      {item.key}
                    </td>
                    <td className="px-5 py-3.5">
                      {item.source === "DATABASE" ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-200">
                          <Server className="w-3 h-3" />
                          Database
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200">
                          Env Variable
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 font-mono text-xs text-slate-600">
                      {item.maskedValue}
                    </td>
                    <td className="px-5 py-3.5 text-xs text-slate-500 max-w-xs truncate">
                      {item.description || "—"}
                    </td>
                    <td className="px-5 py-3.5 text-xs text-slate-400 whitespace-nowrap">
                      {item.updatedAt
                        ? new Date(item.updatedAt).toLocaleString("vi-VN")
                        : "Environment Static"}
                    </td>
                    <td className="px-5 py-3.5 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleOpenPreset(item.key)}
                          className="text-xs font-medium text-indigo-600 hover:text-indigo-800 hover:underline"
                        >
                          Configure
                        </button>
                        {item.source === "DATABASE" && (
                          <button
                            onClick={() => handleDeleteSetting(item.key)}
                            disabled={deletingKey === item.key}
                            className="p-1.5 text-slate-400 hover:text-red-600 rounded hover:bg-red-50 transition-colors disabled:opacity-50"
                            title="Delete setting"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Gemini AI Integration Guide */}
      <div className="bg-slate-900 text-white rounded-2xl p-6 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="w-5 h-5 text-amber-400" />
              <h3 className="text-base font-semibold">Gemini 2.5 Flash Setup</h3>
            </div>
            <p className="text-xs text-slate-300 max-w-2xl leading-relaxed">
              We leverage Google Gemini with specialized Vietnamese viral Thread copywriting personas (Regret Experience, Unpopular Opinion, Curated List). Get your free API key at Google AI Studio and configure it above.
            </p>
          </div>
          <a
            href="https://aistudio.google.com/app/apikey"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-medium transition-colors shrink-0"
          >
            Get Gemini Key <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>

      {/* Modal Configure/Add */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900">
                {selectedPreset === "CUSTOM"
                  ? "Add Custom Setting"
                  : `Configure ${selectedPreset}`}
              </h3>
              <button
                onClick={() => setShowModal(false)}
                className="text-slate-400 hover:text-slate-600 text-lg"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleSaveSetting} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Preset / Setting Key
                </label>
                <select
                  value={selectedPreset}
                  onChange={(e) => {
                    const next = e.target.value;
                    setSelectedPreset(next);
                    if (next !== "CUSTOM") {
                      const found = PRESET_KEYS.find((p) => p.key === next);
                      setCustomKey(next);
                      setDescription(found?.desc || "");
                    } else {
                      setCustomKey("");
                      setDescription("");
                    }
                  }}
                  className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  {PRESET_KEYS.map((p) => (
                    <option key={p.key} value={p.key}>
                      {p.label} ({p.key})
                    </option>
                  ))}
                  <option value="CUSTOM">Custom Key Name...</option>
                </select>
              </div>

              {selectedPreset === "CUSTOM" && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Key Name (UPPERCASE)
                  </label>
                  <input
                    type="text"
                    value={customKey}
                    onChange={(e) => setCustomKey(e.target.value.toUpperCase())}
                    placeholder="MY_CUSTOM_API_KEY"
                    required
                    className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              )}

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-slate-700">
                    Secret Value (Encrypted)
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowSecret(!showSecret)}
                    className="text-[11px] text-slate-500 hover:text-slate-800 flex items-center gap-1"
                  >
                    {showSecret ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                    {showSecret ? "Hide" : "Show"}
                  </button>
                </div>
                <input
                  type={showSecret ? "text" : "password"}
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder={
                    PRESET_KEYS.find((p) => p.key === selectedPreset)?.placeholder || "Paste key here..."
                  }
                  required
                  className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Description (Optional)
                </label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Notes about this key..."
                  className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-800 border border-slate-200 rounded-lg hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors disabled:opacity-50"
                >
                  {submitting ? "Encrypting & Saving..." : "Save Encrypted Key"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

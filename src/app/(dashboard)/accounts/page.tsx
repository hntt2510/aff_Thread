"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Users,
  Plus,
  RefreshCw,
  KeyRound,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Clock,
  X,
  ExternalLink,
} from "lucide-react";
import type { SafeAccount } from "@/services/account.service";

interface ProfilePreview {
  threadsUserId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  biography: string | null;
}

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<SafeAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionError, setActionError] = useState<string | null>(null);

  // Add Account Modal state
  const [showAddModal, setShowAddModal] = useState(false);
  const [inputToken, setInputToken] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [preview, setPreview] = useState<ProfilePreview | null>(null);
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  // Replace Token Modal state
  const [replaceTarget, setReplaceTarget] = useState<SafeAccount | null>(null);
  const [replaceToken, setReplaceToken] = useState("");
  const [replacing, setReplacing] = useState(false);
  const [replaceError, setReplaceError] = useState<string | null>(null);

  // Delete Confirm Modal state
  const [deleteTarget, setDeleteTarget] = useState<SafeAccount | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Loading indicator for per-account checks
  const [checkingId, setCheckingId] = useState<string | null>(null);

  const loadAccounts = useCallback(async () => {
    try {
      const res = await fetch("/api/accounts");
      const data = await res.json();
      if (res.ok && data.accounts) {
        setAccounts(data.accounts);
      } else {
        setActionError(data.error || "Failed to load accounts");
      }
    } catch {
      setActionError("Failed to fetch accounts");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAccounts();
  }, [loadAccounts]);

  // Verify token step
  const handleVerify = async () => {
    if (!inputToken.trim()) return;
    setVerifying(true);
    setAddError(null);
    setPreview(null);

    try {
      const res = await fetch("/api/accounts/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessToken: inputToken.trim() }),
      });
      const data = await res.json();

      if (!res.ok) {
        setAddError(data.error || "Failed to verify token with Meta API");
      } else {
        setPreview(data.profile);
      }
    } catch {
      setAddError("Network error while connecting to verification endpoint");
    } finally {
      setVerifying(false);
    }
  };

  // Confirm Add Account
  const handleConfirmAdd = async () => {
    if (!inputToken.trim()) return;
    setAdding(true);
    setAddError(null);

    try {
      const res = await fetch("/api/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessToken: inputToken.trim() }),
      });
      const data = await res.json();

      if (!res.ok) {
        setAddError(data.error || "Failed to persist account");
      } else {
        setShowAddModal(false);
        setInputToken("");
        setPreview(null);
        await loadAccounts();
      }
    } catch {
      setAddError("Network error while persisting account");
    } finally {
      setAdding(false);
    }
  };

  // Check Account Health
  const handleCheckAccount = async (id: string) => {
    setCheckingId(id);
    setActionError(null);

    try {
      const res = await fetch(`/api/accounts/${id}/check`, {
        method: "POST",
      });
      const data = await res.json();

      if (!res.ok) {
        setActionError(data.error || "Account check failed");
      } else {
        // Update account in local state
        setAccounts((prev) =>
          prev.map((acc) => (acc.id === id ? data.account : acc))
        );
      }
    } catch {
      setActionError("Network error while checking account");
    } finally {
      setCheckingId(null);
    }
  };

  // Submit Replace Token
  const handleConfirmReplace = async () => {
    if (!replaceTarget || !replaceToken.trim()) return;
    setReplacing(true);
    setReplaceError(null);

    try {
      const res = await fetch(`/api/accounts/${replaceTarget.id}/replace-token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessToken: replaceToken.trim() }),
      });
      const data = await res.json();

      if (!res.ok) {
        setReplaceError(data.error || "Failed to replace token");
      } else {
        setReplaceTarget(null);
        setReplaceToken("");
        await loadAccounts();
      }
    } catch {
      setReplaceError("Network error while replacing token");
    } finally {
      setReplacing(false);
    }
  };

  // Confirm Delete
  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setActionError(null);

    try {
      const res = await fetch(`/api/accounts/${deleteTarget.id}`, {
        method: "DELETE",
      });

      if (res.ok) {
        setDeleteTarget(null);
        await loadAccounts();
      } else {
        const data = await res.json();
        setActionError(data.error || "Failed to delete account");
      }
    } catch {
      setActionError("Network error while deleting account");
    } finally {
      setDeleting(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "ACTIVE":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
            Active
          </span>
        );
      case "INVALID_TOKEN":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-rose-50 text-rose-700 border border-rose-200">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
            Invalid Token
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
            Error
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Threads Accounts
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Connect tester accounts using encrypted long-lived access tokens
          </p>
        </div>
        <button
          onClick={() => {
            setShowAddModal(true);
            setInputToken("");
            setPreview(null);
            setAddError(null);
          }}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium rounded-lg shadow-sm transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Account
        </button>
      </div>

      {actionError && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-3 text-rose-700 text-sm">
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <div className="flex-1">{actionError}</div>
          <button
            onClick={() => setActionError(null)}
            className="text-rose-500 hover:text-rose-700"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Account List */}
      {loading ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center text-slate-400">
          <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-slate-400" />
          Loading accounts...
        </div>
      ) : accounts.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center shadow-sm">
          <div className="w-12 h-12 bg-slate-100 text-slate-400 rounded-full flex items-center justify-center mx-auto mb-4">
            <Users className="w-6 h-6" />
          </div>
          <h3 className="text-base font-semibold text-slate-900">No Threads accounts connected</h3>
          <p className="text-sm text-slate-500 max-w-sm mx-auto mt-1 mb-6">
            Add a Threads tester account using a long-lived access token generated from Meta Developer Portal.
          </p>
          <button
            onClick={() => {
              setShowAddModal(true);
              setInputToken("");
              setPreview(null);
              setAddError(null);
            }}
            className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add First Account
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {accounts.map((account) => {
            const isChecking = checkingId === account.id;
            return (
              <div
                key={account.id}
                className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm hover:border-slate-300 transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      {account.avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={account.avatarUrl}
                          alt={account.username}
                          className="w-12 h-12 rounded-full object-cover border border-slate-200"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center font-bold text-slate-600">
                          {account.username.slice(0, 2).toUpperCase()}
                        </div>
                      )}
                      <div>
                        <h4 className="font-semibold text-slate-900 leading-tight">
                          {account.displayName}
                        </h4>
                        <div className="text-sm text-slate-500 flex items-center gap-1 mt-0.5">
                          <span>@{account.username}</span>
                          <a
                            href={`https://threads.net/@${account.username}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-slate-400 hover:text-slate-600"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        </div>
                      </div>
                    </div>
                    <div>{getStatusBadge(account.status)}</div>
                  </div>

                  {account.biography && (
                    <p className="text-xs text-slate-600 mt-3 line-clamp-2 bg-slate-50 p-2 rounded-lg border border-slate-100">
                      {account.biography}
                    </p>
                  )}

                  <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400">
                    <span title={account.threadsUserId}>ID: {account.threadsUserId}</span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" />
                      {account.lastCheckedAt
                        ? `Checked ${new Date(account.lastCheckedAt).toLocaleDateString()}`
                        : "Never checked"}
                    </span>
                  </div>
                </div>

                {/* Account Actions */}
                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                  <button
                    onClick={() => handleCheckAccount(account.id)}
                    disabled={isChecking}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 hover:text-slate-900 hover:bg-slate-100 rounded-lg border border-slate-200 transition-colors disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isChecking ? "animate-spin" : ""}`} />
                    Check
                  </button>
                  <button
                    onClick={() => {
                      setReplaceTarget(account);
                      setReplaceToken("");
                      setReplaceError(null);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 hover:text-slate-900 hover:bg-slate-100 rounded-lg border border-slate-200 transition-colors"
                  >
                    <KeyRound className="w-3.5 h-3.5" />
                    Replace Token
                  </button>
                  <button
                    onClick={() => setDeleteTarget(account)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-rose-600 hover:text-rose-700 hover:bg-rose-50 rounded-lg border border-rose-200 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Remove
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add Account Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-slate-200 space-y-5">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-bold text-slate-900">Add Threads Account</h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-500">
              Paste your Meta Graph API long-lived user access token below. The system will verify
              the identity directly with Threads before saving.
            </p>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Long-lived Access Token
              </label>
              <input
                type="password"
                value={inputToken}
                onChange={(e) => setInputToken(e.target.value)}
                placeholder="THQ... or EAAB..."
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 font-mono focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent"
              />
            </div>

            {addError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg flex items-start gap-2.5 text-rose-700 text-xs">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>{addError}</span>
              </div>
            )}

            {/* Profile Preview */}
            {preview && (
              <div className="p-4 bg-emerald-50/50 border border-emerald-200 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-emerald-800 uppercase tracking-wider">
                    Verified Identity
                  </span>
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-100/80 px-2 py-0.5 rounded-md">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Token Valid
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  {preview.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={preview.avatarUrl}
                      alt={preview.username}
                      className="w-12 h-12 rounded-full border border-emerald-200 object-cover"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold">
                      {preview.username.slice(0, 2).toUpperCase()}
                    </div>
                  )}
                  <div>
                    <div className="font-bold text-slate-900">{preview.displayName}</div>
                    <div className="text-xs text-slate-600">@{preview.username}</div>
                    <div className="text-[11px] text-slate-400">ID: {preview.threadsUserId}</div>
                  </div>
                </div>
                {preview.biography && (
                  <p className="text-xs text-slate-600 bg-white/80 p-2 rounded border border-emerald-100">
                    {preview.biography}
                  </p>
                )}
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
              >
                Cancel
              </button>

              {!preview ? (
                <button
                  type="button"
                  onClick={handleVerify}
                  disabled={verifying || !inputToken.trim()}
                  className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  {verifying ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" /> Verifying...
                    </>
                  ) : (
                    "Verify Account"
                  )}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleConfirmAdd}
                  disabled={adding}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2 shadow-sm"
                >
                  {adding ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" /> Adding...
                    </>
                  ) : (
                    <>
                      <Plus className="w-4 h-4" /> Add Account
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Replace Token Modal */}
      {replaceTarget && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200 space-y-5">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-bold text-slate-900">Replace Access Token</h3>
              <button
                onClick={() => setReplaceTarget(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-500">
              Replacing token for <strong>@{replaceTarget.username}</strong>. The new token must
              belong to the exact same Threads account identity (ID: {replaceTarget.threadsUserId}).
            </p>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                New Long-lived Access Token
              </label>
              <input
                type="password"
                value={replaceToken}
                onChange={(e) => setReplaceToken(e.target.value)}
                placeholder="THQ... or EAAB..."
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 font-mono focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent"
              />
            </div>

            {replaceError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg flex items-start gap-2.5 text-rose-700 text-xs">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>{replaceError}</span>
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setReplaceTarget(null)}
                className="px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmReplace}
                disabled={replacing || !replaceToken.trim()}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {replacing ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" /> Replacing...
                  </>
                ) : (
                  "Confirm Replace"
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200 space-y-5">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="w-10 h-10 bg-rose-100 rounded-full flex items-center justify-center">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900">Remove Account</h3>
                <p className="text-xs text-slate-500">Confirm permanent removal</p>
              </div>
            </div>

            <p className="text-sm text-slate-600">
              Are you sure you want to remove <strong>@{deleteTarget.username}</strong> ({deleteTarget.displayName})?
              Its active credentials will be removed and it will be unavailable for new publishing.
              All existing post history published by this account will remain safely preserved in your audit logs.
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={deleting}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {deleting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" /> Removing...
                  </>
                ) : (
                  "Delete Account"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

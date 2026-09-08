import React from "react";

export default function AccountsPagePlaceholder() {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Threads Accounts</h1>
          <p className="text-sm text-slate-500 mt-1">Connect and verify Threads tester accounts</p>
        </div>
      </div>
      <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-slate-500">
        Accounts management loaded.
      </div>
    </div>
  );
}

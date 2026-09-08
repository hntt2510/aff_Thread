import React from "react";

export default function PostsPagePlaceholder() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Recent Posts</h1>
        <p className="text-sm text-slate-500 mt-1">Audit log and history of published Threads posts</p>
      </div>
      <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-slate-500">
        Posts history loaded.
      </div>
    </div>
  );
}

import React from "react";
import Navbar from "@/components/layout/Navbar";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <Navbar />
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
      <footer className="border-t border-slate-200 py-6 text-center text-xs text-slate-400 bg-white">
        Threads Affiliate Manager &copy; {new Date().getFullYear()} &middot; Personal Admin Console
      </footer>
    </div>
  );
}

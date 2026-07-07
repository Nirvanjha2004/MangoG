import { useState, useEffect } from "react";
import {
  Upload,
  Search,
  FileText,
  ShieldCheck,
  ArrowRight,
  CheckCircle2,
  Clock,
  AlertCircle,
} from "lucide-react";
import { cn, formatBytes } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { NavHeader } from "@/components/nav-header";

interface RecentContract {
  id: number;
  documentId: string;
  originalName: string;
  sizeBytes: number;
  status: "pending" | "processed" | "failed";
  uploadedAt: string;
  signature: {
    signatureId: string;
    status: "pending" | "signed" | "expired";
    signedAt: string | null;
  };
}

function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn("animate-shimmer rounded-lg", className)}
    />
  );
}

function StatusBadge({ status }: { status: string }) {
  const colorMap: Record<string, string> = {
    signed: "bg-emerald-50 text-emerald-700 border-emerald-200",
    pending: "bg-amber-50 text-amber-700 border-amber-200",
    expired: "bg-red-50 text-red-700 border-red-200",
  };

  const iconMap: Record<string, React.ReactNode> = {
    signed: <CheckCircle2 className="w-3 h-3" />,
    pending: <Clock className="w-3 h-3" />,
    expired: <AlertCircle className="w-3 h-3" />,
  };

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border",
        colorMap[status] || "bg-gray-50 text-gray-700 border-gray-200"
      )}
    >
      {iconMap[status]}
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

export function LandingPage() {
  const [recentContracts, setRecentContracts] = useState<RecentContract[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function fetchRecent() {
      try {
        const res = await fetch("/api/contracts");
        if (!res.ok) throw new Error("Failed to fetch");
        const data: RecentContract[] = await res.json();
        if (!cancelled) setRecentContracts(data.slice(0, 5));
      } catch {
        // Silently fail
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchRecent();
    return () => { cancelled = true; };
  }, []);

  const hasContracts = recentContracts.length > 0;

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 via-white to-brand-50">
      <NavHeader />

      {/* Hero Section */}
      <section className="relative overflow-hidden">
        {/* Background decoration */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-40 -right-40 w-80 h-80 rounded-full bg-brand-100/40 blur-3xl" />
          <div className="absolute -bottom-40 -left-40 w-80 h-80 rounded-full bg-brand-100/30 blur-3xl" />
        </div>

        <div className="relative max-w-4xl mx-auto px-4 pt-20 pb-16 sm:pt-28 sm:pb-20 text-center">
          <div className="animate-fade-in-up">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-brand-50 border border-brand-200 text-brand-700 text-xs font-medium mb-6">
              <ShieldCheck className="w-3.5 h-3.5" />
              Secure document signing platform
            </div>
          </div>

          <h1 className="animate-fade-in-up stagger-1 text-4xl sm:text-5xl lg:text-6xl font-bold text-gray-900 tracking-tight leading-tight">
            Sign and manage
            <br />
            <span className="bg-gradient-to-r from-brand-600 to-brand-800 bg-clip-text text-transparent">
              contracts with ease
            </span>
          </h1>

          <p className="animate-fade-in-up stagger-2 mt-5 text-lg text-gray-500 max-w-lg mx-auto leading-relaxed">
            Upload your PDF contracts, request electronic signatures, and track
            the signing status — all in one place.
          </p>

          <div className="animate-fade-in-up stagger-3 mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
            <a href="/upload">
              <Button size="lg" className="w-full sm:w-auto">
                <Upload className="w-4 h-4" />
                Upload a contract
                <ArrowRight className="w-4 h-4" />
              </Button>
            </a>
            <a href="/status">
              <Button variant="secondary" size="lg" className="w-full sm:w-auto">
                <Search className="w-4 h-4" />
                Check signature status
              </Button>
            </a>
          </div>

          <div className="animate-fade-in-up stagger-4 mt-6 flex items-center justify-center gap-6 text-xs text-gray-400">
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5" />
              PDF support
            </span>
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5" />
              Real-time status
            </span>
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5" />
              Secure download
            </span>
          </div>
        </div>
      </section>

      {/* Quick Actions */}
      <section className="max-w-4xl mx-auto px-4 pb-12">
        <div className="grid sm:grid-cols-2 gap-4">
          <a href="/upload" className="group block">
            <Card className="p-6 hover:shadow-md hover:border-brand-200 transition-all duration-300 cursor-pointer h-full">
              <CardContent className="p-0 flex items-start gap-4">
                <div className="shrink-0 w-12 h-12 rounded-xl bg-brand-100 text-brand-600 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                  <Upload className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 group-hover:text-brand-600 transition-colors">
                    Upload a contract
                  </h3>
                  <p className="text-sm text-gray-500 mt-1">
                    Upload a PDF and create a signature request
                  </p>
                </div>
                <ArrowRight className="w-5 h-5 text-gray-300 group-hover:text-brand-500 group-hover:translate-x-1 transition-all ml-auto shrink-0" />
              </CardContent>
            </Card>
          </a>

          <a href="/status" className="group block">
            <Card className="p-6 hover:shadow-md hover:border-brand-200 transition-all duration-300 cursor-pointer h-full">
              <CardContent className="p-0 flex items-start gap-4">
                <div className="shrink-0 w-12 h-12 rounded-xl bg-brand-100 text-brand-600 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                  <Search className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 group-hover:text-brand-600 transition-colors">
                    Check signature status
                  </h3>
                  <p className="text-sm text-gray-500 mt-1">
                    Look up any signature by ID or browse recent requests
                  </p>
                </div>
                <ArrowRight className="w-5 h-5 text-gray-300 group-hover:text-brand-500 group-hover:translate-x-1 transition-all ml-auto shrink-0" />
              </CardContent>
            </Card>
          </a>
        </div>
      </section>

      {/* Recent Activity */}
      <section className="max-w-4xl mx-auto px-4 pb-20">
        <div className="animate-fade-in-up">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-gray-400" />
              <h2 className="text-lg font-semibold text-gray-900">
                Recent activity
              </h2>
            </div>
            {hasContracts && (
              <a
                href="/status"
                className="text-sm text-brand-600 hover:text-brand-700 font-medium inline-flex items-center gap-1 transition-colors"
              >
                View all
                <ArrowRight className="w-3.5 h-3.5" />
              </a>
            )}
          </div>

          <Card>
            <CardContent className="p-0">
              {loading ? (
                <div className="divide-y divide-gray-100">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="p-4 flex items-center gap-3">
                      <Skeleton className="w-8 h-8 rounded-lg" />
                      <div className="flex-1 space-y-1.5">
                        <Skeleton className="h-4 w-40" />
                        <Skeleton className="h-3 w-24" />
                      </div>
                      <Skeleton className="h-5 w-16 rounded-full" />
                    </div>
                  ))}
                </div>
              ) : hasContracts ? (
                <div className="divide-y divide-gray-100">
                  {recentContracts.map((contract, i) => (
                    <a
                      key={contract.id}
                      href="/status"
                      className={cn(
                        "flex items-center gap-3 p-4 hover:bg-gray-50/80 transition-colors group",
                        "animate-fade-in",
                      )}
                      style={{ animationDelay: `${i * 0.05}s` }}
                    >
                      <div className="shrink-0 w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center group-hover:bg-brand-100 transition-colors">
                        <FileText className="w-4 h-4 text-gray-400 group-hover:text-brand-600 transition-colors" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {contract.originalName}
                        </p>
                        <p className="text-xs text-gray-400">
                          {formatBytes(contract.sizeBytes)} ·{" "}
                          {new Date(contract.uploadedAt).toLocaleDateString()}
                        </p>
                      </div>
                      <StatusBadge status={contract.signature.status} />
                    </a>
                  ))}
                </div>
              ) : (
                <div className="p-10 text-center">
                  <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-3">
                    <FileText className="w-6 h-6 text-gray-300" />
                  </div>
                  <p className="text-sm text-gray-500 font-medium">No activity yet</p>
                  <p className="text-xs text-gray-400 mt-1">
                    Upload your first contract to get started
                  </p>
                  <a href="/upload" className="inline-block mt-4">
                    <Button variant="primary" size="sm">
                      <Upload className="w-3.5 h-3.5" />
                      Upload a contract
                    </Button>
                  </a>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-200 bg-white/50">
        <div className="max-w-4xl mx-auto px-4 py-6 flex items-center justify-between text-xs text-gray-400">
          <span>SignFlow — Mock demo application</span>
          <div className="flex items-center gap-4">
            <a href="/upload" className="hover:text-gray-600 transition-colors">
              Upload
            </a>
            <a href="/status" className="hover:text-gray-600 transition-colors">
              Status
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}

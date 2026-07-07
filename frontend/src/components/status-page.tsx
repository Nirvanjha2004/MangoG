import { useState, useEffect, useCallback, useRef } from "react";
import {
  Search,
  FileText,
  CheckCircle2,
  AlertCircle,
  Clock,
  ExternalLink,
  ShieldCheck,
  Download,
  Loader2,
  FileWarning,
  History,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { NavHeader } from "@/components/nav-header";

interface ContractSummary {
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

interface SignatureStatus {
  signatureId: string;
  documentId: string;
  originalName: string;
  status: "pending" | "signed" | "expired";
  createdAt: string;
  signedAt: string | null;
  signedDocumentAvailable: boolean;
}

export function StatusPage() {
  const [searchInput, setSearchInput] = useState("");
  const [searching, setSearching] = useState(false);
  const [signatureStatus, setSignatureStatus] = useState<SignatureStatus | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [contracts, setContracts] = useState<ContractSummary[]>([]);
  const [loadingContracts, setLoadingContracts] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [polling, setPolling] = useState(false);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Real-time polling for pending signatures ──
  const startPolling = useCallback((signatureId: string) => {
    if (pollingRef.current) clearInterval(pollingRef.current);
    setPolling(true);

    pollingRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/signature-status/${encodeURIComponent(signatureId)}`);
        if (!res.ok) return;
        const data: SignatureStatus = await res.json();
        setSignatureStatus(data);
        if (data.status !== "pending") {
          if (pollingRef.current) clearInterval(pollingRef.current);
          pollingRef.current = null;
          setPolling(false);
        }
      } catch {
        // Silently fail during polling
      }
    }, 5000);
  }, []);

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    setPolling(false);
  }, []);

  // Fetch previous contracts
  useEffect(() => {
    let cancelled = false;
    async function fetchContracts() {
      try {
        const res = await fetch("/api/contracts");
        if (!res.ok) throw new Error("Failed to fetch contracts");
        const data: ContractSummary[] = await res.json();
        if (!cancelled) setContracts(data);
      } catch {
        // Silently fail — the list is optional
      } finally {
        if (!cancelled) setLoadingContracts(false);
      }
    }
    fetchContracts();
    return () => { cancelled = true; };
  }, []);

  const searchBySignatureId = useCallback(async (signatureId: string) => {
    const trimmed = signatureId.trim();
    if (!trimmed) return;

    stopPolling();
    setSearching(true);
    setSearchError(null);
    setSignatureStatus(null);

    try {
      const res = await fetch(`/api/signatures/${encodeURIComponent(trimmed)}/status`);
      if (!res.ok) {
        if (res.status === 404) {
          setSearchError("Signature not found. Please check the ID and try again.");
        } else {
          throw new Error("Failed to fetch signature status");
        }
        return;
      }
      const data: SignatureStatus = await res.json();
      setSignatureStatus(data);

      // Start polling if the signature is still pending
      if (data.status === "pending") {
        startPolling(trimmed);
      }
    } catch (err) {
      setSearchError(
        err instanceof Error ? err.message : "An unexpected error occurred"
      );
    } finally {
      setSearching(false);
    }
  }, [startPolling, stopPolling]);

  const handleSearch = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      searchBySignatureId(searchInput);
    },
    [searchInput, searchBySignatureId]
  );

  const handleSelectContract = useCallback(
    (contract: ContractSummary) => {
      setSearchInput(contract.signature.signatureId);
      searchBySignatureId(contract.signature.signatureId);
    },
    [searchBySignatureId]
  );

  const handleDownload = useCallback(async () => {
    if (!signatureStatus?.signatureId) return;
    setDownloading(true);
    try {
      const res = await fetch(
        `/api/download/${encodeURIComponent(signatureStatus.signatureId)}`
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to download document");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `signed_${signatureStatus.originalName}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setDownloadError(
        err instanceof Error ? err.message : "Failed to download document"
      );
    } finally {
      setDownloading(false);
    }
  }, [signatureStatus]);
  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, []);

  const clearResults = useCallback(() => {
    stopPolling();
    setSignatureStatus(null);
    setSearchError(null);
    setSearchInput("");
  }, [stopPolling]);

  const statusColor = (status: string) => {
    switch (status) {
      case "signed":
        return "text-emerald-600";
      case "pending":
        return "text-amber-600";
      case "expired":
        return "text-red-600";
      default:
        return "text-gray-500";
    }
  };

  const statusBg = (status: string) => {
    switch (status) {
      case "signed":
        return "bg-emerald-50";
      case "pending":
        return "bg-amber-50";
      case "expired":
        return "bg-red-50";
      default:
        return "bg-gray-50";
    }
  };

  const statusIcon = (status: string) => {
    switch (status) {
      case "signed":
        return <CheckCircle2 className="w-4 h-4" />;
      case "pending":
        return <Clock className="w-4 h-4" />;
      case "expired":
        return <AlertCircle className="w-4 h-4" />;
      default:
        return <FileText className="w-4 h-4" />;
    }
  };

  const statusLabel = (status: string) => {
    switch (status) {
      case "signed":
        return "Signed";
      case "pending":
        return "Pending signature";
      case "expired":
        return "Expired";
      default:
        return status;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 via-white to-brand-50">
      <NavHeader />

      <div className="max-w-2xl mx-auto px-4 pt-12 pb-16 space-y-8 animate-fade-in-up">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-brand-100 text-brand-600 mb-3 shadow-sm">
            <Search className="w-7 h-7" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">
            Signature Status
          </h1>
          <p className="text-gray-500 text-base max-w-sm mx-auto">
            Check the status of a signature request or select a previous request
          </p>
        </div>

        {/* Search by Signature ID */}
        <Card>
          <CardContent className="p-6 space-y-4">
            <div className="flex items-center gap-2">
              <Search className="w-5 h-5 text-gray-400" />
              <h3 className="font-semibold text-gray-900">
                Search by Signature ID
              </h3>
            </div>
            <form onSubmit={handleSearch} className="flex gap-3">
              <div className="relative flex-1">
                <input
                  type="text"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="Enter a Signature ID (e.g. sig_...)"
                  className="w-full h-10 px-4 pr-10 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 bg-white placeholder-gray-400 font-mono"
                />
                {searchInput && (
                  <button
                    type="button"
                    onClick={clearResults}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    <span className="text-xs">&times;</span>
                  </button>
                )}
              </div>
              <Button
                type="submit"
                variant="primary"
                disabled={!searchInput.trim() || searching}
                loading={searching}
              >
                {searching ? "Searching..." : "Search"}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Search results */}
        {searching && (
          <div className="text-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-brand-600 mx-auto mb-3" />
            <p className="text-sm text-gray-500">Looking up signature status...</p>
          </div>
        )}

        {searchError && (
          <Card variant="subtle">
            <CardContent className="p-6 flex items-start gap-4">
              <div className="shrink-0 w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                <AlertCircle className="w-5 h-5 text-red-600" />
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="text-sm font-semibold text-gray-900">Not found</h4>
                <p className="text-sm text-gray-500 mt-0.5">{searchError}</p>
              </div>
              <button
                onClick={() => setSearchError(null)}
                className="shrink-0 text-gray-400 hover:text-gray-600"
              >
                <span>&times;</span>
              </button>
            </CardContent>
          </Card>
        )}

        {signatureStatus && !searching && (
          <Card className="overflow-hidden animate-scale-in">
            <CardHeader>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={cn(
                      "w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
                      statusBg(signatureStatus.status)
                    )}
                  >
                    <FileText
                      className={cn("w-5 h-5", statusColor(signatureStatus.status))}
                    />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-semibold text-gray-900 truncate">
                      {signatureStatus.originalName}
                    </h3>
                    <p className="text-xs text-gray-500 font-mono truncate">
                      {signatureStatus.signatureId}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {polling && (
                    <span className="inline-flex items-center gap-1 text-xs text-brand-600 animate-pulse-subtle">
                      <RefreshCw className="w-3 h-3 animate-spin" />
                      Live
                    </span>
                  )}
                  <span
                    className={cn(
                      "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium",
                      statusBg(signatureStatus.status),
                      statusColor(signatureStatus.status)
                    )}
                  >
                    {statusIcon(signatureStatus.status)}
                    {statusLabel(signatureStatus.status)}
                  </span>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Status details */}
              <div className="bg-gray-50 rounded-lg divide-y divide-gray-100 text-sm">
                <div className="flex items-center justify-between px-4 py-2.5">
                  <span className="text-gray-500">Document ID</span>
                  <span className="font-mono text-xs text-gray-800 truncate ml-4 max-w-[240px]">
                    {signatureStatus.documentId}
                  </span>
                </div>
                <div className="flex items-center justify-between px-4 py-2.5">
                  <span className="text-gray-500">Signature ID</span>
                  <span className="font-mono text-xs text-gray-800 truncate ml-4 max-w-[240px]">
                    {signatureStatus.signatureId}
                  </span>
                </div>
                <div className="flex items-center justify-between px-4 py-2.5">
                  <span className="text-gray-500">Created</span>
                  <span className="text-xs text-gray-700">
                    {new Date(signatureStatus.createdAt).toLocaleString()}
                  </span>
                </div>
                {signatureStatus.signedAt && (
                  <div className="flex items-center justify-between px-4 py-2.5">
                    <span className="text-gray-500">Signed at</span>
                    <span className="text-xs text-gray-700">
                      {new Date(signatureStatus.signedAt).toLocaleString()}
                    </span>
                  </div>
                )}
              </div>

              {downloadError && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 flex items-start gap-3">
                  <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                  <p className="text-sm text-red-700 flex-1">{downloadError}</p>
                  <button
                    onClick={() => setDownloadError(null)}
                    className="shrink-0 text-red-400 hover:text-red-600"
                  >
                    <span>&times;</span>
                  </button>
                </div>
              )}

              {/* Download section */}
              {signatureStatus.status === "signed" && (
                <div className="rounded-lg border-2 border-emerald-200 bg-emerald-50 p-4 space-y-3 animate-fade-in">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center">
                      <ShieldCheck className="w-4 h-4 text-emerald-600" />
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold text-gray-900">
                        Signed document ready
                      </h4>
                      <p className="text-xs text-gray-500">
                        The document has been signed and is available for download
                      </p>
                    </div>
                  </div>
                  <Button
                    onClick={handleDownload}
                    variant="primary"
                    className="w-full"
                    loading={downloading}
                    disabled={downloading}
                  >
                    <Download className="w-4 h-4" />
                    {downloading ? "Downloading..." : "Download signed document"}
                  </Button>
                </div>
              )}

              {signatureStatus.status === "pending" && (
                <div className="rounded-lg bg-amber-50 border border-amber-200 p-4 text-center animate-fade-in">
                  <Clock className="w-5 h-5 text-amber-500 mx-auto mb-2 animate-pulse-subtle" />
                  <p className="text-sm text-gray-700 font-medium">
                    Waiting for signature
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    {polling
                      ? "Polling for status updates every 5 seconds..."
                      : "The document has not been signed yet. Check back later."}
                  </p>
                </div>
              )}

              {signatureStatus.status === "expired" && (
                <div className="rounded-lg bg-red-50 border border-red-200 p-4 text-center">
                  <FileWarning className="w-5 h-5 text-red-500 mx-auto mb-2" />
                  <p className="text-sm text-gray-700 font-medium">
                    Signature request expired
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    This signature request is no longer valid. Please upload the
                    document again to create a new request.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Previous contracts */}
        <Card className={cn(signatureStatus ? "opacity-70" : "")}>
          <CardContent className="p-6 space-y-4">
            <div className="flex items-center gap-2">
              <History className="w-5 h-5 text-gray-400" />
              <h3 className="font-semibold text-gray-900">
                Previous requests
              </h3>
              {loadingContracts && (
                <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
              )}
              {!loadingContracts && (
                <span className="text-xs text-gray-400">
                  {contracts.length} {contracts.length === 1 ? "request" : "requests"}
                </span>
              )}
            </div>

            {!loadingContracts && contracts.length === 0 && (
              <div className="text-center py-6">
                <FileText className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-gray-400">No previous requests</p>
                <p className="text-xs text-gray-300 mt-1">
                  Upload a contract to get started
                </p>
              </div>
            )}

            {contracts.length > 0 && (
              <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
                {contracts.map((contract) => (
                  <button
                    key={contract.id}
                    onClick={() => handleSelectContract(contract)}
                    className={cn(
                      "w-full text-left p-3 rounded-lg border transition-all duration-200",
                      "hover:border-brand-300 hover:bg-brand-50/50",
                      "focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-1",
                      searchInput === contract.signature.signatureId
                        ? "border-brand-300 bg-brand-50"
                        : "border-gray-200 bg-white"
                    )}
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={cn(
                            "shrink-0 w-8 h-8 rounded-lg flex items-center justify-center",
                            statusBg(contract.signature.status)
                          )}
                        >
                          <FileText
                            className={cn(
                              "w-4 h-4",
                              statusColor(contract.signature.status)
                            )}
                          />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">
                            {contract.originalName}
                          </p>
                          <p className="text-xs text-gray-400 font-mono truncate">
                            {contract.signature.signatureId}
                          </p>
                        </div>
                      </div>
                      <div className="shrink-0 flex items-center gap-2">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 text-xs font-medium",
                            statusColor(contract.signature.status)
                          )}
                        >
                          {statusIcon(contract.signature.status)}
                          {statusLabel(contract.signature.status)}
                        </span>
                        <ExternalLink className="w-3.5 h-3.5 text-gray-300" />
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Footer */}
        <div className="text-center pb-6">
          <p className="text-xs text-gray-400">
            Signature status is fetched in real-time. Signed documents are
            available for download through our secure backend.
          </p>
        </div>
      </div>
    </div>
  );
}

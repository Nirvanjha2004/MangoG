import { useState, useCallback, useEffect } from "react";
import { useRoute } from "wouter";
import {
  FileText,
  PenLine,
  CheckCircle2,
  ExternalLink,
  Loader2,
  ShieldCheck,
  Clock,
  AlertCircle,
  Download,
  ArrowLeft,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { NavHeader } from "@/components/nav-header";

interface SignatureData {
  signatureId: string;
  signatureUrl: string;
  status: "pending" | "signed" | "expired";
  createdAt: string;
  signedAt: string | null;
}

export function SignDocument() {
  const [, params] = useRoute("/sign/:documentId");
  const documentId = params?.documentId;

  const [signature, setSignature] = useState<SignatureData | null>(null);
  const [loading, setLoading] = useState(true);
  const [signing, setSigning] = useState(false);
  const [signed, setSigned] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  const fetchSignatureStatus = useCallback(async () => {
    if (!documentId) {
      setError("No document ID provided");
      setLoading(false);
      return;
    }

    try {
      const res = await fetch(`/api/documents/${documentId}/signature`);
      if (!res.ok) {
        if (res.status === 404) {
          setError("Document not found. The signing link may be invalid.");
        } else {
          throw new Error("Failed to fetch signature status");
        }
        setLoading(false);
        return;
      }

      const data: SignatureData = await res.json();
      setSignature(data);

      if (data.status === "signed") {
        setSigned(true);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load signing request"
      );
    } finally {
      setLoading(false);
    }
  }, [documentId]);

  useEffect(() => {
    fetchSignatureStatus();
  }, [fetchSignatureStatus]);

  const handleSign = useCallback(async () => {
    if (!documentId) return;
    setSigning(true);
    setError(null);

    try {
      const res = await fetch(`/api/documents/${documentId}/sign`, {
        method: "POST",
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to sign document");
      }

      const updatedSignature: SignatureData = await res.json();
      setSignature(updatedSignature);
      setSigned(true);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to sign document. Please try again."
      );
    } finally {
      setSigning(false);
    }
  }, [documentId]);

  const handleDownload = useCallback(async () => {
    if (!signature?.signatureId) return;
    setDownloading(true);
    try {
      const res = await fetch(
        `/api/download/${encodeURIComponent(signature.signatureId)}`
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to download document");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "signed_document.pdf";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Download failed:", err);
    } finally {
      setDownloading(false);
    }
  }, [signature]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-brand-50 flex items-center justify-center">
        <div className="text-center space-y-4">
          <Loader2 className="w-8 h-8 animate-spin text-brand-600 mx-auto" />
          <p className="text-gray-500 text-sm">Loading signing request...</p>
        </div>
      </div>
    );
  }

  if (!documentId || error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-brand-50 flex items-center justify-center p-6">
        <Card className="max-w-md w-full">
          <CardContent className="p-8 text-center space-y-4">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-red-100">
              <AlertCircle className="w-7 h-7 text-red-600" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900">
              Invalid signing request
            </h2>
            <p className="text-sm text-gray-500">
              {error || "The signing link is invalid or has expired."}
            </p>
            <a
              href="/"
              className="inline-flex items-center gap-1 text-sm text-brand-600 hover:text-brand-700 font-medium"
            >
              <ArrowLeft className="w-3 h-3" />
              Back to upload
            </a>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (signed) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-emerald-50 flex items-center justify-center p-6">
        <Card className="max-w-md w-full animate-scale-in">
          <CardContent className="p-8 text-center space-y-5">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-emerald-100">
              <CheckCircle2 className="w-10 h-10 text-emerald-600" />
            </div>
            <div className="space-y-1">
              <h2 className="text-2xl font-bold text-gray-900">
                Document signed!
              </h2>
              <p className="text-gray-500">
                You have successfully signed this document.
              </p>
            </div>
            <div className="bg-gray-50 rounded-lg p-4 text-left space-y-2 text-sm">
              <div className="flex justify-between text-gray-600">
                <span>Document ID</span>
                <span className="font-mono text-gray-900 text-xs">
                  {documentId}
                </span>
              </div>
              <div className="flex justify-between text-gray-600">
                <span>Signed at</span>
                <span className="text-gray-900">
                  {signature?.signedAt
                    ? new Date(signature.signedAt).toLocaleString()
                    : new Date().toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between text-gray-600">
                <span>Status</span>
                <span className="inline-flex items-center gap-1 text-emerald-600 font-medium">
                  <ShieldCheck className="w-3.5 h-3.5" /> Signed
                </span>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <a href="/" className="flex-1">
                <Button variant="secondary" className="w-full">
                  Back to home
                </Button>
              </a>
              <Button
                variant="primary"
                className="flex-1"
                onClick={handleDownload}
                loading={downloading}
                disabled={downloading}
              >
                <Download className="w-4 h-4" />
                {downloading ? "Downloading..." : "Download signed copy"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 via-white to-brand-50">
      <NavHeader />

      {/* Signing area */}
      <div className="max-w-2xl mx-auto px-4 py-12 space-y-6 animate-fade-in-up">
        {/* Document preview card */}
        <Card>
          <CardContent className="p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-brand-100 flex items-center justify-center">
                  <FileText className="w-6 h-6 text-brand-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">
                    Document ready for signature
                  </h3>
                  <p className="text-sm text-gray-500">
                    Please review and sign this document
                  </p>
                </div>
              </div>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 text-xs font-medium">
                <Clock className="w-3 h-3" />
                Awaiting signature
              </div>
            </div>

            {/* Document preview placeholder */}
            <div className="border-2 border-dashed border-gray-200 rounded-lg p-8 text-center space-y-3">
              <div className="w-16 h-20 mx-auto bg-gray-100 rounded flex items-center justify-center">
                <FileText className="w-8 h-8 text-gray-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-700">
                  Contract Document
                </p>
                <p className="text-xs text-gray-400">
                  {documentId}
                </p>
              </div>
              <p className="text-xs text-gray-400 max-w-xs mx-auto">
                This is a placeholder for the actual PDF preview. In production,
                the document would be rendered here for review.
              </p>
            </div>

            {/* Document details */}
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-gray-400 text-xs">Document ID</p>
                <p className="font-mono text-gray-800 text-xs mt-0.5 truncate">
                  {documentId}
                </p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-gray-400 text-xs">Signature ID</p>
                <p className="font-mono text-gray-800 text-xs mt-0.5 truncate">
                  {signature?.signatureId}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Signature field */}
        <Card className="border-2 border-brand-300 overflow-visible">
          <CardContent className="p-6 space-y-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-brand-100 flex items-center justify-center">
                <PenLine className="w-4 h-4 text-brand-600" />
              </div>
              <div>
                <h4 className="font-medium text-gray-900">
                  Your signature is required
                </h4>
                <p className="text-xs text-gray-500">
                  Click the button below to sign this document
                </p>
              </div>
            </div>

            {/* Signature pad placeholder */}
            <div className="border border-gray-200 rounded-lg bg-white p-6 flex items-center justify-center min-h-[80px]">
              {signing ? (
                <div className="flex items-center gap-2 text-brand-600">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span className="text-sm font-medium">
                    Processing your signature...
                  </span>
                </div>
              ) : (
                <div className="text-center">
                  <PenLine className="w-6 h-6 text-gray-300 mx-auto mb-1" />
                  <p className="text-sm text-gray-400">Signature area</p>
                  <p className="text-xs text-gray-300">
                    (Mock — click "Sign Document" to proceed)
                  </p>
                </div>
              )}
            </div>

            <div className="flex items-center gap-3">
              <Button
                onClick={handleSign}
                disabled={signing}
                loading={signing}
                size="lg"
                className="flex-1"
              >
                <PenLine className="w-4 h-4" />
                Sign Document
              </Button>
            </div>

            <p className="text-xs text-gray-400 text-center">
              By clicking "Sign Document", you agree to use an electronic
              signature. This is a mock demo.
            </p>
          </CardContent>
        </Card>

        {/* Footer */}
        <div className="text-center">
          <p className="text-xs text-gray-400">
            <ExternalLink className="w-3 h-3 inline mr-1" />
            This is a simulated signing page for demo purposes
          </p>
        </div>
      </div>
    </div>
  );
}

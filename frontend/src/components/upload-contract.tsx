import { useState, useRef, useCallback, useEffect, type DragEvent, type ChangeEvent } from "react";
import { Upload, FileText, CheckCircle2, AlertCircle, X, FileWarning, ExternalLink, ShieldCheck, Clock, PenLine, Search } from "lucide-react";
import { cn, formatBytes } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { NavHeader } from "@/components/nav-header";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const ACCEPTED_TYPES = ["application/pdf"];
const ACCEPTED_EXTENSIONS = [".pdf"];

type UploadState = "idle" | "dragging" | "uploading" | "success" | "error";
type ErrorType = "invalid-type" | "too-large" | "upload-failed" | null;

interface FileInfo {
  name: string;
  size: number;
}

interface UploadResult {
  documentId: string;
  signatureId: string;
  signatureUrl: string;
  status: string;
  originalName: string;
  sizeBytes: number;
}

export function UploadContract() {
  const [uploadState, setUploadState] = useState<UploadState>("idle");
  const [progress, setProgress] = useState(0);
  const [errorType, setErrorType] = useState<ErrorType>(null);
  const [fileInfo, setFileInfo] = useState<FileInfo | null>(null);
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
  const [signingMode, setSigningMode] = useState<"tab" | "iframe">("tab");
  const [iframeVisible, setIframeVisible] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortRef.current) {
        abortRef.current.abort();
      }
    };
  }, []);

  const validateFile = useCallback((file: File): ErrorType => {
    const extension = "." + file.name.split(".").pop()?.toLowerCase();
    if (!ACCEPTED_TYPES.includes(file.type) && !ACCEPTED_EXTENSIONS.includes(extension)) {
      return "invalid-type";
    }
    if (file.size > MAX_FILE_SIZE) {
      return "too-large";
    }
    return null;
  }, []);

  const uploadFile = useCallback(async (file: File) => {
    const formData = new FormData();
    formData.append("file", file);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      let progressValue = 0;
      const progressInterval = setInterval(() => {
        progressValue = Math.min(progressValue + Math.random() * 15, 90);
        setProgress(progressValue);
      }, 200);

      const response = await fetch("/api/contracts/upload", {
        method: "POST",
        body: formData,
        signal: controller.signal,
      });

      clearInterval(progressInterval);

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || `Upload failed (${response.status})`);
      }

      const result: UploadResult = await response.json();
      setUploadResult(result);
      setProgress(100);
      setFileInfo({ name: result.originalName, size: result.sizeBytes });

      await new Promise((r) => setTimeout(r, 400));
      setUploadState("success");
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") {
        return;
      }
      setErrorType("upload-failed");
      setUploadState("error");
    } finally {
      abortRef.current = null;
    }
  }, []);

  const handleFile = useCallback((file: File) => {
    const validationError = validateFile(file);
    if (validationError) {
      setErrorType(validationError);
      setUploadState("error");
      return;
    }

    setFileInfo({ name: file.name, size: file.size });
    setUploadState("uploading");
    setProgress(0);

    uploadFile(file);
  }, [validateFile, uploadFile]);

  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setUploadState("dragging");
  }, []);

  const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setUploadState("idle");
  }, []);

  const handleDrop = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setUploadState("idle");

    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleFile(file);
    }
  }, [handleFile]);

  const handleInputChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFile(file);
    }
    e.target.value = "";
  }, [handleFile]);

  const handleClickInput = useCallback(() => {
    inputRef.current?.click();
  }, []);

  const reset = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setUploadState("idle");
    setProgress(0);
    setErrorType(null);
    setFileInfo(null);
    setUploadResult(null);
    setIframeVisible(false);
  }, []);

  const openSigningTab = useCallback(() => {
    if (uploadResult?.signatureUrl) {
      window.open(uploadResult.signatureUrl, "_blank", "noopener,noreferrer");
    }
  }, [uploadResult]);

  const toggleIframe = useCallback(() => {
    setIframeVisible((v) => !v);
  }, []);

  const getErrorTitle = () => {
    switch (errorType) {
      case "invalid-type":
        return "Invalid file type";
      case "too-large":
        return "File too large";
      default:
        return "Upload failed";
    }
  };

  const getErrorDescription = () => {
    switch (errorType) {
      case "invalid-type":
        return "Please upload a PDF document. Other file formats are not supported.";
      case "too-large":
        return `File exceeds the maximum size of ${formatBytes(MAX_FILE_SIZE)}. Please compress your file and try again.`;
      default:
        return "There was an error uploading your file. The server may be unavailable. Please try again.";
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 via-white to-brand-50">
      <NavHeader />

      <div className="max-w-lg mx-auto px-4 pt-12 pb-16 space-y-8 animate-fade-in-up">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-brand-100 text-brand-600 mb-3 shadow-sm">
            <FileText className="w-7 h-7" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">
            Upload Contract
          </h1>
          <p className="text-gray-500 text-base max-w-sm mx-auto">
            Upload your PDF contract to add it to the vault
          </p>
        </div>

        {/* Upload Card */}
        <Card className="overflow-hidden">
          <CardContent className="p-0">
            {/* Success State */}
            {uploadState === "success" && (
              <div className="p-8 space-y-6">
                {/* Checkmark header */}
                <div className="text-center space-y-2">
                  <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-emerald-100">
                    <CheckCircle2 className="w-7 h-7 text-emerald-600" />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900">
                    Upload complete!
                  </h3>
                  <p className="text-sm text-gray-500">
                    Your contract has been uploaded and a signature request has been created.
                  </p>
                </div>

                {/* File badge */}
                {fileInfo && (
                  <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-gray-50 rounded-lg text-sm text-gray-600 mx-auto w-fit">
                    <FileText className="w-4 h-4 text-gray-400" />
                    <span className="truncate max-w-[180px]">{fileInfo.name}</span>
                    <span className="text-gray-400">·</span>
                    <span>{formatBytes(fileInfo.size)}</span>
                  </div>
                )}

                {/* Signature metadata */}
                {uploadResult && (
                  <div className="space-y-3">
                    <h4 className="text-sm font-medium text-gray-700 flex items-center gap-1.5">
                      <ShieldCheck className="w-4 h-4 text-brand-500" />
                      Signature details
                    </h4>
                    <div className="bg-gray-50 rounded-lg divide-y divide-gray-100 text-sm">
                      <div className="flex items-center justify-between px-4 py-2.5">
                        <span className="text-gray-500">Document ID</span>
                        <span className="font-mono text-xs text-gray-800 truncate ml-4">
                          {uploadResult.documentId}
                        </span>
                      </div>
                      <div className="flex items-center justify-between px-4 py-2.5">
                        <span className="text-gray-500">Signature ID</span>
                        <span className="font-mono text-xs text-gray-800 truncate ml-4">
                          {uploadResult.signatureId}
                        </span>
                      </div>
                      <div className="flex items-center justify-between px-4 py-2.5">
                        <span className="text-gray-500">Status</span>
                        <span className="inline-flex items-center gap-1 text-amber-600 font-medium">
                          <Clock className="w-3.5 h-3.5" />
                          Pending signature
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Signing options */}
                <div className="space-y-3">
                  <h4 className="text-sm font-medium text-gray-700 flex items-center gap-1.5">
                    <PenLine className="w-4 h-4 text-brand-500" />
                    Signing options
                  </h4>

                  {/* Toggle: tab vs iframe */}
                  <div className="flex gap-2 bg-gray-100 rounded-lg p-1">
                    <button
                      onClick={() => setSigningMode("tab")}
                      className={cn(
                        "flex-1 px-3 py-2 text-sm font-medium rounded-md transition-all",
                        signingMode === "tab"
                          ? "bg-white text-gray-900 shadow-sm"
                          : "text-gray-500 hover:text-gray-700"
                      )}
                    >
                      <ExternalLink className="w-4 h-4 inline mr-1.5" />
                      New tab
                    </button>
                    <button
                      onClick={() => setSigningMode("iframe")}
                      className={cn(
                        "flex-1 px-3 py-2 text-sm font-medium rounded-md transition-all",
                        signingMode === "iframe"
                          ? "bg-white text-gray-900 shadow-sm"
                          : "text-gray-500 hover:text-gray-700"
                      )}
                    >
                      <FileText className="w-4 h-4 inline mr-1.5" />
                      Embedded
                    </button>
                  </div>

                  {signingMode === "tab" ? (
                    <Button
                      onClick={openSigningTab}
                      variant="primary"
                      className="w-full"
                    >
                      <ExternalLink className="w-4 h-4" />
                      Open signing page
                    </Button>
                  ) : (
                    <div className="space-y-2">
                      <Button
                        onClick={toggleIframe}
                        variant={iframeVisible ? "secondary" : "primary"}
                        className="w-full"
                      >
                        {iframeVisible ? "Hide signing page" : "Show signing page"}
                      </Button>
                      {iframeVisible && uploadResult && (
                        <div className="border border-gray-200 rounded-lg overflow-hidden">
                          <iframe
                            src={uploadResult.signatureUrl}
                            className="w-full h-[400px] bg-white"
                            title="Sign Document"
                            sandbox="allow-scripts allow-same-origin"
                          />
                          <div className="bg-gray-50 px-4 py-2 border-t border-gray-200 flex items-center justify-between">
                            <span className="text-xs text-gray-400">
                              Embedded signing view
                            </span>
                            <a
                              href={uploadResult.signatureUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-brand-600 hover:text-brand-700 font-medium inline-flex items-center gap-1"
                            >
                              Open in new tab
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Success navigation */}
                <div className="flex flex-col sm:flex-row gap-2">
                  <Button onClick={reset} variant="secondary" className="flex-1 text-sm">
                    <Upload className="w-4 h-4" />
                    Upload another file
                  </Button>
                  <a href="/status" className="flex-1">
                    <Button variant="primary" className="w-full text-sm">
                      <Search className="w-4 h-4" />
                      Check status
                    </Button>
                  </a>
                </div>
              </div>
            )}

            {/* Error State */}
            {uploadState === "error" && (
              <div className="p-10 text-center space-y-5">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-100">
                  {errorType === "too-large" ? (
                    <FileWarning className="w-8 h-8 text-red-600" />
                  ) : (
                    <AlertCircle className="w-8 h-8 text-red-600" />
                  )}
                </div>
                <div className="space-y-1">
                  <h3 className="text-lg font-semibold text-gray-900">{getErrorTitle()}</h3>
                  <p className="text-sm text-gray-500 max-w-xs mx-auto">
                    {getErrorDescription()}
                  </p>
                </div>
                <div className="flex items-center justify-center gap-3">
                  <Button onClick={reset} variant="secondary">
                    Try again
                  </Button>
                  <Button
                    onClick={() => {
                      reset();
                      setTimeout(handleClickInput, 50);
                    }}
                    variant="primary"
                  >
                    Choose another file
                  </Button>
                </div>
              </div>
            )}

            {/* Uploading State */}
            {uploadState === "uploading" && (
              <div className="p-10 space-y-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="shrink-0 w-10 h-10 rounded-lg bg-brand-100 flex items-center justify-center">
                      <FileText className="w-5 h-5 text-brand-600" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {fileInfo?.name}
                      </p>
                      <p className="text-xs text-gray-500">
                        {fileInfo ? formatBytes(fileInfo.size) : ""}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={reset}
                    className="shrink-0 p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                    title="Cancel upload"
                    aria-label="Cancel upload"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <Progress value={progress} variant="default" size="md" showLabel />
                <p className="text-xs text-gray-400 text-center">
                  Please don't close this page while uploading
                </p>
              </div>
            )}

            {/* Idle / Drag State */}
            {(uploadState === "idle" || uploadState === "dragging") && (
              <div
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    handleClickInput();
                  }
                }}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={handleClickInput}
                className={cn(
                  "p-10 text-center cursor-pointer transition-all duration-200 select-none",
                  "border-2 border-dashed rounded-none",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2",
                  uploadState === "dragging"
                    ? "border-brand-400 bg-brand-50 scale-[1.02]"
                    : "border-gray-200 hover:border-brand-300 hover:bg-gray-50/50",
                )}
              >
                <input
                  ref={inputRef}
                  type="file"
                  name="file"
                  accept=".pdf,application/pdf"
                  onChange={handleInputChange}
                  className="hidden"
                />
                <div className="space-y-4">
                  <div
                    className={cn(
                      "inline-flex items-center justify-center w-14 h-14 rounded-2xl transition-colors duration-200",
                      uploadState === "dragging"
                        ? "bg-brand-200 text-brand-700"
                        : "bg-gray-100 text-gray-400",
                    )}
                  >
                    <Upload className="w-7 h-7" />
                  </div>
                  <div className="space-y-1">
                    {uploadState === "dragging" ? (
                      <p className="text-lg font-medium text-brand-700">
                        Drop your file here
                      </p>
                    ) : (
                      <>
                        <p className="text-base text-gray-700">
                          <span className="font-semibold text-brand-600">Click to upload</span>{" "}
                          or drag and drop
                        </p>
                        <p className="text-sm text-gray-400">
                          PDF only · Max {formatBytes(MAX_FILE_SIZE)}
                        </p>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Guidelines */}
        {uploadState === "idle" && (
          <div className="text-center">
            <p className="text-xs text-gray-400">
              By uploading, you agree to our{" "}
              <span className="underline underline-offset-2 cursor-default">Terms of Service</span>{" "}
              and{" "}
              <span className="underline underline-offset-2 cursor-default">Privacy Policy</span>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

import { useState, useRef, useCallback, useEffect, type DragEvent, type ChangeEvent } from "react";
import { Upload, FileText, CheckCircle2, AlertCircle, X, FileWarning } from "lucide-react";
import { cn, formatBytes } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const ACCEPTED_TYPES = ["application/pdf"];
const ACCEPTED_EXTENSIONS = [".pdf"];

type UploadState = "idle" | "dragging" | "uploading" | "success" | "error";
type ErrorType = "invalid-type" | "too-large" | null;

interface FileInfo {
  name: string;
  size: number;
}

export function UploadContract() {
  const [uploadState, setUploadState] = useState<UploadState>("idle");
  const [progress, setProgress] = useState(0);
  const [errorType, setErrorType] = useState<ErrorType>(null);
  const [fileInfo, setFileInfo] = useState<FileInfo | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Cleanup interval on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
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

  const simulateUpload = useCallback(() => {
    setProgress(0);
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
    }
    intervalRef.current = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          if (intervalRef.current !== null) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
          setUploadState("success");
          return 100;
        }
        const increment = prev < 50 ? 8 : prev < 80 ? 5 : 2;
        return Math.min(prev + increment, 100);
      });
    }, 200);
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
    simulateUpload();
  }, [validateFile, simulateUpload]);

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
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setUploadState("idle");
    setProgress(0);
    setErrorType(null);
    setFileInfo(null);
  }, []);

  const getErrorTitle = () => {
    switch (errorType) {
      case "invalid-type":
        return "Invalid file type";
      case "too-large":
        return "File too large";
      default:
        return "Something went wrong";
    }
  };

  const getErrorDescription = () => {
    switch (errorType) {
      case "invalid-type":
        return "Please upload a PDF document. Other file formats are not supported.";
      case "too-large":
        return `File exceeds the maximum size of ${formatBytes(MAX_FILE_SIZE)}. Please compress your file and try again.`;
      default:
        return "An unexpected error occurred. Please try again.";
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-brand-50 flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-lg mx-auto space-y-8">
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
              <div className="p-10 text-center space-y-5">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald-100">
                  <CheckCircle2 className="w-8 h-8 text-emerald-600" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-lg font-semibold text-gray-900">Upload complete!</h3>
                  <p className="text-sm text-gray-500">
                    {fileInfo?.name} has been uploaded successfully.
                  </p>
                </div>
                {fileInfo && (
                  <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-gray-50 rounded-lg text-sm text-gray-600">
                    <FileText className="w-4 h-4 text-gray-400" />
                    <span className="truncate max-w-[200px]">{fileInfo.name}</span>
                    <span className="text-gray-400">·</span>
                    <span>{fileInfo ? formatBytes(fileInfo.size) : ""}</span>
                  </div>
                )}
                <Button onClick={reset} variant="secondary" className="mt-2">
                  Upload another file
                </Button>
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
                      // Small delay to ensure state resets before file picker opens
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
                <Progress
                  value={progress}
                  variant="default"
                  size="md"
                  showLabel
                />
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

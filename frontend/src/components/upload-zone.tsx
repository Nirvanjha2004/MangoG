import * as React from "react"
import { useQueryClient } from "@tanstack/react-query"
import { UploadCloud, FileText, CheckCircle2, AlertCircle, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { getListContractsQueryKey } from "@workspace/api-client-react"
import { cn, formatBytes } from "@/lib/utils"

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = ["application/pdf"];

type UploadState = "idle" | "selected" | "uploading" | "success" | "error";

export function UploadZone() {
  const queryClient = useQueryClient();
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  
  const [file, setFile] = React.useState<File | null>(null);
  const [uploadState, setUploadState] = React.useState<UploadState>("idle");
  const [progress, setProgress] = React.useState(0);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);
  const [isDragActive, setIsDragActive] = React.useState(false);
  
  const xhrRef = React.useRef<XMLHttpRequest | null>(null);

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const validateFile = (selectedFile: File): boolean => {
    if (!ALLOWED_TYPES.includes(selectedFile.type) && !selectedFile.name.toLowerCase().endsWith('.pdf')) {
      setErrorMsg("Please upload a valid PDF document.");
      setUploadState("error");
      return false;
    }
    
    if (selectedFile.size > MAX_FILE_SIZE) {
      setErrorMsg(`File size exceeds 10MB limit (${formatBytes(selectedFile.size)}).`);
      setUploadState("error");
      return false;
    }
    
    return true;
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const droppedFile = e.dataTransfer.files[0];
      if (validateFile(droppedFile)) {
        setFile(droppedFile);
        setUploadState("selected");
        setErrorMsg(null);
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const selectedFile = e.target.files[0];
      if (validateFile(selectedFile)) {
        setFile(selectedFile);
        setUploadState("selected");
        setErrorMsg(null);
      }
    }
  };

  const handleUpload = () => {
    if (!file) return;
    
    setUploadState("uploading");
    setProgress(0);
    
    const formData = new FormData();
    formData.append("file", file);
    
    const xhr = new XMLHttpRequest();
    xhrRef.current = xhr;
    
    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable) {
        setProgress(Math.round((e.loaded / e.total) * 100));
      }
    });
    
    xhr.addEventListener("load", () => {
      if (xhr.status === 201 || xhr.status === 200) {
        setUploadState("success");
        queryClient.invalidateQueries({ queryKey: getListContractsQueryKey() });
      } else {
        try {
          const res = JSON.parse(xhr.responseText);
          setErrorMsg(res.error || "Upload failed. Please try again.");
        } catch (e) {
          setErrorMsg(`Server responded with status ${xhr.status}.`);
        }
        setUploadState("error");
      }
    });
    
    xhr.addEventListener("error", () => {
      setErrorMsg("Network error occurred during upload.");
      setUploadState("error");
    });
    
    xhr.addEventListener("abort", () => {
      setUploadState("selected");
      setProgress(0);
    });
    
    xhr.open("POST", "/api/contracts/upload");
    xhr.send(formData);
  };
  
  const handleCancel = () => {
    if (xhrRef.current) {
      xhrRef.current.abort();
    }
  };
  
  const handleReset = () => {
    setFile(null);
    setUploadState("idle");
    setProgress(0);
    setErrorMsg(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500 fill-mode-both">
      <div 
        className={cn(
          "relative flex flex-col items-center justify-center p-12 text-center rounded-xl border-2 border-dashed transition-all duration-200 overflow-hidden bg-card text-card-foreground shadow-sm",
          isDragActive ? "border-primary bg-primary/5 scale-[1.01]" : "border-border",
          uploadState === "success" && "border-green-500/50 bg-green-50/50 dark:bg-green-950/10",
          uploadState === "error" && "border-destructive/50 bg-destructive/5"
        )}
        onDragEnter={uploadState === "idle" || uploadState === "selected" ? handleDragEnter : undefined}
        onDragOver={uploadState === "idle" || uploadState === "selected" ? handleDragOver : undefined}
        onDragLeave={uploadState === "idle" || uploadState === "selected" ? handleDragLeave : undefined}
        onDrop={uploadState === "idle" || uploadState === "selected" ? handleDrop : undefined}
      >
        
        {/* Hidden input */}
        <input 
          type="file" 
          ref={fileInputRef} 
          className="hidden" 
          accept=".pdf,application/pdf"
          onChange={handleFileChange}
        />
        
        {uploadState === "idle" && (
          <div className="flex flex-col items-center space-y-4">
            <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center text-primary mb-2">
              <UploadCloud className="h-8 w-8" />
            </div>
            <div>
              <h3 className="font-serif text-xl font-medium">Upload a contract</h3>
              <p className="text-sm text-muted-foreground mt-1 max-w-sm">
                Drag and drop your signed PDF here, or click to browse.
              </p>
            </div>
            <Button onClick={() => fileInputRef.current?.click()} variant="outline" className="mt-4">
              Browse Files
            </Button>
            <p className="text-xs text-muted-foreground mt-6">
              Supported format: PDF. Maximum file size: 10MB.
            </p>
          </div>
        )}
        
        {uploadState === "selected" && file && (
          <div className="flex flex-col items-center w-full max-w-md animate-in zoom-in-95 duration-200">
            <div className="flex items-center p-4 border rounded-lg bg-background w-full shadow-sm mb-6">
              <div className="h-10 w-10 rounded bg-primary/10 flex items-center justify-center text-primary shrink-0">
                <FileText className="h-5 w-5" />
              </div>
              <div className="ml-4 overflow-hidden text-left flex-1">
                <p className="text-sm font-medium truncate" title={file.name}>{file.name}</p>
                <p className="text-xs text-muted-foreground">{formatBytes(file.size)}</p>
              </div>
              <Button variant="ghost" size="icon" onClick={handleReset} className="shrink-0 text-muted-foreground hover:text-destructive">
                <X className="h-4 w-4" />
                <span className="sr-only">Remove</span>
              </Button>
            </div>
            <Button size="lg" className="w-full text-base font-medium shadow-md" onClick={handleUpload}>
              Upload Contract
            </Button>
          </div>
        )}
        
        {uploadState === "uploading" && file && (
          <div className="flex flex-col items-center w-full max-w-md space-y-6 animate-in zoom-in-95 duration-200">
            <div className="text-center">
              <h3 className="font-serif text-xl font-medium">Uploading...</h3>
              <p className="text-sm text-muted-foreground mt-1 truncate max-w-xs mx-auto">
                {file.name}
              </p>
            </div>
            <div className="w-full space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Uploading</span>
                <span className="font-medium">{progress}%</span>
              </div>
              <Progress value={progress} className="h-2" />
            </div>
            <Button variant="outline" onClick={handleCancel}>
              Cancel Upload
            </Button>
          </div>
        )}
        
        {uploadState === "success" && (
          <div className="flex flex-col items-center space-y-4 animate-in zoom-in-95 duration-300">
            <div className="h-16 w-16 rounded-full bg-green-100 text-green-600 flex items-center justify-center mb-2 dark:bg-green-900/30 dark:text-green-500">
              <CheckCircle2 className="h-8 w-8" />
            </div>
            <div className="text-center">
              <h3 className="font-serif text-xl font-medium text-green-700 dark:text-green-400">Upload Complete</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Your contract has been securely saved to the vault.
              </p>
            </div>
            <Button onClick={handleReset} variant="outline" className="mt-4">
              Upload Another
            </Button>
          </div>
        )}
        
        {uploadState === "error" && (
          <div className="flex flex-col items-center space-y-4 animate-in zoom-in-95 duration-200">
            <div className="h-16 w-16 rounded-full bg-destructive/10 text-destructive flex items-center justify-center mb-2">
              <AlertCircle className="h-8 w-8" />
            </div>
            <div className="text-center">
              <h3 className="font-serif text-xl font-medium text-destructive">Upload Failed</h3>
              <p className="text-sm text-destructive/80 mt-1 max-w-md mx-auto">
                {errorMsg}
              </p>
            </div>
            <div className="flex space-x-3 mt-4">
              <Button onClick={handleReset} variant="outline">
                Start Over
              </Button>
              {file && (
                <Button onClick={handleUpload}>
                  Try Again
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

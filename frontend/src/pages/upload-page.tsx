import * as React from "react"
import { Shield } from "lucide-react"

import { UploadZone } from "@/components/upload-zone"
import { ContractList } from "@/components/contract-list"

export default function UploadPage() {
  return (
    <div className="min-h-[100dvh] flex flex-col bg-background selection:bg-primary/20 selection:text-primary">
      {/* Header */}
      <header className="border-b bg-card shadow-sm z-10 sticky top-0">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="h-8 w-8 rounded-lg bg-primary text-primary-foreground flex items-center justify-center shadow-inner">
              <Shield className="h-4 w-4" />
            </div>
            <span className="font-serif text-xl font-semibold tracking-tight text-foreground">
              Contract<span className="text-primary font-bold">Vault</span>
            </span>
          </div>
          <div className="flex items-center space-x-4 text-sm font-medium">
            {/* Nav links could go here if multi-page */}
            <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-muted-foreground border">
              <span className="text-xs">JS</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-5xl mx-auto w-full px-6 py-12 space-y-20">
        
        <section className="space-y-8">
          <div className="text-center max-w-2xl mx-auto space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-500">
            <Badge variant="outline" className="mb-2 uppercase tracking-wider text-[10px] font-bold text-primary border-primary/30 bg-primary/5">
              Secure Upload
            </Badge>
            <h1 className="font-serif text-4xl md:text-5xl tracking-tight font-medium text-foreground leading-tight">
              Securely store your <br/> legal documents
            </h1>
            <p className="text-muted-foreground text-lg px-8">
              Upload signed PDFs to the vault. All documents are encrypted and tracked for professional compliance.
            </p>
          </div>
          
          <div className="pt-4">
            <UploadZone />
          </div>
        </section>
        
        <section className="pt-4">
          <ContractList />
        </section>

      </main>
      
      {/* Footer */}
      <footer className="border-t py-8 bg-card mt-auto">
        <div className="max-w-5xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between text-sm text-muted-foreground">
          <div className="flex items-center space-x-2">
            <Shield className="h-4 w-4 opacity-50" />
            <span>&copy; {new Date().getFullYear()} ContractVault Enterprise.</span>
          </div>
          <p className="mt-4 md:mt-0 text-xs">
            End-to-end encrypted storage • SOC2 Compliant
          </p>
        </div>
      </footer>
    </div>
  )
}

import { Badge } from "@/components/ui/badge"

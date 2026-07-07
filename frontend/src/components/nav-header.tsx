import { Search, Upload, ShieldCheck } from "lucide-react";

export function NavHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-gray-200/80 bg-white/75 backdrop-blur-lg supports-[backdrop-filter]:bg-white/60">
      <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
        {/* Logo */}
        <a
          href="/"
          className="flex items-center gap-2 text-sm font-semibold text-gray-900 hover:text-brand-600 transition-colors"
        >
          <div className="w-7 h-7 rounded-lg bg-brand-600 flex items-center justify-center shadow-sm">
            <ShieldCheck className="w-4 h-4 text-white" />
          </div>
          <span>SignFlow</span>
        </a>

        {/* Navigation links */}
        <nav className="flex items-center gap-1">
          <a
            href="/upload"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-all"
          >
            <Upload className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Upload</span>
          </a>
          <a
            href="/status"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-all"
          >
            <Search className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Status</span>
          </a>
        </nav>
      </div>
    </header>
  );
}

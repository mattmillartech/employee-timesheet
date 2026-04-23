import { useState } from 'react';
import { Copy, Printer, Check } from 'lucide-react';
import { toast } from 'sonner';
import { copyTSVToClipboard, dashboardToTSV } from '@/lib/payrollExport';
import type { DashboardView } from '@/lib/dashboardAggregator';

export function DashboardExport({ view }: { view: DashboardView }): JSX.Element {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (): Promise<void> => {
    try {
      await copyTSVToClipboard(dashboardToTSV(view));
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="inline-flex items-center gap-2 no-print">
      <button
        type="button"
        onClick={() => void handleCopy()}
        className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-1.5 text-sm hover:bg-surface-2"
      >
        {copied ? <Check className="w-4 h-4 text-success" aria-hidden /> : <Copy className="w-4 h-4" aria-hidden />}
        <span>{copied ? 'Copied' : 'Copy as TSV'}</span>
      </button>
      <button
        type="button"
        onClick={() => window.print()}
        className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-1.5 text-sm hover:bg-surface-2"
      >
        <Printer className="w-4 h-4" aria-hidden />
        <span>Print</span>
      </button>
    </div>
  );
}

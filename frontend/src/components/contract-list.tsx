import * as React from "react"
import { format } from "date-fns"
import { useQueryClient } from "@tanstack/react-query"
import { FileText, Trash2, ShieldCheck, Clock, AlertTriangle } from "lucide-react"

import { 
  useListContracts, 
  useDeleteContract, 
  getListContractsQueryKey,
  type Contract
} from "@workspace/api-client-react"

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { formatBytes } from "@/lib/utils"

export function ContractList() {
  const queryClient = useQueryClient();
  const { data: contracts, isLoading, isError } = useListContracts({
    query: { queryKey: getListContractsQueryKey() }
  });
  
  const deleteMutation = useDeleteContract({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListContractsQueryKey() });
      }
    }
  });

  const handleDelete = (id: number) => {
    if (confirm("Are you sure you want to delete this contract from the vault?")) {
      deleteMutation.mutate({ id });
    }
  };

  const renderStatusBadge = (status: Contract["status"]) => {
    switch (status) {
      case "processed":
        return (
          <Badge variant="success" className="gap-1 px-2 py-0.5">
            <ShieldCheck className="h-3 w-3" /> Processed
          </Badge>
        );
      case "pending":
        return (
          <Badge variant="warning" className="gap-1 px-2 py-0.5">
            <Clock className="h-3 w-3" /> Pending
          </Badge>
        );
      case "failed":
        return (
          <Badge variant="destructive" className="gap-1 px-2 py-0.5">
            <AlertTriangle className="h-3 w-3" /> Failed
          </Badge>
        );
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4 animate-in fade-in duration-700 delay-150 fill-mode-both">
        <div className="flex items-center justify-between pb-4 border-b">
          <Skeleton className="h-8 w-48" />
        </div>
        <div className="space-y-3 mt-6">
          {[1, 2, 3].map(i => (
            <div key={i} className="flex items-center justify-between p-4 border rounded-xl bg-card/50">
              <div className="flex items-center space-x-4">
                <Skeleton className="h-10 w-10 rounded bg-muted" />
                <div className="space-y-2">
                  <Skeleton className="h-5 w-64" />
                  <Skeleton className="h-4 w-32" />
                </div>
              </div>
              <Skeleton className="h-6 w-24 rounded-full" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-8 text-center border rounded-xl bg-destructive/5 text-destructive animate-in fade-in">
        <AlertTriangle className="mx-auto h-8 w-8 mb-3 opacity-80" />
        <h3 className="font-serif text-lg font-medium">Failed to load contracts</h3>
        <p className="text-sm opacity-80 mt-1">There was a problem communicating with the vault server.</p>
      </div>
    );
  }

  const hasContracts = contracts && contracts.length > 0;

  return (
    <div className="space-y-6 animate-in fade-in duration-700 delay-150 fill-mode-both">
      <div className="flex items-center justify-between border-b pb-4">
        <div>
          <h2 className="font-serif text-2xl tracking-tight text-foreground">Recent Documents</h2>
          <p className="text-sm text-muted-foreground mt-1">Manage files in your secure vault</p>
        </div>
        <div className="text-sm font-medium text-muted-foreground bg-muted px-3 py-1 rounded-full">
          {contracts?.length || 0} {(contracts?.length === 1) ? 'file' : 'files'}
        </div>
      </div>

      {!hasContracts ? (
        <div className="flex flex-col items-center justify-center p-12 text-center border rounded-xl bg-card/50 shadow-sm border-dashed">
          <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center text-muted-foreground mb-4">
            <FileText className="h-6 w-6 opacity-50" />
          </div>
          <h3 className="font-serif text-lg font-medium">The vault is empty</h3>
          <p className="text-sm text-muted-foreground mt-1 max-w-sm">
            You haven't uploaded any contracts yet. Upload your first document above to get started.
          </p>
        </div>
      ) : (
        <div className="border rounded-xl bg-card shadow-sm overflow-hidden">
          <Table>
            <TableHeader className="bg-muted/30">
              <TableRow>
                <TableHead className="w-[45%]">Document</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Uploaded</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {contracts.map((contract, i) => (
                <TableRow 
                  key={contract.id} 
                  className="group hover:bg-muted/20 animate-in fade-in slide-in-from-bottom-2"
                  style={{ animationDelay: `${i * 50}ms`, animationFillMode: 'both' }}
                >
                  <TableCell>
                    <div className="flex items-center space-x-3">
                      <div className="h-9 w-9 rounded flex items-center justify-center bg-primary/10 text-primary shrink-0">
                        <FileText className="h-4 w-4" />
                      </div>
                      <div className="flex flex-col truncate pr-4">
                        <span className="font-medium text-sm truncate" title={contract.originalName}>
                          {contract.originalName}
                        </span>
                        <span className="text-xs text-muted-foreground mt-0.5">
                          {formatBytes(contract.sizeBytes)}
                        </span>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    {renderStatusBadge(contract.status)}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {format(new Date(contract.uploadedAt), "MMM d, yyyy")}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button 
                      variant="ghost" 
                      size="icon"
                      onClick={() => handleDelete(contract.id)}
                      disabled={deleteMutation.isPending && deleteMutation.variables?.id === contract.id}
                      className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                      title="Delete contract"
                    >
                      <Trash2 className="h-4 w-4" />
                      <span className="sr-only">Delete</span>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

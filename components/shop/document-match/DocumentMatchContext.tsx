"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { toast } from "sonner";

import type { DocumentMatchRow } from "@/types/shop-document-match";

import { DocumentMatchReviewDialog } from "./DocumentMatchReviewDialog";

type DocumentMatchContextValue = {
  isLoading: boolean;
  submitFile: (file: File) => Promise<void>;
};

const DocumentMatchContext = createContext<DocumentMatchContextValue | null>(
  null
);

export function DocumentMatchProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<DocumentMatchRow[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const submitFile = useCallback(async (file: File) => {
    setIsLoading(true);
    const dismiss = toast.loading("Reading your document…");
    try {
      const body = new FormData();
      body.set("file", file);
      const res = await fetch("/api/shop/document-match", {
        method: "POST",
        body,
      });
      const data = (await res.json()) as
        | { success: true; rows: DocumentMatchRow[] }
        | { success: false; error?: string };

      if (!res.ok || !data.success) {
        const msg =
          "error" in data && typeof data.error === "string"
            ? data.error
            : "Could not process this file.";
        toast.error(msg, { id: dismiss });
        return;
      }

      setRows(data.rows);
      setOpen(true);
      toast.success(`Found ${data.rows.length} line item(s). Review matches below.`, {
        id: dismiss,
      });
    } catch {
      toast.error("Something went wrong. Check your connection and try again.", {
        id: dismiss,
      });
    } finally {
      setIsLoading(false);
    }
  }, []);

  const close = useCallback(() => {
    setOpen(false);
  }, []);

  const value = useMemo(
    () => ({ isLoading, submitFile }),
    [isLoading, submitFile]
  );

  return (
    <DocumentMatchContext.Provider value={value}>
      {children}
      <DocumentMatchReviewDialog
        open={open}
        onOpenChange={(next) => {
          if (!next) close();
        }}
        rows={rows}
        onClose={close}
      />
    </DocumentMatchContext.Provider>
  );
}

export function useDocumentMatchUpload(): DocumentMatchContextValue {
  const ctx = useContext(DocumentMatchContext);
  if (!ctx) {
    throw new Error(
      "useDocumentMatchUpload must be used within DocumentMatchProvider"
    );
  }
  return ctx;
}

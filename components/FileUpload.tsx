"use client";

import { api } from "@/lib/api";
import { uploadProductsSchema } from "@/lib/validations";
import type { ProductUploadSuccessData } from "@/types/upload-summary";
import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderPinwheelIcon } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import {
  UploadResultsCard,
  type UploadResultsPhase,
} from "@/components/uploads/UploadResultsCard";
import { Button } from "./ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "./ui/form";
import { Input } from "./ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";

type BranchOption = { _id: string; name: string; location: string };

type FileUploadProps = {
  userId: string;
  storeId: string;
  branchId?: string | null;
  allowBranchPicker?: boolean;
};

type UploadApiResponse = ActionResponse<ProductUploadSuccessData> & {
  duplicate?: boolean;
  message?: string;
};

const FileUpload = ({
  userId,
  branchId,
  storeId,
  allowBranchPicker = false,
}: FileUploadProps) => {
  const [resultsPhase, setResultsPhase] = useState<UploadResultsPhase>("idle");
  const [summary, setSummary] =
    useState<ProductUploadSuccessData["summary"] | null>(null);
  const [duplicateMessage, setDuplicateMessage] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [errorDetails, setErrorDetails] = useState<
    Record<string, string[]> | undefined
  >(undefined);
  const [pendingMeta, setPendingMeta] = useState<{
    fileName: string;
    fileSizeBytes: number;
    branchLabel: string;
  } | null>(null);

  const [selectedBranchId, setSelectedBranchId] = useState(branchId ?? "");
  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [branchesLoading, setBranchesLoading] = useState(allowBranchPicker);
  const [branchError, setBranchError] = useState("");
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (branchId) setSelectedBranchId(branchId);
  }, [branchId]);

  useEffect(() => {
    if (!allowBranchPicker) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/branches");
        const json = (await res.json()) as {
          success?: boolean;
          data?: { branches?: BranchOption[] };
        };
        if (!cancelled && json.success && Array.isArray(json.data?.branches)) {
          setBranches(json.data!.branches!);
        }
      } finally {
        if (!cancelled) setBranchesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [allowBranchPicker]);

  /** Resolve branch label for branch-only users (API returns a single branch). */
  useEffect(() => {
    if (allowBranchPicker || !branchId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/branches");
        const json = (await res.json()) as {
          success?: boolean;
          data?: { branches?: BranchOption[] };
        };
        if (!cancelled && json.success && Array.isArray(json.data?.branches)) {
          setBranches(json.data!.branches!);
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [allowBranchPicker, branchId]);

  const form = useForm<z.infer<typeof uploadProductsSchema>>({
    resolver: zodResolver(uploadProductsSchema),
    defaultValues: {
      file: undefined,
    },
  });

  function branchLabelForId(id: string): string {
    const b = branches.find((x) => x._id === id);
    if (b) return `${b.name} — ${b.location}`;
    return id ? "Selected branch" : "—";
  }

  const handleUploadProducts = async (
    data: z.infer<typeof uploadProductsSchema>
  ) => {
    const effectiveBranchId = allowBranchPicker
      ? selectedBranchId
      : (branchId ?? "");
    if (!effectiveBranchId) {
      setBranchError(
        allowBranchPicker
          ? "Select a branch before uploading."
          : "Missing branch assignment."
      );
      return;
    }
    setBranchError("");

    const formData = new FormData();
    formData.append("file", data.file);
    formData.append("userId", userId);
    formData.append("branchId", effectiveBranchId);
    formData.append("storeId", storeId);

    setPendingMeta({
      fileName: data.file.name,
      fileSizeBytes: data.file.size,
      branchLabel: branchLabelForId(effectiveBranchId),
    });
    setResultsPhase("processing");
    setSummary(null);
    setDuplicateMessage("");
    setErrorMessage("");
    setErrorDetails(undefined);

    startTransition(async () => {
      const res = (await api.products.upload(
        formData
      )) as UploadApiResponse;

      if (!res.success) {
        setResultsPhase("error");
        setErrorMessage(res.error?.message ?? "Upload failed.");
        setErrorDetails(res.error?.details);
        toast.error(res.error?.message ?? "Upload failed.");
        return;
      }

      if (res.duplicate) {
        setResultsPhase("duplicate");
        setDuplicateMessage(
          res.message ?? "Duplicate upload. No changes made."
        );
        toast.message("Duplicate upload — no changes made.");
        return;
      }

      if (res.data?.summary) {
        setSummary(res.data.summary);
        setResultsPhase("success");
        toast.success("Upload completed successfully.");
        return;
      }

      setResultsPhase("error");
      setErrorMessage("Unexpected response from server.");
      toast.error("Unexpected response from server.");
    });
  };

  return (
    <div className="min-h-screen bg-gray-100 px-4 py-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 lg:flex-row lg:items-start">
        <div className="w-full shrink-0 rounded-xl bg-white p-6 text-center shadow-lg lg:max-w-md lg:text-left">
          <h2 className="mb-4 text-xl font-semibold">Upload TXT file</h2>

          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(handleUploadProducts)}
              className="flex flex-col gap-6"
            >
              {allowBranchPicker && (
                <div className="flex flex-col gap-2 text-left">
                  <label className="text-sm font-medium text-gray-700">
                    Branch
                  </label>
                  {branchesLoading ? (
                    <p className="text-sm text-muted-foreground">
                      Loading branches…
                    </p>
                  ) : branches.length === 0 ? (
                    <p className="text-sm text-amber-700">
                      No branches found for this store. Add a branch first.
                    </p>
                  ) : (
                    <Select
                      value={selectedBranchId || undefined}
                      onValueChange={(v) => {
                        setSelectedBranchId(v);
                        setBranchError("");
                      }}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Choose branch" />
                      </SelectTrigger>
                      <SelectContent>
                        {branches.map((b) => (
                          <SelectItem key={b._id} value={b._id}>
                            {b.name} — {b.location}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  {branchError ? (
                    <p className="text-sm text-destructive">{branchError}</p>
                  ) : null}
                </div>
              )}
              <FormField
                control={form.control}
                name="file"
                render={({ field }) => (
                  <FormItem className="text-left">
                    <FormLabel className="text-gray-700">
                      Select a .txt file
                    </FormLabel>
                    <FormControl>
                      <Input
                        type="file"
                        accept=".txt"
                        onChange={(e) => field.onChange(e.target.files?.[0])}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {form.watch("file") && (
                <p className="text-left text-sm text-gray-600">
                  Selected: {form.watch("file")?.name}
                </p>
              )}

              <Button
                type="submit"
                className="bg-blue-600 text-white hover:bg-blue-700"
                disabled={isPending}
              >
                {isPending ? (
                  <>
                    <LoaderPinwheelIcon className="mr-2 size-4 animate-spin" />
                    Uploading…
                  </>
                ) : (
                  "Upload text file"
                )}
              </Button>
            </form>
          </Form>
        </div>

        <UploadResultsCard
          phase={resultsPhase}
          pendingMeta={pendingMeta}
          summary={summary}
          duplicateMessage={duplicateMessage}
          errorMessage={errorMessage}
          errorDetails={errorDetails}
        />
      </div>
    </div>
  );
};

export default FileUpload;

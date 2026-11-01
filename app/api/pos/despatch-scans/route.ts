import { NextResponse, after } from "next/server";

import { auth } from "@/auth";
import { DESPATCH_IMAGE_MIMES } from "@/lib/ai/extractDespatchSlip";
import { resolvePosScope } from "@/lib/auth/pos-scope";
import {
  createDespatchScan,
  DespatchScanError,
  listDespatchScans,
  MAX_SLIP_IMAGE_BYTES,
  processDespatchScan,
} from "@/lib/services/despatchScan.service";
import { TillError } from "@/lib/services/posTill.service";

export const runtime = "nodejs";
export const maxDuration = 60;

const fail = (message: string, status: number, extra?: Record<string, unknown>) =>
  NextResponse.json({ success: false, message, ...extra }, { status });

/** Upload a photo of a Stores Despatch Slip. Returns 202 at once; the AI reads it in the background. */
export async function POST(request: Request) {
  try {
    const form = await request.formData().catch(() => null);
    if (!form) return fail("Send the photo as form data", 400);

    const requestedBranch = form.get("branchId");
    const scoped = await resolvePosScope(await auth(), typeof requestedBranch === "string" ? requestedBranch : null);
    if (!scoped.ok) return scoped.response;
    const { scope } = scoped;
    if (!scope.branchId) return fail("Choose a branch", 400);

    const file = form.get("image");
    if (!(file instanceof File)) return fail("Attach the photo as 'image'", 400);
    if (!(DESPATCH_IMAGE_MIMES as readonly string[]).includes(file.type)) {
      return fail("Use a JPEG, PNG or WebP photo", 415);
    }
    if (file.size > MAX_SLIP_IMAGE_BYTES) return fail("The photo is too large (4 MB limit)", 413);

    const tillRaw = form.get("tillId");
    const { scanId } = await createDespatchScan({
      branchId: scope.branchId,
      tillId: typeof tillRaw === "string" && tillRaw ? tillRaw : null,
      userId: scope.userId,
      image: Buffer.from(await file.arrayBuffer()),
      mime: file.type,
    });

    after(async () => {
      await processDespatchScan(scanId);
    });

    return NextResponse.json({ success: true, data: { id: scanId, status: "processing" } }, { status: 202 });
  } catch (error) {
    if (error instanceof DespatchScanError) {
      return fail(error.message, error.status, error.existingScanId ? { existingScanId: error.existingScanId } : undefined);
    }
    if (error instanceof TillError) return fail(error.message, error.status);
    return fail(error instanceof Error ? error.message : "Failed to upload the photo", 500);
  }
}

/** The till's inbox. ?branchId= (admin), ?tillId=, ?status=ready,applied */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const scoped = await resolvePosScope(await auth(), url.searchParams.get("branchId"));
    if (!scoped.ok) return scoped.response;
    const { scope } = scoped;
    if (!scope.branchId) return fail("Choose a branch", 400);

    const allowed = ["processing", "ready", "failed", "applied", "dismissed"] as const;
    const statuses = (url.searchParams.get("status") ?? "")
      .split(",")
      .filter((s): s is (typeof allowed)[number] => (allowed as readonly string[]).includes(s));

    const data = await listDespatchScans({
      branchId: scope.branchId,
      tillId: url.searchParams.get("tillId"),
      statuses,
    });
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Failed to load scans", 500);
  }
}

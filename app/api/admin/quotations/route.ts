import Customer from "@/database/customer.model";
import Quotation from "@/database/quotation.model";
import { auth } from "@/auth";
import handleError from "@/lib/handlers/error";
import { requireAdmin } from "@/lib/auth/role";
import dbConnect from "@/lib/mongoose";
import { NextResponse } from "next/server";

const PAGE_SIZE = 20;

export async function GET(request: Request) {
  try {
    const session = await auth();
    const denied = requireAdmin(session);
    if (denied) return denied;

    await dbConnect();

    const { searchParams } = new URL(request.url);
    const statusFilter = searchParams.get("status") ?? "all";
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1);

    const filter: Record<string, unknown> = {};
    if (
      statusFilter !== "all" &&
      ["pending", "confirmed", "invoiced", "cancelled"].includes(statusFilter)
    ) {
      filter.status = statusFilter;
    }

    const total = await Quotation.countDocuments(filter);
    const rows = await Quotation.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * PAGE_SIZE)
      .limit(PAGE_SIZE)
      .populate({
        path: "customerId",
        select: "firstName lastName tradeName",
        model: Customer,
      })
      .lean();

    const data = rows.map((q) => {
      const c = q.customerId as unknown as {
        firstName?: string;
        lastName?: string;
        tradeName?: string;
      } | null;
      const customerName = c
        ? c.tradeName ||
          [c.firstName, c.lastName].filter(Boolean).join(" ").trim() ||
          "—"
        : "—";
      return {
        id: String(q._id),
        customerName,
        createdAt: q.createdAt,
        itemCount: Array.isArray(q.items) ? q.items.length : 0,
        subtotal: q.subtotal,
        status: q.status,
      };
    });

    return NextResponse.json(
      {
        success: true,
        data: {
          rows: data,
          total,
          page,
          pageSize: PAGE_SIZE,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    return handleError(error, "api") as APIErrorResponse;
  }
}

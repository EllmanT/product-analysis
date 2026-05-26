import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getUser } from "@/lib/actions/user.action";
import dbConnect from "@/lib/mongoose";
import { buildStockContext } from "@/lib/ai/buildStockContext";

const client = new Anthropic();

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { success, data } = await getUser({ userId: session.user.id });
  if (!success || !data?.user.storeId) {
    return NextResponse.json({ error: "Store not found" }, { status: 404 });
  }

  const storeId = String(data.user.storeId);

  const body = await req.json();
  const question = (body?.question ?? "").trim();
  if (!question) {
    return NextResponse.json({ error: "Question is required" }, { status: 400 });
  }

  await dbConnect();

  const stockContext = await buildStockContext(storeId);

  const message = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1024,
    system: `You are a stock analysis assistant for a retail business. You answer questions about inventory, stock levels, and branch performance clearly and concisely using the real-time data provided. Use plain, simple language. Format numbers with commas. Avoid technical jargon. If asked about something not in the data, say you don't have that information rather than guessing.

Current Stock Data:
${stockContext}`,
    messages: [{ role: "user", content: question }],
  });

  const answer =
    message.content[0].type === "text" ? message.content[0].text : "";

  return NextResponse.json({ answer });
}

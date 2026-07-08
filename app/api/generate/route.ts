import { NextResponse } from "next/server";
import { generateAndScoreReplies } from "@/lib/replyRubric";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      customerEmail?: string;
      contextNotes?: string;
    };

    if (!body.customerEmail?.trim()) {
      return NextResponse.json(
        { error: "Customer email is required." },
        { status: 400 }
      );
    }

    const result = await generateAndScoreReplies({
      customerEmail: body.customerEmail,
      contextNotes: body.contextNotes
    });

    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to generate replies.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}

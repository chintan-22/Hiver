import { NextResponse } from "next/server";
import { evaluateReply } from "@/lib/evaluate";
import { generateReply } from "@/lib/generate";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { incomingEmail?: string };

    if (!body.incomingEmail?.trim()) {
      return NextResponse.json(
        { error: "Incoming email is required." },
        { status: 400 }
      );
    }

    const generation = await generateReply(body.incomingEmail);
    const evaluation = await evaluateReply({
      incomingEmail: body.incomingEmail,
      generatedReply: generation.reply
    });

    return NextResponse.json({ ...generation, evaluation });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to generate a reply.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}

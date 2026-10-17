//* ticket submitting route

import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // webhook URL
    const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL;

    // check
    if (!N8N_WEBHOOK_URL) {
      throw new Error("Webhook URL is not defined");
    }

    const n8nResponse = await fetch(N8N_WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    // Safely parse JSON or text response from n8n
    const data = await n8nResponse.json();

    if (!n8nResponse.ok) {
      throw new Error("n8n request is failed");
    }

    return NextResponse.json(data);
  } catch (error: unknown) {
    if (error instanceof Error) {
      console.error(error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(
      { error: "Something went wrong in n8n workflow" },
      { status: 500 },
    );
  }
}

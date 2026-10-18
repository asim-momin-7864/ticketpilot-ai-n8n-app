//* Tickets actions

"use server";

import { createClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";

//
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

//
export async function approveTicketAction(formData: FormData): Promise<void> {
  const ticketId = formData.get("ticketId") as string;
  const draftReply = formData.get("draftReply") as string;

  const { error } = await supabase
    .from("tickets")
    .update({
      ai_draft_reply: draftReply,
      status: "AUTO_SENT",
    })
    .eq("id", ticketId);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/admin/tickets");
}

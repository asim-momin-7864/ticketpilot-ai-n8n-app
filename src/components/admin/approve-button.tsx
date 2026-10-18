"use client";

import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { HugeiconsIcon } from "@hugeicons/react";
import { SentIcon, Loading03Icon } from "@hugeicons/core-free-icons";

export function ApproveButton() {
  const { pending } = useFormStatus();

  return (
    <Button
      type="submit"
      disabled={pending}
      className="inline-flex items-center gap-2 font-medium"
    >
      <HugeiconsIcon
        icon={pending ? Loading03Icon : SentIcon}
        className={`size-4 ${pending ? "animate-spin" : ""}`}
      />
      <span>{pending ? "Sending..." : "Approve and Send"}</span>
    </Button>
  );
}

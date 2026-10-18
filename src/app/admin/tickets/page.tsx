//* admin page
import { approveTicketAction } from "@/src/actions/tickets";
import { ApproveButton } from "@/src/components/admin/approve-button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createClient } from "@supabase/supabase-js";
import { Suspense } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Ticket01Icon,
  Mail01Icon,
  AiSparklesIcon,
  AlertCircleIcon,
  CheckmarkCircle02Icon,
  Clock01Icon,
  Tag01Icon,
} from "@hugeicons/core-free-icons";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

function getUrgencyBadgeClasses(urgency?: string | null) {
  const u = urgency?.toLowerCase() || "";
  if (u.includes("high") || u.includes("crit") || u.includes("urg")) {
    return "bg-destructive/15 text-destructive border-destructive/30";
  }
  if (u.includes("med") || u.includes("mod")) {
    return "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30";
  }
  return "bg-secondary text-secondary-foreground border-border";
}

const RenderTickets = async () => {
  const { data, error } = await supabase
    .from("tickets")
    .select("*")
    .eq("status", "NEEDS_REVIEW")
    .order("created_at", { ascending: false });

  if (error) {
    return (
      <Card className="border-destructive/30 bg-destructive/10">
        <CardContent className="flex items-center gap-3 p-6 text-destructive">
          <HugeiconsIcon icon={AlertCircleIcon} className="size-5 shrink-0" />
          <p className="text-sm font-medium">
            Failed to load review tickets: {error.message}
          </p>
        </CardContent>
      </Card>
    );
  }

  if (!data || data.length === 0) {
    return (
      <Card className="border border-border bg-card text-center shadow-xs">
        <CardContent className="flex flex-col items-center justify-center py-16 px-6">
          <div className="flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary ring-8 ring-primary/5">
            <HugeiconsIcon icon={CheckmarkCircle02Icon} className="size-7" />
          </div>
          <h3 className="mt-4 text-lg font-semibold text-foreground">
            All Caught Up!
          </h3>
          <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">
            There are no support tickets requiring manual review at this moment.
            New tickets flagged by AI will appear here automatically.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-muted-foreground">
          Showing <span className="font-semibold text-foreground">{data.length}</span>{" "}
          ticket{data.length === 1 ? "" : "s"} awaiting review
        </p>
      </div>

      <div className="grid gap-6">
        {data.map((ticket) => {
          const createdAtDate = ticket.created_at
            ? new Date(ticket.created_at).toLocaleString(undefined, {
                dateStyle: "medium",
                timeStyle: "short",
              })
            : null;

          return (
            <Card
              key={ticket.id}
              className="border border-border bg-card shadow-sm transition-shadow hover:shadow-md dark:shadow-none"
            >
              <CardHeader className="space-y-4 pb-4 border-b border-border/40">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    {/* Status badge */}
                    <span className="inline-flex items-center gap-1 rounded-full border border-primary/25 bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
                      <HugeiconsIcon icon={Ticket01Icon} className="size-3" />
                      Needs Review
                    </span>

                    {/* Category */}
                    {ticket.category && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-border bg-secondary px-2.5 py-0.5 text-xs font-medium text-secondary-foreground">
                        <HugeiconsIcon icon={Tag01Icon} className="size-3 text-muted-foreground" />
                        {ticket.category}
                      </span>
                    )}

                    {/* Urgency */}
                    {ticket.urgency && (
                      <span
                        className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium uppercase tracking-wide ${getUrgencyBadgeClasses(
                          ticket.urgency
                        )}`}
                      >
                        Urgency: {ticket.urgency}
                      </span>
                    )}
                  </div>

                  {/* Timestamp */}
                  {createdAtDate && (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <HugeiconsIcon icon={Clock01Icon} className="size-3.5" />
                      <span>{createdAtDate}</span>
                    </div>
                  )}
                </div>

                <div>
                  <CardTitle className="text-xl font-semibold tracking-tight text-foreground">
                    {ticket.subject || "Untitled Support Ticket"}
                  </CardTitle>
                  <CardDescription className="mt-1.5 flex items-center gap-1.5 text-sm text-muted-foreground">
                    <HugeiconsIcon icon={Mail01Icon} className="size-4 shrink-0 text-muted-foreground" />
                    <span>From:</span>
                    <span className="font-medium text-foreground">
                      {ticket.customer_email}
                    </span>
                  </CardDescription>
                </div>
              </CardHeader>

              <CardContent className="space-y-6 pt-5">
                {/* Customer Message */}
                <div className="space-y-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Customer Message
                  </span>
                  <div className="rounded-xl border border-border/60 bg-muted/30 p-4 text-sm leading-relaxed text-foreground whitespace-pre-wrap">
                    {ticket.message}
                  </div>
                </div>

                {/* AI Draft Reply & Approval Form */}
                <form action={approveTicketAction} className="space-y-4">
                  <input type="hidden" name="ticketId" value={ticket.id} />

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label
                        htmlFor={`draftReply-${ticket.id}`}
                        className="flex items-center gap-1.5 font-medium text-foreground text-sm"
                      >
                        <HugeiconsIcon
                          icon={AiSparklesIcon}
                          className="size-4 text-primary"
                        />
                        <span>AI Draft Reply</span>
                      </Label>
                      <span className="text-xs text-muted-foreground">
                        Review and edit before approving
                      </span>
                    </div>

                    <Textarea
                      id={`draftReply-${ticket.id}`}
                      name="draftReply"
                      defaultValue={ticket.ai_draft_reply || ""}
                      rows={5}
                      className="font-sans text-sm leading-relaxed"
                      placeholder="Type your response to the customer..."
                      required
                    />
                  </div>

                  <div className="flex items-center justify-end pt-2">
                    <ApproveButton />
                  </div>
                </form>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
};

function TicketListSkeleton() {
  return (
    <div className="space-y-6">
      <div className="h-5 w-44 animate-pulse rounded-md bg-muted" />
      {[1, 2].map((i) => (
        <Card key={i} className="border border-border bg-card p-6 shadow-xs">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex gap-2">
                <div className="h-5 w-24 animate-pulse rounded-full bg-muted" />
                <div className="h-5 w-20 animate-pulse rounded-full bg-muted" />
              </div>
              <div className="h-4 w-28 animate-pulse rounded bg-muted" />
            </div>
            <div className="h-6 w-3/4 animate-pulse rounded bg-muted" />
            <div className="h-4 w-1/3 animate-pulse rounded bg-muted" />
            <div className="h-24 w-full animate-pulse rounded-xl bg-muted/60" />
            <div className="h-32 w-full animate-pulse rounded-xl bg-muted/40" />
            <div className="flex justify-end">
              <div className="h-9 w-36 animate-pulse rounded-4xl bg-muted" />
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

export default function AdminDashboard() {
  return (
    <div className="relative min-h-screen bg-background text-foreground px-4 py-10 sm:px-6 lg:px-8">
      {/* Ambient background glow using globals.css primary token */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/10 via-transparent to-transparent" />

      <div className="relative mx-auto max-w-4xl space-y-8">
        {/* Header Section */}
        <header className="space-y-2">
          <div className="inline-flex w-fit items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
            <HugeiconsIcon icon={Ticket01Icon} className="size-3.5" />
            <span>TicketPilot Admin</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Admin Dashboard
          </h1>
          <p className="text-base text-muted-foreground max-w-2xl">
            Review incoming support tickets and verify AI-generated draft replies
            before sending them directly to customers.
          </p>
        </header>

        {/* Dynamic Ticket List Stream */}
        <Suspense fallback={<TicketListSkeleton />}>
          <RenderTickets />
        </Suspense>
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Ticket01Icon,
  SentIcon,
  AlertCircleIcon,
  CheckmarkCircle02Icon,
  Loading03Icon,
  Clock01Icon,
} from "@hugeicons/core-free-icons";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function SupportHomePage() {
  // to store repsone
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [status, setStatus] = useState<{
    type: string;
    message: string;
  } | null>(null);

  // handle submit
  const handleSubmit = async (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();

    setIsSubmitting(true);
    setStatus(null);

    // payload
    const formData = new FormData(e.currentTarget);
    const formElement = e.currentTarget;
    const payload = {
      email: formData.get("email"),
      subject: formData.get("subject"),
      message: formData.get("message"),
    };

    try {
      // call to route hander
      const res = await fetch("/api/ticket", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      // check
      if (!res.ok) {
        const errorData = await res.json().catch(() => null);
        throw new Error(
          (errorData && (errorData.error || errorData.message)) ||
            "Failed to create ticket",
        );
      }

      const data = await res.json();

      // state to show user
      if (data.actionRequired === "PENDING_HUMAN_APPROVAL") {
        setStatus({
          type: "review",
          message: `Ticket #${data.ticketId?.slice(0, 6) || "101"} received. Your issue has been marked as high priority and escalated to our human support team. We will email you shortly.`,
        });
      } else {
        setStatus({
          type: "auto",
          message: `Ticket received! We have automatically dispatched an email to ${payload.email} with steps to resolve your issue.`,
        });
      }

      formElement.reset();
    } catch (error: unknown) {
      if (error instanceof Error) {
        setStatus({
          type: "error",
          message: error.message,
        });
      } else {
        setStatus({
          type: "error",
          message: "Failed to create ticket",
        });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="relative min-h-screen flex flex-1 items-center justify-center bg-background px-4 py-12 sm:px-6 lg:px-8">
      {/* Ambient background glow using globals.css primary token */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/10 via-transparent to-transparent" />

      <main className="relative w-full max-w-xl">
        <Card className="border border-border bg-card shadow-lg shadow-black/5 dark:shadow-none">
          <CardHeader className="space-y-3 pb-6">
            <div className="inline-flex w-fit items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
              <HugeiconsIcon icon={Ticket01Icon} className="size-3.5" />
              <span>TicketPilot Support</span>
            </div>
            <CardTitle className="text-2xl font-semibold tracking-tight text-foreground">
              Submit a Ticket
            </CardTitle>
            <CardDescription className="text-sm text-muted-foreground">
              Provide the details of your inquiry below. Our automated n8n
              workflow will review and route your request.
            </CardDescription>
          </CardHeader>

          <CardContent>
            {status && (
              <div
                className={`mb-6 flex items-start gap-3 rounded-xl border p-4 text-sm transition-all ${
                  status.type === "error"
                    ? "border-destructive/30 bg-destructive/10 text-destructive"
                    : status.type === "review"
                      ? "border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-200"
                      : "border-primary/30 bg-primary/10 text-primary"
                }`}
              >
                <div className="mt-0.5 shrink-0">
                  {status.type === "error" ? (
                    <HugeiconsIcon
                      icon={AlertCircleIcon}
                      className="size-5 text-destructive"
                    />
                  ) : status.type === "review" ? (
                    <HugeiconsIcon
                      icon={Clock01Icon}
                      className="size-5 text-amber-600 dark:text-amber-400"
                    />
                  ) : (
                    <HugeiconsIcon
                      icon={CheckmarkCircle02Icon}
                      className="size-5 text-primary"
                    />
                  )}
                </div>
                <div className="flex-1 text-sm leading-relaxed text-foreground/90">
                  <div className="font-semibold mb-0.5 text-xs uppercase tracking-wider">
                    {status.type === "error"
                      ? "Submission Failed"
                      : status.type === "review"
                        ? "Escalated for Human Review"
                        : "Ticket Received"}
                  </div>
                  <p className="text-xs sm:text-sm text-foreground/80 leading-relaxed">
                    {status.message}
                  </p>
                </div>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <Label
                  htmlFor="email"
                  className="text-sm font-medium text-foreground"
                >
                  Email Address
                </Label>
                <Input
                  type="email"
                  id="email"
                  name="email"
                  required
                  placeholder="name@company.com"
                  className="border-input bg-background/50 placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring"
                />
              </div>

              <div className="space-y-2">
                <Label
                  htmlFor="subject"
                  className="text-sm font-medium text-foreground"
                >
                  Subject
                </Label>
                <Input
                  type="text"
                  id="subject"
                  name="subject"
                  required
                  placeholder="Brief summary of your request"
                  className="border-input bg-background/50 placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring"
                />
              </div>

              <div className="space-y-2">
                <Label
                  htmlFor="message"
                  className="text-sm font-medium text-foreground"
                >
                  Message
                </Label>
                <Textarea
                  id="message"
                  name="message"
                  rows={5}
                  required
                  placeholder="Please describe the issue or inquiry in detail..."
                  className="min-h-[120px] resize-y border-input bg-background/50 placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring"
                />
              </div>

              <Button
                type="submit"
                disabled={isSubmitting}
                className="w-full gap-2 font-medium"
              >
                {isSubmitting ? (
                  <>
                    <HugeiconsIcon
                      icon={Loading03Icon}
                      className="size-4 animate-spin"
                    />
                    <span>Submitting ticket...</span>
                  </>
                ) : (
                  <>
                    <HugeiconsIcon icon={SentIcon} className="size-4" />
                    <span>Submit Ticket</span>
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

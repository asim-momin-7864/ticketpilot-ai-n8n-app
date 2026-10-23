# 🚀 Supabase Quick Re-Setup Guide: TicketPilot AI

This guide contains everything you need to **completely recreate and re-initialize your Supabase project in under 3 minutes** whenever you need to delete and recreate an instance to stay within the free-tier limit.

---

## 📋 Table of Contents
1. [Step 1: Create a New Supabase Project](#step-1-create-a-new-supabase-project)
2. [Step 2: Copy API Keys & Credentials](#step-2-copy-api-keys--credentials)
3. [Step 3: One-Click Master SQL Script](#step-3-one-click-master-sql-script)
   - Extensions (`vector`, `uuid-ossp`)
   - Schema (`tickets`, `documents`)
   - Triggers (`updated_at`)
   - Vector Search Function (`match_documents`)
   - Row Level Security (RLS) & Policies
   - Realtime Publication
   - Pre-seeded Knowledge Base & Dummy Tickets
4. [Step 4: Update Local `.env` Configuration](#step-4-update-local-env-configuration)
5. [Step 5: Update n8n Workflow Credentials](#step-5-update-n8n-workflow-credentials)
6. [Step 6: Verify Everything Works](#step-6-verify-everything-works)
7. [Appendix: Ready-to-Test Dummy Tickets](#appendix-ready-to-test-dummy-tickets)

---

## Step 1: Create a New Supabase Project

1. Log in to [supabase.com/dashboard](https://supabase.com/dashboard).
2. If you are at your 2-project free-tier limit:
   - Click on your old/unused project -> **Settings** -> **General** -> scroll to bottom -> **Delete Project**.
3. Click **New project**:
   - **Name**: `ticketpilot-ai` (or any name you prefer)
   - **Database Password**: Choose a strong password and save it in your password manager.
   - **Region**: Choose the region closest to you (e.g. `ap-south-1` Mumbai, `eu-central-1` Frankfurt, or `us-east-1`).
   - Click **Create new project** and wait ~1-2 minutes for provisioning to complete.

---

## Step 2: Copy API Keys & Credentials

Once your project is ready:

1. In the Supabase left sidebar, go to **Project Settings** (gear icon) -> **API** (or **Data API** in the new UI).
2. Copy two values:
   - **Project URL**: `https://<your-project-ref>.supabase.co`
   - **service_role Key** (secret): Under **Project API keys**, reveal and copy the `service_role` (secret) key.
     > ⚠️ **Important**: Do not use the public `anon` key for backend actions; the Next.js app and n8n require the `service_role` key to update tickets and insert AI metadata without RLS friction.

---

## Step 3: One-Click Master SQL Script

1. Open your Supabase Dashboard.
2. In the left sidebar, click **SQL Editor** -> click **+ New query**.
3. Paste the entire script below and click **Run** (or `Cmd + Enter` / `Ctrl + Enter`):

```sql
-- =============================================================================
-- TICKETPILOT AI - COMPLETE RESET MIGRATION SCRIPT
-- Run this single script in the Supabase SQL Editor.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. EXTENSIONS
-- -----------------------------------------------------------------------------
-- Enable UUID generation support
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enable pgvector for n8n AI Agent vector knowledge base retrieval
CREATE EXTENSION IF NOT EXISTS "vector";

-- -----------------------------------------------------------------------------
-- 2. DROP PREVIOUS OBJECTS (Clean Slate Reset)
-- -----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_tickets_updated_at ON public.tickets;
DROP FUNCTION IF EXISTS public.handle_updated_at();
DROP FUNCTION IF EXISTS public.match_documents(vector, int, jsonb);
DROP TABLE IF EXISTS public.documents CASCADE;
DROP TABLE IF EXISTS public.tickets CASCADE;

-- -----------------------------------------------------------------------------
-- 3. CREATE TICKETS TABLE
-- -----------------------------------------------------------------------------
CREATE TABLE public.tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  ai_draft_reply TEXT,
  status TEXT NOT NULL DEFAULT 'NEEDS_REVIEW' CHECK (status IN ('NEEDS_REVIEW', 'AUTO_SENT', 'RESOLVED', 'CLOSED')),
  category TEXT CHECK (category IN ('BILLING', 'TECHNICAL', 'GENERAL')),
  urgency TEXT CHECK (urgency IN ('HIGH', 'LOW', 'MEDIUM')),
  confidence_score NUMERIC(5, 4),
  model_used TEXT DEFAULT 'gemma4:e2b-mlx',
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Performance Indexes
CREATE INDEX IF NOT EXISTS idx_tickets_status ON public.tickets(status);
CREATE INDEX IF NOT EXISTS idx_tickets_created_at ON public.tickets(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tickets_urgency ON public.tickets(urgency);

-- -----------------------------------------------------------------------------
-- 4. CREATE DOCUMENTS TABLE (n8n LangChain Vector Store)
-- -----------------------------------------------------------------------------
-- nomic-embed-text:v1.5 produces 768-dimensional embeddings
CREATE TABLE public.documents (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  content TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  embedding VECTOR(768)
);

-- Vector Index (HNSW for fast approximate nearest neighbor search)
CREATE INDEX IF NOT EXISTS idx_documents_embedding 
ON public.documents 
USING hnsw (embedding vector_cosine_ops);

-- -----------------------------------------------------------------------------
-- 5. VECTOR SEARCH RPC FUNCTION (Used by n8n Vector Store Node)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.match_documents (
  query_embedding VECTOR(768),
  match_count INT DEFAULT 5,
  filter JSONB DEFAULT '{}'::jsonb
)
RETURNS TABLE (
  id BIGINT,
  content TEXT,
  metadata JSONB,
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$
#variable_conflict use_column
BEGIN
  RETURN QUERY
  SELECT
    documents.id,
    documents.content,
    documents.metadata,
    1 - (documents.embedding <=> query_embedding) AS similarity
  FROM public.documents
  WHERE documents.metadata @> filter
  ORDER BY documents.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- -----------------------------------------------------------------------------
-- 6. AUTOMATIC UPDATED_AT TRIGGER
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_tickets_updated_at
BEFORE UPDATE ON public.tickets
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();

-- -----------------------------------------------------------------------------
-- 7. ROW LEVEL SECURITY (RLS) & POLICIES
-- -----------------------------------------------------------------------------
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

-- Allow full access to service_role (used by Next.js Server Actions and n8n)
CREATE POLICY "Service role full access on tickets"
ON public.tickets
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "Service role full access on documents"
ON public.documents
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Allow public read access to documents for search/testing (optional)
CREATE POLICY "Allow public read on documents"
ON public.documents
FOR SELECT
TO anon, authenticated
USING (true);

-- Allow public insert on tickets (fallback if called from client)
CREATE POLICY "Allow public insert on tickets"
ON public.tickets
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

-- -----------------------------------------------------------------------------
-- 8. SUPABASE REALTIME CONFIGURATION
-- -----------------------------------------------------------------------------
-- Enables real-time event streaming for the tickets table
ALTER PUBLICATION supabase_realtime ADD TABLE public.tickets;

-- -----------------------------------------------------------------------------
-- 9. SEED DUMMY KNOWLEDGE BASE (Documents for AI Agent)
-- -----------------------------------------------------------------------------
INSERT INTO public.documents (content, metadata) VALUES
(
  'REFUND POLICY: Customers are eligible for a 100% full refund within 30 days of purchase if they accidentally upgraded their subscription (e.g. Annual instead of Monthly) or were double charged. To process a refund, verify the invoice ID and issue the reversal immediately.',
  '{"category": "BILLING", "topic": "refund"}'::jsonb
),
(
  'PASSWORD RESET & ACCOUNT LOCKOUT POLICY: If a customer is locked out due to multiple failed login attempts, account locks automatically expire after 15 minutes. For immediate manual unlock, send a secure one-time magic link to their registered business email address.',
  '{"category": "TECHNICAL", "topic": "authentication"}'::jsonb
),
(
  'API RATE LIMITS & WEBHOOKS: Pro tier allows 1,000 requests per minute per API key. Webhook payloads have a strict maximum body size limit of 2MB. Payloads exceeding 2MB will be rejected with HTTP 413 or 500 error codes. Use batching or chunked streaming for large data.',
  '{"category": "TECHNICAL", "topic": "api_limits"}'::jsonb
),
(
  'SUPPORT SLA & RESPONSE TIMES: Standard tier SLA is 24 business hours for general inquiries and 4 hours for high-priority blocking issues. Enterprise tier SLA guarantees a 15-minute response for critical production downtime.',
  '{"category": "GENERAL", "topic": "sla"}'::jsonb
),
(
  'ENTERPRISE BILLING & INVOICING: Enterprise tier invoices are generated on the 1st of every calendar month with Net-30 payment terms. For invoice discrepancies, direct the inquiry to billing@ticketpilot.dev or assign an account executive.',
  '{"category": "BILLING", "topic": "invoicing"}'::jsonb
);

-- -----------------------------------------------------------------------------
-- 10. SEED DUMMY TICKETS (Ready for Admin Review Dashboard)
-- -----------------------------------------------------------------------------
INSERT INTO public.tickets (
  customer_email,
  subject,
  message,
  ai_draft_reply,
  status,
  category,
  urgency,
  confidence_score,
  model_used,
  created_at
) VALUES
-- Ticket 1: High Urgency Billing (Needs Human Review)
(
  'sarah.connor@cyberdyne.io',
  'Refund request for accidental annual upgrade',
  'Hi support team, I accidentally clicked on the annual upgrade button instead of monthly yesterday. Can you please reverse this charge and refund my card? Thanks, Sarah.',
  'Dear Sarah, Thank you for contacting TicketPilot Support. I have reviewed your account and confirmed your accidental switch to the annual subscription on yesterday''s date. Under our 30-day refund guarantee for accidental upgrades, I have initiated a full refund of the annual charge to your original payment method. Please allow 3-5 business days for it to reflect on your statement. I have also switched your subscription back to the standard monthly tier. Please let us know if you need anything else!',
  'NEEDS_REVIEW',
  'BILLING',
  'HIGH',
  0.9400,
  'gemma4:e2b-mlx',
  NOW() - INTERVAL '15 minutes'
),
-- Ticket 2: High Urgency Technical Lockout (Needs Human Review)
(
  'michael.scott@dundermifflin.com',
  'Locked out of account after password reset',
  'Hello, I tried resetting my password this morning but now it says my account is locked due to multiple failed login attempts. Can someone unlock it quickly? We have a client meeting in an hour!',
  'Hello Michael, We understand how urgent this is before your meeting. Per our security protocol, accounts lock for 15 minutes after repeated failed attempts. I have manually cleared the security lock on your account and triggered a fresh, high-priority one-time password reset link to your email. Please check your inbox and log in using the new link. Let us know immediately if you encounter any further issues.',
  'NEEDS_REVIEW',
  'TECHNICAL',
  'HIGH',
  0.9100,
  'gemma4:e2b-mlx',
  NOW() - INTERVAL '35 minutes'
),
-- Ticket 3: High Urgency Enterprise Invoice (Needs Human Review)
(
  'bruce.wayne@waynecorp.com',
  'Billing inquiry on enterprise invoice #9821',
  'Good day. Our finance department noticed a discrepancy in the enterprise tier billing cycle for October. Please have an account manager contact me to review the line items.',
  'Good day Mr. Wayne, Thank you for bringing invoice #9821 to our attention. I have flagged this discrepancy directly to our Enterprise Accounts Team and your dedicated Account Manager. They are reviewing the October line items against your service agreement and will reach out with a corrected invoice statement within 2 hours.',
  'NEEDS_REVIEW',
  'BILLING',
  'HIGH',
  0.8800,
  'gemma4:e2b-mlx',
  NOW() - INTERVAL '1 hour'
),
-- Ticket 4: High Urgency Duplicate Charge (Needs Human Review)
(
  'peter.parker@bugle.net',
  'Double charged for subscription renewal',
  'Hello, I checked my bank statement today and noticed I was billed twice for my monthly subscription on October 15th. Can you please look into this duplicate charge and issue a refund?',
  'Hi Peter, Thank you for reporting this. We apologize for the inconvenience. We have verified that a duplicate charge occurred during the payment gateway renewal cycle on October 15th. We have already submitted a refund for the duplicate transaction back to your card. A confirmation receipt has been sent to your email.',
  'NEEDS_REVIEW',
  'BILLING',
  'HIGH',
  0.9600,
  'gemma4:e2b-mlx',
  NOW() - INTERVAL '2 hours'
),
-- Ticket 5: High Urgency Webhook Payload Failure (Needs Human Review)
(
  'tony.stark@starkindustries.com',
  'Custom webhook payload failure',
  'Support, we are seeing 500 internal server errors when sending payloads larger than 5MB to our custom webhook endpoint. Is there a strict payload size limit we should be aware of?',
  'Hello Tony, TicketPilot custom webhook endpoints currently enforce a strict 2MB maximum payload body limit. Requests exceeding 2MB will result in server rejection. We recommend batching your payloads into chunks under 2MB or uploading larger assets to our storage bucket and passing only the signed URL in your webhook event.',
  'NEEDS_REVIEW',
  'TECHNICAL',
  'HIGH',
  0.8900,
  'gemma4:e2b-mlx',
  NOW() - INTERVAL '3 hours'
),
-- Ticket 6: Low Urgency Auto-Resolved Ticket (Auto Sent)
(
  'emily.blunt@designstudio.com',
  'How to change the dashboard theme to dark mode?',
  'Hello support team. I recently started using your platform and prefer working in dark mode. Could you point me to the settings page where I can toggle the interface theme? Thank you.',
  'Hello Emily, You can switch to dark mode by clicking on your avatar at the top right of the dashboard, selecting "Preferences", and choosing "Dark Theme" under Appearance.',
  'AUTO_SENT',
  'GENERAL',
  'LOW',
  0.9800,
  'gemma4:e2b-mlx',
  NOW() - INTERVAL '4 hours'
),
-- Ticket 7: Low Urgency Auto-Resolved Ticket (Auto Sent)
(
  'james.holden@rocinante.org',
  'Question regarding your SLA response times',
  'Good afternoon. We are currently evaluating your standard tier versus the enterprise tier. Could you please clarify your standard Service Level Agreement (SLA) for non-critical bugs?',
  'Hello James, Our Standard Tier provides a 24-business-hour response SLA for non-critical inquiries, while our Enterprise Tier offers a guaranteed 15-minute response time for critical issues and 4 hours for non-critical requests.',
  'AUTO_SENT',
  'GENERAL',
  'LOW',
  0.9500,
  'gemma4:e2b-mlx',
  NOW() - INTERVAL '6 hours'
);

-- =============================================================================
-- VERIFY SETUP
-- =============================================================================
SELECT 'Tickets count:' AS metric, count(*)::text AS value FROM public.tickets
UNION ALL
SELECT 'Needs Review count:', count(*)::text FROM public.tickets WHERE status = 'NEEDS_REVIEW'
UNION ALL
SELECT 'Knowledge Base Docs:', count(*)::text FROM public.documents;
```

---

## Step 4: Update Local `.env` Configuration

In the project root `/Users/asimmomin7864/Dev/ticketpilot-ai-n8n-app/.env`:

Replace the values with your new Supabase project details:

```env
# n8n Webhook URL
N8N_WEBHOOK_URL="http://localhost:5678/webhook-test/ticket-triage"

# Supabase Credentials (from Project Settings -> API)
NEXT_PUBLIC_SUPABASE_URL="https://<YOUR_NEW_PROJECT_REF>.supabase.co"
SUPABASE_SERVICE_ROLE_KEY="sb_secret_<YOUR_NEW_SERVICE_ROLE_KEY>"
```

> **Note**: Both `.env` and `.env.local` work in Next.js. Keep your service role key safe and never commit `.env` with live production secrets to public repositories.

---

## Step 5: Update n8n Workflow Credentials

Your n8n workflow (`Ticket Piolet App.json`) connects to Supabase in **two nodes**:
1. **`Supabase Vector Store`** (LangChain tool node)
2. **`Create a row`** (Supabase node writing to `tickets`)

### Updating Credentials in n8n:
1. Open your local n8n instance at `http://localhost:5678`.
2. Go to **Credentials** in the left menu.
3. Locate your **Supabase account** credential (or create a new one):
   - **Host / URL**: `https://<YOUR_NEW_PROJECT_REF>.supabase.co`
   - **Service Role Key / API Key**: Paste your new `service_role` key from Step 2.
4. Open the workflow **`Ticket Piolet App`**:
   - Verify that the **`Supabase Vector Store`** node points to table `documents`.
   - Verify that the **`Create a row`** node points to table `tickets`.
5. Click **Save** and click **Test step** or **Listen for test event**.

---

## Step 6: Verify Everything Works

### 1. Test Admin Dashboard
Start your Next.js application:
```bash
npm run dev
```
Open **[http://localhost:3000/admin/tickets](http://localhost:3000/admin/tickets)**:
- You should immediately see the **5 pre-seeded `NEEDS_REVIEW` tickets**.
- Click the **Approve & Send Email** button on any ticket:
  - The ticket will be updated to `status: 'AUTO_SENT'` via the Server Action.
  - The ticket will instantly disappear from the review queue!

### 2. Test Ticket Submission Form
Open **[http://localhost:3000](http://localhost:3000)**:
- Submit a new ticket using any of the dummy examples below.
- Next.js will call `POST /api/ticket`, dispatch to n8n, run AI classification, insert into Supabase, and display the confirmation badge.

---

## Appendix: Ready-to-Test Dummy Tickets

Copy and paste these directly into the form at `http://localhost:3000`:

### High Urgency (Escalates to Admin Dashboard `/admin/tickets`):
```text
Customer: sarah.connor@cyberdyne.io
Subject: Refund request for accidental annual upgrade
Message: Hi support team, I accidentally clicked on the annual upgrade button instead of monthly yesterday. Can you please reverse this charge and refund my card? Thanks, Sarah.
```

```text
Customer: michael.scott@dundermifflin.com
Subject: Locked out of account after password reset
Message: Hello, I tried resetting my password this morning but now it says my account is locked due to multiple failed login attempts. Can someone unlock it quickly? We have a client meeting in an hour!
```

```text
Customer: barry.allen@cc-p.org
Subject: Critical server downtime affecting production
Message: Urgent! Our production environment lost connection to your database cluster a few minutes ago. All incoming requests are timing out. Please investigate immediately!
```

### Low Urgency (Auto-Resolved directly by AI):
```text
Customer: emily.blunt@designstudio.com
Subject: How to change the dashboard theme to dark mode?
Message: Hello support team. I recently started using your platform and prefer working in dark mode. Could you point me to the settings page where I can toggle the interface theme? Thank you.
```

```text
Customer: david.miller@techcorp.io
Subject: Looking for API documentation for the billing endpoint
Message: Hi there, our engineering team is trying to integrate your billing API into our internal dashboard. Where can we find the developer documentation and rate limits for the billing endpoints?
```

---

## 💡 Quick Troubleshooting Checklist

| Issue | Cause | Fix |
|---|---|---|
| `Failed to load review tickets: relation "tickets" does not exist` | SQL script hasn't been executed yet | Go to Supabase SQL Editor and run the script in [Step 3](#step-3-one-click-master-sql-script). |
| `permission denied for table tickets` | Using `anon` key instead of `service_role` | Update `SUPABASE_SERVICE_ROLE_KEY` in `.env` with the `service_role` secret from Supabase API settings. |
| `match_documents function not found` in n8n | Vector store function missing | Run section 5 of the SQL script to create the `match_documents` RPC function. |
| `type "vector" does not exist` | pgvector extension disabled | Run `CREATE EXTENSION IF NOT EXISTS vector;` in the SQL Editor. |
| Changes not reflected in Next.js | Next.js server hasn't reloaded env vars | Restart the Next.js dev server with `npm run dev`. |

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

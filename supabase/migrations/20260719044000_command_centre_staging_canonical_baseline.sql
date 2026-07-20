-- Canonical schema-only baseline for command-centre-staging.
-- Generated from read-only pg_catalog snapshots captured 2026-07-19.
-- Legacy lineage manifest SHA-256: cc34cbdb736153c0bbe9b47f82868023f4a90ca195711d94fd1913b71430435b
-- This file contains no row data and has not been applied remotely.

set check_function_bodies = false;
set search_path = public;

create type public."company_status" as enum ('draft_onboarding', 'pending_review', 'approved', 'ai_ready', 'needs_update', 'archived');

create type public."content_status" as enum ('ai_draft', 'user_edited', 'pending_approval', 'changes_required', 'approved', 'scheduled', 'published', 'rejected', 'archived', 'analysed');

create type public."request_status" as enum ('submitted', 'needs_more_information', 'ai_drafting', 'draft_ready', 'pending_approval', 'changes_required', 'approved', 'scheduled', 'published', 'cancelled', 'completed');

create type public."risk_level" as enum ('low', 'medium', 'high', 'critical');

create table public."ad_accounts" (
  "id" uuid default gen_random_uuid() not null,
  "company_id" uuid not null,
  "platform" text not null,
  "account_name" text not null,
  "external_account_id" text not null,
  "encrypted_token" text not null,
  "token_last_four" text not null,
  "status" text default 'connected'::text not null,
  "connected_by" text,
  "connected_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);

create table public."ad_budgets" (
  "company_id" uuid not null,
  "monthly_budget_usd" numeric default 0 not null,
  "allocation" jsonb default '{}'::jsonb not null,
  "fee_model" text default 'percent_of_spend'::text not null,
  "fee_percent" numeric default 0 not null,
  "fee_flat_usd" numeric default 0 not null,
  "updated_by" text,
  "updated_at" timestamp with time zone default now() not null
);

create table public."ad_campaigns" (
  "id" uuid default gen_random_uuid() not null,
  "company_id" uuid not null,
  "ad_account_id" uuid,
  "platform" text not null,
  "name" text not null,
  "objective" text default 'leads'::text not null,
  "daily_budget_usd" numeric default 0 not null,
  "status" text default 'draft'::text not null,
  "start_date" date not null,
  "end_date" date,
  "created_by" text,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null,
  "audience_segment_id" uuid,
  "external_campaign_id" text
);

create table public."agency_portfolio_snapshots" (
  "id" uuid default gen_random_uuid() not null,
  "tenant_id" uuid not null,
  "company_id" uuid not null,
  "open_count" integer default 0 not null,
  "snoozed_count" integer default 0 not null,
  "top_score" integer default 0 not null,
  "headline" text default ''::text not null,
  "captured_at" timestamp with time zone default now() not null
);

create table public."ai_campaign_recommendations" (
  "id" uuid default gen_random_uuid() not null,
  "tenant_id" uuid not null,
  "company_id" uuid not null,
  "campaign_id" uuid,
  "orchestration_run_id" uuid,
  "recommendation_type" text not null,
  "related_entity_type" text,
  "related_entity_id" text,
  "summary" text not null,
  "payload" jsonb default '{}'::jsonb not null,
  "confidence_score" numeric,
  "risk_score" numeric,
  "expected_outcome" text,
  "model_provider" text,
  "model_name" text,
  "model_version" text,
  "prompt_version" text,
  "human_decision" text,
  "human_decision_at" timestamp with time zone,
  "override_reason" text,
  "action_taken" text,
  "actual_outcome" text,
  "feedback_score" numeric,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);

create table public."ai_mos_opportunities" (
  "id" uuid default gen_random_uuid() not null,
  "tenant_id" uuid not null,
  "company_id" uuid not null,
  "kind" text not null,
  "title" text not null,
  "diagnosis" text not null,
  "suggested_action" jsonb not null,
  "evidence" jsonb default '[]'::jsonb not null,
  "priority" integer default 50 not null,
  "status" text default 'open'::text not null,
  "ai_run_id" uuid,
  "created_by" uuid not null,
  "created_at" timestamp with time zone default now() not null,
  "converted_at" timestamp with time zone,
  "dismissed_at" timestamp with time zone,
  "dismiss_reason" text,
  "result_type" text,
  "result_id" text
);

create table public."ai_mos_signal_runs" (
  "id" uuid default gen_random_uuid() not null,
  "tenant_id" uuid not null,
  "company_id" uuid not null,
  "user_id" uuid not null,
  "mode" text default 'suggest_only'::text not null,
  "execution_mode" text default 'suggest_only'::text not null,
  "signal_count" integer default 0 not null,
  "opportunity_count" integer default 0 not null,
  "signals" jsonb default '[]'::jsonb not null,
  "ai_run_id" uuid,
  "created_at" timestamp with time zone default now() not null
);

create table public."ai_orchestration_runs" (
  "id" uuid default gen_random_uuid() not null,
  "tenant_id" uuid not null,
  "company_id" uuid not null,
  "campaign_id" uuid,
  "operation" text not null,
  "input_summary" text,
  "structured_output" jsonb default '{}'::jsonb not null,
  "model_provider" text,
  "model_name" text,
  "prompt_version_id" uuid,
  "confidence_score" numeric,
  "risk_score" numeric,
  "approval_required" boolean default true not null,
  "status" text default 'proposed'::text not null,
  "created_by" text,
  "correlation_id" text,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);

create table public."ai_prompt_versions" (
  "id" uuid default gen_random_uuid() not null,
  "tenant_id" uuid,
  "prompt_key" text not null,
  "name" text not null,
  "purpose" text not null,
  "prompt_text" text not null,
  "version" integer default 1 not null,
  "model_provider" text default 'anthropic'::text not null,
  "model_name" text,
  "temperature" numeric,
  "output_schema" jsonb,
  "active" boolean default false not null,
  "created_by" text,
  "approved_by" text,
  "effective_at" timestamp with time zone,
  "retired_at" timestamp with time zone,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);

create table public."ai_runs" (
  "id" uuid default gen_random_uuid() not null,
  "tenant_id" uuid not null,
  "company_id" uuid,
  "user_id" text,
  "kind" text not null,
  "model" text not null,
  "prompt_summary" text default ''::text not null,
  "output_chars" integer default 0 not null,
  "sources_used" jsonb default '[]'::jsonb not null,
  "est_cost_usd" numeric default 0 not null,
  "created_at" timestamp with time zone default now() not null,
  "input_tokens" integer default 0 not null,
  "output_tokens" integer default 0 not null,
  "context_chars" integer
);

create table public."api_keys" (
  "id" uuid default gen_random_uuid() not null,
  "tenant_id" uuid not null,
  "name" text not null,
  "key_prefix" text not null,
  "key_hash" text not null,
  "scopes" text[] default '{}'::text[] not null,
  "company_ids" uuid[],
  "created_by" text not null,
  "last_used_at" timestamp with time zone,
  "revoked_at" timestamp with time zone,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);

create table public."app_users" (
  "id" uuid not null,
  "email" text not null,
  "name" text not null,
  "active" boolean default true not null,
  "platform_admin" boolean default false not null,
  "created_at" timestamp with time zone default now() not null
);

create table public."approval_policies" (
  "id" uuid default gen_random_uuid() not null,
  "tenant_id" uuid not null,
  "name" text not null,
  "entity_type" text not null,
  "trigger_rules" jsonb default '{}'::jsonb not null,
  "approval_level" text default 'single'::text not null,
  "active" boolean default true not null,
  "created_by" text,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);

create table public."approved_claims" (
  "id" uuid default gen_random_uuid() not null,
  "company_id" uuid not null,
  "claim_text" text not null,
  "evidence_id" uuid,
  "allowed_channels" jsonb default '[]'::jsonb not null,
  "active" boolean default true not null,
  "created_at" timestamp with time zone default now() not null
);

create table public."approved_responses" (
  "id" uuid default gen_random_uuid() not null,
  "tenant_id" uuid,
  "company_id" uuid,
  "category" text not null,
  "title" text not null,
  "response_text" text not null,
  "active" boolean default true not null,
  "created_at" timestamp with time zone default now() not null
);

create table public."assets" (
  "id" uuid default gen_random_uuid() not null,
  "company_id" uuid not null,
  "location_id" text,
  "folder" text,
  "name" text not null,
  "description" text,
  "asset_type" text not null,
  "source" text default 'upload'::text not null,
  "external_ref" text,
  "file_name" text,
  "mime_type" text,
  "size_bytes" bigint,
  "tags" jsonb default '[]'::jsonb not null,
  "usage_rights" jsonb default '{}'::jsonb not null,
  "status" text default 'draft'::text not null,
  "created_by" text,
  "approved_by" text,
  "approved_at" timestamp with time zone,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null,
  "stored_file" jsonb,
  "ai_model" text,
  "ai_prompt" text,
  "ai_run_id" uuid,
  "est_cost_usd" numeric(10,6),
  "sources_used" text[] default '{}'::text[] not null,
  "rights_confirmed_at" timestamp with time zone,
  "rights_confirmation_email" text,
  "private_provenance" jsonb
);

create table public."audience_segments" (
  "id" uuid default gen_random_uuid() not null,
  "company_id" uuid not null,
  "name" text not null,
  "platform" text default 'all'::text not null,
  "targeting" jsonb default '{}'::jsonb not null,
  "created_by" text,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);

create table public."audit_logs" (
  "id" uuid default gen_random_uuid() not null,
  "tenant_id" uuid,
  "action" text not null,
  "actor_id" text,
  "actor_email" text not null,
  "target_type" text,
  "target_id" text,
  "company_id" uuid,
  "detail" text,
  "created_at" timestamp with time zone default now() not null
);

create table public."automation_runs" (
  "id" uuid default gen_random_uuid() not null,
  "tenant_id" uuid not null,
  "trigger" text not null,
  "triggered_by" text,
  "outcomes" jsonb default '[]'::jsonb not null,
  "created_at" timestamp with time zone default now() not null
);

create table public."automation_settings" (
  "tenant_id" uuid not null,
  "enabled" boolean default false not null,
  "draft_campaign_suggestions" boolean default true not null,
  "monthly_content_generation" boolean default true not null,
  "analytics_summaries" boolean default true not null,
  "content_alerts" boolean default true not null,
  "low_risk_auto_responses" boolean default false not null,
  "max_campaigns_per_run" integer default 2 not null,
  "max_drafts_per_company" integer default 2 not null,
  "updated_at" timestamp with time zone default now() not null,
  "updated_by" text
);

create table public."booking_service_periods" (
  "id" uuid default gen_random_uuid() not null,
  "company_id" uuid not null,
  "name" text not null,
  "day_of_week" integer default 1 not null,
  "start_time" text default '11:00'::text not null,
  "end_time" text default '14:00'::text not null,
  "capacity" integer default 20 not null,
  "slot_minutes" integer default 30 not null,
  "active" boolean default true not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);

create table public."booking_settings" (
  "company_id" uuid not null,
  "venue_kind" text default 'restaurant'::text not null,
  "enabled" boolean default true not null,
  "button_label" text default 'Book a table'::text not null,
  "lead_time_hours" integer default 1 not null,
  "max_party_size" integer default 12 not null,
  "notes" text,
  "updated_at" timestamp with time zone default now() not null
);

create table public."brand_templates" (
  "id" uuid default gen_random_uuid() not null,
  "tenant_id" uuid,
  "company_id" uuid,
  "name" text not null,
  "kind" text not null,
  "description" text default ''::text not null,
  "dimensions" text,
  "source" text default 'canva'::text not null,
  "external_ref" text,
  "spec" text,
  "active" boolean default true not null,
  "created_by" text,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);

create table public."campaign_builder_runs" (
  "id" uuid default gen_random_uuid() not null,
  "company_id" uuid not null,
  "campaign_id" uuid,
  "plan_version_id" uuid,
  "goal" text not null,
  "status" text default 'completed'::text not null,
  "mode" text default 'simulated'::text not null,
  "model" text default 'template (no API key)'::text not null,
  "spawned_content_count" integer default 0 not null,
  "draft_schedule_count" integer default 0 not null,
  "ai_run_id" uuid,
  "created_by" uuid not null,
  "created_at" timestamp with time zone default now() not null
);

create table public."campaign_draft_schedule_items" (
  "id" uuid default gen_random_uuid() not null,
  "campaign_id" uuid not null,
  "company_id" uuid not null,
  "campaign_item_id" uuid,
  "content_id" uuid,
  "plan_version_id" uuid,
  "scheduled_date" date not null,
  "scheduled_time" text,
  "platform" text not null,
  "title" text not null,
  "status" text default 'draft'::text not null,
  "created_by" uuid not null,
  "created_at" timestamp with time zone default now() not null
);

create table public."campaign_experiments" (
  "id" uuid default gen_random_uuid() not null,
  "company_id" uuid not null,
  "campaign_id" uuid not null,
  "hypothesis" text not null,
  "control_variant_id" text not null,
  "test_variant_id" text not null,
  "variants" jsonb default '[]'::jsonb not null,
  "audience_split" numeric default 50 not null,
  "start_date" date,
  "end_date" date,
  "success_metric" text default 'conversion_rate'::text not null,
  "min_sample_size" integer default 100 not null,
  "confidence_threshold" numeric default 0.95 not null,
  "winning_variation" text,
  "status" text default 'draft'::text not null,
  "created_by" text not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);

create table public."campaign_items" (
  "id" uuid default gen_random_uuid() not null,
  "campaign_id" uuid not null,
  "company_id" uuid not null,
  "day_offset" integer not null,
  "channel" text not null,
  "content_type" text not null,
  "title" text not null,
  "brief" text default ''::text not null,
  "content_id" uuid,
  "status" text default 'planned'::text not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);

create table public."campaign_performance_snapshots" (
  "id" uuid default gen_random_uuid() not null,
  "tenant_id" uuid not null,
  "company_id" uuid not null,
  "campaign_id" uuid,
  "content_id" uuid,
  "platform_account_id" text,
  "period_start" timestamp with time zone not null,
  "period_end" timestamp with time zone not null,
  "metrics" jsonb default '{}'::jsonb not null,
  "data_source" text default 'simulated'::text not null,
  "attribution_status" text,
  "collected_at" timestamp with time zone default now() not null,
  "created_at" timestamp with time zone default now() not null
);

create table public."campaign_plan_versions" (
  "id" uuid default gen_random_uuid() not null,
  "campaign_id" uuid not null,
  "company_id" uuid not null,
  "version_number" integer default 1 not null,
  "goal" text not null,
  "objective" text not null,
  "strategy" text default ''::text not null,
  "channel_plan" text default ''::text not null,
  "kpis" jsonb default '[]'::jsonb not null,
  "risk_warnings" jsonb default '[]'::jsonb not null,
  "channels" jsonb default '[]'::jsonb not null,
  "item_count" integer default 0 not null,
  "model" text default 'template (no API key)'::text not null,
  "created_by" uuid not null,
  "created_at" timestamp with time zone default now() not null
);

create table public."campaigns" (
  "id" uuid default gen_random_uuid() not null,
  "company_id" uuid not null,
  "name" text not null,
  "objective" text not null,
  "audience" text,
  "service_focus" text,
  "channels" jsonb default '[]'::jsonb not null,
  "duration_days" integer default 30 not null,
  "start_date" date not null,
  "offer_id" uuid,
  "event_name" text,
  "event_date" date,
  "key_message" text,
  "status" text default 'draft'::text not null,
  "request_id" uuid,
  "created_by" text,
  "approved_by" text,
  "approved_at" timestamp with time zone,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null,
  "campaign_type" text,
  "description" text,
  "priority" text default 'medium'::text not null,
  "timezone" text default 'Australia/Sydney'::text not null,
  "budget_amount" numeric,
  "currency" text default 'AUD'::text not null,
  "daily_spend_limit" numeric,
  "geographic_scope" jsonb default '[]'::jsonb not null,
  "landing_page_url" text,
  "utm" jsonb default '{}'::jsonb not null,
  "associated_products" jsonb default '[]'::jsonb not null,
  "end_date" date,
  "archived_at" timestamp with time zone,
  "layer_meta" jsonb default '{}'::jsonb not null
);

create table public."cms_page_versions" (
  "id" uuid default gen_random_uuid() not null,
  "page_id" uuid not null,
  "company_id" uuid not null,
  "version_number" integer not null,
  "title" text not null,
  "body_html" text default ''::text not null,
  "change_summary" text,
  "status" text default 'draft'::text not null,
  "created_by" uuid,
  "created_at" timestamp with time zone default now() not null,
  "approved_by" uuid,
  "approved_at" timestamp with time zone
);

create table public."cms_pages" (
  "id" uuid default gen_random_uuid() not null,
  "company_id" uuid not null,
  "slug" text not null,
  "title" text not null,
  "kind" text default 'page'::text not null,
  "status" text default 'draft'::text not null,
  "current_version_id" uuid,
  "published_version_id" uuid,
  "live_url" text,
  "created_by" uuid,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);

create table public."cms_seo_metadata" (
  "id" uuid default gen_random_uuid() not null,
  "page_id" uuid not null,
  "company_id" uuid not null,
  "meta_title" text default ''::text not null,
  "meta_description" text default ''::text not null,
  "og_title" text,
  "og_description" text,
  "og_image_url" text,
  "canonical_url" text,
  "no_index" boolean default false not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);

create table public."cms_update_requests" (
  "id" uuid default gen_random_uuid() not null,
  "company_id" uuid not null,
  "page_id" uuid,
  "title" text not null,
  "description" text default ''::text not null,
  "status" text default 'open'::text not null,
  "requested_by" uuid,
  "assigned_to" uuid,
  "completed_at" timestamp with time zone,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);

create table public."companies" (
  "id" uuid default gen_random_uuid() not null,
  "tenant_id" uuid not null,
  "name" text not null,
  "status" company_status default 'draft_onboarding'::company_status not null,
  "profile" jsonb default '{}'::jsonb not null,
  "created_by" text,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null,
  "documents" jsonb default '[]'::jsonb not null
);

create table public."company_access" (
  "user_id" uuid not null,
  "company_id" uuid not null,
  "location_id" text
);

create table public."company_credit_ledger" (
  "id" uuid default gen_random_uuid() not null,
  "tenant_id" uuid not null,
  "company_id" uuid not null,
  "wallet_id" uuid not null,
  "kind" text not null,
  "amount_usd" numeric not null,
  "balance_after_usd" numeric not null,
  "reason" text not null,
  "related_type" text,
  "related_id" text,
  "created_by" text,
  "created_at" timestamp with time zone default now() not null
);

create table public."company_credit_wallets" (
  "id" uuid default gen_random_uuid() not null,
  "tenant_id" uuid not null,
  "company_id" uuid not null,
  "balance_usd" numeric default 0 not null,
  "min_floor_usd" numeric default 50 not null,
  "auto_top_up_enabled" boolean default false not null,
  "top_up_trigger_balance_usd" numeric default 50 not null,
  "top_up_amount_usd" numeric default 100 not null,
  "max_top_up_amount_usd" numeric default 500 not null,
  "max_top_up_per_day" integer default 3 not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null,
  "stripe_customer_id" text,
  "stripe_payment_method_id" text
);

create table public."company_documents" (
  "id" uuid default gen_random_uuid() not null,
  "company_id" uuid not null,
  "name" text not null,
  "content_type" text,
  "size" bigint,
  "approval_status" text default 'pending'::text not null,
  "consent_obtained" boolean default false not null,
  "shows_customer" boolean default false not null,
  "uploaded_by" text,
  "uploaded_at" timestamp with time zone default now() not null
);

create table public."company_entitlements" (
  "id" uuid default gen_random_uuid() not null,
  "company_id" uuid not null,
  "addon_id" text not null,
  "status" text default 'active'::text not null,
  "enabled_by" text,
  "stripe_subscription_id" text,
  "enabled_at" timestamp with time zone default now() not null,
  "cancelled_at" timestamp with time zone,
  "updated_at" timestamp with time zone default now() not null
);

create table public."company_reviews" (
  "id" uuid default gen_random_uuid() not null,
  "company_id" uuid not null,
  "platform" text not null,
  "external_id" text,
  "author_name" text not null,
  "rating" smallint not null,
  "body" text default ''::text not null,
  "reviewed_at" timestamp with time zone not null,
  "sentiment" text not null,
  "topics" text[] default '{}'::text[] not null,
  "urgency" text not null,
  "escalation_required" boolean default false not null,
  "status" text default 'new'::text not null,
  "draft_response" text,
  "published_response" text,
  "imported_at" timestamp with time zone default now() not null,
  "responded_at" timestamp with time zone,
  "created_by" uuid
);

create table public."connect_invites" (
  "id" uuid default gen_random_uuid() not null,
  "tenant_id" uuid not null,
  "company_id" uuid not null,
  "platform" text not null,
  "token" text not null,
  "account_name_hint" text,
  "recipient_email" text,
  "status" text default 'pending'::text not null,
  "invited_by" text not null,
  "completed_at" timestamp with time zone,
  "integration_id" uuid,
  "expires_at" timestamp with time zone not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);

create table public."consents" (
  "id" uuid default gen_random_uuid() not null,
  "company_id" uuid not null,
  "person_shown" text not null,
  "consent_obtained" boolean default false not null,
  "document_name" text,
  "permitted_channels" jsonb default '[]'::jsonb not null,
  "expiry_date" date,
  "restrictions" text,
  "approved_by" text,
  "withdrawn" boolean default false not null,
  "created_at" timestamp with time zone default now() not null
);

create table public."content_comments" (
  "id" uuid default gen_random_uuid() not null,
  "content_id" uuid not null,
  "company_id" uuid not null,
  "author_id" text not null,
  "author_name" text not null,
  "author_kind" text not null,
  "body" text not null,
  "created_at" timestamp with time zone default now() not null
);

create table public."content_items" (
  "id" uuid default gen_random_uuid() not null,
  "company_id" uuid not null,
  "request_id" uuid,
  "type" text not null,
  "title" text not null,
  "body" text not null,
  "status" content_status default 'ai_draft'::content_status not null,
  "created_by" text,
  "compliance" jsonb,
  "brand_fit_score" integer,
  "approved_by" text,
  "approved_at" timestamp with time zone,
  "ai_model" text,
  "ai_prompt" text,
  "sources_used" jsonb default '[]'::jsonb not null,
  "versions" jsonb default '[]'::jsonb not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null,
  "source_refs" jsonb default '[]'::jsonb not null,
  "grounding_label" text,
  "claim_audit" jsonb default '[]'::jsonb not null,
  "routed_to" text,
  "campaign_id" uuid,
  "campaign_item_id" uuid,
  "variant_group_id" text,
  "variant_label" text,
  "repurposed_from_id" uuid,
  "duplicate_warning" text,
  "reuse_permitted" boolean,
  "reuse_channels" jsonb default '[]'::jsonb not null,
  "review_date" date,
  "expiry_date" date,
  "asset_ids" jsonb default '[]'::jsonb not null,
  "client_review" jsonb,
  "ai_run_id" uuid,
  "est_cost_usd" numeric(10,6),
  "ai_critique" jsonb,
  "managed_concept_id" uuid,
  "managed_channel_key" text
);

create table public."conversion_funnels" (
  "id" uuid default gen_random_uuid() not null,
  "company_id" uuid not null,
  "journey_id" uuid,
  "name" text not null,
  "stages" jsonb default '[]'::jsonb not null,
  "status" text default 'draft'::text not null,
  "created_by" uuid not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);

create table public."crm_contacts" (
  "id" uuid default gen_random_uuid() not null,
  "company_id" uuid not null,
  "email" text,
  "phone" text,
  "first_name" text not null,
  "last_name" text,
  "tags" jsonb default '[]'::jsonb not null,
  "consent_status" text default 'pending'::text not null,
  "source" text default 'manual'::text not null,
  "lead_id" uuid,
  "notes" text,
  "created_by" uuid not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);

create table public."crm_interactions" (
  "id" uuid default gen_random_uuid() not null,
  "company_id" uuid not null,
  "contact_id" uuid not null,
  "channel" text not null,
  "direction" text default 'inbound'::text not null,
  "summary" text not null,
  "detail" text,
  "occurred_at" timestamp with time zone default now() not null,
  "created_by" uuid,
  "metadata" jsonb
);

create table public."crm_segments" (
  "id" uuid default gen_random_uuid() not null,
  "company_id" uuid not null,
  "name" text not null,
  "description" text,
  "rule_type" text default 'manual'::text not null,
  "rule_config" jsonb default '{}'::jsonb not null,
  "created_by" uuid not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);

create table public."email_campaigns" (
  "id" uuid default gen_random_uuid() not null,
  "company_id" uuid not null,
  "template_id" uuid not null,
  "name" text not null,
  "subject" text not null,
  "status" text default 'draft'::text not null,
  "scheduled_at" timestamp with time zone,
  "sent_at" timestamp with time zone,
  "segment_tag" text,
  "stats" jsonb default '{"sent": 0, "opens": 0, "clicks": 0, "failed": 0, "bounces": 0, "recipients": 0, "unsubscribes": 0}'::jsonb not null,
  "created_by" text,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);

create table public."email_subscribers" (
  "id" uuid default gen_random_uuid() not null,
  "company_id" uuid not null,
  "email" text not null,
  "name" text,
  "tags" jsonb default '[]'::jsonb not null,
  "marketing_consent" boolean default false not null,
  "unsubscribed_at" timestamp with time zone,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);

create table public."email_templates" (
  "id" uuid default gen_random_uuid() not null,
  "company_id" uuid not null,
  "name" text not null,
  "kind" text default 'newsletter'::text not null,
  "subject" text not null,
  "preview_text" text,
  "html_body" text not null,
  "accent_color" text,
  "active" boolean default true not null,
  "created_by" text,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);

create table public."evidence" (
  "id" uuid default gen_random_uuid() not null,
  "company_id" uuid not null,
  "title" text not null,
  "evidence_type" text not null,
  "detail" text default ''::text not null,
  "document_name" text,
  "valid_until" date,
  "created_by" text,
  "created_at" timestamp with time zone default now() not null
);

create table public."funnel_ab_experiments" (
  "id" uuid default gen_random_uuid() not null,
  "company_id" uuid not null,
  "funnel_id" uuid,
  "landing_page_id" uuid,
  "name" text not null,
  "status" text default 'draft'::text not null,
  "variants" jsonb default '[]'::jsonb not null,
  "winner_variant_id" text,
  "created_by" uuid not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);

create table public."funnel_journeys" (
  "id" uuid default gen_random_uuid() not null,
  "company_id" uuid not null,
  "name" text not null,
  "description" text,
  "touchpoints" jsonb default '[]'::jsonb not null,
  "status" text default 'draft'::text not null,
  "created_by" uuid not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);

create table public."funnel_landing_pages" (
  "id" uuid default gen_random_uuid() not null,
  "company_id" uuid not null,
  "funnel_id" uuid,
  "slug" text not null,
  "title" text not null,
  "url" text,
  "view_count" integer default 0 not null,
  "unique_visitors" integer default 0 not null,
  "cta_clicks" integer default 0 not null,
  "form_submissions" integer default 0 not null,
  "bounce_rate_pct" numeric default 0 not null,
  "avg_time_on_page_sec" integer default 0 not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);

create table public."knowledge_documents" (
  "id" uuid default gen_random_uuid() not null,
  "company_id" uuid not null,
  "title" text not null,
  "content" text not null,
  "source_type" text not null,
  "status" text default 'approved'::text not null,
  "version" integer default 1 not null,
  "previous_versions" jsonb default '[]'::jsonb not null,
  "added_by" text,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);

create table public."knowledge_gaps" (
  "id" uuid default gen_random_uuid() not null,
  "company_id" uuid not null,
  "request_id" uuid,
  "question" text not null,
  "context" text,
  "blocking" boolean default false not null,
  "status" text default 'open'::text not null,
  "answer" text,
  "answered_by" text,
  "answered_at" timestamp with time zone,
  "created_at" timestamp with time zone default now() not null
);

create table public."leads" (
  "id" uuid default gen_random_uuid() not null,
  "company_id" uuid not null,
  "platform" text not null,
  "ad_campaign_id" uuid,
  "contact" text not null,
  "source" text default 'manual'::text not null,
  "value_usd" numeric,
  "status" text default 'new'::text not null,
  "captured_at" timestamp with time zone default now() not null,
  "external_lead_id" text
);

create table public."learning_hypotheses" (
  "id" uuid default gen_random_uuid() not null,
  "tenant_id" uuid not null,
  "company_id" uuid not null,
  "title" text not null,
  "statement" text not null,
  "metric" text,
  "status" text default 'open'::text not null,
  "experiment_outcome" text default 'pending'::text,
  "outcome_notes" text,
  "source_recommendation_type" text,
  "created_by" text not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null,
  "resolved_at" timestamp with time zone
);

create table public."learning_lessons" (
  "id" uuid default gen_random_uuid() not null,
  "tenant_id" uuid not null,
  "company_id" uuid not null,
  "source" text not null,
  "title" text not null,
  "lesson" text not null,
  "recommendation_type" text,
  "dismiss_reason" text,
  "hypothesis_id" uuid,
  "created_by" text not null,
  "created_at" timestamp with time zone default now() not null
);

create table public."legal_holds" (
  "id" uuid default gen_random_uuid() not null,
  "tenant_id" uuid not null,
  "scope" text not null,
  "target_id" text not null,
  "company_id" uuid not null,
  "reason" text not null,
  "active" boolean default true not null,
  "applied_by" text,
  "applied_at" timestamp with time zone default now() not null,
  "released_by" text,
  "released_at" timestamp with time zone
);

create table public."local_area_profiles" (
  "company_id" uuid not null,
  "suburbs" jsonb default '[]'::jsonb not null,
  "demographics" text,
  "common_needs" text,
  "competitors" jsonb default '[]'::jsonb not null,
  "local_events" text,
  "seasonal_patterns" text,
  "search_terms" jsonb default '[]'::jsonb not null,
  "buying_triggers" text,
  "updated_at" timestamp with time zone default now() not null
);

create table public."loyalty_coupons" (
  "id" uuid default gen_random_uuid() not null,
  "company_id" uuid not null,
  "code" text not null,
  "name" text not null,
  "kind" text default 'percent_off'::text not null,
  "value" numeric default 0 not null,
  "segment_tag" text,
  "max_redemptions" integer,
  "per_member_limit" integer default 1 not null,
  "min_spend" numeric,
  "expires_at" timestamp with time zone,
  "channels" jsonb default '[]'::jsonb not null,
  "status" text default 'draft'::text not null,
  "redemption_count" integer default 0 not null,
  "created_by" uuid not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);

create table public."loyalty_members" (
  "id" uuid default gen_random_uuid() not null,
  "company_id" uuid not null,
  "contact_id" uuid,
  "email" text,
  "display_name" text not null,
  "points_balance" integer default 0 not null,
  "stamps_balance" integer default 0 not null,
  "tier_id" uuid,
  "referral_code" text not null,
  "referred_by_code" text,
  "status" text default 'active'::text not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);

create table public."loyalty_programs" (
  "company_id" uuid not null,
  "reward_mode" text default 'points'::text not null,
  "points_per_dollar" numeric default 1 not null,
  "stamps_per_reward" integer default 10 not null,
  "referral_bonus_points" integer default 50 not null,
  "enabled" boolean default true not null,
  "updated_at" timestamp with time zone default now() not null
);

create table public."loyalty_redemptions" (
  "id" uuid default gen_random_uuid() not null,
  "company_id" uuid not null,
  "member_id" uuid not null,
  "coupon_id" uuid not null,
  "amount_off" numeric default 0 not null,
  "mode" text default 'simulated'::text not null,
  "abuse_flagged" boolean default false not null,
  "abuse_reason" text,
  "redeemed_at" timestamp with time zone default now() not null
);

create table public."loyalty_referrals" (
  "id" uuid default gen_random_uuid() not null,
  "company_id" uuid not null,
  "referrer_member_id" uuid not null,
  "referee_email" text not null,
  "status" text default 'pending'::text not null,
  "bonus_awarded" integer default 0 not null,
  "created_at" timestamp with time zone default now() not null,
  "completed_at" timestamp with time zone
);

create table public."loyalty_tiers" (
  "id" uuid default gen_random_uuid() not null,
  "company_id" uuid not null,
  "name" text not null,
  "threshold_points" integer default 0 not null,
  "benefits" text default ''::text not null,
  "sort_order" integer default 0 not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);

create table public."managed_approval_requests" (
  "id" uuid default gen_random_uuid() not null,
  "tenant_id" uuid not null,
  "company_id" uuid not null,
  "content_id" uuid,
  "concept_id" uuid,
  "planned_slot_id" uuid,
  "ad_campaign_id" uuid,
  "scope" text not null,
  "recipient_email" text not null,
  "token_hash" text not null,
  "status" text default 'pending'::text not null,
  "due_at" timestamp with time zone not null,
  "revision_round" smallint default 0 not null,
  "superseded_by_id" uuid,
  "reminder_7d_at" timestamp with time zone,
  "reminder_3d_at" timestamp with time zone,
  "staff_escalation_at" timestamp with time zone,
  "reminder_7d_key" text,
  "reminder_3d_key" text,
  "staff_escalation_key" text,
  "reminder_claim_kind" text,
  "reminder_claim_owner" text,
  "reminder_claimed_at" timestamp with time zone,
  "reminder_claim_expires_at" timestamp with time zone,
  "responded_at" timestamp with time zone,
  "response_payload" jsonb,
  "direct_charge_disclosure_accepted_at" timestamp with time zone,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);

create table public."managed_channel_adaptations" (
  "id" uuid default gen_random_uuid() not null,
  "tenant_id" uuid not null,
  "company_id" uuid not null,
  "concept_id" uuid not null,
  "channel_key" text not null,
  "copy" text default ''::text not null,
  "status" text default 'draft'::text not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);

create table public."managed_content_concepts" (
  "id" uuid default gen_random_uuid() not null,
  "tenant_id" uuid not null,
  "company_id" uuid not null,
  "strategy_cycle_id" uuid,
  "campaign_id" uuid,
  "package_period" text not null,
  "unit_key" text not null,
  "title" text not null,
  "theme" text not null,
  "status" text default 'planned'::text not null,
  "reusable_asset_id" uuid,
  "quota_consumed_at" timestamp with time zone,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);

create table public."managed_content_job_events" (
  "event_id" text not null,
  "job_id" text not null,
  "tenant_id" uuid not null,
  "company_id" uuid not null,
  "event_type" text not null,
  "payload_digest" text not null,
  "processing_status" text not null,
  "lease_owner" text,
  "lease_acquired_at" timestamp with time zone,
  "lease_expires_at" timestamp with time zone,
  "received_at" timestamp with time zone default now() not null,
  "completed_at" timestamp with time zone,
  "last_error" text
);

create table public."managed_content_job_exceptions" (
  "id" uuid default gen_random_uuid() not null,
  "job_id" text not null,
  "tenant_id" uuid not null,
  "company_id" uuid not null,
  "kind" text not null,
  "message" text not null,
  "status" text default 'open'::text not null,
  "created_at" timestamp with time zone default now() not null,
  "resolved_at" timestamp with time zone
);

create table public."managed_content_jobs" (
  "id" text not null,
  "tenant_id" uuid not null,
  "company_id" uuid not null,
  "request_id" text not null,
  "concept_id" text not null,
  "strategy_cycle_id" uuid,
  "idempotency_key" text not null,
  "request_fingerprint" text not null,
  "request_payload" jsonb not null,
  "schema_version" text not null,
  "callback_url" text,
  "callback_target" text,
  "external_job_id" text,
  "external_status_url" text,
  "status" text not null,
  "poll_attempts" integer default 0 not null,
  "next_poll_at" timestamp with time zone,
  "last_error" text,
  "result_payload" jsonb,
  "private_provenance" jsonb,
  "imported_concept_id" uuid,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);

create table public."managed_delivery_runs" (
  "id" uuid default gen_random_uuid() not null,
  "tenant_id" uuid not null,
  "company_id" uuid not null,
  "phase" text default 'queued'::text not null,
  "service_level" text default 'approval'::text not null,
  "onboarding_completed_at" timestamp with time zone not null,
  "strategy_due_at" timestamp with time zone not null,
  "strategy_started_at" timestamp with time zone,
  "strategy_completed_at" timestamp with time zone,
  "calendar_completed_at" timestamp with time zone,
  "campaign_id" uuid,
  "strategy_version" integer default 0 not null,
  "calendar_version" integer default 0 not null,
  "missing_info" jsonb default '[]'::jsonb not null,
  "assumptions" jsonb default '[]'::jsonb not null,
  "errors" jsonb default '[]'::jsonb not null,
  "retry_count" integer default 0 not null,
  "status_message_key" text default 'strategy_preparing'::text not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null,
  "strategy_eligible_at" timestamp with time zone,
  "implementation_plan_emailed_at" timestamp with time zone,
  "enqueue_reason" text
);

create table public."managed_engagement_routes" (
  "id" uuid default gen_random_uuid() not null,
  "tenant_id" uuid not null,
  "company_id" uuid not null,
  "source_kind" text not null,
  "source_id" text not null,
  "risk_level" text not null,
  "confidence" numeric(4,3) not null,
  "sentiment" text not null,
  "decision" text not null,
  "reason" text not null,
  "published_at" timestamp with time zone,
  "created_at" timestamp with time zone default now() not null
);

create table public."managed_paid_authorizations" (
  "id" uuid default gen_random_uuid() not null,
  "tenant_id" uuid not null,
  "company_id" uuid not null,
  "ad_campaign_id" uuid not null,
  "month_key" text not null,
  "requested_budget_aud" numeric(12,2) not null,
  "client_monthly_cap_aud" numeric(12,2) not null,
  "creative_approval_id" uuid,
  "budget_targeting_approval_id" uuid,
  "disclosure_accepted_at" timestamp with time zone,
  "status" text default 'pending'::text not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);

create table public."managed_planned_slots" (
  "id" uuid default gen_random_uuid() not null,
  "tenant_id" uuid not null,
  "company_id" uuid not null,
  "concept_id" uuid not null,
  "adaptation_id" uuid not null,
  "planned_publish_at" timestamp with time zone not null,
  "final_content_due_at" timestamp with time zone generated always as ((((planned_publish_at AT TIME ZONE 'UTC'::text) - '14 days'::interval) AT TIME ZONE 'UTC'::text)) stored,
  "status" text default 'planned'::text not null,
  "scheduled_post_id" uuid,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);

create table public."managed_strategy_cycles" (
  "id" uuid default gen_random_uuid() not null,
  "tenant_id" uuid not null,
  "company_id" uuid not null,
  "quarter_start" date not null,
  "status" text default 'draft'::text not null,
  "confirmed_inputs" jsonb default '{}'::jsonb not null,
  "guardrails" jsonb default '{}'::jsonb not null,
  "approved_at" timestamp with time zone,
  "superseded_at" timestamp with time zone,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);

create table public."marketing_requests" (
  "id" uuid default gen_random_uuid() not null,
  "company_id" uuid not null,
  "location_id" text,
  "requester_id" text,
  "request_type" text not null,
  "objective" text not null,
  "target_audience" text,
  "platform" text,
  "topic" text not null,
  "offer" text,
  "call_to_action" text,
  "preferred_date" date,
  "preferred_time" text,
  "urgency" text default 'normal'::text not null,
  "notes" text,
  "consent" jsonb default '{}'::jsonb not null,
  "uploads" jsonb default '[]'::jsonb not null,
  "status" request_status default 'submitted'::request_status not null,
  "assigned_reviewer_id" text,
  "status_history" jsonb default '[]'::jsonb not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);

create table public."marketing_workflow_settings" (
  "company_id" uuid not null,
  "quiet_hours_start" text default '20:00'::text not null,
  "quiet_hours_end" text default '08:00'::text not null,
  "frequency_cap_per_week" integer default 3 not null,
  "updated_by" uuid,
  "updated_at" timestamp with time zone default now() not null
);

create table public."marketing_workflows" (
  "id" uuid default gen_random_uuid() not null,
  "tenant_id" uuid not null,
  "company_id" uuid,
  "name" text not null,
  "description" text,
  "trigger_kind" text default 'manual'::text not null,
  "template_kind" text,
  "status" text default 'draft'::text not null,
  "steps" jsonb default '[]'::jsonb not null,
  "is_agency_template" boolean default false not null,
  "deployed_from_template_id" uuid,
  "created_by" uuid not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);

create table public."menu_designs" (
  "id" uuid default gen_random_uuid() not null,
  "company_id" uuid not null,
  "title" text not null,
  "brief" text not null,
  "format" text default 'both'::text not null,
  "status" text default 'requested'::text not null,
  "billing_class" text default 'included'::text not null,
  "quota_year" integer not null,
  "designer_notes" text,
  "deliverable_asset_ids" jsonb default '[]'::jsonb not null,
  "created_by" text not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);

create table public."offers" (
  "id" uuid default gen_random_uuid() not null,
  "company_id" uuid not null,
  "name" text not null,
  "start_date" date,
  "end_date" date,
  "terms" text,
  "exclusions" text,
  "approved_wording" text default ''::text not null,
  "required_disclaimer" text,
  "channels_allowed" jsonb default '[]'::jsonb not null,
  "status" text default 'draft'::text not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null,
  "promotion_type" text,
  "offer_description" text,
  "discount_amount" numeric,
  "discount_percentage" numeric,
  "coupon_code" text,
  "minimum_purchase_amount" numeric,
  "maximum_discount" numeric,
  "eligible_products" jsonb default '[]'::jsonb not null,
  "eligible_categories" jsonb default '[]'::jsonb not null,
  "eligible_segments" jsonb default '[]'::jsonb not null,
  "excluded_products" jsonb default '[]'::jsonb not null,
  "excluded_customers" jsonb default '[]'::jsonb not null,
  "eligible_regions" jsonb default '[]'::jsonb not null,
  "excluded_regions" jsonb default '[]'::jsonb not null,
  "total_usage_limit" integer,
  "per_customer_usage_limit" integer,
  "redemption_channel" text,
  "inventory_allocation" integer,
  "approval_status" text default 'draft'::text not null,
  "promotion_meta" jsonb default '{}'::jsonb not null
);

create table public."order_menu_items" (
  "id" uuid default gen_random_uuid() not null,
  "company_id" uuid not null,
  "name" text not null,
  "description" text,
  "price_cents" integer not null,
  "category" text default 'General'::text not null,
  "available" boolean default true not null,
  "sort_order" integer default 0 not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);

create table public."ordering_settings" (
  "company_id" uuid not null,
  "pickup_enabled" boolean default true not null,
  "delivery_enabled" boolean default false not null,
  "min_order_cents" integer default 0 not null,
  "button_label" text default 'Order Now'::text not null,
  "stripe_connect_account_id" text,
  "connect_status" text default 'not_started'::text not null,
  "updated_at" timestamp with time zone default now() not null
);

create table public."partner_webhooks" (
  "id" uuid default gen_random_uuid() not null,
  "tenant_id" uuid not null,
  "label" text not null,
  "url" text not null,
  "events" text[] default '{}'::text[] not null,
  "secret_enc" text not null,
  "status" text default 'pending'::text not null,
  "created_by" text not null,
  "verified_at" timestamp with time zone,
  "last_delivery_at" timestamp with time zone,
  "last_delivery_status" text,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);

create table public."photo_marketplace_bookings" (
  "id" uuid default gen_random_uuid() not null,
  "company_id" uuid not null,
  "photographer_id" uuid not null,
  "package_id" uuid not null,
  "photo_shoot_id" uuid not null,
  "scheduled_slot" timestamp with time zone,
  "brief" text,
  "location" text,
  "status" text default 'pending_payment'::text not null,
  "payment_status" text default 'pending'::text not null,
  "payout_status" text default 'held'::text not null,
  "total_cents" integer default 0 not null,
  "marketplace_fee_cents" integer default 0 not null,
  "photographer_payout_cents" integer default 0 not null,
  "stripe_checkout_session_id" text,
  "booked_by" text not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);

create table public."photo_shoots" (
  "id" uuid default gen_random_uuid() not null,
  "company_id" uuid not null,
  "brief" text not null,
  "location" text,
  "scheduled_at" timestamp with time zone,
  "status" text default 'requested'::text not null,
  "photographer_notes" text,
  "deliverable_asset_ids" jsonb default '[]'::jsonb not null,
  "target_content_id" uuid,
  "target_channels" jsonb default '[]'::jsonb not null,
  "created_by" text not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null,
  "marketplace_booking_id" uuid
);

create table public."photographer_packages" (
  "id" uuid default gen_random_uuid() not null,
  "photographer_id" uuid not null,
  "title" text not null,
  "description" text,
  "duration_minutes" integer default 60 not null,
  "price_cents" integer not null,
  "includes" jsonb default '[]'::jsonb not null,
  "active" boolean default true not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);

create table public."photographer_profiles" (
  "id" uuid default gen_random_uuid() not null,
  "tenant_id" uuid,
  "name" text not null,
  "bio" text,
  "specialty" jsonb default '[]'::jsonb not null,
  "service_area" text,
  "stripe_connect_account_id" text,
  "connect_status" text default 'not_started'::text not null,
  "active" boolean default true not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);

create table public."privacy_requests" (
  "id" uuid default gen_random_uuid() not null,
  "tenant_id" uuid not null,
  "company_id" uuid not null,
  "subject_ref" text not null,
  "request_type" text not null,
  "status" text default 'pending'::text not null,
  "lawful_basis" text,
  "jurisdiction" text,
  "due_at" timestamp with time zone,
  "completed_at" timestamp with time zone,
  "notes" text,
  "created_by" text,
  "created_at" timestamp with time zone default now() not null
);

create table public."prompt_templates" (
  "id" uuid default gen_random_uuid() not null,
  "tenant_id" uuid,
  "company_id" uuid,
  "name" text not null,
  "content_type" text not null,
  "topic" text default ''::text not null,
  "objective" text default ''::text not null,
  "audience" text,
  "channel" text,
  "tone" text,
  "active" boolean default true not null,
  "created_by" text,
  "created_at" timestamp with time zone default now() not null
);

create table public."publish_logs" (
  "id" uuid default gen_random_uuid() not null,
  "company_id" uuid not null,
  "platform" text not null,
  "integration_id" uuid,
  "scheduled_post_id" uuid,
  "social_response_id" uuid,
  "content_id" uuid,
  "status" text not null,
  "attempt" integer default 1 not null,
  "detail" text default ''::text not null,
  "actor_id" text,
  "created_at" timestamp with time zone default now() not null
);

create table public."publishing_controls" (
  "tenant_id" uuid not null,
  "freeze_all" boolean default false not null,
  "automated_publishing_disabled" boolean default false not null,
  "social_replies_disabled" boolean default false not null,
  "frozen_company_ids" jsonb default '[]'::jsonb not null,
  "frozen_platforms" jsonb default '[]'::jsonb not null,
  "frozen_campaign_ids" jsonb default '[]'::jsonb not null
);

create table public."publishing_integrations" (
  "id" uuid default gen_random_uuid() not null,
  "company_id" uuid not null,
  "platform" text not null,
  "account_name" text not null,
  "encrypted_token" text not null,
  "token_last_four" text not null,
  "status" text default 'connected'::text not null,
  "connected_by" text,
  "connected_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);

create table public."rag_knowledge_sources" (
  "id" uuid default gen_random_uuid() not null,
  "company_id" uuid not null,
  "title" text not null,
  "source_type" text default 'other'::text not null,
  "status" text default 'draft'::text not null,
  "current_version_id" uuid,
  "approved_version_id" uuid,
  "added_by" text,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);

create table public."rag_knowledge_versions" (
  "id" uuid default gen_random_uuid() not null,
  "source_id" uuid not null,
  "company_id" uuid not null,
  "version_number" integer not null,
  "title" text not null,
  "content" text default ''::text not null,
  "status" text default 'draft'::text not null,
  "file_name" text,
  "content_type" text,
  "superseded_by_id" uuid,
  "created_by" text,
  "created_at" timestamp with time zone default now() not null,
  "approved_by" text,
  "approved_at" timestamp with time zone
);

create table public."recommendation_dismiss_history" (
  "id" uuid default gen_random_uuid() not null,
  "company_id" uuid not null,
  "recommendation_type" text not null,
  "title" text default ''::text not null,
  "reason" text,
  "dismissed_by" text,
  "dismissed_at" timestamp with time zone default now() not null
);

create table public."recommendations" (
  "id" uuid default gen_random_uuid() not null,
  "company_id" uuid not null,
  "type" text not null,
  "title" text not null,
  "rationale" text default ''::text not null,
  "action" jsonb default '{}'::jsonb not null,
  "status" text default 'open'::text not null,
  "created_by" text,
  "result_type" text,
  "result_id" text,
  "created_at" timestamp with time zone default now() not null,
  "score" integer,
  "dismiss_reason" text,
  "snoozed_until" timestamp with time zone,
  "evidence" jsonb default '[]'::jsonb not null
);

create table public."reservations" (
  "id" uuid default gen_random_uuid() not null,
  "company_id" uuid not null,
  "service_period_id" uuid not null,
  "status" text default 'requested'::text not null,
  "guest_name" text not null,
  "guest_email" text not null,
  "guest_phone" text,
  "party_size" integer default 2 not null,
  "scheduled_at" timestamp with time zone not null,
  "notes" text,
  "confirmation_mode" text default 'simulated'::text not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);

create table public."restaurant_orders" (
  "id" uuid default gen_random_uuid() not null,
  "company_id" uuid not null,
  "status" text default 'pending_payment'::text not null,
  "fulfillment" text default 'pickup'::text not null,
  "customer_name" text not null,
  "customer_email" text not null,
  "customer_phone" text,
  "delivery_address" text,
  "lines" jsonb default '[]'::jsonb not null,
  "subtotal_cents" integer default 0 not null,
  "total_cents" integer default 0 not null,
  "notes" text,
  "payment_status" text default 'pending'::text not null,
  "stripe_checkout_session_id" text,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);

create table public."review_request_campaigns" (
  "id" uuid default gen_random_uuid() not null,
  "company_id" uuid not null,
  "name" text not null,
  "channel" text not null,
  "status" text default 'draft'::text not null,
  "message_template" text not null,
  "target_segment" text,
  "sent_count" integer default 0 not null,
  "click_count" integer default 0 not null,
  "review_count" integer default 0 not null,
  "created_by" uuid,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null,
  "activated_at" timestamp with time zone
);

create table public."scheduled_posts" (
  "id" uuid default gen_random_uuid() not null,
  "content_id" uuid not null,
  "company_id" uuid not null,
  "platform" text not null,
  "scheduled_date" date not null,
  "scheduled_time" text,
  "status" text default 'scheduled'::text not null,
  "created_by" text,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);

create table public."security_settings" (
  "tenant_id" uuid not null,
  "crisis_mode" boolean default false not null,
  "crisis_note" text,
  "sandbox_mode" boolean default false not null,
  "retention_days" integer default 730 not null,
  "ai_monthly_cap_usd" numeric default 50 not null,
  "updated_at" timestamp with time zone default now() not null,
  "updated_by" text
);

create table public."services" (
  "id" uuid default gen_random_uuid() not null,
  "company_id" uuid not null,
  "name" text not null,
  "description" text default ''::text not null,
  "target_customer" text,
  "price_range" text,
  "price_approved" boolean default false not null,
  "margin_priority" text default 'medium'::text not null,
  "seasonality" text,
  "locations" jsonb default '[]'::jsonb not null,
  "required_disclaimer" text,
  "restrictions" text,
  "active" boolean default true not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);

create table public."sms_campaigns" (
  "id" uuid default gen_random_uuid() not null,
  "company_id" uuid not null,
  "name" text not null,
  "body" text not null,
  "kind" text default 'promotional'::text not null,
  "status" text default 'draft'::text not null,
  "scheduled_at" timestamp with time zone,
  "sent_at" timestamp with time zone,
  "segment_tag" text,
  "short_link" text,
  "utm_campaign" text,
  "stats" jsonb default '{}'::jsonb not null,
  "created_by" text,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);

create table public."sms_company_settings" (
  "company_id" uuid not null,
  "country_code" text default 'AU'::text not null,
  "sender_id" text default ''::text not null,
  "quiet_hours_start" text default '20:00'::text not null,
  "quiet_hours_end" text default '08:00'::text not null,
  "monthly_spend_cap_usd" numeric,
  "updated_by" text,
  "updated_at" timestamp with time zone default now() not null
);

create table public."sms_subscribers" (
  "id" uuid default gen_random_uuid() not null,
  "company_id" uuid not null,
  "phone_e164" text not null,
  "name" text,
  "tags" jsonb default '[]'::jsonb not null,
  "consent_status" text default 'pending'::text not null,
  "consented_at" timestamp with time zone,
  "opted_out_at" timestamp with time zone,
  "source" text default 'manual'::text not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);

create table public."social_mentions" (
  "id" uuid default gen_random_uuid() not null,
  "company_id" uuid not null,
  "platform" text not null,
  "external_id" text,
  "author_name" text not null,
  "text" text not null,
  "received_at" timestamp with time zone default now() not null,
  "status" text default 'new'::text not null,
  "linked_draft_id" uuid,
  "created_at" timestamp with time zone default now() not null
);

create table public."social_responses" (
  "id" uuid default gen_random_uuid() not null,
  "company_id" uuid not null,
  "platform" text not null,
  "original_comment" text not null,
  "sentiment" text not null,
  "intent" text not null,
  "risk_level" risk_level not null,
  "escalation_required" boolean default false not null,
  "draft_response" text not null,
  "status" text default 'pending_approval'::text not null,
  "created_by" text,
  "approved_by" text,
  "created_at" timestamp with time zone default now() not null,
  "library_ref" text
);

create table public."stripe_webhook_events" (
  "event_id" text not null,
  "event_type" text not null,
  "processed_at" timestamp with time zone default now() not null
);

create table public."tasks" (
  "id" uuid default gen_random_uuid() not null,
  "company_id" uuid not null,
  "title" text not null,
  "detail" text,
  "status" text default 'open'::text not null,
  "source_recommendation_id" uuid,
  "created_by" text,
  "created_at" timestamp with time zone default now() not null,
  "done_at" timestamp with time zone
);

create table public."tax_invoices" (
  "id" uuid default gen_random_uuid() not null,
  "tenant_id" uuid not null,
  "company_id" uuid not null,
  "invoice_number" text not null,
  "kind" text not null,
  "status" text default 'issued'::text not null,
  "currency" text default 'usd'::text not null,
  "seller" jsonb default '{}'::jsonb not null,
  "buyer" jsonb default '{}'::jsonb not null,
  "lines" jsonb default '[]'::jsonb not null,
  "subtotal_ex_gst" numeric default 0 not null,
  "gst_amount" numeric default 0 not null,
  "total_inc_gst" numeric default 0 not null,
  "gst_inclusive" boolean default true not null,
  "notes" text,
  "related_type" text,
  "related_id" text,
  "credits_invoice_id" uuid,
  "stripe_checkout_session_id" text,
  "stripe_payment_intent_id" text,
  "stripe_invoice_id" text,
  "issued_at" timestamp with time zone default now() not null,
  "voided_at" timestamp with time zone,
  "created_by" text,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);

create table public."tenant_members" (
  "tenant_id" uuid not null,
  "user_id" uuid not null,
  "role" text default 'member'::text not null,
  "role_title" text,
  "created_at" timestamp with time zone default now() not null,
  "portal_only" boolean default false not null,
  "capabilities" jsonb default '[]'::jsonb not null
);

create table public."tenants" (
  "id" uuid default gen_random_uuid() not null,
  "name" text not null,
  "kind" text default 'business_group'::text not null,
  "plan" text default 'starter'::text not null,
  "status" text default 'active'::text not null,
  "stripe_customer_id" text,
  "stripe_subscription_id" text,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null,
  "branding" jsonb,
  "onboarding" jsonb,
  "onboarding_completed_at" timestamp with time zone,
  "timezone" text,
  "promo_catalog" jsonb,
  "marketing_package_catalog" jsonb,
  "promo_industries" jsonb
);

create table public."terms_acceptances" (
  "id" uuid default gen_random_uuid() not null,
  "user_id" uuid not null,
  "tenant_id" uuid not null,
  "version" integer not null,
  "accepted_at" timestamp with time zone default now() not null,
  "ip" text,
  "kind" text default 'terms'::text not null
);

create table public."terms_versions" (
  "id" uuid default gen_random_uuid() not null,
  "version" integer not null,
  "title" text not null,
  "body" text not null,
  "summary" text,
  "effective_date" date not null,
  "active" boolean default true not null,
  "published_by" text,
  "published_at" timestamp with time zone default now() not null,
  "notified_at" timestamp with time zone,
  "notified_count" integer,
  "kind" text default 'terms'::text not null
);

create table public."utm_links" (
  "id" uuid default gen_random_uuid() not null,
  "company_id" uuid not null,
  "destination_url" text not null,
  "source" text not null,
  "medium" text not null,
  "campaign" text not null,
  "content_type" text,
  "campaign_id" uuid,
  "content_id" uuid,
  "request_id" uuid,
  "created_by" text,
  "created_at" timestamp with time zone default now() not null
);

create table public."workflow_dispatch_logs" (
  "id" uuid default gen_random_uuid() not null,
  "workflow_id" uuid not null,
  "company_id" uuid not null,
  "contact_id" uuid,
  "channel" text not null,
  "step_id" text not null,
  "status" text not null,
  "detail" text default ''::text not null,
  "created_at" timestamp with time zone default now() not null
);

alter table only public."ad_accounts" add constraint "ad_accounts_pkey" PRIMARY KEY (id);
alter table only public."ad_budgets" add constraint "ad_budgets_pkey" PRIMARY KEY (company_id);
alter table only public."ad_campaigns" add constraint "ad_campaigns_pkey" PRIMARY KEY (id);
alter table only public."agency_portfolio_snapshots" add constraint "agency_portfolio_snapshots_pkey" PRIMARY KEY (id);
alter table only public."ai_campaign_recommendations" add constraint "ai_campaign_recommendations_pkey" PRIMARY KEY (id);
alter table only public."ai_mos_opportunities" add constraint "ai_mos_opportunities_pkey" PRIMARY KEY (id);
alter table only public."ai_mos_signal_runs" add constraint "ai_mos_signal_runs_pkey" PRIMARY KEY (id);
alter table only public."ai_orchestration_runs" add constraint "ai_orchestration_runs_pkey" PRIMARY KEY (id);
alter table only public."ai_prompt_versions" add constraint "ai_prompt_versions_pkey" PRIMARY KEY (id);
alter table only public."ai_prompt_versions" add constraint "ai_prompt_versions_tenant_id_prompt_key_version_key" UNIQUE (tenant_id, prompt_key, version);
alter table only public."ai_runs" add constraint "ai_runs_pkey" PRIMARY KEY (id);
alter table only public."api_keys" add constraint "api_keys_pkey" PRIMARY KEY (id);
alter table only public."app_users" add constraint "app_users_email_key" UNIQUE (email);
alter table only public."app_users" add constraint "app_users_pkey" PRIMARY KEY (id);
alter table only public."approval_policies" add constraint "approval_policies_pkey" PRIMARY KEY (id);
alter table only public."approved_claims" add constraint "approved_claims_pkey" PRIMARY KEY (id);
alter table only public."approved_responses" add constraint "approved_responses_pkey" PRIMARY KEY (id);
alter table only public."assets" add constraint "assets_pkey" PRIMARY KEY (id);
alter table only public."audience_segments" add constraint "audience_segments_pkey" PRIMARY KEY (id);
alter table only public."audit_logs" add constraint "audit_logs_pkey" PRIMARY KEY (id);
alter table only public."automation_runs" add constraint "automation_runs_pkey" PRIMARY KEY (id);
alter table only public."automation_settings" add constraint "automation_settings_pkey" PRIMARY KEY (tenant_id);
alter table only public."booking_service_periods" add constraint "booking_service_periods_pkey" PRIMARY KEY (id);
alter table only public."booking_settings" add constraint "booking_settings_pkey" PRIMARY KEY (company_id);
alter table only public."brand_templates" add constraint "brand_templates_pkey" PRIMARY KEY (id);
alter table only public."campaign_builder_runs" add constraint "campaign_builder_runs_pkey" PRIMARY KEY (id);
alter table only public."campaign_draft_schedule_items" add constraint "campaign_draft_schedule_items_pkey" PRIMARY KEY (id);
alter table only public."campaign_experiments" add constraint "campaign_experiments_pkey" PRIMARY KEY (id);
alter table only public."campaign_items" add constraint "campaign_items_pkey" PRIMARY KEY (id);
alter table only public."campaign_performance_snapshots" add constraint "campaign_performance_snapshots_pkey" PRIMARY KEY (id);
alter table only public."campaign_plan_versions" add constraint "campaign_plan_versions_pkey" PRIMARY KEY (id);
alter table only public."campaigns" add constraint "campaigns_pkey" PRIMARY KEY (id);
alter table only public."cms_page_versions" add constraint "cms_page_versions_page_id_version_number_key" UNIQUE (page_id, version_number);
alter table only public."cms_page_versions" add constraint "cms_page_versions_pkey" PRIMARY KEY (id);
alter table only public."cms_pages" add constraint "cms_pages_company_id_slug_key" UNIQUE (company_id, slug);
alter table only public."cms_pages" add constraint "cms_pages_pkey" PRIMARY KEY (id);
alter table only public."cms_seo_metadata" add constraint "cms_seo_metadata_page_id_key" UNIQUE (page_id);
alter table only public."cms_seo_metadata" add constraint "cms_seo_metadata_pkey" PRIMARY KEY (id);
alter table only public."cms_update_requests" add constraint "cms_update_requests_pkey" PRIMARY KEY (id);
alter table only public."companies" add constraint "companies_pkey" PRIMARY KEY (id);
alter table only public."company_access" add constraint "company_access_pkey" PRIMARY KEY (user_id, company_id);
alter table only public."company_credit_ledger" add constraint "company_credit_ledger_pkey" PRIMARY KEY (id);
alter table only public."company_credit_wallets" add constraint "company_credit_wallets_company_unique" UNIQUE (company_id);
alter table only public."company_credit_wallets" add constraint "company_credit_wallets_pkey" PRIMARY KEY (id);
alter table only public."company_documents" add constraint "company_documents_pkey" PRIMARY KEY (id);
alter table only public."company_entitlements" add constraint "company_entitlements_company_id_addon_id_key" UNIQUE (company_id, addon_id);
alter table only public."company_entitlements" add constraint "company_entitlements_pkey" PRIMARY KEY (id);
alter table only public."company_reviews" add constraint "company_reviews_pkey" PRIMARY KEY (id);
alter table only public."connect_invites" add constraint "connect_invites_pkey" PRIMARY KEY (id);
alter table only public."connect_invites" add constraint "connect_invites_token_key" UNIQUE (token);
alter table only public."consents" add constraint "consents_pkey" PRIMARY KEY (id);
alter table only public."content_comments" add constraint "content_comments_pkey" PRIMARY KEY (id);
alter table only public."content_items" add constraint "content_items_pkey" PRIMARY KEY (id);
alter table only public."conversion_funnels" add constraint "conversion_funnels_pkey" PRIMARY KEY (id);
alter table only public."crm_contacts" add constraint "crm_contacts_pkey" PRIMARY KEY (id);
alter table only public."crm_interactions" add constraint "crm_interactions_pkey" PRIMARY KEY (id);
alter table only public."crm_segments" add constraint "crm_segments_pkey" PRIMARY KEY (id);
alter table only public."email_campaigns" add constraint "email_campaigns_pkey" PRIMARY KEY (id);
alter table only public."email_subscribers" add constraint "email_subscribers_company_id_email_key" UNIQUE (company_id, email);
alter table only public."email_subscribers" add constraint "email_subscribers_pkey" PRIMARY KEY (id);
alter table only public."email_templates" add constraint "email_templates_pkey" PRIMARY KEY (id);
alter table only public."evidence" add constraint "evidence_pkey" PRIMARY KEY (id);
alter table only public."funnel_ab_experiments" add constraint "funnel_ab_experiments_pkey" PRIMARY KEY (id);
alter table only public."funnel_journeys" add constraint "funnel_journeys_pkey" PRIMARY KEY (id);
alter table only public."funnel_landing_pages" add constraint "funnel_landing_pages_company_id_slug_key" UNIQUE (company_id, slug);
alter table only public."funnel_landing_pages" add constraint "funnel_landing_pages_pkey" PRIMARY KEY (id);
alter table only public."knowledge_documents" add constraint "knowledge_documents_pkey" PRIMARY KEY (id);
alter table only public."knowledge_gaps" add constraint "knowledge_gaps_pkey" PRIMARY KEY (id);
alter table only public."leads" add constraint "leads_pkey" PRIMARY KEY (id);
alter table only public."learning_hypotheses" add constraint "learning_hypotheses_pkey" PRIMARY KEY (id);
alter table only public."learning_lessons" add constraint "learning_lessons_pkey" PRIMARY KEY (id);
alter table only public."legal_holds" add constraint "legal_holds_pkey" PRIMARY KEY (id);
alter table only public."local_area_profiles" add constraint "local_area_profiles_pkey" PRIMARY KEY (company_id);
alter table only public."loyalty_coupons" add constraint "loyalty_coupons_pkey" PRIMARY KEY (id);
alter table only public."loyalty_members" add constraint "loyalty_members_pkey" PRIMARY KEY (id);
alter table only public."loyalty_programs" add constraint "loyalty_programs_pkey" PRIMARY KEY (company_id);
alter table only public."loyalty_redemptions" add constraint "loyalty_redemptions_pkey" PRIMARY KEY (id);
alter table only public."loyalty_referrals" add constraint "loyalty_referrals_pkey" PRIMARY KEY (id);
alter table only public."loyalty_tiers" add constraint "loyalty_tiers_pkey" PRIMARY KEY (id);
alter table only public."managed_approval_requests" add constraint "managed_approval_requests_pkey" PRIMARY KEY (id);
alter table only public."managed_approval_requests" add constraint "managed_approval_requests_reminder_3d_key_key" UNIQUE (reminder_3d_key);
alter table only public."managed_approval_requests" add constraint "managed_approval_requests_reminder_7d_key_key" UNIQUE (reminder_7d_key);
alter table only public."managed_approval_requests" add constraint "managed_approval_requests_staff_escalation_key_key" UNIQUE (staff_escalation_key);
alter table only public."managed_approval_requests" add constraint "managed_approval_requests_token_hash_key" UNIQUE (token_hash);
alter table only public."managed_channel_adaptations" add constraint "managed_channel_adaptations_concept_id_channel_key_key" UNIQUE (concept_id, channel_key);
alter table only public."managed_channel_adaptations" add constraint "managed_channel_adaptations_pkey" PRIMARY KEY (id);
alter table only public."managed_content_concepts" add constraint "managed_content_concepts_company_id_package_period_unit_key_key" UNIQUE (company_id, package_period, unit_key);
alter table only public."managed_content_concepts" add constraint "managed_content_concepts_pkey" PRIMARY KEY (id);
alter table only public."managed_content_job_events" add constraint "managed_content_job_events_pkey" PRIMARY KEY (event_id);
alter table only public."managed_content_job_exceptions" add constraint "managed_content_job_exceptions_job_id_kind_key" UNIQUE (job_id, kind);
alter table only public."managed_content_job_exceptions" add constraint "managed_content_job_exceptions_pkey" PRIMARY KEY (id);
alter table only public."managed_content_jobs" add constraint "managed_content_jobs_external_job_id_key" UNIQUE (external_job_id);
alter table only public."managed_content_jobs" add constraint "managed_content_jobs_pkey" PRIMARY KEY (id);
alter table only public."managed_content_jobs" add constraint "managed_content_jobs_tenant_id_idempotency_key_key" UNIQUE (tenant_id, idempotency_key);
alter table only public."managed_delivery_runs" add constraint "managed_delivery_runs_pkey" PRIMARY KEY (id);
alter table only public."managed_engagement_routes" add constraint "managed_engagement_routes_company_id_source_kind_source_id_key" UNIQUE (company_id, source_kind, source_id);
alter table only public."managed_engagement_routes" add constraint "managed_engagement_routes_pkey" PRIMARY KEY (id);
alter table only public."managed_paid_authorizations" add constraint "managed_paid_authorizations_ad_campaign_id_month_key_key" UNIQUE (ad_campaign_id, month_key);
alter table only public."managed_paid_authorizations" add constraint "managed_paid_authorizations_pkey" PRIMARY KEY (id);
alter table only public."managed_planned_slots" add constraint "managed_planned_slots_adaptation_id_planned_publish_at_key" UNIQUE (adaptation_id, planned_publish_at);
alter table only public."managed_planned_slots" add constraint "managed_planned_slots_pkey" PRIMARY KEY (id);
alter table only public."managed_strategy_cycles" add constraint "managed_strategy_cycles_company_id_quarter_start_key" UNIQUE (company_id, quarter_start);
alter table only public."managed_strategy_cycles" add constraint "managed_strategy_cycles_pkey" PRIMARY KEY (id);
alter table only public."marketing_requests" add constraint "marketing_requests_pkey" PRIMARY KEY (id);
alter table only public."marketing_workflow_settings" add constraint "marketing_workflow_settings_pkey" PRIMARY KEY (company_id);
alter table only public."marketing_workflows" add constraint "marketing_workflows_pkey" PRIMARY KEY (id);
alter table only public."menu_designs" add constraint "menu_designs_pkey" PRIMARY KEY (id);
alter table only public."offers" add constraint "offers_pkey" PRIMARY KEY (id);
alter table only public."order_menu_items" add constraint "order_menu_items_pkey" PRIMARY KEY (id);
alter table only public."ordering_settings" add constraint "ordering_settings_pkey" PRIMARY KEY (company_id);
alter table only public."partner_webhooks" add constraint "partner_webhooks_pkey" PRIMARY KEY (id);
alter table only public."photo_marketplace_bookings" add constraint "photo_marketplace_bookings_pkey" PRIMARY KEY (id);
alter table only public."photo_shoots" add constraint "photo_shoots_pkey" PRIMARY KEY (id);
alter table only public."photographer_packages" add constraint "photographer_packages_pkey" PRIMARY KEY (id);
alter table only public."photographer_profiles" add constraint "photographer_profiles_pkey" PRIMARY KEY (id);
alter table only public."privacy_requests" add constraint "privacy_requests_pkey" PRIMARY KEY (id);
alter table only public."prompt_templates" add constraint "prompt_templates_pkey" PRIMARY KEY (id);
alter table only public."publish_logs" add constraint "publish_logs_pkey" PRIMARY KEY (id);
alter table only public."publishing_controls" add constraint "publishing_controls_pkey" PRIMARY KEY (tenant_id);
alter table only public."publishing_integrations" add constraint "publishing_integrations_pkey" PRIMARY KEY (id);
alter table only public."rag_knowledge_sources" add constraint "rag_knowledge_sources_pkey" PRIMARY KEY (id);
alter table only public."rag_knowledge_versions" add constraint "rag_knowledge_versions_pkey" PRIMARY KEY (id);
alter table only public."rag_knowledge_versions" add constraint "rag_knowledge_versions_source_id_version_number_key" UNIQUE (source_id, version_number);
alter table only public."recommendation_dismiss_history" add constraint "recommendation_dismiss_history_pkey" PRIMARY KEY (id);
alter table only public."recommendations" add constraint "recommendations_pkey" PRIMARY KEY (id);
alter table only public."reservations" add constraint "reservations_pkey" PRIMARY KEY (id);
alter table only public."restaurant_orders" add constraint "restaurant_orders_pkey" PRIMARY KEY (id);
alter table only public."review_request_campaigns" add constraint "review_request_campaigns_pkey" PRIMARY KEY (id);
alter table only public."scheduled_posts" add constraint "scheduled_posts_pkey" PRIMARY KEY (id);
alter table only public."security_settings" add constraint "security_settings_pkey" PRIMARY KEY (tenant_id);
alter table only public."services" add constraint "services_pkey" PRIMARY KEY (id);
alter table only public."sms_campaigns" add constraint "sms_campaigns_pkey" PRIMARY KEY (id);
alter table only public."sms_company_settings" add constraint "sms_company_settings_pkey" PRIMARY KEY (company_id);
alter table only public."sms_subscribers" add constraint "sms_subscribers_company_id_phone_e164_key" UNIQUE (company_id, phone_e164);
alter table only public."sms_subscribers" add constraint "sms_subscribers_pkey" PRIMARY KEY (id);
alter table only public."social_mentions" add constraint "social_mentions_pkey" PRIMARY KEY (id);
alter table only public."social_responses" add constraint "social_responses_pkey" PRIMARY KEY (id);
alter table only public."stripe_webhook_events" add constraint "stripe_webhook_events_pkey" PRIMARY KEY (event_id);
alter table only public."tasks" add constraint "tasks_pkey" PRIMARY KEY (id);
alter table only public."tax_invoices" add constraint "tax_invoices_number_tenant_unique" UNIQUE (tenant_id, invoice_number);
alter table only public."tax_invoices" add constraint "tax_invoices_pkey" PRIMARY KEY (id);
alter table only public."tenant_members" add constraint "tenant_members_pkey" PRIMARY KEY (tenant_id, user_id);
alter table only public."tenants" add constraint "tenants_pkey" PRIMARY KEY (id);
alter table only public."terms_acceptances" add constraint "terms_acceptances_pkey" PRIMARY KEY (id);
alter table only public."terms_versions" add constraint "terms_versions_pkey" PRIMARY KEY (id);
alter table only public."utm_links" add constraint "utm_links_pkey" PRIMARY KEY (id);
alter table only public."workflow_dispatch_logs" add constraint "workflow_dispatch_logs_pkey" PRIMARY KEY (id);

create UNIQUE INDEX ad_campaigns_id_company_unique_idx ON public.ad_campaigns USING btree (id, company_id);
create UNIQUE INDEX assets_id_company_unique_idx ON public.assets USING btree (id, company_id);
create UNIQUE INDEX campaigns_id_company_unique_idx ON public.campaigns USING btree (id, company_id);
create UNIQUE INDEX companies_id_tenant_unique_idx ON public.companies USING btree (id, tenant_id);
create UNIQUE INDEX content_items_id_company_unique_idx ON public.content_items USING btree (id, company_id);
create UNIQUE INDEX idx_api_keys_prefix ON public.api_keys USING btree (key_prefix);
create UNIQUE INDEX idx_company_reviews_external ON public.company_reviews USING btree (company_id, platform, external_id) WHERE (external_id IS NOT NULL);
create UNIQUE INDEX idx_leads_external_dedup ON public.leads USING btree (company_id, platform, external_lead_id) WHERE (external_lead_id IS NOT NULL);
create UNIQUE INDEX managed_approval_requests_id_tenant_company_unique_idx ON public.managed_approval_requests USING btree (id, tenant_id, company_id);
create UNIQUE INDEX managed_channel_adaptations_id_tenant_company_unique_idx ON public.managed_channel_adaptations USING btree (id, tenant_id, company_id);
create UNIQUE INDEX managed_content_concepts_id_company_unique_idx ON public.managed_content_concepts USING btree (id, company_id);
create UNIQUE INDEX managed_content_concepts_id_tenant_company_unique_idx ON public.managed_content_concepts USING btree (id, tenant_id, company_id);
create UNIQUE INDEX managed_content_jobs_id_tenant_company_unique_idx ON public.managed_content_jobs USING btree (id, tenant_id, company_id);
create UNIQUE INDEX managed_planned_slots_id_tenant_company_unique_idx ON public.managed_planned_slots USING btree (id, tenant_id, company_id);
create UNIQUE INDEX managed_strategy_cycles_id_tenant_company_unique_idx ON public.managed_strategy_cycles USING btree (id, tenant_id, company_id);
create UNIQUE INDEX scheduled_posts_id_company_unique_idx ON public.scheduled_posts USING btree (id, company_id);
create UNIQUE INDEX tax_invoices_stripe_session_unique ON public.tax_invoices USING btree (stripe_checkout_session_id) WHERE (stripe_checkout_session_id IS NOT NULL);
create UNIQUE INDEX tenants_stripe_customer_idx ON public.tenants USING btree (stripe_customer_id);
create UNIQUE INDEX terms_versions_kind_version_uidx ON public.terms_versions USING btree (kind, version);

alter table only public."company_reviews" add constraint "company_reviews_rating_check" CHECK (rating >= 1 AND rating <= 5);
alter table only public."managed_approval_requests" add constraint "managed_approval_requests_reminder_claim_kind_check" CHECK (reminder_claim_kind = ANY (ARRAY['client_7d'::text, 'client_3d'::text, 'staff_1d'::text]));
alter table only public."managed_approval_requests" add constraint "managed_approval_requests_revision_round_check" CHECK (revision_round >= 0 AND revision_round <= 2);
alter table only public."managed_content_job_events" add constraint "managed_content_job_events_processing_status_check" CHECK (processing_status = ANY (ARRAY['processing'::text, 'completed'::text, 'failed'::text]));
alter table only public."managed_content_job_exceptions" add constraint "managed_content_job_exceptions_status_check" CHECK (status = ANY (ARRAY['open'::text, 'resolved'::text]));
alter table only public."managed_content_jobs" add constraint "managed_content_jobs_callback_target_check" CHECK (callback_target = 'command-centre'::text);
alter table only public."managed_content_jobs" add constraint "managed_content_jobs_check" CHECK ((callback_url IS NOT NULL) <> (callback_target IS NOT NULL));
alter table only public."managed_content_jobs" add constraint "managed_content_jobs_poll_attempts_check" CHECK (poll_attempts >= 0);
alter table only public."managed_content_jobs" add constraint "managed_content_jobs_schema_version_check" CHECK (schema_version = '1.0'::text);
alter table only public."managed_engagement_routes" add constraint "managed_engagement_routes_confidence_check" CHECK (confidence >= 0::numeric AND confidence <= 1::numeric);
alter table only public."managed_paid_authorizations" add constraint "managed_paid_authorizations_client_monthly_cap_aud_check" CHECK (client_monthly_cap_aud >= 0::numeric);
alter table only public."managed_paid_authorizations" add constraint "managed_paid_authorizations_requested_budget_aud_check" CHECK (requested_budget_aud >= 0::numeric);
alter table only public."terms_acceptances" add constraint "terms_acceptances_kind_check" CHECK (kind = ANY (ARRAY['terms'::text, 'privacy'::text]));
alter table only public."terms_versions" add constraint "terms_versions_kind_check" CHECK (kind = ANY (ARRAY['terms'::text, 'privacy'::text]));

alter table only public."ad_accounts" add constraint "ad_accounts_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table only public."ad_budgets" add constraint "ad_budgets_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table only public."ad_campaigns" add constraint "ad_campaigns_ad_account_id_fkey" FOREIGN KEY (ad_account_id) REFERENCES ad_accounts(id) ON DELETE SET NULL;
alter table only public."ad_campaigns" add constraint "ad_campaigns_audience_segment_id_fkey" FOREIGN KEY (audience_segment_id) REFERENCES audience_segments(id) ON DELETE SET NULL;
alter table only public."ad_campaigns" add constraint "ad_campaigns_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table only public."agency_portfolio_snapshots" add constraint "agency_portfolio_snapshots_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table only public."agency_portfolio_snapshots" add constraint "agency_portfolio_snapshots_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
alter table only public."ai_campaign_recommendations" add constraint "ai_campaign_recommendations_campaign_id_fkey" FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE SET NULL;
alter table only public."ai_campaign_recommendations" add constraint "ai_campaign_recommendations_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table only public."ai_campaign_recommendations" add constraint "ai_campaign_recommendations_orchestration_run_id_fkey" FOREIGN KEY (orchestration_run_id) REFERENCES ai_orchestration_runs(id) ON DELETE SET NULL;
alter table only public."ai_campaign_recommendations" add constraint "ai_campaign_recommendations_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
alter table only public."ai_mos_opportunities" add constraint "ai_mos_opportunities_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table only public."ai_mos_opportunities" add constraint "ai_mos_opportunities_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
alter table only public."ai_mos_signal_runs" add constraint "ai_mos_signal_runs_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table only public."ai_mos_signal_runs" add constraint "ai_mos_signal_runs_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
alter table only public."ai_orchestration_runs" add constraint "ai_orchestration_runs_campaign_id_fkey" FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE SET NULL;
alter table only public."ai_orchestration_runs" add constraint "ai_orchestration_runs_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table only public."ai_orchestration_runs" add constraint "ai_orchestration_runs_prompt_version_id_fkey" FOREIGN KEY (prompt_version_id) REFERENCES ai_prompt_versions(id) ON DELETE SET NULL;
alter table only public."ai_orchestration_runs" add constraint "ai_orchestration_runs_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
alter table only public."ai_prompt_versions" add constraint "ai_prompt_versions_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
alter table only public."ai_runs" add constraint "ai_runs_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL;
alter table only public."ai_runs" add constraint "ai_runs_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
alter table only public."api_keys" add constraint "api_keys_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
alter table only public."app_users" add constraint "app_users_id_fkey" FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table only public."approval_policies" add constraint "approval_policies_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
alter table only public."approved_claims" add constraint "approved_claims_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table only public."approved_claims" add constraint "approved_claims_evidence_id_fkey" FOREIGN KEY (evidence_id) REFERENCES evidence(id) ON DELETE SET NULL;
alter table only public."approved_responses" add constraint "approved_responses_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table only public."approved_responses" add constraint "approved_responses_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
alter table only public."assets" add constraint "assets_ai_run_id_fkey" FOREIGN KEY (ai_run_id) REFERENCES ai_runs(id) ON DELETE SET NULL;
alter table only public."assets" add constraint "assets_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table only public."audience_segments" add constraint "audience_segments_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table only public."audit_logs" add constraint "audit_logs_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL;
alter table only public."audit_logs" add constraint "audit_logs_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
alter table only public."automation_runs" add constraint "automation_runs_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
alter table only public."automation_settings" add constraint "automation_settings_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
alter table only public."booking_service_periods" add constraint "booking_service_periods_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table only public."booking_settings" add constraint "booking_settings_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table only public."brand_templates" add constraint "brand_templates_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table only public."brand_templates" add constraint "brand_templates_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
alter table only public."campaign_builder_runs" add constraint "campaign_builder_runs_ai_run_id_fkey" FOREIGN KEY (ai_run_id) REFERENCES ai_runs(id) ON DELETE SET NULL;
alter table only public."campaign_builder_runs" add constraint "campaign_builder_runs_campaign_id_fkey" FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE SET NULL;
alter table only public."campaign_builder_runs" add constraint "campaign_builder_runs_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table only public."campaign_builder_runs" add constraint "campaign_builder_runs_plan_version_id_fkey" FOREIGN KEY (plan_version_id) REFERENCES campaign_plan_versions(id) ON DELETE SET NULL;
alter table only public."campaign_draft_schedule_items" add constraint "campaign_draft_schedule_items_campaign_id_fkey" FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE;
alter table only public."campaign_draft_schedule_items" add constraint "campaign_draft_schedule_items_campaign_item_id_fkey" FOREIGN KEY (campaign_item_id) REFERENCES campaign_items(id) ON DELETE SET NULL;
alter table only public."campaign_draft_schedule_items" add constraint "campaign_draft_schedule_items_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table only public."campaign_draft_schedule_items" add constraint "campaign_draft_schedule_items_content_id_fkey" FOREIGN KEY (content_id) REFERENCES content_items(id) ON DELETE SET NULL;
alter table only public."campaign_draft_schedule_items" add constraint "campaign_draft_schedule_items_plan_version_id_fkey" FOREIGN KEY (plan_version_id) REFERENCES campaign_plan_versions(id) ON DELETE SET NULL;
alter table only public."campaign_experiments" add constraint "campaign_experiments_campaign_id_fkey" FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE;
alter table only public."campaign_experiments" add constraint "campaign_experiments_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table only public."campaign_items" add constraint "campaign_items_campaign_id_fkey" FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE;
alter table only public."campaign_items" add constraint "campaign_items_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table only public."campaign_items" add constraint "campaign_items_content_id_fkey" FOREIGN KEY (content_id) REFERENCES content_items(id) ON DELETE SET NULL;
alter table only public."campaign_performance_snapshots" add constraint "campaign_performance_snapshots_campaign_id_fkey" FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE;
alter table only public."campaign_performance_snapshots" add constraint "campaign_performance_snapshots_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table only public."campaign_performance_snapshots" add constraint "campaign_performance_snapshots_content_id_fkey" FOREIGN KEY (content_id) REFERENCES content_items(id) ON DELETE SET NULL;
alter table only public."campaign_performance_snapshots" add constraint "campaign_performance_snapshots_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
alter table only public."campaign_plan_versions" add constraint "campaign_plan_versions_campaign_id_fkey" FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE;
alter table only public."campaign_plan_versions" add constraint "campaign_plan_versions_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table only public."campaigns" add constraint "campaigns_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table only public."campaigns" add constraint "campaigns_offer_id_fkey" FOREIGN KEY (offer_id) REFERENCES offers(id) ON DELETE SET NULL;
alter table only public."campaigns" add constraint "campaigns_request_id_fkey" FOREIGN KEY (request_id) REFERENCES marketing_requests(id) ON DELETE SET NULL;
alter table only public."cms_page_versions" add constraint "cms_page_versions_approved_by_fkey" FOREIGN KEY (approved_by) REFERENCES app_users(id);
alter table only public."cms_page_versions" add constraint "cms_page_versions_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table only public."cms_page_versions" add constraint "cms_page_versions_created_by_fkey" FOREIGN KEY (created_by) REFERENCES app_users(id);
alter table only public."cms_page_versions" add constraint "cms_page_versions_page_id_fkey" FOREIGN KEY (page_id) REFERENCES cms_pages(id) ON DELETE CASCADE;
alter table only public."cms_pages" add constraint "cms_pages_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table only public."cms_pages" add constraint "cms_pages_created_by_fkey" FOREIGN KEY (created_by) REFERENCES app_users(id);
alter table only public."cms_seo_metadata" add constraint "cms_seo_metadata_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table only public."cms_seo_metadata" add constraint "cms_seo_metadata_page_id_fkey" FOREIGN KEY (page_id) REFERENCES cms_pages(id) ON DELETE CASCADE;
alter table only public."cms_update_requests" add constraint "cms_update_requests_assigned_to_fkey" FOREIGN KEY (assigned_to) REFERENCES app_users(id);
alter table only public."cms_update_requests" add constraint "cms_update_requests_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table only public."cms_update_requests" add constraint "cms_update_requests_page_id_fkey" FOREIGN KEY (page_id) REFERENCES cms_pages(id) ON DELETE SET NULL;
alter table only public."cms_update_requests" add constraint "cms_update_requests_requested_by_fkey" FOREIGN KEY (requested_by) REFERENCES app_users(id);
alter table only public."companies" add constraint "companies_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
alter table only public."company_access" add constraint "company_access_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table only public."company_access" add constraint "company_access_user_id_fkey" FOREIGN KEY (user_id) REFERENCES app_users(id) ON DELETE CASCADE;
alter table only public."company_credit_ledger" add constraint "company_credit_ledger_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table only public."company_credit_ledger" add constraint "company_credit_ledger_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
alter table only public."company_credit_ledger" add constraint "company_credit_ledger_wallet_id_fkey" FOREIGN KEY (wallet_id) REFERENCES company_credit_wallets(id) ON DELETE CASCADE;
alter table only public."company_credit_wallets" add constraint "company_credit_wallets_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table only public."company_credit_wallets" add constraint "company_credit_wallets_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
alter table only public."company_documents" add constraint "company_documents_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table only public."company_entitlements" add constraint "company_entitlements_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table only public."company_reviews" add constraint "company_reviews_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table only public."company_reviews" add constraint "company_reviews_created_by_fkey" FOREIGN KEY (created_by) REFERENCES app_users(id);
alter table only public."connect_invites" add constraint "connect_invites_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table only public."connect_invites" add constraint "connect_invites_integration_id_fkey" FOREIGN KEY (integration_id) REFERENCES publishing_integrations(id) ON DELETE SET NULL;
alter table only public."connect_invites" add constraint "connect_invites_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
alter table only public."consents" add constraint "consents_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table only public."content_comments" add constraint "content_comments_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table only public."content_comments" add constraint "content_comments_content_id_fkey" FOREIGN KEY (content_id) REFERENCES content_items(id) ON DELETE CASCADE;
alter table only public."content_items" add constraint "content_campaign_fk" FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE SET NULL;
alter table only public."content_items" add constraint "content_campaign_item_fk" FOREIGN KEY (campaign_item_id) REFERENCES campaign_items(id) ON DELETE SET NULL;
alter table only public."content_items" add constraint "content_items_ai_run_id_fkey" FOREIGN KEY (ai_run_id) REFERENCES ai_runs(id) ON DELETE SET NULL;
alter table only public."content_items" add constraint "content_items_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table only public."content_items" add constraint "content_items_managed_concept_company_fk" FOREIGN KEY (managed_concept_id, company_id) REFERENCES managed_content_concepts(id, company_id);
alter table only public."content_items" add constraint "content_items_managed_concept_id_fkey" FOREIGN KEY (managed_concept_id) REFERENCES managed_content_concepts(id) ON DELETE SET NULL;
alter table only public."content_items" add constraint "content_items_request_id_fkey" FOREIGN KEY (request_id) REFERENCES marketing_requests(id) ON DELETE SET NULL;
alter table only public."content_items" add constraint "content_repurposed_fk" FOREIGN KEY (repurposed_from_id) REFERENCES content_items(id) ON DELETE SET NULL;
alter table only public."conversion_funnels" add constraint "conversion_funnels_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table only public."conversion_funnels" add constraint "conversion_funnels_journey_id_fkey" FOREIGN KEY (journey_id) REFERENCES funnel_journeys(id) ON DELETE SET NULL;
alter table only public."crm_contacts" add constraint "crm_contacts_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table only public."crm_contacts" add constraint "crm_contacts_lead_id_fkey" FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE SET NULL;
alter table only public."crm_interactions" add constraint "crm_interactions_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table only public."crm_interactions" add constraint "crm_interactions_contact_id_fkey" FOREIGN KEY (contact_id) REFERENCES crm_contacts(id) ON DELETE CASCADE;
alter table only public."crm_segments" add constraint "crm_segments_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table only public."email_campaigns" add constraint "email_campaigns_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table only public."email_campaigns" add constraint "email_campaigns_template_id_fkey" FOREIGN KEY (template_id) REFERENCES email_templates(id) ON DELETE RESTRICT;
alter table only public."email_subscribers" add constraint "email_subscribers_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table only public."email_templates" add constraint "email_templates_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table only public."evidence" add constraint "evidence_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table only public."funnel_ab_experiments" add constraint "funnel_ab_experiments_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table only public."funnel_ab_experiments" add constraint "funnel_ab_experiments_funnel_id_fkey" FOREIGN KEY (funnel_id) REFERENCES conversion_funnels(id) ON DELETE SET NULL;
alter table only public."funnel_ab_experiments" add constraint "funnel_ab_experiments_landing_page_id_fkey" FOREIGN KEY (landing_page_id) REFERENCES funnel_landing_pages(id) ON DELETE SET NULL;
alter table only public."funnel_journeys" add constraint "funnel_journeys_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table only public."funnel_landing_pages" add constraint "funnel_landing_pages_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table only public."funnel_landing_pages" add constraint "funnel_landing_pages_funnel_id_fkey" FOREIGN KEY (funnel_id) REFERENCES conversion_funnels(id) ON DELETE SET NULL;
alter table only public."knowledge_documents" add constraint "knowledge_documents_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table only public."knowledge_gaps" add constraint "knowledge_gaps_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table only public."knowledge_gaps" add constraint "knowledge_gaps_request_id_fkey" FOREIGN KEY (request_id) REFERENCES marketing_requests(id) ON DELETE SET NULL;
alter table only public."leads" add constraint "leads_ad_campaign_id_fkey" FOREIGN KEY (ad_campaign_id) REFERENCES ad_campaigns(id) ON DELETE SET NULL;
alter table only public."leads" add constraint "leads_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table only public."learning_hypotheses" add constraint "learning_hypotheses_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table only public."learning_hypotheses" add constraint "learning_hypotheses_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
alter table only public."learning_lessons" add constraint "learning_lessons_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table only public."learning_lessons" add constraint "learning_lessons_hypothesis_id_fkey" FOREIGN KEY (hypothesis_id) REFERENCES learning_hypotheses(id) ON DELETE SET NULL;
alter table only public."learning_lessons" add constraint "learning_lessons_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
alter table only public."legal_holds" add constraint "legal_holds_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table only public."legal_holds" add constraint "legal_holds_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
alter table only public."local_area_profiles" add constraint "local_area_profiles_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table only public."loyalty_coupons" add constraint "loyalty_coupons_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table only public."loyalty_members" add constraint "loyalty_members_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table only public."loyalty_members" add constraint "loyalty_members_contact_id_fkey" FOREIGN KEY (contact_id) REFERENCES crm_contacts(id) ON DELETE SET NULL;
alter table only public."loyalty_members" add constraint "loyalty_members_tier_id_fkey" FOREIGN KEY (tier_id) REFERENCES loyalty_tiers(id) ON DELETE SET NULL;
alter table only public."loyalty_programs" add constraint "loyalty_programs_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table only public."loyalty_redemptions" add constraint "loyalty_redemptions_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table only public."loyalty_redemptions" add constraint "loyalty_redemptions_coupon_id_fkey" FOREIGN KEY (coupon_id) REFERENCES loyalty_coupons(id) ON DELETE CASCADE;
alter table only public."loyalty_redemptions" add constraint "loyalty_redemptions_member_id_fkey" FOREIGN KEY (member_id) REFERENCES loyalty_members(id) ON DELETE CASCADE;
alter table only public."loyalty_referrals" add constraint "loyalty_referrals_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table only public."loyalty_referrals" add constraint "loyalty_referrals_referrer_member_id_fkey" FOREIGN KEY (referrer_member_id) REFERENCES loyalty_members(id) ON DELETE CASCADE;
alter table only public."loyalty_tiers" add constraint "loyalty_tiers_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table only public."managed_approval_requests" add constraint "managed_approval_requests_ad_campaign_company_fk" FOREIGN KEY (ad_campaign_id, company_id) REFERENCES ad_campaigns(id, company_id) ON DELETE CASCADE;
alter table only public."managed_approval_requests" add constraint "managed_approval_requests_ad_campaign_id_fkey" FOREIGN KEY (ad_campaign_id) REFERENCES ad_campaigns(id) ON DELETE CASCADE;
alter table only public."managed_approval_requests" add constraint "managed_approval_requests_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table only public."managed_approval_requests" add constraint "managed_approval_requests_company_tenant_fk" FOREIGN KEY (company_id, tenant_id) REFERENCES companies(id, tenant_id) ON DELETE CASCADE;
alter table only public."managed_approval_requests" add constraint "managed_approval_requests_concept_id_fkey" FOREIGN KEY (concept_id) REFERENCES managed_content_concepts(id) ON DELETE CASCADE;
alter table only public."managed_approval_requests" add constraint "managed_approval_requests_concept_tenant_company_fk" FOREIGN KEY (concept_id, tenant_id, company_id) REFERENCES managed_content_concepts(id, tenant_id, company_id) ON DELETE CASCADE;
alter table only public."managed_approval_requests" add constraint "managed_approval_requests_content_company_fk" FOREIGN KEY (content_id, company_id) REFERENCES content_items(id, company_id) ON DELETE CASCADE;
alter table only public."managed_approval_requests" add constraint "managed_approval_requests_content_id_fkey" FOREIGN KEY (content_id) REFERENCES content_items(id) ON DELETE CASCADE;
alter table only public."managed_approval_requests" add constraint "managed_approval_requests_planned_slot_id_fkey" FOREIGN KEY (planned_slot_id) REFERENCES managed_planned_slots(id) ON DELETE CASCADE;
alter table only public."managed_approval_requests" add constraint "managed_approval_requests_slot_tenant_company_fk" FOREIGN KEY (planned_slot_id, tenant_id, company_id) REFERENCES managed_planned_slots(id, tenant_id, company_id) ON DELETE CASCADE;
alter table only public."managed_approval_requests" add constraint "managed_approval_requests_superseded_by_id_fkey" FOREIGN KEY (superseded_by_id) REFERENCES managed_approval_requests(id) ON DELETE SET NULL;
alter table only public."managed_approval_requests" add constraint "managed_approval_requests_superseded_tenant_company_fk" FOREIGN KEY (superseded_by_id, tenant_id, company_id) REFERENCES managed_approval_requests(id, tenant_id, company_id);
alter table only public."managed_approval_requests" add constraint "managed_approval_requests_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
alter table only public."managed_channel_adaptations" add constraint "managed_channel_adaptations_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table only public."managed_channel_adaptations" add constraint "managed_channel_adaptations_company_tenant_fk" FOREIGN KEY (company_id, tenant_id) REFERENCES companies(id, tenant_id) ON DELETE CASCADE;
alter table only public."managed_channel_adaptations" add constraint "managed_channel_adaptations_concept_id_fkey" FOREIGN KEY (concept_id) REFERENCES managed_content_concepts(id) ON DELETE CASCADE;
alter table only public."managed_channel_adaptations" add constraint "managed_channel_adaptations_concept_tenant_company_fk" FOREIGN KEY (concept_id, tenant_id, company_id) REFERENCES managed_content_concepts(id, tenant_id, company_id) ON DELETE CASCADE;
alter table only public."managed_channel_adaptations" add constraint "managed_channel_adaptations_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
alter table only public."managed_content_concepts" add constraint "managed_content_concepts_asset_company_fk" FOREIGN KEY (reusable_asset_id, company_id) REFERENCES assets(id, company_id);
alter table only public."managed_content_concepts" add constraint "managed_content_concepts_campaign_company_fk" FOREIGN KEY (campaign_id, company_id) REFERENCES campaigns(id, company_id);
alter table only public."managed_content_concepts" add constraint "managed_content_concepts_campaign_id_fkey" FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE SET NULL;
alter table only public."managed_content_concepts" add constraint "managed_content_concepts_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table only public."managed_content_concepts" add constraint "managed_content_concepts_company_tenant_fk" FOREIGN KEY (company_id, tenant_id) REFERENCES companies(id, tenant_id) ON DELETE CASCADE;
alter table only public."managed_content_concepts" add constraint "managed_content_concepts_reusable_asset_id_fkey" FOREIGN KEY (reusable_asset_id) REFERENCES assets(id) ON DELETE SET NULL;
alter table only public."managed_content_concepts" add constraint "managed_content_concepts_strategy_cycle_id_fkey" FOREIGN KEY (strategy_cycle_id) REFERENCES managed_strategy_cycles(id) ON DELETE SET NULL;
alter table only public."managed_content_concepts" add constraint "managed_content_concepts_strategy_tenant_company_fk" FOREIGN KEY (strategy_cycle_id, tenant_id, company_id) REFERENCES managed_strategy_cycles(id, tenant_id, company_id);
alter table only public."managed_content_concepts" add constraint "managed_content_concepts_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
alter table only public."managed_content_job_events" add constraint "managed_content_job_events_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table only public."managed_content_job_events" add constraint "managed_content_job_events_job_id_fkey" FOREIGN KEY (job_id) REFERENCES managed_content_jobs(id) ON DELETE CASCADE;
alter table only public."managed_content_job_events" add constraint "managed_content_job_events_job_tenant_company_fk" FOREIGN KEY (job_id, tenant_id, company_id) REFERENCES managed_content_jobs(id, tenant_id, company_id) ON DELETE CASCADE;
alter table only public."managed_content_job_events" add constraint "managed_content_job_events_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
alter table only public."managed_content_job_exceptions" add constraint "managed_content_job_exceptions_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table only public."managed_content_job_exceptions" add constraint "managed_content_job_exceptions_job_id_fkey" FOREIGN KEY (job_id) REFERENCES managed_content_jobs(id) ON DELETE CASCADE;
alter table only public."managed_content_job_exceptions" add constraint "managed_content_job_exceptions_job_tenant_company_fk" FOREIGN KEY (job_id, tenant_id, company_id) REFERENCES managed_content_jobs(id, tenant_id, company_id) ON DELETE CASCADE;
alter table only public."managed_content_job_exceptions" add constraint "managed_content_job_exceptions_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
alter table only public."managed_content_jobs" add constraint "managed_content_jobs_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table only public."managed_content_jobs" add constraint "managed_content_jobs_company_tenant_fk" FOREIGN KEY (company_id, tenant_id) REFERENCES companies(id, tenant_id) ON DELETE CASCADE;
alter table only public."managed_content_jobs" add constraint "managed_content_jobs_imported_concept_id_fkey" FOREIGN KEY (imported_concept_id) REFERENCES managed_content_concepts(id) ON DELETE SET NULL;
alter table only public."managed_content_jobs" add constraint "managed_content_jobs_imported_concept_tenant_company_fk" FOREIGN KEY (imported_concept_id, tenant_id, company_id) REFERENCES managed_content_concepts(id, tenant_id, company_id) ON DELETE SET NULL (imported_concept_id);
alter table only public."managed_content_jobs" add constraint "managed_content_jobs_strategy_cycle_id_fkey" FOREIGN KEY (strategy_cycle_id) REFERENCES managed_strategy_cycles(id) ON DELETE SET NULL;
alter table only public."managed_content_jobs" add constraint "managed_content_jobs_strategy_tenant_company_fk" FOREIGN KEY (strategy_cycle_id, tenant_id, company_id) REFERENCES managed_strategy_cycles(id, tenant_id, company_id) ON DELETE SET NULL (strategy_cycle_id);
alter table only public."managed_content_jobs" add constraint "managed_content_jobs_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
alter table only public."managed_delivery_runs" add constraint "managed_delivery_runs_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table only public."managed_delivery_runs" add constraint "managed_delivery_runs_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
alter table only public."managed_engagement_routes" add constraint "managed_engagement_routes_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table only public."managed_engagement_routes" add constraint "managed_engagement_routes_company_tenant_fk" FOREIGN KEY (company_id, tenant_id) REFERENCES companies(id, tenant_id) ON DELETE CASCADE;
alter table only public."managed_engagement_routes" add constraint "managed_engagement_routes_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
alter table only public."managed_paid_authorizations" add constraint "managed_paid_authorizations_ad_campaign_company_fk" FOREIGN KEY (ad_campaign_id, company_id) REFERENCES ad_campaigns(id, company_id) ON DELETE CASCADE;
alter table only public."managed_paid_authorizations" add constraint "managed_paid_authorizations_ad_campaign_id_fkey" FOREIGN KEY (ad_campaign_id) REFERENCES ad_campaigns(id) ON DELETE CASCADE;
alter table only public."managed_paid_authorizations" add constraint "managed_paid_authorizations_budget_approval_tenant_company_fk" FOREIGN KEY (budget_targeting_approval_id, tenant_id, company_id) REFERENCES managed_approval_requests(id, tenant_id, company_id) ON DELETE RESTRICT;
alter table only public."managed_paid_authorizations" add constraint "managed_paid_authorizations_budget_targeting_approval_id_fkey" FOREIGN KEY (budget_targeting_approval_id) REFERENCES managed_approval_requests(id) ON DELETE RESTRICT;
alter table only public."managed_paid_authorizations" add constraint "managed_paid_authorizations_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table only public."managed_paid_authorizations" add constraint "managed_paid_authorizations_company_tenant_fk" FOREIGN KEY (company_id, tenant_id) REFERENCES companies(id, tenant_id) ON DELETE CASCADE;
alter table only public."managed_paid_authorizations" add constraint "managed_paid_authorizations_creative_approval_id_fkey" FOREIGN KEY (creative_approval_id) REFERENCES managed_approval_requests(id) ON DELETE RESTRICT;
alter table only public."managed_paid_authorizations" add constraint "managed_paid_authorizations_creative_approval_tenant_company_fk" FOREIGN KEY (creative_approval_id, tenant_id, company_id) REFERENCES managed_approval_requests(id, tenant_id, company_id) ON DELETE RESTRICT;
alter table only public."managed_paid_authorizations" add constraint "managed_paid_authorizations_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
alter table only public."managed_planned_slots" add constraint "managed_planned_slots_adaptation_id_fkey" FOREIGN KEY (adaptation_id) REFERENCES managed_channel_adaptations(id) ON DELETE CASCADE;
alter table only public."managed_planned_slots" add constraint "managed_planned_slots_adaptation_tenant_company_fk" FOREIGN KEY (adaptation_id, tenant_id, company_id) REFERENCES managed_channel_adaptations(id, tenant_id, company_id) ON DELETE CASCADE;
alter table only public."managed_planned_slots" add constraint "managed_planned_slots_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table only public."managed_planned_slots" add constraint "managed_planned_slots_company_tenant_fk" FOREIGN KEY (company_id, tenant_id) REFERENCES companies(id, tenant_id) ON DELETE CASCADE;
alter table only public."managed_planned_slots" add constraint "managed_planned_slots_concept_id_fkey" FOREIGN KEY (concept_id) REFERENCES managed_content_concepts(id) ON DELETE CASCADE;
alter table only public."managed_planned_slots" add constraint "managed_planned_slots_concept_tenant_company_fk" FOREIGN KEY (concept_id, tenant_id, company_id) REFERENCES managed_content_concepts(id, tenant_id, company_id) ON DELETE CASCADE;
alter table only public."managed_planned_slots" add constraint "managed_planned_slots_scheduled_post_company_fk" FOREIGN KEY (scheduled_post_id, company_id) REFERENCES scheduled_posts(id, company_id);
alter table only public."managed_planned_slots" add constraint "managed_planned_slots_scheduled_post_id_fkey" FOREIGN KEY (scheduled_post_id) REFERENCES scheduled_posts(id) ON DELETE SET NULL;
alter table only public."managed_planned_slots" add constraint "managed_planned_slots_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
alter table only public."managed_strategy_cycles" add constraint "managed_strategy_cycles_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table only public."managed_strategy_cycles" add constraint "managed_strategy_cycles_company_tenant_fk" FOREIGN KEY (company_id, tenant_id) REFERENCES companies(id, tenant_id) ON DELETE CASCADE;
alter table only public."managed_strategy_cycles" add constraint "managed_strategy_cycles_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
alter table only public."marketing_requests" add constraint "marketing_requests_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table only public."marketing_workflow_settings" add constraint "marketing_workflow_settings_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table only public."marketing_workflows" add constraint "marketing_workflows_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table only public."marketing_workflows" add constraint "marketing_workflows_deployed_from_template_id_fkey" FOREIGN KEY (deployed_from_template_id) REFERENCES marketing_workflows(id) ON DELETE SET NULL;
alter table only public."marketing_workflows" add constraint "marketing_workflows_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
alter table only public."menu_designs" add constraint "menu_designs_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table only public."offers" add constraint "offers_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table only public."order_menu_items" add constraint "order_menu_items_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table only public."ordering_settings" add constraint "ordering_settings_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table only public."partner_webhooks" add constraint "partner_webhooks_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
alter table only public."photo_marketplace_bookings" add constraint "photo_marketplace_bookings_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table only public."photo_marketplace_bookings" add constraint "photo_marketplace_bookings_package_id_fkey" FOREIGN KEY (package_id) REFERENCES photographer_packages(id) ON DELETE RESTRICT;
alter table only public."photo_marketplace_bookings" add constraint "photo_marketplace_bookings_photo_shoot_id_fkey" FOREIGN KEY (photo_shoot_id) REFERENCES photo_shoots(id) ON DELETE CASCADE;
alter table only public."photo_marketplace_bookings" add constraint "photo_marketplace_bookings_photographer_id_fkey" FOREIGN KEY (photographer_id) REFERENCES photographer_profiles(id) ON DELETE RESTRICT;
alter table only public."photo_shoots" add constraint "photo_shoots_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table only public."photo_shoots" add constraint "photo_shoots_marketplace_booking_id_fkey" FOREIGN KEY (marketplace_booking_id) REFERENCES photo_marketplace_bookings(id) ON DELETE SET NULL;
alter table only public."photo_shoots" add constraint "photo_shoots_target_content_id_fkey" FOREIGN KEY (target_content_id) REFERENCES content_items(id) ON DELETE SET NULL;
alter table only public."photographer_packages" add constraint "photographer_packages_photographer_id_fkey" FOREIGN KEY (photographer_id) REFERENCES photographer_profiles(id) ON DELETE CASCADE;
alter table only public."photographer_profiles" add constraint "photographer_profiles_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
alter table only public."privacy_requests" add constraint "privacy_requests_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table only public."privacy_requests" add constraint "privacy_requests_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
alter table only public."prompt_templates" add constraint "prompt_templates_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table only public."prompt_templates" add constraint "prompt_templates_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
alter table only public."publish_logs" add constraint "publish_logs_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table only public."publish_logs" add constraint "publish_logs_content_id_fkey" FOREIGN KEY (content_id) REFERENCES content_items(id) ON DELETE SET NULL;
alter table only public."publish_logs" add constraint "publish_logs_integration_id_fkey" FOREIGN KEY (integration_id) REFERENCES publishing_integrations(id) ON DELETE SET NULL;
alter table only public."publish_logs" add constraint "publish_logs_scheduled_post_id_fkey" FOREIGN KEY (scheduled_post_id) REFERENCES scheduled_posts(id) ON DELETE SET NULL;
alter table only public."publish_logs" add constraint "publish_logs_social_response_id_fkey" FOREIGN KEY (social_response_id) REFERENCES social_responses(id) ON DELETE SET NULL;
alter table only public."publishing_controls" add constraint "publishing_controls_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
alter table only public."publishing_integrations" add constraint "publishing_integrations_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table only public."rag_knowledge_sources" add constraint "rag_knowledge_sources_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table only public."rag_knowledge_versions" add constraint "rag_knowledge_versions_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table only public."rag_knowledge_versions" add constraint "rag_knowledge_versions_source_id_fkey" FOREIGN KEY (source_id) REFERENCES rag_knowledge_sources(id) ON DELETE CASCADE;
alter table only public."rag_knowledge_versions" add constraint "rag_knowledge_versions_superseded_by_id_fkey" FOREIGN KEY (superseded_by_id) REFERENCES rag_knowledge_versions(id) ON DELETE SET NULL;
alter table only public."recommendation_dismiss_history" add constraint "recommendation_dismiss_history_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table only public."recommendations" add constraint "recommendations_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table only public."reservations" add constraint "reservations_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table only public."reservations" add constraint "reservations_service_period_id_fkey" FOREIGN KEY (service_period_id) REFERENCES booking_service_periods(id) ON DELETE CASCADE;
alter table only public."restaurant_orders" add constraint "restaurant_orders_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table only public."review_request_campaigns" add constraint "review_request_campaigns_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table only public."review_request_campaigns" add constraint "review_request_campaigns_created_by_fkey" FOREIGN KEY (created_by) REFERENCES app_users(id);
alter table only public."scheduled_posts" add constraint "scheduled_posts_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table only public."scheduled_posts" add constraint "scheduled_posts_content_id_fkey" FOREIGN KEY (content_id) REFERENCES content_items(id) ON DELETE CASCADE;
alter table only public."security_settings" add constraint "security_settings_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
alter table only public."services" add constraint "services_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table only public."sms_campaigns" add constraint "sms_campaigns_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table only public."sms_company_settings" add constraint "sms_company_settings_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table only public."sms_subscribers" add constraint "sms_subscribers_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table only public."social_mentions" add constraint "social_mentions_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table only public."social_mentions" add constraint "social_mentions_linked_draft_id_fkey" FOREIGN KEY (linked_draft_id) REFERENCES social_responses(id) ON DELETE SET NULL;
alter table only public."social_responses" add constraint "social_responses_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table only public."tasks" add constraint "tasks_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table only public."tasks" add constraint "tasks_source_recommendation_id_fkey" FOREIGN KEY (source_recommendation_id) REFERENCES recommendations(id) ON DELETE SET NULL;
alter table only public."tax_invoices" add constraint "tax_invoices_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table only public."tax_invoices" add constraint "tax_invoices_credits_invoice_id_fkey" FOREIGN KEY (credits_invoice_id) REFERENCES tax_invoices(id) ON DELETE SET NULL;
alter table only public."tax_invoices" add constraint "tax_invoices_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
alter table only public."tenant_members" add constraint "tenant_members_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
alter table only public."tenant_members" add constraint "tenant_members_user_id_fkey" FOREIGN KEY (user_id) REFERENCES app_users(id) ON DELETE CASCADE;
alter table only public."terms_acceptances" add constraint "terms_acceptances_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
alter table only public."terms_acceptances" add constraint "terms_acceptances_user_id_fkey" FOREIGN KEY (user_id) REFERENCES app_users(id) ON DELETE CASCADE;
alter table only public."utm_links" add constraint "utm_links_campaign_id_fkey" FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE SET NULL;
alter table only public."utm_links" add constraint "utm_links_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table only public."utm_links" add constraint "utm_links_content_id_fkey" FOREIGN KEY (content_id) REFERENCES content_items(id) ON DELETE SET NULL;
alter table only public."utm_links" add constraint "utm_links_request_id_fkey" FOREIGN KEY (request_id) REFERENCES marketing_requests(id) ON DELETE SET NULL;
alter table only public."workflow_dispatch_logs" add constraint "workflow_dispatch_logs_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table only public."workflow_dispatch_logs" add constraint "workflow_dispatch_logs_workflow_id_fkey" FOREIGN KEY (workflow_id) REFERENCES marketing_workflows(id) ON DELETE CASCADE;

create INDEX ai_campaign_recommendations_campaign_idx ON public.ai_campaign_recommendations USING btree (campaign_id) WHERE (campaign_id IS NOT NULL);
create INDEX ai_campaign_recommendations_company_idx ON public.ai_campaign_recommendations USING btree (company_id, created_at DESC);
create INDEX ai_mos_opportunities_company_idx ON public.ai_mos_opportunities USING btree (company_id);
create INDEX ai_mos_opportunities_tenant_idx ON public.ai_mos_opportunities USING btree (tenant_id);
create INDEX ai_mos_signal_runs_company_idx ON public.ai_mos_signal_runs USING btree (company_id);
create INDEX ai_mos_signal_runs_tenant_idx ON public.ai_mos_signal_runs USING btree (tenant_id);
create INDEX ai_orchestration_runs_company_idx ON public.ai_orchestration_runs USING btree (company_id, created_at DESC);
create INDEX ai_prompt_versions_active_idx ON public.ai_prompt_versions USING btree (prompt_key) WHERE (active = true);
create INDEX approval_policies_tenant_idx ON public.approval_policies USING btree (tenant_id, entity_type) WHERE (active = true);
create INDEX campaign_builder_runs_company_idx ON public.campaign_builder_runs USING btree (company_id);
create INDEX campaign_draft_schedule_campaign_idx ON public.campaign_draft_schedule_items USING btree (campaign_id);
create INDEX campaign_experiments_campaign_idx ON public.campaign_experiments USING btree (campaign_id);
create INDEX campaign_experiments_company_idx ON public.campaign_experiments USING btree (company_id);
create INDEX campaign_performance_snapshots_campaign_idx ON public.campaign_performance_snapshots USING btree (campaign_id, period_start DESC);
create INDEX campaign_plan_versions_campaign_idx ON public.campaign_plan_versions USING btree (campaign_id);
create INDEX companies_tenant_idx ON public.companies USING btree (tenant_id);
create INDEX company_credit_ledger_company_idx ON public.company_credit_ledger USING btree (company_id, created_at DESC);
create INDEX company_credit_ledger_kind_day_idx ON public.company_credit_ledger USING btree (company_id, kind, created_at DESC);
create INDEX company_credit_ledger_wallet_idx ON public.company_credit_ledger USING btree (wallet_id, created_at DESC);
create INDEX company_credit_wallets_tenant_idx ON public.company_credit_wallets USING btree (tenant_id);
create INDEX content_comments_content_idx ON public.content_comments USING btree (content_id);
create INDEX idx_ad_accounts_company ON public.ad_accounts USING btree (company_id);
create INDEX idx_ad_campaigns_company ON public.ad_campaigns USING btree (company_id);
create INDEX idx_ad_campaigns_external ON public.ad_campaigns USING btree (external_campaign_id) WHERE (external_campaign_id IS NOT NULL);
create INDEX idx_ai_runs_tenant_month ON public.ai_runs USING btree (tenant_id, created_at);
create INDEX idx_api_keys_tenant ON public.api_keys USING btree (tenant_id);
create INDEX idx_audience_segments_company ON public.audience_segments USING btree (company_id);
create INDEX idx_booking_service_periods_company ON public.booking_service_periods USING btree (company_id);
create INDEX idx_company_entitlements_company ON public.company_entitlements USING btree (company_id);
create INDEX idx_connect_invites_company ON public.connect_invites USING btree (company_id);
create INDEX idx_connect_invites_pending ON public.connect_invites USING btree (tenant_id, status) WHERE (status = 'pending'::text);
create INDEX idx_connect_invites_tenant ON public.connect_invites USING btree (tenant_id);
create INDEX idx_connect_invites_token ON public.connect_invites USING btree (token);
create INDEX idx_conversion_funnels_company ON public.conversion_funnels USING btree (company_id);
create INDEX idx_email_campaigns_company ON public.email_campaigns USING btree (company_id);
create INDEX idx_email_subscribers_company ON public.email_subscribers USING btree (company_id);
create INDEX idx_email_templates_company ON public.email_templates USING btree (company_id);
create INDEX idx_funnel_ab_experiments_company ON public.funnel_ab_experiments USING btree (company_id);
create INDEX idx_funnel_journeys_company ON public.funnel_journeys USING btree (company_id);
create INDEX idx_funnel_landing_pages_company ON public.funnel_landing_pages USING btree (company_id);
create INDEX idx_leads_company ON public.leads USING btree (company_id);
create INDEX idx_menu_designs_company ON public.menu_designs USING btree (company_id);
create INDEX idx_menu_designs_quota ON public.menu_designs USING btree (company_id, quota_year, billing_class);
create INDEX idx_order_menu_items_company ON public.order_menu_items USING btree (company_id);
create INDEX idx_partner_webhooks_tenant ON public.partner_webhooks USING btree (tenant_id);
create INDEX idx_photo_marketplace_bookings_company ON public.photo_marketplace_bookings USING btree (company_id);
create INDEX idx_photo_shoots_company ON public.photo_shoots USING btree (company_id);
create INDEX idx_photographer_packages_photographer ON public.photographer_packages USING btree (photographer_id);
create INDEX idx_photographer_profiles_tenant ON public.photographer_profiles USING btree (tenant_id);
create INDEX idx_publish_logs_company_created ON public.publish_logs USING btree (company_id, created_at DESC);
create INDEX idx_publish_logs_scheduled_post ON public.publish_logs USING btree (scheduled_post_id, created_at DESC) WHERE (scheduled_post_id IS NOT NULL);
create INDEX idx_reservations_company ON public.reservations USING btree (company_id);
create INDEX idx_reservations_scheduled ON public.reservations USING btree (company_id, scheduled_at);
create INDEX idx_reservations_status ON public.reservations USING btree (company_id, status);
create INDEX idx_restaurant_orders_company ON public.restaurant_orders USING btree (company_id);
create INDEX idx_restaurant_orders_status ON public.restaurant_orders USING btree (company_id, status);
create INDEX idx_scheduled_posts_status_date ON public.scheduled_posts USING btree (status, scheduled_date);
create INDEX idx_sms_campaigns_company ON public.sms_campaigns USING btree (company_id);
create INDEX idx_sms_subscribers_company ON public.sms_subscribers USING btree (company_id);
create INDEX idx_stripe_webhook_events_processed_at ON public.stripe_webhook_events USING btree (processed_at);
create INDEX idx_terms_acceptances_tenant ON public.terms_acceptances USING btree (tenant_id);
create INDEX idx_terms_acceptances_user_kind ON public.terms_acceptances USING btree (user_id, kind, version);
create INDEX idx_terms_versions_kind_active ON public.terms_versions USING btree (kind, active, version DESC);
create INDEX learning_hypotheses_company_idx ON public.learning_hypotheses USING btree (company_id);
create INDEX learning_hypotheses_tenant_idx ON public.learning_hypotheses USING btree (tenant_id);
create INDEX learning_lessons_company_idx ON public.learning_lessons USING btree (company_id);
create INDEX learning_lessons_tenant_idx ON public.learning_lessons USING btree (tenant_id);
create INDEX managed_approval_requests_content_idx ON public.managed_approval_requests USING btree (content_id, created_at DESC);
create INDEX managed_approval_requests_due_idx ON public.managed_approval_requests USING btree (tenant_id, status, due_at);
create INDEX managed_content_concepts_quota_idx ON public.managed_content_concepts USING btree (tenant_id, company_id, package_period);
create INDEX managed_content_job_events_job_idx ON public.managed_content_job_events USING btree (job_id, received_at DESC);
create INDEX managed_content_job_events_lease_idx ON public.managed_content_job_events USING btree (lease_expires_at) WHERE (processing_status = 'processing'::text);
create INDEX managed_content_job_exceptions_open_idx ON public.managed_content_job_exceptions USING btree (tenant_id, status, created_at DESC);
create INDEX managed_content_jobs_poll_idx ON public.managed_content_jobs USING btree (tenant_id, next_poll_at) WHERE (status = ANY (ARRAY['accepted'::text, 'processing'::text]));
create INDEX managed_delivery_runs_company_idx ON public.managed_delivery_runs USING btree (company_id, created_at DESC);
create INDEX managed_delivery_runs_due_idx ON public.managed_delivery_runs USING btree (tenant_id, strategy_due_at);
create INDEX managed_delivery_runs_tenant_phase_idx ON public.managed_delivery_runs USING btree (tenant_id, phase);
create INDEX managed_engagement_routes_queue_idx ON public.managed_engagement_routes USING btree (tenant_id, decision, created_at);
create INDEX managed_planned_slots_horizon_idx ON public.managed_planned_slots USING btree (tenant_id, planned_publish_at, status);
create INDEX managed_strategy_cycles_due_idx ON public.managed_strategy_cycles USING btree (tenant_id, quarter_start, status);
create INDEX privacy_requests_company_idx ON public.privacy_requests USING btree (company_id, created_at DESC);
create INDEX privacy_requests_subject_idx ON public.privacy_requests USING btree (company_id, subject_ref);
create INDEX privacy_requests_tenant_status_idx ON public.privacy_requests USING btree (tenant_id, status);
create INDEX social_mentions_company_idx ON public.social_mentions USING btree (company_id);
create INDEX tax_invoices_company_issued_idx ON public.tax_invoices USING btree (company_id, issued_at DESC);
create INDEX tax_invoices_tenant_issued_idx ON public.tax_invoices USING btree (tenant_id, issued_at DESC);

CREATE OR REPLACE FUNCTION public.claim_managed_approval_reminder(p_request_id uuid, p_kind text, p_owner text, p_now timestamp with time zone, p_lease_seconds integer DEFAULT 300)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare claimed_count integer;
begin
  if p_kind not in ('client_7d', 'client_3d', 'staff_1d') then
    raise exception 'Invalid reminder kind';
  end if;
  update managed_approval_requests
  set reminder_claim_kind = p_kind,
      reminder_claim_owner = p_owner,
      reminder_claimed_at = p_now,
      reminder_claim_expires_at = p_now + make_interval(secs => p_lease_seconds),
      updated_at = p_now
  where id = p_request_id
    and status = 'pending'
    and (reminder_claim_expires_at is null or reminder_claim_expires_at <= p_now)
    and case p_kind
      when 'client_7d' then reminder_7d_at is null
      when 'client_3d' then reminder_3d_at is null
      else staff_escalation_at is null
    end;
  get diagnostics claimed_count = row_count;
  return claimed_count = 1;
end;
$function$;

revoke all on function public."claim_managed_approval_reminder"(p_request_id uuid, p_kind text, p_owner text, p_now timestamp with time zone, p_lease_seconds integer) from public, anon, authenticated, service_role;
grant execute on function public."claim_managed_approval_reminder"(p_request_id uuid, p_kind text, p_owner text, p_now timestamp with time zone, p_lease_seconds integer) to "service_role";

CREATE OR REPLACE FUNCTION public.claim_managed_content_job_event(p_event_id text, p_job_id text, p_tenant_id uuid, p_company_id uuid, p_event_type text, p_payload_digest text, p_lease_owner text, p_now timestamp with time zone, p_lease_seconds integer DEFAULT 300)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  claimed_id text;
  existing_digest text;
begin
  insert into managed_content_job_events (
    event_id, job_id, tenant_id, company_id, event_type, payload_digest,
    processing_status, lease_owner, lease_acquired_at, lease_expires_at
  ) values (
    p_event_id, p_job_id, p_tenant_id, p_company_id, p_event_type,
    p_payload_digest, 'processing', p_lease_owner, p_now,
    p_now + make_interval(secs => p_lease_seconds)
  )
  on conflict (event_id) do update
    set processing_status = 'processing',
        lease_owner = excluded.lease_owner,
        lease_acquired_at = excluded.lease_acquired_at,
        lease_expires_at = excluded.lease_expires_at,
        completed_at = null,
        last_error = null
    where managed_content_job_events.payload_digest = excluded.payload_digest
      and (
        managed_content_job_events.processing_status = 'failed'
        or (
          managed_content_job_events.processing_status = 'processing'
          and managed_content_job_events.lease_expires_at <= p_now
        )
      )
  returning event_id into claimed_id;
  if claimed_id is not null then return 'claimed'; end if;
  select payload_digest into existing_digest
  from managed_content_job_events where event_id = p_event_id;
  if existing_digest is distinct from p_payload_digest then
    return 'payload_mismatch';
  end if;
  return 'duplicate';
end;
$function$;

revoke all on function public."claim_managed_content_job_event"(p_event_id text, p_job_id text, p_tenant_id uuid, p_company_id uuid, p_event_type text, p_payload_digest text, p_lease_owner text, p_now timestamp with time zone, p_lease_seconds integer) from public, anon, authenticated, service_role;
grant execute on function public."claim_managed_content_job_event"(p_event_id text, p_job_id text, p_tenant_id uuid, p_company_id uuid, p_event_type text, p_payload_digest text, p_lease_owner text, p_now timestamp with time zone, p_lease_seconds integer) to "service_role";

CREATE OR REPLACE FUNCTION public.client_respond_managed_approval(p_request_id uuid, p_decision text, p_accept_direct_charge_disclosure boolean DEFAULT false)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  target managed_approval_requests%rowtype;
  stamp timestamptz := now();
begin
  if p_decision not in ('approved', 'changes_requested') then
    raise exception 'Invalid approval decision';
  end if;
  select r.* into target
  from managed_approval_requests r
  join app_users u
    on u.id = auth.uid() and u.active and lower(u.email) = lower(r.recipient_email)
  join tenant_members m
    on m.user_id = u.id and m.tenant_id = r.tenant_id
  where r.id = p_request_id
    and r.status = 'pending'
    and r.due_at > stamp
    and r.superseded_by_id is null
    and m.role = 'member'
    and (
      m.portal_only
      or (
        select count(*)
        from company_access client_access
        join companies client_company on client_company.id = client_access.company_id
        where client_access.user_id = m.user_id
          and client_company.tenant_id = m.tenant_id
      ) = 1
    )
    and has_company_access(r.company_id)
  for update of r;
  if not found then return false; end if;
  if p_decision = 'changes_requested' and target.revision_round >= 2 then
    return false;
  end if;
  if target.scope = 'paid_budget_targeting'
     and p_decision = 'approved'
     and not p_accept_direct_charge_disclosure then
    raise exception 'Direct platform charge disclosure acceptance is required';
  end if;
  update managed_approval_requests
  set status = p_decision,
      responded_at = stamp,
      revision_round = case
        when p_decision = 'changes_requested'
          then least(2, revision_round + 1)
        else revision_round
      end,
      direct_charge_disclosure_accepted_at = case
        when p_accept_direct_charge_disclosure then stamp
        else direct_charge_disclosure_accepted_at
      end,
      updated_at = stamp
  where id = target.id;
  if p_decision = 'approved' and target.ad_campaign_id is not null then
    update managed_paid_authorizations a
    set status = 'approved',
        disclosure_accepted_at = coalesce(
          a.disclosure_accepted_at,
          (
            select r.direct_charge_disclosure_accepted_at
            from managed_approval_requests r
            where r.id = a.budget_targeting_approval_id
          )
        ),
        updated_at = stamp
    where a.ad_campaign_id = target.ad_campaign_id
      and a.tenant_id = target.tenant_id
      and a.company_id = target.company_id
      and exists (
        select 1 from managed_approval_requests r
        where r.id = a.creative_approval_id
          and r.status = 'approved'
          and r.due_at > stamp
          and r.superseded_by_id is null
      )
      and exists (
        select 1 from managed_approval_requests r
        where r.id = a.budget_targeting_approval_id
          and r.status = 'approved'
          and r.due_at > stamp
          and r.superseded_by_id is null
          and r.direct_charge_disclosure_accepted_at is not null
      )
      and (
        select coalesce(sum(other.requested_budget_aud), 0)
        from managed_paid_authorizations other
        where other.company_id = a.company_id
          and other.month_key = a.month_key
          and other.status = 'approved'
          and other.id <> a.id
      ) + a.requested_budget_aud <= a.client_monthly_cap_aud;
  end if;
  return true;
end;
$function$;

revoke all on function public."client_respond_managed_approval"(p_request_id uuid, p_decision text, p_accept_direct_charge_disclosure boolean) from public, anon, authenticated, service_role;
grant execute on function public."client_respond_managed_approval"(p_request_id uuid, p_decision text, p_accept_direct_charge_disclosure boolean) to "authenticated";
grant execute on function public."client_respond_managed_approval"(p_request_id uuid, p_decision text, p_accept_direct_charge_disclosure boolean) to "service_role";

CREATE OR REPLACE FUNCTION public.has_company_access(cid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from companies c
    where c.id = cid
      and (
        is_tenant_admin(c.tenant_id)
        or (
          is_tenant_member(c.tenant_id)
          and exists (
            select 1 from company_access a
            where a.user_id = auth.uid() and a.company_id = cid
          )
        )
      )
  );
$function$;

revoke all on function public."has_company_access"(cid uuid) from public, anon, authenticated, service_role;
grant execute on function public."has_company_access"(cid uuid) to public;
grant execute on function public."has_company_access"(cid uuid) to "anon";
grant execute on function public."has_company_access"(cid uuid) to "authenticated";
grant execute on function public."has_company_access"(cid uuid) to "service_role";

CREATE OR REPLACE FUNCTION public.is_admin_of_company(cid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from companies c
    where c.id = cid and is_tenant_admin(c.tenant_id)
  );
$function$;

revoke all on function public."is_admin_of_company"(cid uuid) from public, anon, authenticated, service_role;
grant execute on function public."is_admin_of_company"(cid uuid) to public;
grant execute on function public."is_admin_of_company"(cid uuid) to "anon";
grant execute on function public."is_admin_of_company"(cid uuid) to "authenticated";
grant execute on function public."is_admin_of_company"(cid uuid) to "service_role";

CREATE OR REPLACE FUNCTION public.is_company_staff(cid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from companies c
    join tenant_members m
      on m.tenant_id = c.tenant_id and m.user_id = auth.uid()
    join app_users u on u.id = m.user_id
    where c.id = cid
      and u.active
      and (
        m.role in ('owner', 'admin')
        or (
          m.role = 'member'
          and not (
            m.portal_only
            or (
              select count(*)
              from company_access member_access
              join companies member_company
                on member_company.id = member_access.company_id
              where member_access.user_id = m.user_id
                and member_company.tenant_id = m.tenant_id
            ) = 1
          )
          and exists (
            select 1 from company_access a
            where a.user_id = auth.uid() and a.company_id = cid
          )
        )
      )
  );
$function$;

revoke all on function public."is_company_staff"(cid uuid) from public, anon, authenticated, service_role;
grant execute on function public."is_company_staff"(cid uuid) to "authenticated";
grant execute on function public."is_company_staff"(cid uuid) to "service_role";

CREATE OR REPLACE FUNCTION public.is_platform_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from app_users
    where id = auth.uid() and platform_admin and active
  );
$function$;

revoke all on function public."is_platform_admin"() from public, anon, authenticated, service_role;
grant execute on function public."is_platform_admin"() to public;
grant execute on function public."is_platform_admin"() to "anon";
grant execute on function public."is_platform_admin"() to "authenticated";
grant execute on function public."is_platform_admin"() to "service_role";

CREATE OR REPLACE FUNCTION public.is_tenant_admin(tid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from tenant_members m join app_users u on u.id = m.user_id
    where m.user_id = auth.uid() and m.tenant_id = tid
      and m.role in ('owner','admin') and u.active
  );
$function$;

revoke all on function public."is_tenant_admin"(tid uuid) from public, anon, authenticated, service_role;
grant execute on function public."is_tenant_admin"(tid uuid) to public;
grant execute on function public."is_tenant_admin"(tid uuid) to "anon";
grant execute on function public."is_tenant_admin"(tid uuid) to "authenticated";
grant execute on function public."is_tenant_admin"(tid uuid) to "service_role";

CREATE OR REPLACE FUNCTION public.is_tenant_member(tid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from tenant_members m join app_users u on u.id = m.user_id
    where m.user_id = auth.uid() and m.tenant_id = tid and u.active
  );
$function$;

revoke all on function public."is_tenant_member"(tid uuid) from public, anon, authenticated, service_role;
grant execute on function public."is_tenant_member"(tid uuid) to public;
grant execute on function public."is_tenant_member"(tid uuid) to "anon";
grant execute on function public."is_tenant_member"(tid uuid) to "authenticated";
grant execute on function public."is_tenant_member"(tid uuid) to "service_role";

CREATE OR REPLACE FUNCTION public.respond_managed_approval_with_token(p_token_hash text, p_company_id uuid, p_decision text, p_response_payload jsonb DEFAULT '{}'::jsonb, p_accept_direct_charge_disclosure boolean DEFAULT false)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  target managed_approval_requests%rowtype;
  stamp timestamptz := now();
begin
  if p_decision not in ('approved', 'changes_requested') then
    raise exception 'Invalid approval decision';
  end if;
  select r.* into target
  from managed_approval_requests r
  where r.token_hash = p_token_hash
    and r.company_id = p_company_id
  for update;
  if not found then return false; end if;
  if target.status = p_decision and target.responded_at is not null then
    return true;
  end if;
  if target.status <> 'pending'
     or target.due_at <= stamp
     or target.superseded_by_id is not null then
    return false;
  end if;
  if p_decision = 'changes_requested' and target.revision_round >= 2 then
    return false;
  end if;
  if target.scope = 'paid_budget_targeting'
     and p_decision = 'approved'
     and not p_accept_direct_charge_disclosure then
    raise exception 'Direct platform charge disclosure acceptance is required';
  end if;
  update managed_approval_requests
  set status = p_decision,
      responded_at = stamp,
      response_payload = coalesce(p_response_payload, '{}'::jsonb),
      revision_round = case
        when p_decision = 'changes_requested' then revision_round + 1
        else revision_round
      end,
      direct_charge_disclosure_accepted_at = case
        when p_accept_direct_charge_disclosure then stamp
        else direct_charge_disclosure_accepted_at
      end,
      updated_at = stamp
  where id = target.id;
  if p_decision = 'approved' and target.ad_campaign_id is not null then
    update managed_paid_authorizations a
    set status = 'approved',
        disclosure_accepted_at = coalesce(
          a.disclosure_accepted_at,
          (
            select r.direct_charge_disclosure_accepted_at
            from managed_approval_requests r
            where r.id = a.budget_targeting_approval_id
          )
        ),
        updated_at = stamp
    where a.ad_campaign_id = target.ad_campaign_id
      and a.tenant_id = target.tenant_id
      and a.company_id = target.company_id
      and a.status = 'pending'
      and exists (
        select 1 from managed_approval_requests r
        where r.id = a.creative_approval_id
          and r.status = 'approved'
          and r.due_at > stamp
          and r.superseded_by_id is null
      )
      and exists (
        select 1 from managed_approval_requests r
        where r.id = a.budget_targeting_approval_id
          and r.status = 'approved'
          and r.due_at > stamp
          and r.superseded_by_id is null
          and r.direct_charge_disclosure_accepted_at is not null
      )
      and (
        select coalesce(sum(other.requested_budget_aud), 0)
        from managed_paid_authorizations other
        where other.company_id = a.company_id
          and other.month_key = a.month_key
          and other.status = 'approved'
          and other.id <> a.id
      ) + a.requested_budget_aud <= a.client_monthly_cap_aud;
  end if;
  return true;
end;
$function$;

revoke all on function public."respond_managed_approval_with_token"(p_token_hash text, p_company_id uuid, p_decision text, p_response_payload jsonb, p_accept_direct_charge_disclosure boolean) from public, anon, authenticated, service_role;
grant execute on function public."respond_managed_approval_with_token"(p_token_hash text, p_company_id uuid, p_decision text, p_response_payload jsonb, p_accept_direct_charge_disclosure boolean) to "anon";
grant execute on function public."respond_managed_approval_with_token"(p_token_hash text, p_company_id uuid, p_decision text, p_response_payload jsonb, p_accept_direct_charge_disclosure boolean) to "authenticated";
grant execute on function public."respond_managed_approval_with_token"(p_token_hash text, p_company_id uuid, p_decision text, p_response_payload jsonb, p_accept_direct_charge_disclosure boolean) to "service_role";

alter table public."ad_accounts" enable row level security;
alter table public."ad_budgets" enable row level security;
alter table public."ad_campaigns" enable row level security;
alter table public."agency_portfolio_snapshots" enable row level security;
alter table public."ai_campaign_recommendations" enable row level security;
alter table public."ai_mos_opportunities" enable row level security;
alter table public."ai_mos_signal_runs" enable row level security;
alter table public."ai_orchestration_runs" enable row level security;
alter table public."ai_prompt_versions" enable row level security;
alter table public."ai_runs" enable row level security;
alter table public."api_keys" enable row level security;
alter table public."app_users" enable row level security;
alter table public."approval_policies" enable row level security;
alter table public."approved_claims" enable row level security;
alter table public."approved_responses" enable row level security;
alter table public."assets" enable row level security;
alter table public."audience_segments" enable row level security;
alter table public."audit_logs" enable row level security;
alter table public."automation_runs" enable row level security;
alter table public."automation_settings" enable row level security;
alter table public."booking_service_periods" enable row level security;
alter table public."booking_settings" enable row level security;
alter table public."brand_templates" enable row level security;
alter table public."campaign_builder_runs" enable row level security;
alter table public."campaign_draft_schedule_items" enable row level security;
alter table public."campaign_experiments" enable row level security;
alter table public."campaign_items" enable row level security;
alter table public."campaign_performance_snapshots" enable row level security;
alter table public."campaign_plan_versions" enable row level security;
alter table public."campaigns" enable row level security;
alter table public."cms_page_versions" enable row level security;
alter table public."cms_pages" enable row level security;
alter table public."cms_seo_metadata" enable row level security;
alter table public."cms_update_requests" enable row level security;
alter table public."companies" enable row level security;
alter table public."company_access" enable row level security;
alter table public."company_credit_ledger" enable row level security;
alter table public."company_credit_wallets" enable row level security;
alter table public."company_documents" enable row level security;
alter table public."company_entitlements" enable row level security;
alter table public."company_reviews" enable row level security;
alter table public."connect_invites" enable row level security;
alter table public."consents" enable row level security;
alter table public."content_comments" enable row level security;
alter table public."content_items" enable row level security;
alter table public."conversion_funnels" enable row level security;
alter table public."crm_contacts" enable row level security;
alter table public."crm_interactions" enable row level security;
alter table public."crm_segments" enable row level security;
alter table public."email_campaigns" enable row level security;
alter table public."email_subscribers" enable row level security;
alter table public."email_templates" enable row level security;
alter table public."evidence" enable row level security;
alter table public."funnel_ab_experiments" enable row level security;
alter table public."funnel_journeys" enable row level security;
alter table public."funnel_landing_pages" enable row level security;
alter table public."knowledge_documents" enable row level security;
alter table public."knowledge_gaps" enable row level security;
alter table public."leads" enable row level security;
alter table public."learning_hypotheses" enable row level security;
alter table public."learning_lessons" enable row level security;
alter table public."legal_holds" enable row level security;
alter table public."local_area_profiles" enable row level security;
alter table public."loyalty_coupons" enable row level security;
alter table public."loyalty_members" enable row level security;
alter table public."loyalty_programs" enable row level security;
alter table public."loyalty_redemptions" enable row level security;
alter table public."loyalty_referrals" enable row level security;
alter table public."loyalty_tiers" enable row level security;
alter table public."managed_approval_requests" enable row level security;
alter table public."managed_channel_adaptations" enable row level security;
alter table public."managed_content_concepts" enable row level security;
alter table public."managed_content_job_events" enable row level security;
alter table public."managed_content_job_exceptions" enable row level security;
alter table public."managed_content_jobs" enable row level security;
alter table public."managed_delivery_runs" enable row level security;
alter table public."managed_engagement_routes" enable row level security;
alter table public."managed_paid_authorizations" enable row level security;
alter table public."managed_planned_slots" enable row level security;
alter table public."managed_strategy_cycles" enable row level security;
alter table public."marketing_requests" enable row level security;
alter table public."marketing_workflow_settings" enable row level security;
alter table public."marketing_workflows" enable row level security;
alter table public."menu_designs" enable row level security;
alter table public."offers" enable row level security;
alter table public."order_menu_items" enable row level security;
alter table public."ordering_settings" enable row level security;
alter table public."partner_webhooks" enable row level security;
alter table public."photo_marketplace_bookings" enable row level security;
alter table public."photo_shoots" enable row level security;
alter table public."photographer_packages" enable row level security;
alter table public."photographer_profiles" enable row level security;
alter table public."privacy_requests" enable row level security;
alter table public."prompt_templates" enable row level security;
alter table public."publish_logs" enable row level security;
alter table public."publishing_controls" enable row level security;
alter table public."publishing_integrations" enable row level security;
alter table public."rag_knowledge_sources" enable row level security;
alter table public."rag_knowledge_versions" enable row level security;
alter table public."recommendation_dismiss_history" enable row level security;
alter table public."recommendations" enable row level security;
alter table public."reservations" enable row level security;
alter table public."restaurant_orders" enable row level security;
alter table public."review_request_campaigns" enable row level security;
alter table public."scheduled_posts" enable row level security;
alter table public."security_settings" enable row level security;
alter table public."services" enable row level security;
alter table public."sms_campaigns" enable row level security;
alter table public."sms_company_settings" enable row level security;
alter table public."sms_subscribers" enable row level security;
alter table public."social_mentions" enable row level security;
alter table public."social_responses" enable row level security;
alter table public."stripe_webhook_events" enable row level security;
alter table public."tasks" enable row level security;
alter table public."tax_invoices" enable row level security;
alter table public."tenant_members" enable row level security;
alter table public."tenants" enable row level security;
alter table public."terms_acceptances" enable row level security;
alter table public."terms_versions" enable row level security;
alter table public."utm_links" enable row level security;
alter table public."workflow_dispatch_logs" enable row level security;

create policy "ad_accounts_rw" on public."ad_accounts" as PERMISSIVE for ALL to public using (has_company_access(company_id)) with check (has_company_access(company_id));
create policy "ad_budgets_rw" on public."ad_budgets" as PERMISSIVE for ALL to public using (has_company_access(company_id)) with check (has_company_access(company_id));
create policy "ad_campaigns_rw" on public."ad_campaigns" as PERMISSIVE for ALL to public using (has_company_access(company_id)) with check (has_company_access(company_id));
create policy "agency_portfolio_snapshots_scoped" on public."agency_portfolio_snapshots" as PERMISSIVE for ALL to public using (has_company_access(company_id)) with check (has_company_access(company_id));
create policy "ai_campaign_recommendations_access" on public."ai_campaign_recommendations" as PERMISSIVE for ALL to public using (has_company_access(company_id)) with check (has_company_access(company_id));
create policy "ai_mos_opportunities_rw" on public."ai_mos_opportunities" as PERMISSIVE for ALL to public using (has_company_access(company_id)) with check (has_company_access(company_id));
create policy "ai_mos_signal_runs_rw" on public."ai_mos_signal_runs" as PERMISSIVE for ALL to public using (has_company_access(company_id)) with check (has_company_access(company_id));
create policy "ai_orchestration_runs_access" on public."ai_orchestration_runs" as PERMISSIVE for ALL to public using (has_company_access(company_id)) with check (has_company_access(company_id));
create policy "ai_prompt_versions_read" on public."ai_prompt_versions" as PERMISSIVE for SELECT to public using (((tenant_id IS NULL) OR is_tenant_member(tenant_id)));
create policy "ai_prompt_versions_write" on public."ai_prompt_versions" as PERMISSIVE for ALL to public using (((tenant_id IS NOT NULL) AND is_tenant_admin(tenant_id))) with check (((tenant_id IS NOT NULL) AND is_tenant_admin(tenant_id)));
create policy "air_read" on public."ai_runs" as PERMISSIVE for SELECT to public using ((is_tenant_admin(tenant_id) OR ((company_id IS NOT NULL) AND has_company_access(company_id))));
create policy "air_write" on public."ai_runs" as PERMISSIVE for INSERT to public with check (
CASE
    WHEN (company_id IS NULL) THEN is_tenant_admin(tenant_id)
    ELSE (is_tenant_member(tenant_id) AND has_company_access(company_id))
END);
create policy "api_keys_tenant" on public."api_keys" as PERMISSIVE for ALL to public using (is_tenant_admin(tenant_id)) with check (is_tenant_admin(tenant_id));
create policy "app_users_platform_write" on public."app_users" as PERMISSIVE for ALL to public using (is_platform_admin()) with check (is_platform_admin());
create policy "app_users_read" on public."app_users" as PERMISSIVE for SELECT to public using (((id = auth.uid()) OR is_platform_admin() OR (EXISTS ( SELECT 1
   FROM (tenant_members mine
     JOIN tenant_members theirs ON ((theirs.tenant_id = mine.tenant_id)))
  WHERE ((mine.user_id = auth.uid()) AND (theirs.user_id = app_users.id))))));
create policy "approval_policies_tenant" on public."approval_policies" as PERMISSIVE for ALL to public using (is_tenant_admin(tenant_id)) with check (is_tenant_admin(tenant_id));
create policy "clm_rw" on public."approved_claims" as PERMISSIVE for ALL to public using (has_company_access(company_id)) with check (has_company_access(company_id));
create policy "resp_read" on public."approved_responses" as PERMISSIVE for SELECT to public using (((tenant_id IS NULL) OR ((company_id IS NULL) AND is_tenant_member(tenant_id)) OR ((company_id IS NOT NULL) AND has_company_access(company_id))));
create policy "resp_write" on public."approved_responses" as PERMISSIVE for ALL to public using (
CASE
    WHEN (tenant_id IS NULL) THEN is_platform_admin()
    WHEN (company_id IS NULL) THEN is_tenant_admin(tenant_id)
    ELSE has_company_access(company_id)
END) with check (
CASE
    WHEN (tenant_id IS NULL) THEN is_platform_admin()
    WHEN (company_id IS NULL) THEN is_tenant_admin(tenant_id)
    ELSE has_company_access(company_id)
END);
create policy "asset_rw" on public."assets" as PERMISSIVE for ALL to public using (has_company_access(company_id)) with check (has_company_access(company_id));
create policy "audience_segments_rw" on public."audience_segments" as PERMISSIVE for ALL to public using (has_company_access(company_id)) with check (has_company_access(company_id));
create policy "audit_insert" on public."audit_logs" as PERMISSIVE for INSERT to public with check (((tenant_id IS NOT NULL) AND is_tenant_member(tenant_id)));
create policy "audit_read" on public."audit_logs" as PERMISSIVE for SELECT to public using (((tenant_id IS NOT NULL) AND (is_tenant_admin(tenant_id) OR ((company_id IS NOT NULL) AND has_company_access(company_id)))));
create policy "ar_admin" on public."automation_runs" as PERMISSIVE for ALL to public using (is_tenant_admin(tenant_id)) with check (is_tenant_admin(tenant_id));
create policy "as_read" on public."automation_settings" as PERMISSIVE for SELECT to public using (is_tenant_member(tenant_id));
create policy "as_write" on public."automation_settings" as PERMISSIVE for ALL to public using (is_tenant_admin(tenant_id)) with check (is_tenant_admin(tenant_id));
create policy "booking_service_periods_rw" on public."booking_service_periods" as PERMISSIVE for ALL to public using (has_company_access(company_id)) with check (has_company_access(company_id));
create policy "booking_settings_rw" on public."booking_settings" as PERMISSIVE for ALL to public using (has_company_access(company_id)) with check (has_company_access(company_id));
create policy "bt_read" on public."brand_templates" as PERMISSIVE for SELECT to public using (((tenant_id IS NULL) OR ((company_id IS NULL) AND is_tenant_member(tenant_id)) OR ((company_id IS NOT NULL) AND has_company_access(company_id))));
create policy "bt_write" on public."brand_templates" as PERMISSIVE for ALL to public using (
CASE
    WHEN (tenant_id IS NULL) THEN is_platform_admin()
    WHEN (company_id IS NULL) THEN is_tenant_admin(tenant_id)
    ELSE has_company_access(company_id)
END) with check (
CASE
    WHEN (tenant_id IS NULL) THEN is_platform_admin()
    WHEN (company_id IS NULL) THEN is_tenant_admin(tenant_id)
    ELSE has_company_access(company_id)
END);
create policy "campaign_builder_runs_rw" on public."campaign_builder_runs" as PERMISSIVE for ALL to public using (has_company_access(company_id)) with check (has_company_access(company_id));
create policy "campaign_draft_schedule_items_rw" on public."campaign_draft_schedule_items" as PERMISSIVE for ALL to public using (has_company_access(company_id)) with check (has_company_access(company_id));
create policy "campaign_experiments_scoped" on public."campaign_experiments" as PERMISSIVE for ALL to public using (has_company_access(company_id)) with check (has_company_access(company_id));
create policy "ci_rw" on public."campaign_items" as PERMISSIVE for ALL to public using (has_company_access(company_id)) with check (has_company_access(company_id));
create policy "campaign_performance_snapshots_access" on public."campaign_performance_snapshots" as PERMISSIVE for ALL to public using (has_company_access(company_id)) with check (has_company_access(company_id));
create policy "campaign_plan_versions_rw" on public."campaign_plan_versions" as PERMISSIVE for ALL to public using (has_company_access(company_id)) with check (has_company_access(company_id));
create policy "cmp_rw" on public."campaigns" as PERMISSIVE for ALL to public using (has_company_access(company_id)) with check (has_company_access(company_id));
create policy "cms_page_versions_scoped" on public."cms_page_versions" as PERMISSIVE for ALL to public using (has_company_access(company_id)) with check (has_company_access(company_id));
create policy "cms_pages_scoped" on public."cms_pages" as PERMISSIVE for ALL to public using (has_company_access(company_id)) with check (has_company_access(company_id));
create policy "cms_seo_metadata_scoped" on public."cms_seo_metadata" as PERMISSIVE for ALL to public using (has_company_access(company_id)) with check (has_company_access(company_id));
create policy "cms_update_requests_scoped" on public."cms_update_requests" as PERMISSIVE for ALL to public using (has_company_access(company_id)) with check (has_company_access(company_id));
create policy "companies_admin_write" on public."companies" as PERMISSIVE for ALL to public using (is_tenant_admin(tenant_id)) with check (is_tenant_admin(tenant_id));
create policy "companies_read" on public."companies" as PERMISSIVE for SELECT to public using (has_company_access(id));
create policy "access_admin_write" on public."company_access" as PERMISSIVE for ALL to public using (is_admin_of_company(company_id)) with check (is_admin_of_company(company_id));
create policy "access_read" on public."company_access" as PERMISSIVE for SELECT to public using (((user_id = auth.uid()) OR is_admin_of_company(company_id)));
create policy "company_credit_ledger_access" on public."company_credit_ledger" as PERMISSIVE for ALL to public using (has_company_access(company_id)) with check (has_company_access(company_id));
create policy "company_credit_wallets_access" on public."company_credit_wallets" as PERMISSIVE for ALL to public using (has_company_access(company_id)) with check (has_company_access(company_id));
create policy "docs_admin_write" on public."company_documents" as PERMISSIVE for ALL to public using (is_admin_of_company(company_id)) with check (is_admin_of_company(company_id));
create policy "docs_scoped" on public."company_documents" as PERMISSIVE for SELECT to public using (has_company_access(company_id));
create policy "company_entitlements_rw" on public."company_entitlements" as PERMISSIVE for ALL to public using (has_company_access(company_id)) with check (has_company_access(company_id));
create policy "company_reviews_scoped" on public."company_reviews" as PERMISSIVE for SELECT to public using (has_company_access(company_id));
create policy "company_reviews_write" on public."company_reviews" as PERMISSIVE for ALL to public using (has_company_access(company_id)) with check (has_company_access(company_id));
create policy "ci_access" on public."connect_invites" as PERMISSIVE for ALL to public using (has_company_access(company_id)) with check (has_company_access(company_id));
create policy "cons_rw" on public."consents" as PERMISSIVE for ALL to public using (has_company_access(company_id)) with check (has_company_access(company_id));
create policy "cc_rw" on public."content_comments" as PERMISSIVE for ALL to public using (has_company_access(company_id)) with check (has_company_access(company_id));
create policy "content_scoped" on public."content_items" as PERMISSIVE for SELECT to public using (has_company_access(company_id));
create policy "content_write" on public."content_items" as PERMISSIVE for ALL to public using (has_company_access(company_id)) with check (has_company_access(company_id));
create policy "conversion_funnels_rw" on public."conversion_funnels" as PERMISSIVE for ALL to public using (has_company_access(company_id)) with check (has_company_access(company_id));
create policy "crm_contacts_rw" on public."crm_contacts" as PERMISSIVE for ALL to public using (has_company_access(company_id)) with check (has_company_access(company_id));
create policy "crm_interactions_rw" on public."crm_interactions" as PERMISSIVE for ALL to public using (has_company_access(company_id)) with check (has_company_access(company_id));
create policy "crm_segments_rw" on public."crm_segments" as PERMISSIVE for ALL to public using (has_company_access(company_id)) with check (has_company_access(company_id));
create policy "email_cmp_rw" on public."email_campaigns" as PERMISSIVE for ALL to public using (has_company_access(company_id)) with check (has_company_access(company_id));
create policy "email_sub_rw" on public."email_subscribers" as PERMISSIVE for ALL to public using (has_company_access(company_id)) with check (has_company_access(company_id));
create policy "email_tpl_rw" on public."email_templates" as PERMISSIVE for ALL to public using (has_company_access(company_id)) with check (has_company_access(company_id));
create policy "ev_rw" on public."evidence" as PERMISSIVE for ALL to public using (has_company_access(company_id)) with check (has_company_access(company_id));
create policy "funnel_ab_experiments_rw" on public."funnel_ab_experiments" as PERMISSIVE for ALL to public using (has_company_access(company_id)) with check (has_company_access(company_id));
create policy "funnel_journeys_rw" on public."funnel_journeys" as PERMISSIVE for ALL to public using (has_company_access(company_id)) with check (has_company_access(company_id));
create policy "funnel_landing_pages_rw" on public."funnel_landing_pages" as PERMISSIVE for ALL to public using (has_company_access(company_id)) with check (has_company_access(company_id));
create policy "kd_rw" on public."knowledge_documents" as PERMISSIVE for ALL to public using (has_company_access(company_id)) with check (has_company_access(company_id));
create policy "gap_rw" on public."knowledge_gaps" as PERMISSIVE for ALL to public using (has_company_access(company_id)) with check (has_company_access(company_id));
create policy "leads_rw" on public."leads" as PERMISSIVE for ALL to public using (has_company_access(company_id)) with check (has_company_access(company_id));
create policy "learning_hypotheses_scoped" on public."learning_hypotheses" as PERMISSIVE for ALL to public using (has_company_access(company_id)) with check (has_company_access(company_id));
create policy "learning_lessons_scoped" on public."learning_lessons" as PERMISSIVE for ALL to public using (has_company_access(company_id)) with check (has_company_access(company_id));
create policy "lh_admin" on public."legal_holds" as PERMISSIVE for ALL to public using (is_tenant_admin(tenant_id)) with check (is_tenant_admin(tenant_id));
create policy "lap_rw" on public."local_area_profiles" as PERMISSIVE for ALL to public using (has_company_access(company_id)) with check (has_company_access(company_id));
create policy "loyalty_coupons_rw" on public."loyalty_coupons" as PERMISSIVE for ALL to public using (has_company_access(company_id)) with check (has_company_access(company_id));
create policy "loyalty_members_rw" on public."loyalty_members" as PERMISSIVE for ALL to public using (has_company_access(company_id)) with check (has_company_access(company_id));
create policy "loyalty_programs_rw" on public."loyalty_programs" as PERMISSIVE for ALL to public using (has_company_access(company_id)) with check (has_company_access(company_id));
create policy "loyalty_redemptions_rw" on public."loyalty_redemptions" as PERMISSIVE for ALL to public using (has_company_access(company_id)) with check (has_company_access(company_id));
create policy "loyalty_referrals_rw" on public."loyalty_referrals" as PERMISSIVE for ALL to public using (has_company_access(company_id)) with check (has_company_access(company_id));
create policy "loyalty_tiers_rw" on public."loyalty_tiers" as PERMISSIVE for ALL to public using (has_company_access(company_id)) with check (has_company_access(company_id));
create policy "managed_approval_requests_client_read" on public."managed_approval_requests" as PERMISSIVE for SELECT to "authenticated" using ((has_company_access(company_id) AND (is_company_staff(company_id) OR (recipient_email = ( SELECT u.email
   FROM app_users u
  WHERE ((u.id = auth.uid()) AND u.active))))));
create policy "managed_approval_requests_staff_write" on public."managed_approval_requests" as PERMISSIVE for ALL to "authenticated" using (is_company_staff(company_id)) with check (is_company_staff(company_id));
create policy "managed_channel_adaptations_read" on public."managed_channel_adaptations" as PERMISSIVE for SELECT to "authenticated" using (has_company_access(company_id));
create policy "managed_channel_adaptations_staff_write" on public."managed_channel_adaptations" as PERMISSIVE for ALL to "authenticated" using (is_company_staff(company_id)) with check (is_company_staff(company_id));
create policy "managed_content_concepts_read" on public."managed_content_concepts" as PERMISSIVE for SELECT to "authenticated" using (has_company_access(company_id));
create policy "managed_content_concepts_staff_write" on public."managed_content_concepts" as PERMISSIVE for ALL to "authenticated" using (is_company_staff(company_id)) with check (is_company_staff(company_id));
create policy "managed_delivery_runs_access" on public."managed_delivery_runs" as PERMISSIVE for ALL to public using (has_company_access(company_id)) with check (has_company_access(company_id));
create policy "managed_engagement_routes_staff_access" on public."managed_engagement_routes" as PERMISSIVE for ALL to "authenticated" using (is_company_staff(company_id)) with check (is_company_staff(company_id));
create policy "managed_paid_authorizations_read" on public."managed_paid_authorizations" as PERMISSIVE for SELECT to "authenticated" using (has_company_access(company_id));
create policy "managed_paid_authorizations_staff_write" on public."managed_paid_authorizations" as PERMISSIVE for ALL to "authenticated" using (is_company_staff(company_id)) with check (is_company_staff(company_id));
create policy "managed_planned_slots_read" on public."managed_planned_slots" as PERMISSIVE for SELECT to "authenticated" using (has_company_access(company_id));
create policy "managed_planned_slots_staff_write" on public."managed_planned_slots" as PERMISSIVE for ALL to "authenticated" using (is_company_staff(company_id)) with check (is_company_staff(company_id));
create policy "managed_strategy_cycles_read" on public."managed_strategy_cycles" as PERMISSIVE for SELECT to "authenticated" using (has_company_access(company_id));
create policy "managed_strategy_cycles_staff_write" on public."managed_strategy_cycles" as PERMISSIVE for ALL to "authenticated" using (is_company_staff(company_id)) with check (is_company_staff(company_id));
create policy "requests_scoped" on public."marketing_requests" as PERMISSIVE for SELECT to public using (has_company_access(company_id));
create policy "requests_write" on public."marketing_requests" as PERMISSIVE for ALL to public using (has_company_access(company_id)) with check (has_company_access(company_id));
create policy "marketing_workflow_settings_rw" on public."marketing_workflow_settings" as PERMISSIVE for ALL to public using (has_company_access(company_id)) with check (has_company_access(company_id));
create policy "marketing_workflows_rw" on public."marketing_workflows" as PERMISSIVE for ALL to public using (((is_agency_template AND (tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE (tenant_members.user_id = auth.uid())))) OR ((company_id IS NOT NULL) AND has_company_access(company_id)))) with check (((is_agency_template AND (tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE (tenant_members.user_id = auth.uid())))) OR ((company_id IS NOT NULL) AND has_company_access(company_id))));
create policy "menu_designs_rw" on public."menu_designs" as PERMISSIVE for ALL to public using (has_company_access(company_id)) with check (has_company_access(company_id));
create policy "off_rw" on public."offers" as PERMISSIVE for ALL to public using (has_company_access(company_id)) with check (has_company_access(company_id));
create policy "order_menu_items_rw" on public."order_menu_items" as PERMISSIVE for ALL to public using (has_company_access(company_id)) with check (has_company_access(company_id));
create policy "ordering_settings_rw" on public."ordering_settings" as PERMISSIVE for ALL to public using (has_company_access(company_id)) with check (has_company_access(company_id));
create policy "partner_webhooks_tenant" on public."partner_webhooks" as PERMISSIVE for ALL to public using (is_tenant_admin(tenant_id)) with check (is_tenant_admin(tenant_id));
create policy "photo_marketplace_bookings_rw" on public."photo_marketplace_bookings" as PERMISSIVE for ALL to public using (has_company_access(company_id)) with check (has_company_access(company_id));
create policy "photo_shoots_rw" on public."photo_shoots" as PERMISSIVE for ALL to public using (has_company_access(company_id)) with check (has_company_access(company_id));
create policy "photographer_packages_read" on public."photographer_packages" as PERMISSIVE for SELECT to public using ((EXISTS ( SELECT 1
   FROM photographer_profiles p
  WHERE ((p.id = photographer_packages.photographer_id) AND ((p.tenant_id IS NULL) OR is_tenant_member(p.tenant_id))))));
create policy "photographer_packages_write" on public."photographer_packages" as PERMISSIVE for ALL to public using ((EXISTS ( SELECT 1
   FROM photographer_profiles p
  WHERE ((p.id = photographer_packages.photographer_id) AND (p.tenant_id IS NOT NULL) AND is_tenant_member(p.tenant_id))))) with check ((EXISTS ( SELECT 1
   FROM photographer_profiles p
  WHERE ((p.id = photographer_packages.photographer_id) AND (p.tenant_id IS NOT NULL) AND is_tenant_member(p.tenant_id)))));
create policy "photographer_profiles_read" on public."photographer_profiles" as PERMISSIVE for SELECT to public using (((tenant_id IS NULL) OR is_tenant_member(tenant_id)));
create policy "photographer_profiles_write" on public."photographer_profiles" as PERMISSIVE for ALL to public using (((tenant_id IS NOT NULL) AND is_tenant_member(tenant_id))) with check (((tenant_id IS NOT NULL) AND is_tenant_member(tenant_id)));
create policy "privacy_requests_access" on public."privacy_requests" as PERMISSIVE for ALL to public using (has_company_access(company_id)) with check (has_company_access(company_id));
create policy "pt_read" on public."prompt_templates" as PERMISSIVE for SELECT to public using (((tenant_id IS NULL) OR ((company_id IS NULL) AND is_tenant_member(tenant_id)) OR ((company_id IS NOT NULL) AND has_company_access(company_id))));
create policy "pt_write" on public."prompt_templates" as PERMISSIVE for ALL to public using (
CASE
    WHEN (tenant_id IS NULL) THEN is_platform_admin()
    WHEN (company_id IS NULL) THEN is_tenant_admin(tenant_id)
    ELSE has_company_access(company_id)
END) with check (
CASE
    WHEN (tenant_id IS NULL) THEN is_platform_admin()
    WHEN (company_id IS NULL) THEN is_tenant_admin(tenant_id)
    ELSE has_company_access(company_id)
END);
create policy "pl_insert" on public."publish_logs" as PERMISSIVE for INSERT to public with check (has_company_access(company_id));
create policy "pl_read" on public."publish_logs" as PERMISSIVE for SELECT to public using (has_company_access(company_id));
create policy "pc_read" on public."publishing_controls" as PERMISSIVE for SELECT to public using (is_tenant_member(tenant_id));
create policy "pc_write" on public."publishing_controls" as PERMISSIVE for ALL to public using (is_tenant_admin(tenant_id)) with check (is_tenant_admin(tenant_id));
create policy "pi_admin" on public."publishing_integrations" as PERMISSIVE for ALL to public using (is_admin_of_company(company_id)) with check (is_admin_of_company(company_id));
create policy "rag_knowledge_sources_scoped" on public."rag_knowledge_sources" as PERMISSIVE for ALL to public using (has_company_access(company_id)) with check (has_company_access(company_id));
create policy "rag_knowledge_versions_scoped" on public."rag_knowledge_versions" as PERMISSIVE for ALL to public using (has_company_access(company_id)) with check (has_company_access(company_id));
create policy "recommendation_dismiss_history_scoped" on public."recommendation_dismiss_history" as PERMISSIVE for ALL to public using (has_company_access(company_id)) with check (has_company_access(company_id));
create policy "rec_rw" on public."recommendations" as PERMISSIVE for ALL to public using (has_company_access(company_id)) with check (has_company_access(company_id));
create policy "reservations_rw" on public."reservations" as PERMISSIVE for ALL to public using (has_company_access(company_id)) with check (has_company_access(company_id));
create policy "restaurant_orders_rw" on public."restaurant_orders" as PERMISSIVE for ALL to public using (has_company_access(company_id)) with check (has_company_access(company_id));
create policy "review_campaigns_scoped" on public."review_request_campaigns" as PERMISSIVE for SELECT to public using (has_company_access(company_id));
create policy "review_campaigns_write" on public."review_request_campaigns" as PERMISSIVE for ALL to public using (has_company_access(company_id)) with check (has_company_access(company_id));
create policy "sp_rw" on public."scheduled_posts" as PERMISSIVE for ALL to public using (has_company_access(company_id)) with check (has_company_access(company_id));
create policy "ss_read" on public."security_settings" as PERMISSIVE for SELECT to public using (is_tenant_member(tenant_id));
create policy "ss_write" on public."security_settings" as PERMISSIVE for ALL to public using (is_tenant_admin(tenant_id)) with check (is_tenant_admin(tenant_id));
create policy "svc_rw" on public."services" as PERMISSIVE for ALL to public using (has_company_access(company_id)) with check (has_company_access(company_id));
create policy "sms_campaigns_rw" on public."sms_campaigns" as PERMISSIVE for ALL to public using (has_company_access(company_id)) with check (has_company_access(company_id));
create policy "sms_settings_rw" on public."sms_company_settings" as PERMISSIVE for ALL to public using (has_company_access(company_id)) with check (has_company_access(company_id));
create policy "sms_subscribers_rw" on public."sms_subscribers" as PERMISSIVE for ALL to public using (has_company_access(company_id)) with check (has_company_access(company_id));
create policy "sm_rw" on public."social_mentions" as PERMISSIVE for ALL to public using (has_company_access(company_id)) with check (has_company_access(company_id));
create policy "social_scoped" on public."social_responses" as PERMISSIVE for SELECT to public using (has_company_access(company_id));
create policy "social_write" on public."social_responses" as PERMISSIVE for ALL to public using (has_company_access(company_id)) with check (has_company_access(company_id));
create policy "task_rw" on public."tasks" as PERMISSIVE for ALL to public using (has_company_access(company_id)) with check (has_company_access(company_id));
create policy "tax_invoices_access" on public."tax_invoices" as PERMISSIVE for ALL to public using (has_company_access(company_id)) with check (has_company_access(company_id));
create policy "members_admin_write" on public."tenant_members" as PERMISSIVE for ALL to public using (is_tenant_admin(tenant_id)) with check (is_tenant_admin(tenant_id));
create policy "members_read" on public."tenant_members" as PERMISSIVE for SELECT to public using (((user_id = auth.uid()) OR is_tenant_member(tenant_id)));
create policy "tenants_owner_write" on public."tenants" as PERMISSIVE for UPDATE to public using ((EXISTS ( SELECT 1
   FROM tenant_members m
  WHERE ((m.tenant_id = tenants.id) AND (m.user_id = auth.uid()) AND (m.role = 'owner'::text))))) with check (true);
create policy "tenants_read" on public."tenants" as PERMISSIVE for SELECT to public using ((is_tenant_member(id) OR is_platform_admin()));
create policy "terms_acceptances_own" on public."terms_acceptances" as PERMISSIVE for SELECT to public using ((user_id = auth.uid()));
create policy "terms_versions_read" on public."terms_versions" as PERMISSIVE for SELECT to public using (true);
create policy "utm_rw" on public."utm_links" as PERMISSIVE for ALL to public using (has_company_access(company_id)) with check (has_company_access(company_id));
create policy "workflow_dispatch_logs_rw" on public."workflow_dispatch_logs" as PERMISSIVE for ALL to public using (has_company_access(company_id)) with check (has_company_access(company_id));

revoke all on table public."ad_accounts" from public, anon, authenticated, service_role;
revoke all on table public."ad_budgets" from public, anon, authenticated, service_role;
revoke all on table public."ad_campaigns" from public, anon, authenticated, service_role;
revoke all on table public."agency_portfolio_snapshots" from public, anon, authenticated, service_role;
revoke all on table public."ai_campaign_recommendations" from public, anon, authenticated, service_role;
revoke all on table public."ai_mos_opportunities" from public, anon, authenticated, service_role;
revoke all on table public."ai_mos_signal_runs" from public, anon, authenticated, service_role;
revoke all on table public."ai_orchestration_runs" from public, anon, authenticated, service_role;
revoke all on table public."ai_prompt_versions" from public, anon, authenticated, service_role;
revoke all on table public."ai_runs" from public, anon, authenticated, service_role;
revoke all on table public."api_keys" from public, anon, authenticated, service_role;
revoke all on table public."app_users" from public, anon, authenticated, service_role;
revoke all on table public."approval_policies" from public, anon, authenticated, service_role;
revoke all on table public."approved_claims" from public, anon, authenticated, service_role;
revoke all on table public."approved_responses" from public, anon, authenticated, service_role;
revoke all on table public."assets" from public, anon, authenticated, service_role;
revoke all on table public."audience_segments" from public, anon, authenticated, service_role;
revoke all on table public."audit_logs" from public, anon, authenticated, service_role;
revoke all on table public."automation_runs" from public, anon, authenticated, service_role;
revoke all on table public."automation_settings" from public, anon, authenticated, service_role;
revoke all on table public."booking_service_periods" from public, anon, authenticated, service_role;
revoke all on table public."booking_settings" from public, anon, authenticated, service_role;
revoke all on table public."brand_templates" from public, anon, authenticated, service_role;
revoke all on table public."campaign_builder_runs" from public, anon, authenticated, service_role;
revoke all on table public."campaign_draft_schedule_items" from public, anon, authenticated, service_role;
revoke all on table public."campaign_experiments" from public, anon, authenticated, service_role;
revoke all on table public."campaign_items" from public, anon, authenticated, service_role;
revoke all on table public."campaign_performance_snapshots" from public, anon, authenticated, service_role;
revoke all on table public."campaign_plan_versions" from public, anon, authenticated, service_role;
revoke all on table public."campaigns" from public, anon, authenticated, service_role;
revoke all on table public."cms_page_versions" from public, anon, authenticated, service_role;
revoke all on table public."cms_pages" from public, anon, authenticated, service_role;
revoke all on table public."cms_seo_metadata" from public, anon, authenticated, service_role;
revoke all on table public."cms_update_requests" from public, anon, authenticated, service_role;
revoke all on table public."companies" from public, anon, authenticated, service_role;
revoke all on table public."company_access" from public, anon, authenticated, service_role;
revoke all on table public."company_credit_ledger" from public, anon, authenticated, service_role;
revoke all on table public."company_credit_wallets" from public, anon, authenticated, service_role;
revoke all on table public."company_documents" from public, anon, authenticated, service_role;
revoke all on table public."company_entitlements" from public, anon, authenticated, service_role;
revoke all on table public."company_reviews" from public, anon, authenticated, service_role;
revoke all on table public."connect_invites" from public, anon, authenticated, service_role;
revoke all on table public."consents" from public, anon, authenticated, service_role;
revoke all on table public."content_comments" from public, anon, authenticated, service_role;
revoke all on table public."content_items" from public, anon, authenticated, service_role;
revoke all on table public."conversion_funnels" from public, anon, authenticated, service_role;
revoke all on table public."crm_contacts" from public, anon, authenticated, service_role;
revoke all on table public."crm_interactions" from public, anon, authenticated, service_role;
revoke all on table public."crm_segments" from public, anon, authenticated, service_role;
revoke all on table public."email_campaigns" from public, anon, authenticated, service_role;
revoke all on table public."email_subscribers" from public, anon, authenticated, service_role;
revoke all on table public."email_templates" from public, anon, authenticated, service_role;
revoke all on table public."evidence" from public, anon, authenticated, service_role;
revoke all on table public."funnel_ab_experiments" from public, anon, authenticated, service_role;
revoke all on table public."funnel_journeys" from public, anon, authenticated, service_role;
revoke all on table public."funnel_landing_pages" from public, anon, authenticated, service_role;
revoke all on table public."knowledge_documents" from public, anon, authenticated, service_role;
revoke all on table public."knowledge_gaps" from public, anon, authenticated, service_role;
revoke all on table public."leads" from public, anon, authenticated, service_role;
revoke all on table public."learning_hypotheses" from public, anon, authenticated, service_role;
revoke all on table public."learning_lessons" from public, anon, authenticated, service_role;
revoke all on table public."legal_holds" from public, anon, authenticated, service_role;
revoke all on table public."local_area_profiles" from public, anon, authenticated, service_role;
revoke all on table public."loyalty_coupons" from public, anon, authenticated, service_role;
revoke all on table public."loyalty_members" from public, anon, authenticated, service_role;
revoke all on table public."loyalty_programs" from public, anon, authenticated, service_role;
revoke all on table public."loyalty_redemptions" from public, anon, authenticated, service_role;
revoke all on table public."loyalty_referrals" from public, anon, authenticated, service_role;
revoke all on table public."loyalty_tiers" from public, anon, authenticated, service_role;
revoke all on table public."managed_approval_requests" from public, anon, authenticated, service_role;
revoke all on table public."managed_channel_adaptations" from public, anon, authenticated, service_role;
revoke all on table public."managed_content_concepts" from public, anon, authenticated, service_role;
revoke all on table public."managed_content_job_events" from public, anon, authenticated, service_role;
revoke all on table public."managed_content_job_exceptions" from public, anon, authenticated, service_role;
revoke all on table public."managed_content_jobs" from public, anon, authenticated, service_role;
revoke all on table public."managed_delivery_runs" from public, anon, authenticated, service_role;
revoke all on table public."managed_engagement_routes" from public, anon, authenticated, service_role;
revoke all on table public."managed_paid_authorizations" from public, anon, authenticated, service_role;
revoke all on table public."managed_planned_slots" from public, anon, authenticated, service_role;
revoke all on table public."managed_strategy_cycles" from public, anon, authenticated, service_role;
revoke all on table public."marketing_requests" from public, anon, authenticated, service_role;
revoke all on table public."marketing_workflow_settings" from public, anon, authenticated, service_role;
revoke all on table public."marketing_workflows" from public, anon, authenticated, service_role;
revoke all on table public."menu_designs" from public, anon, authenticated, service_role;
revoke all on table public."offers" from public, anon, authenticated, service_role;
revoke all on table public."order_menu_items" from public, anon, authenticated, service_role;
revoke all on table public."ordering_settings" from public, anon, authenticated, service_role;
revoke all on table public."partner_webhooks" from public, anon, authenticated, service_role;
revoke all on table public."photo_marketplace_bookings" from public, anon, authenticated, service_role;
revoke all on table public."photo_shoots" from public, anon, authenticated, service_role;
revoke all on table public."photographer_packages" from public, anon, authenticated, service_role;
revoke all on table public."photographer_profiles" from public, anon, authenticated, service_role;
revoke all on table public."privacy_requests" from public, anon, authenticated, service_role;
revoke all on table public."prompt_templates" from public, anon, authenticated, service_role;
revoke all on table public."publish_logs" from public, anon, authenticated, service_role;
revoke all on table public."publishing_controls" from public, anon, authenticated, service_role;
revoke all on table public."publishing_integrations" from public, anon, authenticated, service_role;
revoke all on table public."rag_knowledge_sources" from public, anon, authenticated, service_role;
revoke all on table public."rag_knowledge_versions" from public, anon, authenticated, service_role;
revoke all on table public."recommendation_dismiss_history" from public, anon, authenticated, service_role;
revoke all on table public."recommendations" from public, anon, authenticated, service_role;
revoke all on table public."reservations" from public, anon, authenticated, service_role;
revoke all on table public."restaurant_orders" from public, anon, authenticated, service_role;
revoke all on table public."review_request_campaigns" from public, anon, authenticated, service_role;
revoke all on table public."scheduled_posts" from public, anon, authenticated, service_role;
revoke all on table public."security_settings" from public, anon, authenticated, service_role;
revoke all on table public."services" from public, anon, authenticated, service_role;
revoke all on table public."sms_campaigns" from public, anon, authenticated, service_role;
revoke all on table public."sms_company_settings" from public, anon, authenticated, service_role;
revoke all on table public."sms_subscribers" from public, anon, authenticated, service_role;
revoke all on table public."social_mentions" from public, anon, authenticated, service_role;
revoke all on table public."social_responses" from public, anon, authenticated, service_role;
revoke all on table public."stripe_webhook_events" from public, anon, authenticated, service_role;
revoke all on table public."tasks" from public, anon, authenticated, service_role;
revoke all on table public."tax_invoices" from public, anon, authenticated, service_role;
revoke all on table public."tenant_members" from public, anon, authenticated, service_role;
revoke all on table public."tenants" from public, anon, authenticated, service_role;
revoke all on table public."terms_acceptances" from public, anon, authenticated, service_role;
revoke all on table public."terms_versions" from public, anon, authenticated, service_role;
revoke all on table public."utm_links" from public, anon, authenticated, service_role;
revoke all on table public."workflow_dispatch_logs" from public, anon, authenticated, service_role;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."ad_accounts" to "anon";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."ad_accounts" to "authenticated";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."ad_accounts" to "service_role";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."ad_budgets" to "anon";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."ad_budgets" to "authenticated";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."ad_budgets" to "service_role";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."ad_campaigns" to "anon";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."ad_campaigns" to "authenticated";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."ad_campaigns" to "service_role";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."agency_portfolio_snapshots" to "anon";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."agency_portfolio_snapshots" to "authenticated";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."agency_portfolio_snapshots" to "service_role";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."ai_campaign_recommendations" to "anon";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."ai_campaign_recommendations" to "authenticated";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."ai_campaign_recommendations" to "service_role";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."ai_mos_opportunities" to "anon";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."ai_mos_opportunities" to "authenticated";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."ai_mos_opportunities" to "service_role";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."ai_mos_signal_runs" to "anon";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."ai_mos_signal_runs" to "authenticated";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."ai_mos_signal_runs" to "service_role";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."ai_orchestration_runs" to "anon";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."ai_orchestration_runs" to "authenticated";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."ai_orchestration_runs" to "service_role";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."ai_prompt_versions" to "anon";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."ai_prompt_versions" to "authenticated";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."ai_prompt_versions" to "service_role";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."ai_runs" to "anon";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."ai_runs" to "authenticated";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."ai_runs" to "service_role";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."api_keys" to "anon";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."api_keys" to "authenticated";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."api_keys" to "service_role";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."app_users" to "anon";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."app_users" to "authenticated";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."app_users" to "service_role";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."approval_policies" to "anon";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."approval_policies" to "authenticated";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."approval_policies" to "service_role";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."approved_claims" to "anon";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."approved_claims" to "authenticated";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."approved_claims" to "service_role";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."approved_responses" to "anon";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."approved_responses" to "authenticated";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."approved_responses" to "service_role";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."assets" to "anon";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."assets" to "authenticated";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."assets" to "service_role";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."audience_segments" to "anon";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."audience_segments" to "authenticated";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."audience_segments" to "service_role";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."audit_logs" to "anon";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."audit_logs" to "authenticated";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."audit_logs" to "service_role";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."automation_runs" to "anon";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."automation_runs" to "authenticated";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."automation_runs" to "service_role";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."automation_settings" to "anon";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."automation_settings" to "authenticated";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."automation_settings" to "service_role";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."booking_service_periods" to "anon";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."booking_service_periods" to "authenticated";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."booking_service_periods" to "service_role";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."booking_settings" to "anon";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."booking_settings" to "authenticated";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."booking_settings" to "service_role";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."brand_templates" to "anon";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."brand_templates" to "authenticated";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."brand_templates" to "service_role";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."campaign_builder_runs" to "anon";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."campaign_builder_runs" to "authenticated";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."campaign_builder_runs" to "service_role";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."campaign_draft_schedule_items" to "anon";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."campaign_draft_schedule_items" to "authenticated";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."campaign_draft_schedule_items" to "service_role";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."campaign_experiments" to "anon";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."campaign_experiments" to "authenticated";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."campaign_experiments" to "service_role";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."campaign_items" to "anon";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."campaign_items" to "authenticated";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."campaign_items" to "service_role";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."campaign_performance_snapshots" to "anon";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."campaign_performance_snapshots" to "authenticated";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."campaign_performance_snapshots" to "service_role";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."campaign_plan_versions" to "anon";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."campaign_plan_versions" to "authenticated";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."campaign_plan_versions" to "service_role";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."campaigns" to "anon";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."campaigns" to "authenticated";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."campaigns" to "service_role";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."cms_page_versions" to "anon";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."cms_page_versions" to "authenticated";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."cms_page_versions" to "service_role";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."cms_pages" to "anon";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."cms_pages" to "authenticated";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."cms_pages" to "service_role";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."cms_seo_metadata" to "anon";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."cms_seo_metadata" to "authenticated";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."cms_seo_metadata" to "service_role";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."cms_update_requests" to "anon";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."cms_update_requests" to "authenticated";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."cms_update_requests" to "service_role";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."companies" to "anon";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."companies" to "authenticated";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."companies" to "service_role";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."company_access" to "anon";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."company_access" to "authenticated";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."company_access" to "service_role";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."company_credit_ledger" to "anon";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."company_credit_ledger" to "authenticated";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."company_credit_ledger" to "service_role";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."company_credit_wallets" to "anon";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."company_credit_wallets" to "authenticated";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."company_credit_wallets" to "service_role";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."company_documents" to "anon";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."company_documents" to "authenticated";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."company_documents" to "service_role";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."company_entitlements" to "anon";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."company_entitlements" to "authenticated";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."company_entitlements" to "service_role";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."company_reviews" to "anon";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."company_reviews" to "authenticated";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."company_reviews" to "service_role";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."connect_invites" to "anon";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."connect_invites" to "authenticated";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."connect_invites" to "service_role";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."consents" to "anon";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."consents" to "authenticated";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."consents" to "service_role";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."content_comments" to "anon";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."content_comments" to "authenticated";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."content_comments" to "service_role";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."content_items" to "anon";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."content_items" to "authenticated";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."content_items" to "service_role";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."conversion_funnels" to "anon";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."conversion_funnels" to "authenticated";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."conversion_funnels" to "service_role";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."crm_contacts" to "anon";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."crm_contacts" to "authenticated";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."crm_contacts" to "service_role";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."crm_interactions" to "anon";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."crm_interactions" to "authenticated";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."crm_interactions" to "service_role";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."crm_segments" to "anon";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."crm_segments" to "authenticated";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."crm_segments" to "service_role";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."email_campaigns" to "anon";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."email_campaigns" to "authenticated";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."email_campaigns" to "service_role";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."email_subscribers" to "anon";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."email_subscribers" to "authenticated";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."email_subscribers" to "service_role";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."email_templates" to "anon";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."email_templates" to "authenticated";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."email_templates" to "service_role";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."evidence" to "anon";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."evidence" to "authenticated";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."evidence" to "service_role";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."funnel_ab_experiments" to "anon";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."funnel_ab_experiments" to "authenticated";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."funnel_ab_experiments" to "service_role";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."funnel_journeys" to "anon";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."funnel_journeys" to "authenticated";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."funnel_journeys" to "service_role";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."funnel_landing_pages" to "anon";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."funnel_landing_pages" to "authenticated";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."funnel_landing_pages" to "service_role";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."knowledge_documents" to "anon";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."knowledge_documents" to "authenticated";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."knowledge_documents" to "service_role";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."knowledge_gaps" to "anon";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."knowledge_gaps" to "authenticated";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."knowledge_gaps" to "service_role";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."leads" to "anon";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."leads" to "authenticated";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."leads" to "service_role";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."learning_hypotheses" to "anon";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."learning_hypotheses" to "authenticated";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."learning_hypotheses" to "service_role";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."learning_lessons" to "anon";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."learning_lessons" to "authenticated";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."learning_lessons" to "service_role";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."legal_holds" to "anon";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."legal_holds" to "authenticated";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."legal_holds" to "service_role";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."local_area_profiles" to "anon";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."local_area_profiles" to "authenticated";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."local_area_profiles" to "service_role";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."loyalty_coupons" to "anon";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."loyalty_coupons" to "authenticated";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."loyalty_coupons" to "service_role";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."loyalty_members" to "anon";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."loyalty_members" to "authenticated";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."loyalty_members" to "service_role";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."loyalty_programs" to "anon";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."loyalty_programs" to "authenticated";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."loyalty_programs" to "service_role";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."loyalty_redemptions" to "anon";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."loyalty_redemptions" to "authenticated";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."loyalty_redemptions" to "service_role";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."loyalty_referrals" to "anon";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."loyalty_referrals" to "authenticated";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."loyalty_referrals" to "service_role";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."loyalty_tiers" to "anon";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."loyalty_tiers" to "authenticated";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."loyalty_tiers" to "service_role";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."managed_approval_requests" to "anon";
grant DELETE, INSERT, REFERENCES, TRIGGER, TRUNCATE, UPDATE on table public."managed_approval_requests" to "authenticated";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."managed_approval_requests" to "service_role";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."managed_channel_adaptations" to "anon";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."managed_channel_adaptations" to "authenticated";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."managed_channel_adaptations" to "service_role";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."managed_content_concepts" to "anon";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."managed_content_concepts" to "authenticated";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."managed_content_concepts" to "service_role";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."managed_content_job_events" to "service_role";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."managed_content_job_exceptions" to "service_role";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."managed_content_jobs" to "service_role";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."managed_delivery_runs" to "anon";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."managed_delivery_runs" to "authenticated";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."managed_delivery_runs" to "service_role";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."managed_engagement_routes" to "anon";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."managed_engagement_routes" to "authenticated";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."managed_engagement_routes" to "service_role";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."managed_paid_authorizations" to "anon";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."managed_paid_authorizations" to "authenticated";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."managed_paid_authorizations" to "service_role";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."managed_planned_slots" to "anon";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."managed_planned_slots" to "authenticated";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."managed_planned_slots" to "service_role";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."managed_strategy_cycles" to "anon";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."managed_strategy_cycles" to "authenticated";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."managed_strategy_cycles" to "service_role";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."marketing_requests" to "anon";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."marketing_requests" to "authenticated";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."marketing_requests" to "service_role";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."marketing_workflow_settings" to "anon";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."marketing_workflow_settings" to "authenticated";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."marketing_workflow_settings" to "service_role";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."marketing_workflows" to "anon";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."marketing_workflows" to "authenticated";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."marketing_workflows" to "service_role";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."menu_designs" to "anon";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."menu_designs" to "authenticated";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."menu_designs" to "service_role";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."offers" to "anon";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."offers" to "authenticated";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."offers" to "service_role";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."order_menu_items" to "anon";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."order_menu_items" to "authenticated";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."order_menu_items" to "service_role";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."ordering_settings" to "anon";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."ordering_settings" to "authenticated";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."ordering_settings" to "service_role";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."partner_webhooks" to "anon";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."partner_webhooks" to "authenticated";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."partner_webhooks" to "service_role";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."photo_marketplace_bookings" to "anon";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."photo_marketplace_bookings" to "authenticated";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."photo_marketplace_bookings" to "service_role";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."photo_shoots" to "anon";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."photo_shoots" to "authenticated";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."photo_shoots" to "service_role";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."photographer_packages" to "anon";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."photographer_packages" to "authenticated";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."photographer_packages" to "service_role";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."photographer_profiles" to "anon";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."photographer_profiles" to "authenticated";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."photographer_profiles" to "service_role";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."privacy_requests" to "anon";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."privacy_requests" to "authenticated";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."privacy_requests" to "service_role";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."prompt_templates" to "anon";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."prompt_templates" to "authenticated";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."prompt_templates" to "service_role";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."publish_logs" to "anon";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."publish_logs" to "authenticated";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."publish_logs" to "service_role";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."publishing_controls" to "anon";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."publishing_controls" to "authenticated";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."publishing_controls" to "service_role";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."publishing_integrations" to "anon";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."publishing_integrations" to "authenticated";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."publishing_integrations" to "service_role";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."rag_knowledge_sources" to "anon";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."rag_knowledge_sources" to "authenticated";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."rag_knowledge_sources" to "service_role";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."rag_knowledge_versions" to "anon";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."rag_knowledge_versions" to "authenticated";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."rag_knowledge_versions" to "service_role";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."recommendation_dismiss_history" to "anon";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."recommendation_dismiss_history" to "authenticated";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."recommendation_dismiss_history" to "service_role";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."recommendations" to "anon";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."recommendations" to "authenticated";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."recommendations" to "service_role";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."reservations" to "anon";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."reservations" to "authenticated";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."reservations" to "service_role";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."restaurant_orders" to "anon";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."restaurant_orders" to "authenticated";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."restaurant_orders" to "service_role";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."review_request_campaigns" to "anon";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."review_request_campaigns" to "authenticated";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."review_request_campaigns" to "service_role";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."scheduled_posts" to "anon";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."scheduled_posts" to "authenticated";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."scheduled_posts" to "service_role";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."security_settings" to "anon";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."security_settings" to "authenticated";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."security_settings" to "service_role";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."services" to "anon";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."services" to "authenticated";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."services" to "service_role";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."sms_campaigns" to "anon";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."sms_campaigns" to "authenticated";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."sms_campaigns" to "service_role";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."sms_company_settings" to "anon";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."sms_company_settings" to "authenticated";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."sms_company_settings" to "service_role";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."sms_subscribers" to "anon";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."sms_subscribers" to "authenticated";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."sms_subscribers" to "service_role";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."social_mentions" to "anon";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."social_mentions" to "authenticated";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."social_mentions" to "service_role";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."social_responses" to "anon";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."social_responses" to "authenticated";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."social_responses" to "service_role";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."stripe_webhook_events" to "service_role";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."tasks" to "anon";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."tasks" to "authenticated";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."tasks" to "service_role";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."tax_invoices" to "anon";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."tax_invoices" to "authenticated";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."tax_invoices" to "service_role";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."tenant_members" to "anon";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."tenant_members" to "authenticated";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."tenant_members" to "service_role";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."tenants" to "anon";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."tenants" to "authenticated";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."tenants" to "service_role";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."terms_acceptances" to "anon";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."terms_acceptances" to "authenticated";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."terms_acceptances" to "service_role";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."terms_versions" to "anon";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."terms_versions" to "authenticated";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."terms_versions" to "service_role";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."utm_links" to "anon";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."utm_links" to "authenticated";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."utm_links" to "service_role";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."workflow_dispatch_logs" to "anon";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."workflow_dispatch_logs" to "authenticated";
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."workflow_dispatch_logs" to "service_role";
grant INSERT ("account_name", "company_id", "connected_at", "connected_by", "encrypted_token", "external_account_id", "id", "platform", "status", "token_last_four", "updated_at") on table public."ad_accounts" to "anon";
grant REFERENCES ("account_name", "company_id", "connected_at", "connected_by", "encrypted_token", "external_account_id", "id", "platform", "status", "token_last_four", "updated_at") on table public."ad_accounts" to "anon";
grant SELECT ("account_name", "company_id", "connected_at", "connected_by", "encrypted_token", "external_account_id", "id", "platform", "status", "token_last_four", "updated_at") on table public."ad_accounts" to "anon";
grant UPDATE ("account_name", "company_id", "connected_at", "connected_by", "encrypted_token", "external_account_id", "id", "platform", "status", "token_last_four", "updated_at") on table public."ad_accounts" to "anon";
grant INSERT ("account_name", "company_id", "connected_at", "connected_by", "encrypted_token", "external_account_id", "id", "platform", "status", "token_last_four", "updated_at") on table public."ad_accounts" to "authenticated";
grant REFERENCES ("account_name", "company_id", "connected_at", "connected_by", "encrypted_token", "external_account_id", "id", "platform", "status", "token_last_four", "updated_at") on table public."ad_accounts" to "authenticated";
grant SELECT ("account_name", "company_id", "connected_at", "connected_by", "encrypted_token", "external_account_id", "id", "platform", "status", "token_last_four", "updated_at") on table public."ad_accounts" to "authenticated";
grant UPDATE ("account_name", "company_id", "connected_at", "connected_by", "encrypted_token", "external_account_id", "id", "platform", "status", "token_last_four", "updated_at") on table public."ad_accounts" to "authenticated";
grant INSERT ("account_name", "company_id", "connected_at", "connected_by", "encrypted_token", "external_account_id", "id", "platform", "status", "token_last_four", "updated_at") on table public."ad_accounts" to "service_role";
grant REFERENCES ("account_name", "company_id", "connected_at", "connected_by", "encrypted_token", "external_account_id", "id", "platform", "status", "token_last_four", "updated_at") on table public."ad_accounts" to "service_role";
grant SELECT ("account_name", "company_id", "connected_at", "connected_by", "encrypted_token", "external_account_id", "id", "platform", "status", "token_last_four", "updated_at") on table public."ad_accounts" to "service_role";
grant UPDATE ("account_name", "company_id", "connected_at", "connected_by", "encrypted_token", "external_account_id", "id", "platform", "status", "token_last_four", "updated_at") on table public."ad_accounts" to "service_role";
grant INSERT ("allocation", "company_id", "fee_flat_usd", "fee_model", "fee_percent", "monthly_budget_usd", "updated_at", "updated_by") on table public."ad_budgets" to "anon";
grant REFERENCES ("allocation", "company_id", "fee_flat_usd", "fee_model", "fee_percent", "monthly_budget_usd", "updated_at", "updated_by") on table public."ad_budgets" to "anon";
grant SELECT ("allocation", "company_id", "fee_flat_usd", "fee_model", "fee_percent", "monthly_budget_usd", "updated_at", "updated_by") on table public."ad_budgets" to "anon";
grant UPDATE ("allocation", "company_id", "fee_flat_usd", "fee_model", "fee_percent", "monthly_budget_usd", "updated_at", "updated_by") on table public."ad_budgets" to "anon";
grant INSERT ("allocation", "company_id", "fee_flat_usd", "fee_model", "fee_percent", "monthly_budget_usd", "updated_at", "updated_by") on table public."ad_budgets" to "authenticated";
grant REFERENCES ("allocation", "company_id", "fee_flat_usd", "fee_model", "fee_percent", "monthly_budget_usd", "updated_at", "updated_by") on table public."ad_budgets" to "authenticated";
grant SELECT ("allocation", "company_id", "fee_flat_usd", "fee_model", "fee_percent", "monthly_budget_usd", "updated_at", "updated_by") on table public."ad_budgets" to "authenticated";
grant UPDATE ("allocation", "company_id", "fee_flat_usd", "fee_model", "fee_percent", "monthly_budget_usd", "updated_at", "updated_by") on table public."ad_budgets" to "authenticated";
grant INSERT ("allocation", "company_id", "fee_flat_usd", "fee_model", "fee_percent", "monthly_budget_usd", "updated_at", "updated_by") on table public."ad_budgets" to "service_role";
grant REFERENCES ("allocation", "company_id", "fee_flat_usd", "fee_model", "fee_percent", "monthly_budget_usd", "updated_at", "updated_by") on table public."ad_budgets" to "service_role";
grant SELECT ("allocation", "company_id", "fee_flat_usd", "fee_model", "fee_percent", "monthly_budget_usd", "updated_at", "updated_by") on table public."ad_budgets" to "service_role";
grant UPDATE ("allocation", "company_id", "fee_flat_usd", "fee_model", "fee_percent", "monthly_budget_usd", "updated_at", "updated_by") on table public."ad_budgets" to "service_role";
grant INSERT ("ad_account_id", "audience_segment_id", "company_id", "created_at", "created_by", "daily_budget_usd", "end_date", "external_campaign_id", "id", "name", "objective", "platform", "start_date", "status", "updated_at") on table public."ad_campaigns" to "anon";
grant REFERENCES ("ad_account_id", "audience_segment_id", "company_id", "created_at", "created_by", "daily_budget_usd", "end_date", "external_campaign_id", "id", "name", "objective", "platform", "start_date", "status", "updated_at") on table public."ad_campaigns" to "anon";
grant SELECT ("ad_account_id", "audience_segment_id", "company_id", "created_at", "created_by", "daily_budget_usd", "end_date", "external_campaign_id", "id", "name", "objective", "platform", "start_date", "status", "updated_at") on table public."ad_campaigns" to "anon";
grant UPDATE ("ad_account_id", "audience_segment_id", "company_id", "created_at", "created_by", "daily_budget_usd", "end_date", "external_campaign_id", "id", "name", "objective", "platform", "start_date", "status", "updated_at") on table public."ad_campaigns" to "anon";
grant INSERT ("ad_account_id", "audience_segment_id", "company_id", "created_at", "created_by", "daily_budget_usd", "end_date", "external_campaign_id", "id", "name", "objective", "platform", "start_date", "status", "updated_at") on table public."ad_campaigns" to "authenticated";
grant REFERENCES ("ad_account_id", "audience_segment_id", "company_id", "created_at", "created_by", "daily_budget_usd", "end_date", "external_campaign_id", "id", "name", "objective", "platform", "start_date", "status", "updated_at") on table public."ad_campaigns" to "authenticated";
grant SELECT ("ad_account_id", "audience_segment_id", "company_id", "created_at", "created_by", "daily_budget_usd", "end_date", "external_campaign_id", "id", "name", "objective", "platform", "start_date", "status", "updated_at") on table public."ad_campaigns" to "authenticated";
grant UPDATE ("ad_account_id", "audience_segment_id", "company_id", "created_at", "created_by", "daily_budget_usd", "end_date", "external_campaign_id", "id", "name", "objective", "platform", "start_date", "status", "updated_at") on table public."ad_campaigns" to "authenticated";
grant INSERT ("ad_account_id", "audience_segment_id", "company_id", "created_at", "created_by", "daily_budget_usd", "end_date", "external_campaign_id", "id", "name", "objective", "platform", "start_date", "status", "updated_at") on table public."ad_campaigns" to "service_role";
grant REFERENCES ("ad_account_id", "audience_segment_id", "company_id", "created_at", "created_by", "daily_budget_usd", "end_date", "external_campaign_id", "id", "name", "objective", "platform", "start_date", "status", "updated_at") on table public."ad_campaigns" to "service_role";
grant SELECT ("ad_account_id", "audience_segment_id", "company_id", "created_at", "created_by", "daily_budget_usd", "end_date", "external_campaign_id", "id", "name", "objective", "platform", "start_date", "status", "updated_at") on table public."ad_campaigns" to "service_role";
grant UPDATE ("ad_account_id", "audience_segment_id", "company_id", "created_at", "created_by", "daily_budget_usd", "end_date", "external_campaign_id", "id", "name", "objective", "platform", "start_date", "status", "updated_at") on table public."ad_campaigns" to "service_role";
grant INSERT ("captured_at", "company_id", "headline", "id", "open_count", "snoozed_count", "tenant_id", "top_score") on table public."agency_portfolio_snapshots" to "anon";
grant REFERENCES ("captured_at", "company_id", "headline", "id", "open_count", "snoozed_count", "tenant_id", "top_score") on table public."agency_portfolio_snapshots" to "anon";
grant SELECT ("captured_at", "company_id", "headline", "id", "open_count", "snoozed_count", "tenant_id", "top_score") on table public."agency_portfolio_snapshots" to "anon";
grant UPDATE ("captured_at", "company_id", "headline", "id", "open_count", "snoozed_count", "tenant_id", "top_score") on table public."agency_portfolio_snapshots" to "anon";
grant INSERT ("captured_at", "company_id", "headline", "id", "open_count", "snoozed_count", "tenant_id", "top_score") on table public."agency_portfolio_snapshots" to "authenticated";
grant REFERENCES ("captured_at", "company_id", "headline", "id", "open_count", "snoozed_count", "tenant_id", "top_score") on table public."agency_portfolio_snapshots" to "authenticated";
grant SELECT ("captured_at", "company_id", "headline", "id", "open_count", "snoozed_count", "tenant_id", "top_score") on table public."agency_portfolio_snapshots" to "authenticated";
grant UPDATE ("captured_at", "company_id", "headline", "id", "open_count", "snoozed_count", "tenant_id", "top_score") on table public."agency_portfolio_snapshots" to "authenticated";
grant INSERT ("captured_at", "company_id", "headline", "id", "open_count", "snoozed_count", "tenant_id", "top_score") on table public."agency_portfolio_snapshots" to "service_role";
grant REFERENCES ("captured_at", "company_id", "headline", "id", "open_count", "snoozed_count", "tenant_id", "top_score") on table public."agency_portfolio_snapshots" to "service_role";
grant SELECT ("captured_at", "company_id", "headline", "id", "open_count", "snoozed_count", "tenant_id", "top_score") on table public."agency_portfolio_snapshots" to "service_role";
grant UPDATE ("captured_at", "company_id", "headline", "id", "open_count", "snoozed_count", "tenant_id", "top_score") on table public."agency_portfolio_snapshots" to "service_role";
grant INSERT ("action_taken", "actual_outcome", "campaign_id", "company_id", "confidence_score", "created_at", "expected_outcome", "feedback_score", "human_decision", "human_decision_at", "id", "model_name", "model_provider", "model_version", "orchestration_run_id", "override_reason", "payload", "prompt_version", "recommendation_type", "related_entity_id", "related_entity_type", "risk_score", "summary", "tenant_id", "updated_at") on table public."ai_campaign_recommendations" to "anon";
grant REFERENCES ("action_taken", "actual_outcome", "campaign_id", "company_id", "confidence_score", "created_at", "expected_outcome", "feedback_score", "human_decision", "human_decision_at", "id", "model_name", "model_provider", "model_version", "orchestration_run_id", "override_reason", "payload", "prompt_version", "recommendation_type", "related_entity_id", "related_entity_type", "risk_score", "summary", "tenant_id", "updated_at") on table public."ai_campaign_recommendations" to "anon";
grant SELECT ("action_taken", "actual_outcome", "campaign_id", "company_id", "confidence_score", "created_at", "expected_outcome", "feedback_score", "human_decision", "human_decision_at", "id", "model_name", "model_provider", "model_version", "orchestration_run_id", "override_reason", "payload", "prompt_version", "recommendation_type", "related_entity_id", "related_entity_type", "risk_score", "summary", "tenant_id", "updated_at") on table public."ai_campaign_recommendations" to "anon";
grant UPDATE ("action_taken", "actual_outcome", "campaign_id", "company_id", "confidence_score", "created_at", "expected_outcome", "feedback_score", "human_decision", "human_decision_at", "id", "model_name", "model_provider", "model_version", "orchestration_run_id", "override_reason", "payload", "prompt_version", "recommendation_type", "related_entity_id", "related_entity_type", "risk_score", "summary", "tenant_id", "updated_at") on table public."ai_campaign_recommendations" to "anon";
grant INSERT ("action_taken", "actual_outcome", "campaign_id", "company_id", "confidence_score", "created_at", "expected_outcome", "feedback_score", "human_decision", "human_decision_at", "id", "model_name", "model_provider", "model_version", "orchestration_run_id", "override_reason", "payload", "prompt_version", "recommendation_type", "related_entity_id", "related_entity_type", "risk_score", "summary", "tenant_id", "updated_at") on table public."ai_campaign_recommendations" to "authenticated";
grant REFERENCES ("action_taken", "actual_outcome", "campaign_id", "company_id", "confidence_score", "created_at", "expected_outcome", "feedback_score", "human_decision", "human_decision_at", "id", "model_name", "model_provider", "model_version", "orchestration_run_id", "override_reason", "payload", "prompt_version", "recommendation_type", "related_entity_id", "related_entity_type", "risk_score", "summary", "tenant_id", "updated_at") on table public."ai_campaign_recommendations" to "authenticated";
grant SELECT ("action_taken", "actual_outcome", "campaign_id", "company_id", "confidence_score", "created_at", "expected_outcome", "feedback_score", "human_decision", "human_decision_at", "id", "model_name", "model_provider", "model_version", "orchestration_run_id", "override_reason", "payload", "prompt_version", "recommendation_type", "related_entity_id", "related_entity_type", "risk_score", "summary", "tenant_id", "updated_at") on table public."ai_campaign_recommendations" to "authenticated";
grant UPDATE ("action_taken", "actual_outcome", "campaign_id", "company_id", "confidence_score", "created_at", "expected_outcome", "feedback_score", "human_decision", "human_decision_at", "id", "model_name", "model_provider", "model_version", "orchestration_run_id", "override_reason", "payload", "prompt_version", "recommendation_type", "related_entity_id", "related_entity_type", "risk_score", "summary", "tenant_id", "updated_at") on table public."ai_campaign_recommendations" to "authenticated";
grant INSERT ("action_taken", "actual_outcome", "campaign_id", "company_id", "confidence_score", "created_at", "expected_outcome", "feedback_score", "human_decision", "human_decision_at", "id", "model_name", "model_provider", "model_version", "orchestration_run_id", "override_reason", "payload", "prompt_version", "recommendation_type", "related_entity_id", "related_entity_type", "risk_score", "summary", "tenant_id", "updated_at") on table public."ai_campaign_recommendations" to "service_role";
grant REFERENCES ("action_taken", "actual_outcome", "campaign_id", "company_id", "confidence_score", "created_at", "expected_outcome", "feedback_score", "human_decision", "human_decision_at", "id", "model_name", "model_provider", "model_version", "orchestration_run_id", "override_reason", "payload", "prompt_version", "recommendation_type", "related_entity_id", "related_entity_type", "risk_score", "summary", "tenant_id", "updated_at") on table public."ai_campaign_recommendations" to "service_role";
grant SELECT ("action_taken", "actual_outcome", "campaign_id", "company_id", "confidence_score", "created_at", "expected_outcome", "feedback_score", "human_decision", "human_decision_at", "id", "model_name", "model_provider", "model_version", "orchestration_run_id", "override_reason", "payload", "prompt_version", "recommendation_type", "related_entity_id", "related_entity_type", "risk_score", "summary", "tenant_id", "updated_at") on table public."ai_campaign_recommendations" to "service_role";
grant UPDATE ("action_taken", "actual_outcome", "campaign_id", "company_id", "confidence_score", "created_at", "expected_outcome", "feedback_score", "human_decision", "human_decision_at", "id", "model_name", "model_provider", "model_version", "orchestration_run_id", "override_reason", "payload", "prompt_version", "recommendation_type", "related_entity_id", "related_entity_type", "risk_score", "summary", "tenant_id", "updated_at") on table public."ai_campaign_recommendations" to "service_role";
grant INSERT ("ai_run_id", "company_id", "converted_at", "created_at", "created_by", "diagnosis", "dismiss_reason", "dismissed_at", "evidence", "id", "kind", "priority", "result_id", "result_type", "status", "suggested_action", "tenant_id", "title") on table public."ai_mos_opportunities" to "anon";
grant REFERENCES ("ai_run_id", "company_id", "converted_at", "created_at", "created_by", "diagnosis", "dismiss_reason", "dismissed_at", "evidence", "id", "kind", "priority", "result_id", "result_type", "status", "suggested_action", "tenant_id", "title") on table public."ai_mos_opportunities" to "anon";
grant SELECT ("ai_run_id", "company_id", "converted_at", "created_at", "created_by", "diagnosis", "dismiss_reason", "dismissed_at", "evidence", "id", "kind", "priority", "result_id", "result_type", "status", "suggested_action", "tenant_id", "title") on table public."ai_mos_opportunities" to "anon";
grant UPDATE ("ai_run_id", "company_id", "converted_at", "created_at", "created_by", "diagnosis", "dismiss_reason", "dismissed_at", "evidence", "id", "kind", "priority", "result_id", "result_type", "status", "suggested_action", "tenant_id", "title") on table public."ai_mos_opportunities" to "anon";
grant INSERT ("ai_run_id", "company_id", "converted_at", "created_at", "created_by", "diagnosis", "dismiss_reason", "dismissed_at", "evidence", "id", "kind", "priority", "result_id", "result_type", "status", "suggested_action", "tenant_id", "title") on table public."ai_mos_opportunities" to "authenticated";
grant REFERENCES ("ai_run_id", "company_id", "converted_at", "created_at", "created_by", "diagnosis", "dismiss_reason", "dismissed_at", "evidence", "id", "kind", "priority", "result_id", "result_type", "status", "suggested_action", "tenant_id", "title") on table public."ai_mos_opportunities" to "authenticated";
grant SELECT ("ai_run_id", "company_id", "converted_at", "created_at", "created_by", "diagnosis", "dismiss_reason", "dismissed_at", "evidence", "id", "kind", "priority", "result_id", "result_type", "status", "suggested_action", "tenant_id", "title") on table public."ai_mos_opportunities" to "authenticated";
grant UPDATE ("ai_run_id", "company_id", "converted_at", "created_at", "created_by", "diagnosis", "dismiss_reason", "dismissed_at", "evidence", "id", "kind", "priority", "result_id", "result_type", "status", "suggested_action", "tenant_id", "title") on table public."ai_mos_opportunities" to "authenticated";
grant INSERT ("ai_run_id", "company_id", "converted_at", "created_at", "created_by", "diagnosis", "dismiss_reason", "dismissed_at", "evidence", "id", "kind", "priority", "result_id", "result_type", "status", "suggested_action", "tenant_id", "title") on table public."ai_mos_opportunities" to "service_role";
grant REFERENCES ("ai_run_id", "company_id", "converted_at", "created_at", "created_by", "diagnosis", "dismiss_reason", "dismissed_at", "evidence", "id", "kind", "priority", "result_id", "result_type", "status", "suggested_action", "tenant_id", "title") on table public."ai_mos_opportunities" to "service_role";
grant SELECT ("ai_run_id", "company_id", "converted_at", "created_at", "created_by", "diagnosis", "dismiss_reason", "dismissed_at", "evidence", "id", "kind", "priority", "result_id", "result_type", "status", "suggested_action", "tenant_id", "title") on table public."ai_mos_opportunities" to "service_role";
grant UPDATE ("ai_run_id", "company_id", "converted_at", "created_at", "created_by", "diagnosis", "dismiss_reason", "dismissed_at", "evidence", "id", "kind", "priority", "result_id", "result_type", "status", "suggested_action", "tenant_id", "title") on table public."ai_mos_opportunities" to "service_role";
grant INSERT ("ai_run_id", "company_id", "created_at", "execution_mode", "id", "mode", "opportunity_count", "signal_count", "signals", "tenant_id", "user_id") on table public."ai_mos_signal_runs" to "anon";
grant REFERENCES ("ai_run_id", "company_id", "created_at", "execution_mode", "id", "mode", "opportunity_count", "signal_count", "signals", "tenant_id", "user_id") on table public."ai_mos_signal_runs" to "anon";
grant SELECT ("ai_run_id", "company_id", "created_at", "execution_mode", "id", "mode", "opportunity_count", "signal_count", "signals", "tenant_id", "user_id") on table public."ai_mos_signal_runs" to "anon";
grant UPDATE ("ai_run_id", "company_id", "created_at", "execution_mode", "id", "mode", "opportunity_count", "signal_count", "signals", "tenant_id", "user_id") on table public."ai_mos_signal_runs" to "anon";
grant INSERT ("ai_run_id", "company_id", "created_at", "execution_mode", "id", "mode", "opportunity_count", "signal_count", "signals", "tenant_id", "user_id") on table public."ai_mos_signal_runs" to "authenticated";
grant REFERENCES ("ai_run_id", "company_id", "created_at", "execution_mode", "id", "mode", "opportunity_count", "signal_count", "signals", "tenant_id", "user_id") on table public."ai_mos_signal_runs" to "authenticated";
grant SELECT ("ai_run_id", "company_id", "created_at", "execution_mode", "id", "mode", "opportunity_count", "signal_count", "signals", "tenant_id", "user_id") on table public."ai_mos_signal_runs" to "authenticated";
grant UPDATE ("ai_run_id", "company_id", "created_at", "execution_mode", "id", "mode", "opportunity_count", "signal_count", "signals", "tenant_id", "user_id") on table public."ai_mos_signal_runs" to "authenticated";
grant INSERT ("ai_run_id", "company_id", "created_at", "execution_mode", "id", "mode", "opportunity_count", "signal_count", "signals", "tenant_id", "user_id") on table public."ai_mos_signal_runs" to "service_role";
grant REFERENCES ("ai_run_id", "company_id", "created_at", "execution_mode", "id", "mode", "opportunity_count", "signal_count", "signals", "tenant_id", "user_id") on table public."ai_mos_signal_runs" to "service_role";
grant SELECT ("ai_run_id", "company_id", "created_at", "execution_mode", "id", "mode", "opportunity_count", "signal_count", "signals", "tenant_id", "user_id") on table public."ai_mos_signal_runs" to "service_role";
grant UPDATE ("ai_run_id", "company_id", "created_at", "execution_mode", "id", "mode", "opportunity_count", "signal_count", "signals", "tenant_id", "user_id") on table public."ai_mos_signal_runs" to "service_role";
grant INSERT ("approval_required", "campaign_id", "company_id", "confidence_score", "correlation_id", "created_at", "created_by", "id", "input_summary", "model_name", "model_provider", "operation", "prompt_version_id", "risk_score", "status", "structured_output", "tenant_id", "updated_at") on table public."ai_orchestration_runs" to "anon";
grant REFERENCES ("approval_required", "campaign_id", "company_id", "confidence_score", "correlation_id", "created_at", "created_by", "id", "input_summary", "model_name", "model_provider", "operation", "prompt_version_id", "risk_score", "status", "structured_output", "tenant_id", "updated_at") on table public."ai_orchestration_runs" to "anon";
grant SELECT ("approval_required", "campaign_id", "company_id", "confidence_score", "correlation_id", "created_at", "created_by", "id", "input_summary", "model_name", "model_provider", "operation", "prompt_version_id", "risk_score", "status", "structured_output", "tenant_id", "updated_at") on table public."ai_orchestration_runs" to "anon";
grant UPDATE ("approval_required", "campaign_id", "company_id", "confidence_score", "correlation_id", "created_at", "created_by", "id", "input_summary", "model_name", "model_provider", "operation", "prompt_version_id", "risk_score", "status", "structured_output", "tenant_id", "updated_at") on table public."ai_orchestration_runs" to "anon";
grant INSERT ("approval_required", "campaign_id", "company_id", "confidence_score", "correlation_id", "created_at", "created_by", "id", "input_summary", "model_name", "model_provider", "operation", "prompt_version_id", "risk_score", "status", "structured_output", "tenant_id", "updated_at") on table public."ai_orchestration_runs" to "authenticated";
grant REFERENCES ("approval_required", "campaign_id", "company_id", "confidence_score", "correlation_id", "created_at", "created_by", "id", "input_summary", "model_name", "model_provider", "operation", "prompt_version_id", "risk_score", "status", "structured_output", "tenant_id", "updated_at") on table public."ai_orchestration_runs" to "authenticated";
grant SELECT ("approval_required", "campaign_id", "company_id", "confidence_score", "correlation_id", "created_at", "created_by", "id", "input_summary", "model_name", "model_provider", "operation", "prompt_version_id", "risk_score", "status", "structured_output", "tenant_id", "updated_at") on table public."ai_orchestration_runs" to "authenticated";
grant UPDATE ("approval_required", "campaign_id", "company_id", "confidence_score", "correlation_id", "created_at", "created_by", "id", "input_summary", "model_name", "model_provider", "operation", "prompt_version_id", "risk_score", "status", "structured_output", "tenant_id", "updated_at") on table public."ai_orchestration_runs" to "authenticated";
grant INSERT ("approval_required", "campaign_id", "company_id", "confidence_score", "correlation_id", "created_at", "created_by", "id", "input_summary", "model_name", "model_provider", "operation", "prompt_version_id", "risk_score", "status", "structured_output", "tenant_id", "updated_at") on table public."ai_orchestration_runs" to "service_role";
grant REFERENCES ("approval_required", "campaign_id", "company_id", "confidence_score", "correlation_id", "created_at", "created_by", "id", "input_summary", "model_name", "model_provider", "operation", "prompt_version_id", "risk_score", "status", "structured_output", "tenant_id", "updated_at") on table public."ai_orchestration_runs" to "service_role";
grant SELECT ("approval_required", "campaign_id", "company_id", "confidence_score", "correlation_id", "created_at", "created_by", "id", "input_summary", "model_name", "model_provider", "operation", "prompt_version_id", "risk_score", "status", "structured_output", "tenant_id", "updated_at") on table public."ai_orchestration_runs" to "service_role";
grant UPDATE ("approval_required", "campaign_id", "company_id", "confidence_score", "correlation_id", "created_at", "created_by", "id", "input_summary", "model_name", "model_provider", "operation", "prompt_version_id", "risk_score", "status", "structured_output", "tenant_id", "updated_at") on table public."ai_orchestration_runs" to "service_role";
grant INSERT ("active", "approved_by", "created_at", "created_by", "effective_at", "id", "model_name", "model_provider", "name", "output_schema", "prompt_key", "prompt_text", "purpose", "retired_at", "temperature", "tenant_id", "updated_at", "version") on table public."ai_prompt_versions" to "anon";
grant REFERENCES ("active", "approved_by", "created_at", "created_by", "effective_at", "id", "model_name", "model_provider", "name", "output_schema", "prompt_key", "prompt_text", "purpose", "retired_at", "temperature", "tenant_id", "updated_at", "version") on table public."ai_prompt_versions" to "anon";
grant SELECT ("active", "approved_by", "created_at", "created_by", "effective_at", "id", "model_name", "model_provider", "name", "output_schema", "prompt_key", "prompt_text", "purpose", "retired_at", "temperature", "tenant_id", "updated_at", "version") on table public."ai_prompt_versions" to "anon";
grant UPDATE ("active", "approved_by", "created_at", "created_by", "effective_at", "id", "model_name", "model_provider", "name", "output_schema", "prompt_key", "prompt_text", "purpose", "retired_at", "temperature", "tenant_id", "updated_at", "version") on table public."ai_prompt_versions" to "anon";
grant INSERT ("active", "approved_by", "created_at", "created_by", "effective_at", "id", "model_name", "model_provider", "name", "output_schema", "prompt_key", "prompt_text", "purpose", "retired_at", "temperature", "tenant_id", "updated_at", "version") on table public."ai_prompt_versions" to "authenticated";
grant REFERENCES ("active", "approved_by", "created_at", "created_by", "effective_at", "id", "model_name", "model_provider", "name", "output_schema", "prompt_key", "prompt_text", "purpose", "retired_at", "temperature", "tenant_id", "updated_at", "version") on table public."ai_prompt_versions" to "authenticated";
grant SELECT ("active", "approved_by", "created_at", "created_by", "effective_at", "id", "model_name", "model_provider", "name", "output_schema", "prompt_key", "prompt_text", "purpose", "retired_at", "temperature", "tenant_id", "updated_at", "version") on table public."ai_prompt_versions" to "authenticated";
grant UPDATE ("active", "approved_by", "created_at", "created_by", "effective_at", "id", "model_name", "model_provider", "name", "output_schema", "prompt_key", "prompt_text", "purpose", "retired_at", "temperature", "tenant_id", "updated_at", "version") on table public."ai_prompt_versions" to "authenticated";
grant INSERT ("active", "approved_by", "created_at", "created_by", "effective_at", "id", "model_name", "model_provider", "name", "output_schema", "prompt_key", "prompt_text", "purpose", "retired_at", "temperature", "tenant_id", "updated_at", "version") on table public."ai_prompt_versions" to "service_role";
grant REFERENCES ("active", "approved_by", "created_at", "created_by", "effective_at", "id", "model_name", "model_provider", "name", "output_schema", "prompt_key", "prompt_text", "purpose", "retired_at", "temperature", "tenant_id", "updated_at", "version") on table public."ai_prompt_versions" to "service_role";
grant SELECT ("active", "approved_by", "created_at", "created_by", "effective_at", "id", "model_name", "model_provider", "name", "output_schema", "prompt_key", "prompt_text", "purpose", "retired_at", "temperature", "tenant_id", "updated_at", "version") on table public."ai_prompt_versions" to "service_role";
grant UPDATE ("active", "approved_by", "created_at", "created_by", "effective_at", "id", "model_name", "model_provider", "name", "output_schema", "prompt_key", "prompt_text", "purpose", "retired_at", "temperature", "tenant_id", "updated_at", "version") on table public."ai_prompt_versions" to "service_role";
grant INSERT ("company_id", "context_chars", "created_at", "est_cost_usd", "id", "input_tokens", "kind", "model", "output_chars", "output_tokens", "prompt_summary", "sources_used", "tenant_id", "user_id") on table public."ai_runs" to "anon";
grant REFERENCES ("company_id", "context_chars", "created_at", "est_cost_usd", "id", "input_tokens", "kind", "model", "output_chars", "output_tokens", "prompt_summary", "sources_used", "tenant_id", "user_id") on table public."ai_runs" to "anon";
grant SELECT ("company_id", "context_chars", "created_at", "est_cost_usd", "id", "input_tokens", "kind", "model", "output_chars", "output_tokens", "prompt_summary", "sources_used", "tenant_id", "user_id") on table public."ai_runs" to "anon";
grant UPDATE ("company_id", "context_chars", "created_at", "est_cost_usd", "id", "input_tokens", "kind", "model", "output_chars", "output_tokens", "prompt_summary", "sources_used", "tenant_id", "user_id") on table public."ai_runs" to "anon";
grant INSERT ("company_id", "context_chars", "created_at", "est_cost_usd", "id", "input_tokens", "kind", "model", "output_chars", "output_tokens", "prompt_summary", "sources_used", "tenant_id", "user_id") on table public."ai_runs" to "authenticated";
grant REFERENCES ("company_id", "context_chars", "created_at", "est_cost_usd", "id", "input_tokens", "kind", "model", "output_chars", "output_tokens", "prompt_summary", "sources_used", "tenant_id", "user_id") on table public."ai_runs" to "authenticated";
grant SELECT ("company_id", "context_chars", "created_at", "est_cost_usd", "id", "input_tokens", "kind", "model", "output_chars", "output_tokens", "prompt_summary", "sources_used", "tenant_id", "user_id") on table public."ai_runs" to "authenticated";
grant UPDATE ("company_id", "context_chars", "created_at", "est_cost_usd", "id", "input_tokens", "kind", "model", "output_chars", "output_tokens", "prompt_summary", "sources_used", "tenant_id", "user_id") on table public."ai_runs" to "authenticated";
grant INSERT ("company_id", "context_chars", "created_at", "est_cost_usd", "id", "input_tokens", "kind", "model", "output_chars", "output_tokens", "prompt_summary", "sources_used", "tenant_id", "user_id") on table public."ai_runs" to "service_role";
grant REFERENCES ("company_id", "context_chars", "created_at", "est_cost_usd", "id", "input_tokens", "kind", "model", "output_chars", "output_tokens", "prompt_summary", "sources_used", "tenant_id", "user_id") on table public."ai_runs" to "service_role";
grant SELECT ("company_id", "context_chars", "created_at", "est_cost_usd", "id", "input_tokens", "kind", "model", "output_chars", "output_tokens", "prompt_summary", "sources_used", "tenant_id", "user_id") on table public."ai_runs" to "service_role";
grant UPDATE ("company_id", "context_chars", "created_at", "est_cost_usd", "id", "input_tokens", "kind", "model", "output_chars", "output_tokens", "prompt_summary", "sources_used", "tenant_id", "user_id") on table public."ai_runs" to "service_role";
grant INSERT ("company_ids", "created_at", "created_by", "id", "key_hash", "key_prefix", "last_used_at", "name", "revoked_at", "scopes", "tenant_id", "updated_at") on table public."api_keys" to "anon";
grant REFERENCES ("company_ids", "created_at", "created_by", "id", "key_hash", "key_prefix", "last_used_at", "name", "revoked_at", "scopes", "tenant_id", "updated_at") on table public."api_keys" to "anon";
grant SELECT ("company_ids", "created_at", "created_by", "id", "key_hash", "key_prefix", "last_used_at", "name", "revoked_at", "scopes", "tenant_id", "updated_at") on table public."api_keys" to "anon";
grant UPDATE ("company_ids", "created_at", "created_by", "id", "key_hash", "key_prefix", "last_used_at", "name", "revoked_at", "scopes", "tenant_id", "updated_at") on table public."api_keys" to "anon";
grant INSERT ("company_ids", "created_at", "created_by", "id", "key_hash", "key_prefix", "last_used_at", "name", "revoked_at", "scopes", "tenant_id", "updated_at") on table public."api_keys" to "authenticated";
grant REFERENCES ("company_ids", "created_at", "created_by", "id", "key_hash", "key_prefix", "last_used_at", "name", "revoked_at", "scopes", "tenant_id", "updated_at") on table public."api_keys" to "authenticated";
grant SELECT ("company_ids", "created_at", "created_by", "id", "key_hash", "key_prefix", "last_used_at", "name", "revoked_at", "scopes", "tenant_id", "updated_at") on table public."api_keys" to "authenticated";
grant UPDATE ("company_ids", "created_at", "created_by", "id", "key_hash", "key_prefix", "last_used_at", "name", "revoked_at", "scopes", "tenant_id", "updated_at") on table public."api_keys" to "authenticated";
grant INSERT ("company_ids", "created_at", "created_by", "id", "key_hash", "key_prefix", "last_used_at", "name", "revoked_at", "scopes", "tenant_id", "updated_at") on table public."api_keys" to "service_role";
grant REFERENCES ("company_ids", "created_at", "created_by", "id", "key_hash", "key_prefix", "last_used_at", "name", "revoked_at", "scopes", "tenant_id", "updated_at") on table public."api_keys" to "service_role";
grant SELECT ("company_ids", "created_at", "created_by", "id", "key_hash", "key_prefix", "last_used_at", "name", "revoked_at", "scopes", "tenant_id", "updated_at") on table public."api_keys" to "service_role";
grant UPDATE ("company_ids", "created_at", "created_by", "id", "key_hash", "key_prefix", "last_used_at", "name", "revoked_at", "scopes", "tenant_id", "updated_at") on table public."api_keys" to "service_role";
grant INSERT ("active", "created_at", "email", "id", "name", "platform_admin") on table public."app_users" to "anon";
grant REFERENCES ("active", "created_at", "email", "id", "name", "platform_admin") on table public."app_users" to "anon";
grant SELECT ("active", "created_at", "email", "id", "name", "platform_admin") on table public."app_users" to "anon";
grant UPDATE ("active", "created_at", "email", "id", "name", "platform_admin") on table public."app_users" to "anon";
grant INSERT ("active", "created_at", "email", "id", "name", "platform_admin") on table public."app_users" to "authenticated";
grant REFERENCES ("active", "created_at", "email", "id", "name", "platform_admin") on table public."app_users" to "authenticated";
grant SELECT ("active", "created_at", "email", "id", "name", "platform_admin") on table public."app_users" to "authenticated";
grant UPDATE ("active", "created_at", "email", "id", "name", "platform_admin") on table public."app_users" to "authenticated";
grant INSERT ("active", "created_at", "email", "id", "name", "platform_admin") on table public."app_users" to "service_role";
grant REFERENCES ("active", "created_at", "email", "id", "name", "platform_admin") on table public."app_users" to "service_role";
grant SELECT ("active", "created_at", "email", "id", "name", "platform_admin") on table public."app_users" to "service_role";
grant UPDATE ("active", "created_at", "email", "id", "name", "platform_admin") on table public."app_users" to "service_role";
grant INSERT ("active", "approval_level", "created_at", "created_by", "entity_type", "id", "name", "tenant_id", "trigger_rules", "updated_at") on table public."approval_policies" to "anon";
grant REFERENCES ("active", "approval_level", "created_at", "created_by", "entity_type", "id", "name", "tenant_id", "trigger_rules", "updated_at") on table public."approval_policies" to "anon";
grant SELECT ("active", "approval_level", "created_at", "created_by", "entity_type", "id", "name", "tenant_id", "trigger_rules", "updated_at") on table public."approval_policies" to "anon";
grant UPDATE ("active", "approval_level", "created_at", "created_by", "entity_type", "id", "name", "tenant_id", "trigger_rules", "updated_at") on table public."approval_policies" to "anon";
grant INSERT ("active", "approval_level", "created_at", "created_by", "entity_type", "id", "name", "tenant_id", "trigger_rules", "updated_at") on table public."approval_policies" to "authenticated";
grant REFERENCES ("active", "approval_level", "created_at", "created_by", "entity_type", "id", "name", "tenant_id", "trigger_rules", "updated_at") on table public."approval_policies" to "authenticated";
grant SELECT ("active", "approval_level", "created_at", "created_by", "entity_type", "id", "name", "tenant_id", "trigger_rules", "updated_at") on table public."approval_policies" to "authenticated";
grant UPDATE ("active", "approval_level", "created_at", "created_by", "entity_type", "id", "name", "tenant_id", "trigger_rules", "updated_at") on table public."approval_policies" to "authenticated";
grant INSERT ("active", "approval_level", "created_at", "created_by", "entity_type", "id", "name", "tenant_id", "trigger_rules", "updated_at") on table public."approval_policies" to "service_role";
grant REFERENCES ("active", "approval_level", "created_at", "created_by", "entity_type", "id", "name", "tenant_id", "trigger_rules", "updated_at") on table public."approval_policies" to "service_role";
grant SELECT ("active", "approval_level", "created_at", "created_by", "entity_type", "id", "name", "tenant_id", "trigger_rules", "updated_at") on table public."approval_policies" to "service_role";
grant UPDATE ("active", "approval_level", "created_at", "created_by", "entity_type", "id", "name", "tenant_id", "trigger_rules", "updated_at") on table public."approval_policies" to "service_role";
grant INSERT ("active", "allowed_channels", "claim_text", "company_id", "created_at", "evidence_id", "id") on table public."approved_claims" to "anon";
grant REFERENCES ("active", "allowed_channels", "claim_text", "company_id", "created_at", "evidence_id", "id") on table public."approved_claims" to "anon";
grant SELECT ("active", "allowed_channels", "claim_text", "company_id", "created_at", "evidence_id", "id") on table public."approved_claims" to "anon";
grant UPDATE ("active", "allowed_channels", "claim_text", "company_id", "created_at", "evidence_id", "id") on table public."approved_claims" to "anon";
grant INSERT ("active", "allowed_channels", "claim_text", "company_id", "created_at", "evidence_id", "id") on table public."approved_claims" to "authenticated";
grant REFERENCES ("active", "allowed_channels", "claim_text", "company_id", "created_at", "evidence_id", "id") on table public."approved_claims" to "authenticated";
grant SELECT ("active", "allowed_channels", "claim_text", "company_id", "created_at", "evidence_id", "id") on table public."approved_claims" to "authenticated";
grant UPDATE ("active", "allowed_channels", "claim_text", "company_id", "created_at", "evidence_id", "id") on table public."approved_claims" to "authenticated";
grant INSERT ("active", "allowed_channels", "claim_text", "company_id", "created_at", "evidence_id", "id") on table public."approved_claims" to "service_role";
grant REFERENCES ("active", "allowed_channels", "claim_text", "company_id", "created_at", "evidence_id", "id") on table public."approved_claims" to "service_role";
grant SELECT ("active", "allowed_channels", "claim_text", "company_id", "created_at", "evidence_id", "id") on table public."approved_claims" to "service_role";
grant UPDATE ("active", "allowed_channels", "claim_text", "company_id", "created_at", "evidence_id", "id") on table public."approved_claims" to "service_role";
grant INSERT ("active", "category", "company_id", "created_at", "id", "response_text", "tenant_id", "title") on table public."approved_responses" to "anon";
grant REFERENCES ("active", "category", "company_id", "created_at", "id", "response_text", "tenant_id", "title") on table public."approved_responses" to "anon";
grant SELECT ("active", "category", "company_id", "created_at", "id", "response_text", "tenant_id", "title") on table public."approved_responses" to "anon";
grant UPDATE ("active", "category", "company_id", "created_at", "id", "response_text", "tenant_id", "title") on table public."approved_responses" to "anon";
grant INSERT ("active", "category", "company_id", "created_at", "id", "response_text", "tenant_id", "title") on table public."approved_responses" to "authenticated";
grant REFERENCES ("active", "category", "company_id", "created_at", "id", "response_text", "tenant_id", "title") on table public."approved_responses" to "authenticated";
grant SELECT ("active", "category", "company_id", "created_at", "id", "response_text", "tenant_id", "title") on table public."approved_responses" to "authenticated";
grant UPDATE ("active", "category", "company_id", "created_at", "id", "response_text", "tenant_id", "title") on table public."approved_responses" to "authenticated";
grant INSERT ("active", "category", "company_id", "created_at", "id", "response_text", "tenant_id", "title") on table public."approved_responses" to "service_role";
grant REFERENCES ("active", "category", "company_id", "created_at", "id", "response_text", "tenant_id", "title") on table public."approved_responses" to "service_role";
grant SELECT ("active", "category", "company_id", "created_at", "id", "response_text", "tenant_id", "title") on table public."approved_responses" to "service_role";
grant UPDATE ("active", "category", "company_id", "created_at", "id", "response_text", "tenant_id", "title") on table public."approved_responses" to "service_role";
grant INSERT ("ai_model", "ai_prompt", "ai_run_id", "approved_at", "approved_by", "asset_type", "company_id", "created_at", "created_by", "description", "est_cost_usd", "external_ref", "file_name", "folder", "id", "location_id", "mime_type", "name", "private_provenance", "rights_confirmation_email", "rights_confirmed_at", "size_bytes", "source", "sources_used", "status", "stored_file", "tags", "updated_at", "usage_rights") on table public."assets" to "anon";
grant REFERENCES ("ai_model", "ai_prompt", "ai_run_id", "approved_at", "approved_by", "asset_type", "company_id", "created_at", "created_by", "description", "est_cost_usd", "external_ref", "file_name", "folder", "id", "location_id", "mime_type", "name", "private_provenance", "rights_confirmation_email", "rights_confirmed_at", "size_bytes", "source", "sources_used", "status", "stored_file", "tags", "updated_at", "usage_rights") on table public."assets" to "anon";
grant SELECT ("ai_model", "ai_prompt", "ai_run_id", "approved_at", "approved_by", "asset_type", "company_id", "created_at", "created_by", "description", "est_cost_usd", "external_ref", "file_name", "folder", "id", "location_id", "mime_type", "name", "private_provenance", "rights_confirmation_email", "rights_confirmed_at", "size_bytes", "source", "sources_used", "status", "stored_file", "tags", "updated_at", "usage_rights") on table public."assets" to "anon";
grant UPDATE ("ai_model", "ai_prompt", "ai_run_id", "approved_at", "approved_by", "asset_type", "company_id", "created_at", "created_by", "description", "est_cost_usd", "external_ref", "file_name", "folder", "id", "location_id", "mime_type", "name", "private_provenance", "rights_confirmation_email", "rights_confirmed_at", "size_bytes", "source", "sources_used", "status", "stored_file", "tags", "updated_at", "usage_rights") on table public."assets" to "anon";
grant INSERT ("ai_model", "ai_prompt", "ai_run_id", "approved_at", "approved_by", "asset_type", "company_id", "created_at", "created_by", "description", "est_cost_usd", "external_ref", "file_name", "folder", "id", "location_id", "mime_type", "name", "private_provenance", "rights_confirmation_email", "rights_confirmed_at", "size_bytes", "source", "sources_used", "status", "stored_file", "tags", "updated_at", "usage_rights") on table public."assets" to "authenticated";
grant REFERENCES ("ai_model", "ai_prompt", "ai_run_id", "approved_at", "approved_by", "asset_type", "company_id", "created_at", "created_by", "description", "est_cost_usd", "external_ref", "file_name", "folder", "id", "location_id", "mime_type", "name", "private_provenance", "rights_confirmation_email", "rights_confirmed_at", "size_bytes", "source", "sources_used", "status", "stored_file", "tags", "updated_at", "usage_rights") on table public."assets" to "authenticated";
grant SELECT ("ai_model", "ai_prompt", "ai_run_id", "approved_at", "approved_by", "asset_type", "company_id", "created_at", "created_by", "description", "est_cost_usd", "external_ref", "file_name", "folder", "id", "location_id", "mime_type", "name", "private_provenance", "rights_confirmation_email", "rights_confirmed_at", "size_bytes", "source", "sources_used", "status", "stored_file", "tags", "updated_at", "usage_rights") on table public."assets" to "authenticated";
grant UPDATE ("ai_model", "ai_prompt", "ai_run_id", "approved_at", "approved_by", "asset_type", "company_id", "created_at", "created_by", "description", "est_cost_usd", "external_ref", "file_name", "folder", "id", "location_id", "mime_type", "name", "private_provenance", "rights_confirmation_email", "rights_confirmed_at", "size_bytes", "source", "sources_used", "status", "stored_file", "tags", "updated_at", "usage_rights") on table public."assets" to "authenticated";
grant INSERT ("ai_model", "ai_prompt", "ai_run_id", "approved_at", "approved_by", "asset_type", "company_id", "created_at", "created_by", "description", "est_cost_usd", "external_ref", "file_name", "folder", "id", "location_id", "mime_type", "name", "private_provenance", "rights_confirmation_email", "rights_confirmed_at", "size_bytes", "source", "sources_used", "status", "stored_file", "tags", "updated_at", "usage_rights") on table public."assets" to "service_role";
grant REFERENCES ("ai_model", "ai_prompt", "ai_run_id", "approved_at", "approved_by", "asset_type", "company_id", "created_at", "created_by", "description", "est_cost_usd", "external_ref", "file_name", "folder", "id", "location_id", "mime_type", "name", "private_provenance", "rights_confirmation_email", "rights_confirmed_at", "size_bytes", "source", "sources_used", "status", "stored_file", "tags", "updated_at", "usage_rights") on table public."assets" to "service_role";
grant SELECT ("ai_model", "ai_prompt", "ai_run_id", "approved_at", "approved_by", "asset_type", "company_id", "created_at", "created_by", "description", "est_cost_usd", "external_ref", "file_name", "folder", "id", "location_id", "mime_type", "name", "private_provenance", "rights_confirmation_email", "rights_confirmed_at", "size_bytes", "source", "sources_used", "status", "stored_file", "tags", "updated_at", "usage_rights") on table public."assets" to "service_role";
grant UPDATE ("ai_model", "ai_prompt", "ai_run_id", "approved_at", "approved_by", "asset_type", "company_id", "created_at", "created_by", "description", "est_cost_usd", "external_ref", "file_name", "folder", "id", "location_id", "mime_type", "name", "private_provenance", "rights_confirmation_email", "rights_confirmed_at", "size_bytes", "source", "sources_used", "status", "stored_file", "tags", "updated_at", "usage_rights") on table public."assets" to "service_role";
grant INSERT ("company_id", "created_at", "created_by", "id", "name", "platform", "targeting", "updated_at") on table public."audience_segments" to "anon";
grant REFERENCES ("company_id", "created_at", "created_by", "id", "name", "platform", "targeting", "updated_at") on table public."audience_segments" to "anon";
grant SELECT ("company_id", "created_at", "created_by", "id", "name", "platform", "targeting", "updated_at") on table public."audience_segments" to "anon";
grant UPDATE ("company_id", "created_at", "created_by", "id", "name", "platform", "targeting", "updated_at") on table public."audience_segments" to "anon";
grant INSERT ("company_id", "created_at", "created_by", "id", "name", "platform", "targeting", "updated_at") on table public."audience_segments" to "authenticated";
grant REFERENCES ("company_id", "created_at", "created_by", "id", "name", "platform", "targeting", "updated_at") on table public."audience_segments" to "authenticated";
grant SELECT ("company_id", "created_at", "created_by", "id", "name", "platform", "targeting", "updated_at") on table public."audience_segments" to "authenticated";
grant UPDATE ("company_id", "created_at", "created_by", "id", "name", "platform", "targeting", "updated_at") on table public."audience_segments" to "authenticated";
grant INSERT ("company_id", "created_at", "created_by", "id", "name", "platform", "targeting", "updated_at") on table public."audience_segments" to "service_role";
grant REFERENCES ("company_id", "created_at", "created_by", "id", "name", "platform", "targeting", "updated_at") on table public."audience_segments" to "service_role";
grant SELECT ("company_id", "created_at", "created_by", "id", "name", "platform", "targeting", "updated_at") on table public."audience_segments" to "service_role";
grant UPDATE ("company_id", "created_at", "created_by", "id", "name", "platform", "targeting", "updated_at") on table public."audience_segments" to "service_role";
grant INSERT ("action", "actor_email", "actor_id", "company_id", "created_at", "detail", "id", "target_id", "target_type", "tenant_id") on table public."audit_logs" to "anon";
grant REFERENCES ("action", "actor_email", "actor_id", "company_id", "created_at", "detail", "id", "target_id", "target_type", "tenant_id") on table public."audit_logs" to "anon";
grant SELECT ("action", "actor_email", "actor_id", "company_id", "created_at", "detail", "id", "target_id", "target_type", "tenant_id") on table public."audit_logs" to "anon";
grant UPDATE ("action", "actor_email", "actor_id", "company_id", "created_at", "detail", "id", "target_id", "target_type", "tenant_id") on table public."audit_logs" to "anon";
grant INSERT ("action", "actor_email", "actor_id", "company_id", "created_at", "detail", "id", "target_id", "target_type", "tenant_id") on table public."audit_logs" to "authenticated";
grant REFERENCES ("action", "actor_email", "actor_id", "company_id", "created_at", "detail", "id", "target_id", "target_type", "tenant_id") on table public."audit_logs" to "authenticated";
grant SELECT ("action", "actor_email", "actor_id", "company_id", "created_at", "detail", "id", "target_id", "target_type", "tenant_id") on table public."audit_logs" to "authenticated";
grant UPDATE ("action", "actor_email", "actor_id", "company_id", "created_at", "detail", "id", "target_id", "target_type", "tenant_id") on table public."audit_logs" to "authenticated";
grant INSERT ("action", "actor_email", "actor_id", "company_id", "created_at", "detail", "id", "target_id", "target_type", "tenant_id") on table public."audit_logs" to "service_role";
grant REFERENCES ("action", "actor_email", "actor_id", "company_id", "created_at", "detail", "id", "target_id", "target_type", "tenant_id") on table public."audit_logs" to "service_role";
grant SELECT ("action", "actor_email", "actor_id", "company_id", "created_at", "detail", "id", "target_id", "target_type", "tenant_id") on table public."audit_logs" to "service_role";
grant UPDATE ("action", "actor_email", "actor_id", "company_id", "created_at", "detail", "id", "target_id", "target_type", "tenant_id") on table public."audit_logs" to "service_role";
grant INSERT ("created_at", "id", "outcomes", "tenant_id", "trigger", "triggered_by") on table public."automation_runs" to "anon";
grant REFERENCES ("created_at", "id", "outcomes", "tenant_id", "trigger", "triggered_by") on table public."automation_runs" to "anon";
grant SELECT ("created_at", "id", "outcomes", "tenant_id", "trigger", "triggered_by") on table public."automation_runs" to "anon";
grant UPDATE ("created_at", "id", "outcomes", "tenant_id", "trigger", "triggered_by") on table public."automation_runs" to "anon";
grant INSERT ("created_at", "id", "outcomes", "tenant_id", "trigger", "triggered_by") on table public."automation_runs" to "authenticated";
grant REFERENCES ("created_at", "id", "outcomes", "tenant_id", "trigger", "triggered_by") on table public."automation_runs" to "authenticated";
grant SELECT ("created_at", "id", "outcomes", "tenant_id", "trigger", "triggered_by") on table public."automation_runs" to "authenticated";
grant UPDATE ("created_at", "id", "outcomes", "tenant_id", "trigger", "triggered_by") on table public."automation_runs" to "authenticated";
grant INSERT ("created_at", "id", "outcomes", "tenant_id", "trigger", "triggered_by") on table public."automation_runs" to "service_role";
grant REFERENCES ("created_at", "id", "outcomes", "tenant_id", "trigger", "triggered_by") on table public."automation_runs" to "service_role";
grant SELECT ("created_at", "id", "outcomes", "tenant_id", "trigger", "triggered_by") on table public."automation_runs" to "service_role";
grant UPDATE ("created_at", "id", "outcomes", "tenant_id", "trigger", "triggered_by") on table public."automation_runs" to "service_role";
grant INSERT ("analytics_summaries", "content_alerts", "draft_campaign_suggestions", "enabled", "low_risk_auto_responses", "max_campaigns_per_run", "max_drafts_per_company", "monthly_content_generation", "tenant_id", "updated_at", "updated_by") on table public."automation_settings" to "anon";
grant REFERENCES ("analytics_summaries", "content_alerts", "draft_campaign_suggestions", "enabled", "low_risk_auto_responses", "max_campaigns_per_run", "max_drafts_per_company", "monthly_content_generation", "tenant_id", "updated_at", "updated_by") on table public."automation_settings" to "anon";
grant SELECT ("analytics_summaries", "content_alerts", "draft_campaign_suggestions", "enabled", "low_risk_auto_responses", "max_campaigns_per_run", "max_drafts_per_company", "monthly_content_generation", "tenant_id", "updated_at", "updated_by") on table public."automation_settings" to "anon";
grant UPDATE ("analytics_summaries", "content_alerts", "draft_campaign_suggestions", "enabled", "low_risk_auto_responses", "max_campaigns_per_run", "max_drafts_per_company", "monthly_content_generation", "tenant_id", "updated_at", "updated_by") on table public."automation_settings" to "anon";
grant INSERT ("analytics_summaries", "content_alerts", "draft_campaign_suggestions", "enabled", "low_risk_auto_responses", "max_campaigns_per_run", "max_drafts_per_company", "monthly_content_generation", "tenant_id", "updated_at", "updated_by") on table public."automation_settings" to "authenticated";
grant REFERENCES ("analytics_summaries", "content_alerts", "draft_campaign_suggestions", "enabled", "low_risk_auto_responses", "max_campaigns_per_run", "max_drafts_per_company", "monthly_content_generation", "tenant_id", "updated_at", "updated_by") on table public."automation_settings" to "authenticated";
grant SELECT ("analytics_summaries", "content_alerts", "draft_campaign_suggestions", "enabled", "low_risk_auto_responses", "max_campaigns_per_run", "max_drafts_per_company", "monthly_content_generation", "tenant_id", "updated_at", "updated_by") on table public."automation_settings" to "authenticated";
grant UPDATE ("analytics_summaries", "content_alerts", "draft_campaign_suggestions", "enabled", "low_risk_auto_responses", "max_campaigns_per_run", "max_drafts_per_company", "monthly_content_generation", "tenant_id", "updated_at", "updated_by") on table public."automation_settings" to "authenticated";
grant INSERT ("analytics_summaries", "content_alerts", "draft_campaign_suggestions", "enabled", "low_risk_auto_responses", "max_campaigns_per_run", "max_drafts_per_company", "monthly_content_generation", "tenant_id", "updated_at", "updated_by") on table public."automation_settings" to "service_role";
grant REFERENCES ("analytics_summaries", "content_alerts", "draft_campaign_suggestions", "enabled", "low_risk_auto_responses", "max_campaigns_per_run", "max_drafts_per_company", "monthly_content_generation", "tenant_id", "updated_at", "updated_by") on table public."automation_settings" to "service_role";
grant SELECT ("analytics_summaries", "content_alerts", "draft_campaign_suggestions", "enabled", "low_risk_auto_responses", "max_campaigns_per_run", "max_drafts_per_company", "monthly_content_generation", "tenant_id", "updated_at", "updated_by") on table public."automation_settings" to "service_role";
grant UPDATE ("analytics_summaries", "content_alerts", "draft_campaign_suggestions", "enabled", "low_risk_auto_responses", "max_campaigns_per_run", "max_drafts_per_company", "monthly_content_generation", "tenant_id", "updated_at", "updated_by") on table public."automation_settings" to "service_role";
grant INSERT ("active", "capacity", "company_id", "created_at", "day_of_week", "end_time", "id", "name", "slot_minutes", "start_time", "updated_at") on table public."booking_service_periods" to "anon";
grant REFERENCES ("active", "capacity", "company_id", "created_at", "day_of_week", "end_time", "id", "name", "slot_minutes", "start_time", "updated_at") on table public."booking_service_periods" to "anon";
grant SELECT ("active", "capacity", "company_id", "created_at", "day_of_week", "end_time", "id", "name", "slot_minutes", "start_time", "updated_at") on table public."booking_service_periods" to "anon";
grant UPDATE ("active", "capacity", "company_id", "created_at", "day_of_week", "end_time", "id", "name", "slot_minutes", "start_time", "updated_at") on table public."booking_service_periods" to "anon";
grant INSERT ("active", "capacity", "company_id", "created_at", "day_of_week", "end_time", "id", "name", "slot_minutes", "start_time", "updated_at") on table public."booking_service_periods" to "authenticated";
grant REFERENCES ("active", "capacity", "company_id", "created_at", "day_of_week", "end_time", "id", "name", "slot_minutes", "start_time", "updated_at") on table public."booking_service_periods" to "authenticated";
grant SELECT ("active", "capacity", "company_id", "created_at", "day_of_week", "end_time", "id", "name", "slot_minutes", "start_time", "updated_at") on table public."booking_service_periods" to "authenticated";
grant UPDATE ("active", "capacity", "company_id", "created_at", "day_of_week", "end_time", "id", "name", "slot_minutes", "start_time", "updated_at") on table public."booking_service_periods" to "authenticated";
grant INSERT ("active", "capacity", "company_id", "created_at", "day_of_week", "end_time", "id", "name", "slot_minutes", "start_time", "updated_at") on table public."booking_service_periods" to "service_role";
grant REFERENCES ("active", "capacity", "company_id", "created_at", "day_of_week", "end_time", "id", "name", "slot_minutes", "start_time", "updated_at") on table public."booking_service_periods" to "service_role";
grant SELECT ("active", "capacity", "company_id", "created_at", "day_of_week", "end_time", "id", "name", "slot_minutes", "start_time", "updated_at") on table public."booking_service_periods" to "service_role";
grant UPDATE ("active", "capacity", "company_id", "created_at", "day_of_week", "end_time", "id", "name", "slot_minutes", "start_time", "updated_at") on table public."booking_service_periods" to "service_role";
grant INSERT ("button_label", "company_id", "enabled", "lead_time_hours", "max_party_size", "notes", "updated_at", "venue_kind") on table public."booking_settings" to "anon";
grant REFERENCES ("button_label", "company_id", "enabled", "lead_time_hours", "max_party_size", "notes", "updated_at", "venue_kind") on table public."booking_settings" to "anon";
grant SELECT ("button_label", "company_id", "enabled", "lead_time_hours", "max_party_size", "notes", "updated_at", "venue_kind") on table public."booking_settings" to "anon";
grant UPDATE ("button_label", "company_id", "enabled", "lead_time_hours", "max_party_size", "notes", "updated_at", "venue_kind") on table public."booking_settings" to "anon";
grant INSERT ("button_label", "company_id", "enabled", "lead_time_hours", "max_party_size", "notes", "updated_at", "venue_kind") on table public."booking_settings" to "authenticated";
grant REFERENCES ("button_label", "company_id", "enabled", "lead_time_hours", "max_party_size", "notes", "updated_at", "venue_kind") on table public."booking_settings" to "authenticated";
grant SELECT ("button_label", "company_id", "enabled", "lead_time_hours", "max_party_size", "notes", "updated_at", "venue_kind") on table public."booking_settings" to "authenticated";
grant UPDATE ("button_label", "company_id", "enabled", "lead_time_hours", "max_party_size", "notes", "updated_at", "venue_kind") on table public."booking_settings" to "authenticated";
grant INSERT ("button_label", "company_id", "enabled", "lead_time_hours", "max_party_size", "notes", "updated_at", "venue_kind") on table public."booking_settings" to "service_role";
grant REFERENCES ("button_label", "company_id", "enabled", "lead_time_hours", "max_party_size", "notes", "updated_at", "venue_kind") on table public."booking_settings" to "service_role";
grant SELECT ("button_label", "company_id", "enabled", "lead_time_hours", "max_party_size", "notes", "updated_at", "venue_kind") on table public."booking_settings" to "service_role";
grant UPDATE ("button_label", "company_id", "enabled", "lead_time_hours", "max_party_size", "notes", "updated_at", "venue_kind") on table public."booking_settings" to "service_role";
grant INSERT ("active", "company_id", "created_at", "created_by", "description", "dimensions", "external_ref", "id", "kind", "name", "source", "spec", "tenant_id", "updated_at") on table public."brand_templates" to "anon";
grant REFERENCES ("active", "company_id", "created_at", "created_by", "description", "dimensions", "external_ref", "id", "kind", "name", "source", "spec", "tenant_id", "updated_at") on table public."brand_templates" to "anon";
grant SELECT ("active", "company_id", "created_at", "created_by", "description", "dimensions", "external_ref", "id", "kind", "name", "source", "spec", "tenant_id", "updated_at") on table public."brand_templates" to "anon";
grant UPDATE ("active", "company_id", "created_at", "created_by", "description", "dimensions", "external_ref", "id", "kind", "name", "source", "spec", "tenant_id", "updated_at") on table public."brand_templates" to "anon";
grant INSERT ("active", "company_id", "created_at", "created_by", "description", "dimensions", "external_ref", "id", "kind", "name", "source", "spec", "tenant_id", "updated_at") on table public."brand_templates" to "authenticated";
grant REFERENCES ("active", "company_id", "created_at", "created_by", "description", "dimensions", "external_ref", "id", "kind", "name", "source", "spec", "tenant_id", "updated_at") on table public."brand_templates" to "authenticated";
grant SELECT ("active", "company_id", "created_at", "created_by", "description", "dimensions", "external_ref", "id", "kind", "name", "source", "spec", "tenant_id", "updated_at") on table public."brand_templates" to "authenticated";
grant UPDATE ("active", "company_id", "created_at", "created_by", "description", "dimensions", "external_ref", "id", "kind", "name", "source", "spec", "tenant_id", "updated_at") on table public."brand_templates" to "authenticated";
grant INSERT ("active", "company_id", "created_at", "created_by", "description", "dimensions", "external_ref", "id", "kind", "name", "source", "spec", "tenant_id", "updated_at") on table public."brand_templates" to "service_role";
grant REFERENCES ("active", "company_id", "created_at", "created_by", "description", "dimensions", "external_ref", "id", "kind", "name", "source", "spec", "tenant_id", "updated_at") on table public."brand_templates" to "service_role";
grant SELECT ("active", "company_id", "created_at", "created_by", "description", "dimensions", "external_ref", "id", "kind", "name", "source", "spec", "tenant_id", "updated_at") on table public."brand_templates" to "service_role";
grant UPDATE ("active", "company_id", "created_at", "created_by", "description", "dimensions", "external_ref", "id", "kind", "name", "source", "spec", "tenant_id", "updated_at") on table public."brand_templates" to "service_role";
grant INSERT ("ai_run_id", "campaign_id", "company_id", "created_at", "created_by", "draft_schedule_count", "goal", "id", "mode", "model", "plan_version_id", "spawned_content_count", "status") on table public."campaign_builder_runs" to "anon";
grant REFERENCES ("ai_run_id", "campaign_id", "company_id", "created_at", "created_by", "draft_schedule_count", "goal", "id", "mode", "model", "plan_version_id", "spawned_content_count", "status") on table public."campaign_builder_runs" to "anon";
grant SELECT ("ai_run_id", "campaign_id", "company_id", "created_at", "created_by", "draft_schedule_count", "goal", "id", "mode", "model", "plan_version_id", "spawned_content_count", "status") on table public."campaign_builder_runs" to "anon";
grant UPDATE ("ai_run_id", "campaign_id", "company_id", "created_at", "created_by", "draft_schedule_count", "goal", "id", "mode", "model", "plan_version_id", "spawned_content_count", "status") on table public."campaign_builder_runs" to "anon";
grant INSERT ("ai_run_id", "campaign_id", "company_id", "created_at", "created_by", "draft_schedule_count", "goal", "id", "mode", "model", "plan_version_id", "spawned_content_count", "status") on table public."campaign_builder_runs" to "authenticated";
grant REFERENCES ("ai_run_id", "campaign_id", "company_id", "created_at", "created_by", "draft_schedule_count", "goal", "id", "mode", "model", "plan_version_id", "spawned_content_count", "status") on table public."campaign_builder_runs" to "authenticated";
grant SELECT ("ai_run_id", "campaign_id", "company_id", "created_at", "created_by", "draft_schedule_count", "goal", "id", "mode", "model", "plan_version_id", "spawned_content_count", "status") on table public."campaign_builder_runs" to "authenticated";
grant UPDATE ("ai_run_id", "campaign_id", "company_id", "created_at", "created_by", "draft_schedule_count", "goal", "id", "mode", "model", "plan_version_id", "spawned_content_count", "status") on table public."campaign_builder_runs" to "authenticated";
grant INSERT ("ai_run_id", "campaign_id", "company_id", "created_at", "created_by", "draft_schedule_count", "goal", "id", "mode", "model", "plan_version_id", "spawned_content_count", "status") on table public."campaign_builder_runs" to "service_role";
grant REFERENCES ("ai_run_id", "campaign_id", "company_id", "created_at", "created_by", "draft_schedule_count", "goal", "id", "mode", "model", "plan_version_id", "spawned_content_count", "status") on table public."campaign_builder_runs" to "service_role";
grant SELECT ("ai_run_id", "campaign_id", "company_id", "created_at", "created_by", "draft_schedule_count", "goal", "id", "mode", "model", "plan_version_id", "spawned_content_count", "status") on table public."campaign_builder_runs" to "service_role";
grant UPDATE ("ai_run_id", "campaign_id", "company_id", "created_at", "created_by", "draft_schedule_count", "goal", "id", "mode", "model", "plan_version_id", "spawned_content_count", "status") on table public."campaign_builder_runs" to "service_role";
grant INSERT ("campaign_id", "campaign_item_id", "company_id", "content_id", "created_at", "created_by", "id", "plan_version_id", "platform", "scheduled_date", "scheduled_time", "status", "title") on table public."campaign_draft_schedule_items" to "anon";
grant REFERENCES ("campaign_id", "campaign_item_id", "company_id", "content_id", "created_at", "created_by", "id", "plan_version_id", "platform", "scheduled_date", "scheduled_time", "status", "title") on table public."campaign_draft_schedule_items" to "anon";
grant SELECT ("campaign_id", "campaign_item_id", "company_id", "content_id", "created_at", "created_by", "id", "plan_version_id", "platform", "scheduled_date", "scheduled_time", "status", "title") on table public."campaign_draft_schedule_items" to "anon";
grant UPDATE ("campaign_id", "campaign_item_id", "company_id", "content_id", "created_at", "created_by", "id", "plan_version_id", "platform", "scheduled_date", "scheduled_time", "status", "title") on table public."campaign_draft_schedule_items" to "anon";
grant INSERT ("campaign_id", "campaign_item_id", "company_id", "content_id", "created_at", "created_by", "id", "plan_version_id", "platform", "scheduled_date", "scheduled_time", "status", "title") on table public."campaign_draft_schedule_items" to "authenticated";
grant REFERENCES ("campaign_id", "campaign_item_id", "company_id", "content_id", "created_at", "created_by", "id", "plan_version_id", "platform", "scheduled_date", "scheduled_time", "status", "title") on table public."campaign_draft_schedule_items" to "authenticated";
grant SELECT ("campaign_id", "campaign_item_id", "company_id", "content_id", "created_at", "created_by", "id", "plan_version_id", "platform", "scheduled_date", "scheduled_time", "status", "title") on table public."campaign_draft_schedule_items" to "authenticated";
grant UPDATE ("campaign_id", "campaign_item_id", "company_id", "content_id", "created_at", "created_by", "id", "plan_version_id", "platform", "scheduled_date", "scheduled_time", "status", "title") on table public."campaign_draft_schedule_items" to "authenticated";
grant INSERT ("campaign_id", "campaign_item_id", "company_id", "content_id", "created_at", "created_by", "id", "plan_version_id", "platform", "scheduled_date", "scheduled_time", "status", "title") on table public."campaign_draft_schedule_items" to "service_role";
grant REFERENCES ("campaign_id", "campaign_item_id", "company_id", "content_id", "created_at", "created_by", "id", "plan_version_id", "platform", "scheduled_date", "scheduled_time", "status", "title") on table public."campaign_draft_schedule_items" to "service_role";
grant SELECT ("campaign_id", "campaign_item_id", "company_id", "content_id", "created_at", "created_by", "id", "plan_version_id", "platform", "scheduled_date", "scheduled_time", "status", "title") on table public."campaign_draft_schedule_items" to "service_role";
grant UPDATE ("campaign_id", "campaign_item_id", "company_id", "content_id", "created_at", "created_by", "id", "plan_version_id", "platform", "scheduled_date", "scheduled_time", "status", "title") on table public."campaign_draft_schedule_items" to "service_role";
grant INSERT ("audience_split", "campaign_id", "company_id", "confidence_threshold", "control_variant_id", "created_at", "created_by", "end_date", "hypothesis", "id", "min_sample_size", "start_date", "status", "success_metric", "test_variant_id", "updated_at", "variants", "winning_variation") on table public."campaign_experiments" to "anon";
grant REFERENCES ("audience_split", "campaign_id", "company_id", "confidence_threshold", "control_variant_id", "created_at", "created_by", "end_date", "hypothesis", "id", "min_sample_size", "start_date", "status", "success_metric", "test_variant_id", "updated_at", "variants", "winning_variation") on table public."campaign_experiments" to "anon";
grant SELECT ("audience_split", "campaign_id", "company_id", "confidence_threshold", "control_variant_id", "created_at", "created_by", "end_date", "hypothesis", "id", "min_sample_size", "start_date", "status", "success_metric", "test_variant_id", "updated_at", "variants", "winning_variation") on table public."campaign_experiments" to "anon";
grant UPDATE ("audience_split", "campaign_id", "company_id", "confidence_threshold", "control_variant_id", "created_at", "created_by", "end_date", "hypothesis", "id", "min_sample_size", "start_date", "status", "success_metric", "test_variant_id", "updated_at", "variants", "winning_variation") on table public."campaign_experiments" to "anon";
grant INSERT ("audience_split", "campaign_id", "company_id", "confidence_threshold", "control_variant_id", "created_at", "created_by", "end_date", "hypothesis", "id", "min_sample_size", "start_date", "status", "success_metric", "test_variant_id", "updated_at", "variants", "winning_variation") on table public."campaign_experiments" to "authenticated";
grant REFERENCES ("audience_split", "campaign_id", "company_id", "confidence_threshold", "control_variant_id", "created_at", "created_by", "end_date", "hypothesis", "id", "min_sample_size", "start_date", "status", "success_metric", "test_variant_id", "updated_at", "variants", "winning_variation") on table public."campaign_experiments" to "authenticated";
grant SELECT ("audience_split", "campaign_id", "company_id", "confidence_threshold", "control_variant_id", "created_at", "created_by", "end_date", "hypothesis", "id", "min_sample_size", "start_date", "status", "success_metric", "test_variant_id", "updated_at", "variants", "winning_variation") on table public."campaign_experiments" to "authenticated";
grant UPDATE ("audience_split", "campaign_id", "company_id", "confidence_threshold", "control_variant_id", "created_at", "created_by", "end_date", "hypothesis", "id", "min_sample_size", "start_date", "status", "success_metric", "test_variant_id", "updated_at", "variants", "winning_variation") on table public."campaign_experiments" to "authenticated";
grant INSERT ("audience_split", "campaign_id", "company_id", "confidence_threshold", "control_variant_id", "created_at", "created_by", "end_date", "hypothesis", "id", "min_sample_size", "start_date", "status", "success_metric", "test_variant_id", "updated_at", "variants", "winning_variation") on table public."campaign_experiments" to "service_role";
grant REFERENCES ("audience_split", "campaign_id", "company_id", "confidence_threshold", "control_variant_id", "created_at", "created_by", "end_date", "hypothesis", "id", "min_sample_size", "start_date", "status", "success_metric", "test_variant_id", "updated_at", "variants", "winning_variation") on table public."campaign_experiments" to "service_role";
grant SELECT ("audience_split", "campaign_id", "company_id", "confidence_threshold", "control_variant_id", "created_at", "created_by", "end_date", "hypothesis", "id", "min_sample_size", "start_date", "status", "success_metric", "test_variant_id", "updated_at", "variants", "winning_variation") on table public."campaign_experiments" to "service_role";
grant UPDATE ("audience_split", "campaign_id", "company_id", "confidence_threshold", "control_variant_id", "created_at", "created_by", "end_date", "hypothesis", "id", "min_sample_size", "start_date", "status", "success_metric", "test_variant_id", "updated_at", "variants", "winning_variation") on table public."campaign_experiments" to "service_role";
grant INSERT ("brief", "campaign_id", "channel", "company_id", "content_id", "content_type", "created_at", "day_offset", "id", "status", "title", "updated_at") on table public."campaign_items" to "anon";
grant REFERENCES ("brief", "campaign_id", "channel", "company_id", "content_id", "content_type", "created_at", "day_offset", "id", "status", "title", "updated_at") on table public."campaign_items" to "anon";
grant SELECT ("brief", "campaign_id", "channel", "company_id", "content_id", "content_type", "created_at", "day_offset", "id", "status", "title", "updated_at") on table public."campaign_items" to "anon";
grant UPDATE ("brief", "campaign_id", "channel", "company_id", "content_id", "content_type", "created_at", "day_offset", "id", "status", "title", "updated_at") on table public."campaign_items" to "anon";
grant INSERT ("brief", "campaign_id", "channel", "company_id", "content_id", "content_type", "created_at", "day_offset", "id", "status", "title", "updated_at") on table public."campaign_items" to "authenticated";
grant REFERENCES ("brief", "campaign_id", "channel", "company_id", "content_id", "content_type", "created_at", "day_offset", "id", "status", "title", "updated_at") on table public."campaign_items" to "authenticated";
grant SELECT ("brief", "campaign_id", "channel", "company_id", "content_id", "content_type", "created_at", "day_offset", "id", "status", "title", "updated_at") on table public."campaign_items" to "authenticated";
grant UPDATE ("brief", "campaign_id", "channel", "company_id", "content_id", "content_type", "created_at", "day_offset", "id", "status", "title", "updated_at") on table public."campaign_items" to "authenticated";
grant INSERT ("brief", "campaign_id", "channel", "company_id", "content_id", "content_type", "created_at", "day_offset", "id", "status", "title", "updated_at") on table public."campaign_items" to "service_role";
grant REFERENCES ("brief", "campaign_id", "channel", "company_id", "content_id", "content_type", "created_at", "day_offset", "id", "status", "title", "updated_at") on table public."campaign_items" to "service_role";
grant SELECT ("brief", "campaign_id", "channel", "company_id", "content_id", "content_type", "created_at", "day_offset", "id", "status", "title", "updated_at") on table public."campaign_items" to "service_role";
grant UPDATE ("brief", "campaign_id", "channel", "company_id", "content_id", "content_type", "created_at", "day_offset", "id", "status", "title", "updated_at") on table public."campaign_items" to "service_role";
grant INSERT ("attribution_status", "campaign_id", "collected_at", "company_id", "content_id", "created_at", "data_source", "id", "metrics", "period_end", "period_start", "platform_account_id", "tenant_id") on table public."campaign_performance_snapshots" to "anon";
grant REFERENCES ("attribution_status", "campaign_id", "collected_at", "company_id", "content_id", "created_at", "data_source", "id", "metrics", "period_end", "period_start", "platform_account_id", "tenant_id") on table public."campaign_performance_snapshots" to "anon";
grant SELECT ("attribution_status", "campaign_id", "collected_at", "company_id", "content_id", "created_at", "data_source", "id", "metrics", "period_end", "period_start", "platform_account_id", "tenant_id") on table public."campaign_performance_snapshots" to "anon";
grant UPDATE ("attribution_status", "campaign_id", "collected_at", "company_id", "content_id", "created_at", "data_source", "id", "metrics", "period_end", "period_start", "platform_account_id", "tenant_id") on table public."campaign_performance_snapshots" to "anon";
grant INSERT ("attribution_status", "campaign_id", "collected_at", "company_id", "content_id", "created_at", "data_source", "id", "metrics", "period_end", "period_start", "platform_account_id", "tenant_id") on table public."campaign_performance_snapshots" to "authenticated";
grant REFERENCES ("attribution_status", "campaign_id", "collected_at", "company_id", "content_id", "created_at", "data_source", "id", "metrics", "period_end", "period_start", "platform_account_id", "tenant_id") on table public."campaign_performance_snapshots" to "authenticated";
grant SELECT ("attribution_status", "campaign_id", "collected_at", "company_id", "content_id", "created_at", "data_source", "id", "metrics", "period_end", "period_start", "platform_account_id", "tenant_id") on table public."campaign_performance_snapshots" to "authenticated";
grant UPDATE ("attribution_status", "campaign_id", "collected_at", "company_id", "content_id", "created_at", "data_source", "id", "metrics", "period_end", "period_start", "platform_account_id", "tenant_id") on table public."campaign_performance_snapshots" to "authenticated";
grant INSERT ("attribution_status", "campaign_id", "collected_at", "company_id", "content_id", "created_at", "data_source", "id", "metrics", "period_end", "period_start", "platform_account_id", "tenant_id") on table public."campaign_performance_snapshots" to "service_role";
grant REFERENCES ("attribution_status", "campaign_id", "collected_at", "company_id", "content_id", "created_at", "data_source", "id", "metrics", "period_end", "period_start", "platform_account_id", "tenant_id") on table public."campaign_performance_snapshots" to "service_role";
grant SELECT ("attribution_status", "campaign_id", "collected_at", "company_id", "content_id", "created_at", "data_source", "id", "metrics", "period_end", "period_start", "platform_account_id", "tenant_id") on table public."campaign_performance_snapshots" to "service_role";
grant UPDATE ("attribution_status", "campaign_id", "collected_at", "company_id", "content_id", "created_at", "data_source", "id", "metrics", "period_end", "period_start", "platform_account_id", "tenant_id") on table public."campaign_performance_snapshots" to "service_role";
grant INSERT ("campaign_id", "channel_plan", "channels", "company_id", "created_at", "created_by", "goal", "id", "item_count", "kpis", "model", "objective", "risk_warnings", "strategy", "version_number") on table public."campaign_plan_versions" to "anon";
grant REFERENCES ("campaign_id", "channel_plan", "channels", "company_id", "created_at", "created_by", "goal", "id", "item_count", "kpis", "model", "objective", "risk_warnings", "strategy", "version_number") on table public."campaign_plan_versions" to "anon";
grant SELECT ("campaign_id", "channel_plan", "channels", "company_id", "created_at", "created_by", "goal", "id", "item_count", "kpis", "model", "objective", "risk_warnings", "strategy", "version_number") on table public."campaign_plan_versions" to "anon";
grant UPDATE ("campaign_id", "channel_plan", "channels", "company_id", "created_at", "created_by", "goal", "id", "item_count", "kpis", "model", "objective", "risk_warnings", "strategy", "version_number") on table public."campaign_plan_versions" to "anon";
grant INSERT ("campaign_id", "channel_plan", "channels", "company_id", "created_at", "created_by", "goal", "id", "item_count", "kpis", "model", "objective", "risk_warnings", "strategy", "version_number") on table public."campaign_plan_versions" to "authenticated";
grant REFERENCES ("campaign_id", "channel_plan", "channels", "company_id", "created_at", "created_by", "goal", "id", "item_count", "kpis", "model", "objective", "risk_warnings", "strategy", "version_number") on table public."campaign_plan_versions" to "authenticated";
grant SELECT ("campaign_id", "channel_plan", "channels", "company_id", "created_at", "created_by", "goal", "id", "item_count", "kpis", "model", "objective", "risk_warnings", "strategy", "version_number") on table public."campaign_plan_versions" to "authenticated";
grant UPDATE ("campaign_id", "channel_plan", "channels", "company_id", "created_at", "created_by", "goal", "id", "item_count", "kpis", "model", "objective", "risk_warnings", "strategy", "version_number") on table public."campaign_plan_versions" to "authenticated";
grant INSERT ("campaign_id", "channel_plan", "channels", "company_id", "created_at", "created_by", "goal", "id", "item_count", "kpis", "model", "objective", "risk_warnings", "strategy", "version_number") on table public."campaign_plan_versions" to "service_role";
grant REFERENCES ("campaign_id", "channel_plan", "channels", "company_id", "created_at", "created_by", "goal", "id", "item_count", "kpis", "model", "objective", "risk_warnings", "strategy", "version_number") on table public."campaign_plan_versions" to "service_role";
grant SELECT ("campaign_id", "channel_plan", "channels", "company_id", "created_at", "created_by", "goal", "id", "item_count", "kpis", "model", "objective", "risk_warnings", "strategy", "version_number") on table public."campaign_plan_versions" to "service_role";
grant UPDATE ("campaign_id", "channel_plan", "channels", "company_id", "created_at", "created_by", "goal", "id", "item_count", "kpis", "model", "objective", "risk_warnings", "strategy", "version_number") on table public."campaign_plan_versions" to "service_role";
grant INSERT ("approved_at", "approved_by", "archived_at", "associated_products", "audience", "budget_amount", "campaign_type", "channels", "company_id", "created_at", "created_by", "currency", "daily_spend_limit", "description", "duration_days", "end_date", "event_date", "event_name", "geographic_scope", "id", "key_message", "landing_page_url", "layer_meta", "name", "objective", "offer_id", "priority", "request_id", "service_focus", "start_date", "status", "timezone", "updated_at", "utm") on table public."campaigns" to "anon";
grant REFERENCES ("approved_at", "approved_by", "archived_at", "associated_products", "audience", "budget_amount", "campaign_type", "channels", "company_id", "created_at", "created_by", "currency", "daily_spend_limit", "description", "duration_days", "end_date", "event_date", "event_name", "geographic_scope", "id", "key_message", "landing_page_url", "layer_meta", "name", "objective", "offer_id", "priority", "request_id", "service_focus", "start_date", "status", "timezone", "updated_at", "utm") on table public."campaigns" to "anon";
grant SELECT ("approved_at", "approved_by", "archived_at", "associated_products", "audience", "budget_amount", "campaign_type", "channels", "company_id", "created_at", "created_by", "currency", "daily_spend_limit", "description", "duration_days", "end_date", "event_date", "event_name", "geographic_scope", "id", "key_message", "landing_page_url", "layer_meta", "name", "objective", "offer_id", "priority", "request_id", "service_focus", "start_date", "status", "timezone", "updated_at", "utm") on table public."campaigns" to "anon";
grant UPDATE ("approved_at", "approved_by", "archived_at", "associated_products", "audience", "budget_amount", "campaign_type", "channels", "company_id", "created_at", "created_by", "currency", "daily_spend_limit", "description", "duration_days", "end_date", "event_date", "event_name", "geographic_scope", "id", "key_message", "landing_page_url", "layer_meta", "name", "objective", "offer_id", "priority", "request_id", "service_focus", "start_date", "status", "timezone", "updated_at", "utm") on table public."campaigns" to "anon";
grant INSERT ("approved_at", "approved_by", "archived_at", "associated_products", "audience", "budget_amount", "campaign_type", "channels", "company_id", "created_at", "created_by", "currency", "daily_spend_limit", "description", "duration_days", "end_date", "event_date", "event_name", "geographic_scope", "id", "key_message", "landing_page_url", "layer_meta", "name", "objective", "offer_id", "priority", "request_id", "service_focus", "start_date", "status", "timezone", "updated_at", "utm") on table public."campaigns" to "authenticated";
grant REFERENCES ("approved_at", "approved_by", "archived_at", "associated_products", "audience", "budget_amount", "campaign_type", "channels", "company_id", "created_at", "created_by", "currency", "daily_spend_limit", "description", "duration_days", "end_date", "event_date", "event_name", "geographic_scope", "id", "key_message", "landing_page_url", "layer_meta", "name", "objective", "offer_id", "priority", "request_id", "service_focus", "start_date", "status", "timezone", "updated_at", "utm") on table public."campaigns" to "authenticated";
grant SELECT ("approved_at", "approved_by", "archived_at", "associated_products", "audience", "budget_amount", "campaign_type", "channels", "company_id", "created_at", "created_by", "currency", "daily_spend_limit", "description", "duration_days", "end_date", "event_date", "event_name", "geographic_scope", "id", "key_message", "landing_page_url", "layer_meta", "name", "objective", "offer_id", "priority", "request_id", "service_focus", "start_date", "status", "timezone", "updated_at", "utm") on table public."campaigns" to "authenticated";
grant UPDATE ("approved_at", "approved_by", "archived_at", "associated_products", "audience", "budget_amount", "campaign_type", "channels", "company_id", "created_at", "created_by", "currency", "daily_spend_limit", "description", "duration_days", "end_date", "event_date", "event_name", "geographic_scope", "id", "key_message", "landing_page_url", "layer_meta", "name", "objective", "offer_id", "priority", "request_id", "service_focus", "start_date", "status", "timezone", "updated_at", "utm") on table public."campaigns" to "authenticated";
grant INSERT ("approved_at", "approved_by", "archived_at", "associated_products", "audience", "budget_amount", "campaign_type", "channels", "company_id", "created_at", "created_by", "currency", "daily_spend_limit", "description", "duration_days", "end_date", "event_date", "event_name", "geographic_scope", "id", "key_message", "landing_page_url", "layer_meta", "name", "objective", "offer_id", "priority", "request_id", "service_focus", "start_date", "status", "timezone", "updated_at", "utm") on table public."campaigns" to "service_role";
grant REFERENCES ("approved_at", "approved_by", "archived_at", "associated_products", "audience", "budget_amount", "campaign_type", "channels", "company_id", "created_at", "created_by", "currency", "daily_spend_limit", "description", "duration_days", "end_date", "event_date", "event_name", "geographic_scope", "id", "key_message", "landing_page_url", "layer_meta", "name", "objective", "offer_id", "priority", "request_id", "service_focus", "start_date", "status", "timezone", "updated_at", "utm") on table public."campaigns" to "service_role";
grant SELECT ("approved_at", "approved_by", "archived_at", "associated_products", "audience", "budget_amount", "campaign_type", "channels", "company_id", "created_at", "created_by", "currency", "daily_spend_limit", "description", "duration_days", "end_date", "event_date", "event_name", "geographic_scope", "id", "key_message", "landing_page_url", "layer_meta", "name", "objective", "offer_id", "priority", "request_id", "service_focus", "start_date", "status", "timezone", "updated_at", "utm") on table public."campaigns" to "service_role";
grant UPDATE ("approved_at", "approved_by", "archived_at", "associated_products", "audience", "budget_amount", "campaign_type", "channels", "company_id", "created_at", "created_by", "currency", "daily_spend_limit", "description", "duration_days", "end_date", "event_date", "event_name", "geographic_scope", "id", "key_message", "landing_page_url", "layer_meta", "name", "objective", "offer_id", "priority", "request_id", "service_focus", "start_date", "status", "timezone", "updated_at", "utm") on table public."campaigns" to "service_role";
grant INSERT ("approved_at", "approved_by", "body_html", "change_summary", "company_id", "created_at", "created_by", "id", "page_id", "status", "title", "version_number") on table public."cms_page_versions" to "anon";
grant REFERENCES ("approved_at", "approved_by", "body_html", "change_summary", "company_id", "created_at", "created_by", "id", "page_id", "status", "title", "version_number") on table public."cms_page_versions" to "anon";
grant SELECT ("approved_at", "approved_by", "body_html", "change_summary", "company_id", "created_at", "created_by", "id", "page_id", "status", "title", "version_number") on table public."cms_page_versions" to "anon";
grant UPDATE ("approved_at", "approved_by", "body_html", "change_summary", "company_id", "created_at", "created_by", "id", "page_id", "status", "title", "version_number") on table public."cms_page_versions" to "anon";
grant INSERT ("approved_at", "approved_by", "body_html", "change_summary", "company_id", "created_at", "created_by", "id", "page_id", "status", "title", "version_number") on table public."cms_page_versions" to "authenticated";
grant REFERENCES ("approved_at", "approved_by", "body_html", "change_summary", "company_id", "created_at", "created_by", "id", "page_id", "status", "title", "version_number") on table public."cms_page_versions" to "authenticated";
grant SELECT ("approved_at", "approved_by", "body_html", "change_summary", "company_id", "created_at", "created_by", "id", "page_id", "status", "title", "version_number") on table public."cms_page_versions" to "authenticated";
grant UPDATE ("approved_at", "approved_by", "body_html", "change_summary", "company_id", "created_at", "created_by", "id", "page_id", "status", "title", "version_number") on table public."cms_page_versions" to "authenticated";
grant INSERT ("approved_at", "approved_by", "body_html", "change_summary", "company_id", "created_at", "created_by", "id", "page_id", "status", "title", "version_number") on table public."cms_page_versions" to "service_role";
grant REFERENCES ("approved_at", "approved_by", "body_html", "change_summary", "company_id", "created_at", "created_by", "id", "page_id", "status", "title", "version_number") on table public."cms_page_versions" to "service_role";
grant SELECT ("approved_at", "approved_by", "body_html", "change_summary", "company_id", "created_at", "created_by", "id", "page_id", "status", "title", "version_number") on table public."cms_page_versions" to "service_role";
grant UPDATE ("approved_at", "approved_by", "body_html", "change_summary", "company_id", "created_at", "created_by", "id", "page_id", "status", "title", "version_number") on table public."cms_page_versions" to "service_role";
grant INSERT ("company_id", "created_at", "created_by", "current_version_id", "id", "kind", "live_url", "published_version_id", "slug", "status", "title", "updated_at") on table public."cms_pages" to "anon";
grant REFERENCES ("company_id", "created_at", "created_by", "current_version_id", "id", "kind", "live_url", "published_version_id", "slug", "status", "title", "updated_at") on table public."cms_pages" to "anon";
grant SELECT ("company_id", "created_at", "created_by", "current_version_id", "id", "kind", "live_url", "published_version_id", "slug", "status", "title", "updated_at") on table public."cms_pages" to "anon";
grant UPDATE ("company_id", "created_at", "created_by", "current_version_id", "id", "kind", "live_url", "published_version_id", "slug", "status", "title", "updated_at") on table public."cms_pages" to "anon";
grant INSERT ("company_id", "created_at", "created_by", "current_version_id", "id", "kind", "live_url", "published_version_id", "slug", "status", "title", "updated_at") on table public."cms_pages" to "authenticated";
grant REFERENCES ("company_id", "created_at", "created_by", "current_version_id", "id", "kind", "live_url", "published_version_id", "slug", "status", "title", "updated_at") on table public."cms_pages" to "authenticated";
grant SELECT ("company_id", "created_at", "created_by", "current_version_id", "id", "kind", "live_url", "published_version_id", "slug", "status", "title", "updated_at") on table public."cms_pages" to "authenticated";
grant UPDATE ("company_id", "created_at", "created_by", "current_version_id", "id", "kind", "live_url", "published_version_id", "slug", "status", "title", "updated_at") on table public."cms_pages" to "authenticated";
grant INSERT ("company_id", "created_at", "created_by", "current_version_id", "id", "kind", "live_url", "published_version_id", "slug", "status", "title", "updated_at") on table public."cms_pages" to "service_role";
grant REFERENCES ("company_id", "created_at", "created_by", "current_version_id", "id", "kind", "live_url", "published_version_id", "slug", "status", "title", "updated_at") on table public."cms_pages" to "service_role";
grant SELECT ("company_id", "created_at", "created_by", "current_version_id", "id", "kind", "live_url", "published_version_id", "slug", "status", "title", "updated_at") on table public."cms_pages" to "service_role";
grant UPDATE ("company_id", "created_at", "created_by", "current_version_id", "id", "kind", "live_url", "published_version_id", "slug", "status", "title", "updated_at") on table public."cms_pages" to "service_role";
grant INSERT ("canonical_url", "company_id", "created_at", "id", "meta_description", "meta_title", "no_index", "og_description", "og_image_url", "og_title", "page_id", "updated_at") on table public."cms_seo_metadata" to "anon";
grant REFERENCES ("canonical_url", "company_id", "created_at", "id", "meta_description", "meta_title", "no_index", "og_description", "og_image_url", "og_title", "page_id", "updated_at") on table public."cms_seo_metadata" to "anon";
grant SELECT ("canonical_url", "company_id", "created_at", "id", "meta_description", "meta_title", "no_index", "og_description", "og_image_url", "og_title", "page_id", "updated_at") on table public."cms_seo_metadata" to "anon";
grant UPDATE ("canonical_url", "company_id", "created_at", "id", "meta_description", "meta_title", "no_index", "og_description", "og_image_url", "og_title", "page_id", "updated_at") on table public."cms_seo_metadata" to "anon";
grant INSERT ("canonical_url", "company_id", "created_at", "id", "meta_description", "meta_title", "no_index", "og_description", "og_image_url", "og_title", "page_id", "updated_at") on table public."cms_seo_metadata" to "authenticated";
grant REFERENCES ("canonical_url", "company_id", "created_at", "id", "meta_description", "meta_title", "no_index", "og_description", "og_image_url", "og_title", "page_id", "updated_at") on table public."cms_seo_metadata" to "authenticated";
grant SELECT ("canonical_url", "company_id", "created_at", "id", "meta_description", "meta_title", "no_index", "og_description", "og_image_url", "og_title", "page_id", "updated_at") on table public."cms_seo_metadata" to "authenticated";
grant UPDATE ("canonical_url", "company_id", "created_at", "id", "meta_description", "meta_title", "no_index", "og_description", "og_image_url", "og_title", "page_id", "updated_at") on table public."cms_seo_metadata" to "authenticated";
grant INSERT ("canonical_url", "company_id", "created_at", "id", "meta_description", "meta_title", "no_index", "og_description", "og_image_url", "og_title", "page_id", "updated_at") on table public."cms_seo_metadata" to "service_role";
grant REFERENCES ("canonical_url", "company_id", "created_at", "id", "meta_description", "meta_title", "no_index", "og_description", "og_image_url", "og_title", "page_id", "updated_at") on table public."cms_seo_metadata" to "service_role";
grant SELECT ("canonical_url", "company_id", "created_at", "id", "meta_description", "meta_title", "no_index", "og_description", "og_image_url", "og_title", "page_id", "updated_at") on table public."cms_seo_metadata" to "service_role";
grant UPDATE ("canonical_url", "company_id", "created_at", "id", "meta_description", "meta_title", "no_index", "og_description", "og_image_url", "og_title", "page_id", "updated_at") on table public."cms_seo_metadata" to "service_role";
grant INSERT ("assigned_to", "company_id", "completed_at", "created_at", "description", "id", "page_id", "requested_by", "status", "title", "updated_at") on table public."cms_update_requests" to "anon";
grant REFERENCES ("assigned_to", "company_id", "completed_at", "created_at", "description", "id", "page_id", "requested_by", "status", "title", "updated_at") on table public."cms_update_requests" to "anon";
grant SELECT ("assigned_to", "company_id", "completed_at", "created_at", "description", "id", "page_id", "requested_by", "status", "title", "updated_at") on table public."cms_update_requests" to "anon";
grant UPDATE ("assigned_to", "company_id", "completed_at", "created_at", "description", "id", "page_id", "requested_by", "status", "title", "updated_at") on table public."cms_update_requests" to "anon";
grant INSERT ("assigned_to", "company_id", "completed_at", "created_at", "description", "id", "page_id", "requested_by", "status", "title", "updated_at") on table public."cms_update_requests" to "authenticated";
grant REFERENCES ("assigned_to", "company_id", "completed_at", "created_at", "description", "id", "page_id", "requested_by", "status", "title", "updated_at") on table public."cms_update_requests" to "authenticated";
grant SELECT ("assigned_to", "company_id", "completed_at", "created_at", "description", "id", "page_id", "requested_by", "status", "title", "updated_at") on table public."cms_update_requests" to "authenticated";
grant UPDATE ("assigned_to", "company_id", "completed_at", "created_at", "description", "id", "page_id", "requested_by", "status", "title", "updated_at") on table public."cms_update_requests" to "authenticated";
grant INSERT ("assigned_to", "company_id", "completed_at", "created_at", "description", "id", "page_id", "requested_by", "status", "title", "updated_at") on table public."cms_update_requests" to "service_role";
grant REFERENCES ("assigned_to", "company_id", "completed_at", "created_at", "description", "id", "page_id", "requested_by", "status", "title", "updated_at") on table public."cms_update_requests" to "service_role";
grant SELECT ("assigned_to", "company_id", "completed_at", "created_at", "description", "id", "page_id", "requested_by", "status", "title", "updated_at") on table public."cms_update_requests" to "service_role";
grant UPDATE ("assigned_to", "company_id", "completed_at", "created_at", "description", "id", "page_id", "requested_by", "status", "title", "updated_at") on table public."cms_update_requests" to "service_role";
grant INSERT ("created_at", "created_by", "documents", "id", "name", "profile", "status", "tenant_id", "updated_at") on table public."companies" to "anon";
grant REFERENCES ("created_at", "created_by", "documents", "id", "name", "profile", "status", "tenant_id", "updated_at") on table public."companies" to "anon";
grant SELECT ("created_at", "created_by", "documents", "id", "name", "profile", "status", "tenant_id", "updated_at") on table public."companies" to "anon";
grant UPDATE ("created_at", "created_by", "documents", "id", "name", "profile", "status", "tenant_id", "updated_at") on table public."companies" to "anon";
grant INSERT ("created_at", "created_by", "documents", "id", "name", "profile", "status", "tenant_id", "updated_at") on table public."companies" to "authenticated";
grant REFERENCES ("created_at", "created_by", "documents", "id", "name", "profile", "status", "tenant_id", "updated_at") on table public."companies" to "authenticated";
grant SELECT ("created_at", "created_by", "documents", "id", "name", "profile", "status", "tenant_id", "updated_at") on table public."companies" to "authenticated";
grant UPDATE ("created_at", "created_by", "documents", "id", "name", "profile", "status", "tenant_id", "updated_at") on table public."companies" to "authenticated";
grant INSERT ("created_at", "created_by", "documents", "id", "name", "profile", "status", "tenant_id", "updated_at") on table public."companies" to "service_role";
grant REFERENCES ("created_at", "created_by", "documents", "id", "name", "profile", "status", "tenant_id", "updated_at") on table public."companies" to "service_role";
grant SELECT ("created_at", "created_by", "documents", "id", "name", "profile", "status", "tenant_id", "updated_at") on table public."companies" to "service_role";
grant UPDATE ("created_at", "created_by", "documents", "id", "name", "profile", "status", "tenant_id", "updated_at") on table public."companies" to "service_role";
grant INSERT ("company_id", "location_id", "user_id") on table public."company_access" to "anon";
grant REFERENCES ("company_id", "location_id", "user_id") on table public."company_access" to "anon";
grant SELECT ("company_id", "location_id", "user_id") on table public."company_access" to "anon";
grant UPDATE ("company_id", "location_id", "user_id") on table public."company_access" to "anon";
grant INSERT ("company_id", "location_id", "user_id") on table public."company_access" to "authenticated";
grant REFERENCES ("company_id", "location_id", "user_id") on table public."company_access" to "authenticated";
grant SELECT ("company_id", "location_id", "user_id") on table public."company_access" to "authenticated";
grant UPDATE ("company_id", "location_id", "user_id") on table public."company_access" to "authenticated";
grant INSERT ("company_id", "location_id", "user_id") on table public."company_access" to "service_role";
grant REFERENCES ("company_id", "location_id", "user_id") on table public."company_access" to "service_role";
grant SELECT ("company_id", "location_id", "user_id") on table public."company_access" to "service_role";
grant UPDATE ("company_id", "location_id", "user_id") on table public."company_access" to "service_role";
grant INSERT ("amount_usd", "balance_after_usd", "company_id", "created_at", "created_by", "id", "kind", "reason", "related_id", "related_type", "tenant_id", "wallet_id") on table public."company_credit_ledger" to "anon";
grant REFERENCES ("amount_usd", "balance_after_usd", "company_id", "created_at", "created_by", "id", "kind", "reason", "related_id", "related_type", "tenant_id", "wallet_id") on table public."company_credit_ledger" to "anon";
grant SELECT ("amount_usd", "balance_after_usd", "company_id", "created_at", "created_by", "id", "kind", "reason", "related_id", "related_type", "tenant_id", "wallet_id") on table public."company_credit_ledger" to "anon";
grant UPDATE ("amount_usd", "balance_after_usd", "company_id", "created_at", "created_by", "id", "kind", "reason", "related_id", "related_type", "tenant_id", "wallet_id") on table public."company_credit_ledger" to "anon";
grant INSERT ("amount_usd", "balance_after_usd", "company_id", "created_at", "created_by", "id", "kind", "reason", "related_id", "related_type", "tenant_id", "wallet_id") on table public."company_credit_ledger" to "authenticated";
grant REFERENCES ("amount_usd", "balance_after_usd", "company_id", "created_at", "created_by", "id", "kind", "reason", "related_id", "related_type", "tenant_id", "wallet_id") on table public."company_credit_ledger" to "authenticated";
grant SELECT ("amount_usd", "balance_after_usd", "company_id", "created_at", "created_by", "id", "kind", "reason", "related_id", "related_type", "tenant_id", "wallet_id") on table public."company_credit_ledger" to "authenticated";
grant UPDATE ("amount_usd", "balance_after_usd", "company_id", "created_at", "created_by", "id", "kind", "reason", "related_id", "related_type", "tenant_id", "wallet_id") on table public."company_credit_ledger" to "authenticated";
grant INSERT ("amount_usd", "balance_after_usd", "company_id", "created_at", "created_by", "id", "kind", "reason", "related_id", "related_type", "tenant_id", "wallet_id") on table public."company_credit_ledger" to "service_role";
grant REFERENCES ("amount_usd", "balance_after_usd", "company_id", "created_at", "created_by", "id", "kind", "reason", "related_id", "related_type", "tenant_id", "wallet_id") on table public."company_credit_ledger" to "service_role";
grant SELECT ("amount_usd", "balance_after_usd", "company_id", "created_at", "created_by", "id", "kind", "reason", "related_id", "related_type", "tenant_id", "wallet_id") on table public."company_credit_ledger" to "service_role";
grant UPDATE ("amount_usd", "balance_after_usd", "company_id", "created_at", "created_by", "id", "kind", "reason", "related_id", "related_type", "tenant_id", "wallet_id") on table public."company_credit_ledger" to "service_role";
grant INSERT ("auto_top_up_enabled", "balance_usd", "company_id", "created_at", "id", "max_top_up_amount_usd", "max_top_up_per_day", "min_floor_usd", "stripe_customer_id", "stripe_payment_method_id", "tenant_id", "top_up_amount_usd", "top_up_trigger_balance_usd", "updated_at") on table public."company_credit_wallets" to "anon";
grant REFERENCES ("auto_top_up_enabled", "balance_usd", "company_id", "created_at", "id", "max_top_up_amount_usd", "max_top_up_per_day", "min_floor_usd", "stripe_customer_id", "stripe_payment_method_id", "tenant_id", "top_up_amount_usd", "top_up_trigger_balance_usd", "updated_at") on table public."company_credit_wallets" to "anon";
grant SELECT ("auto_top_up_enabled", "balance_usd", "company_id", "created_at", "id", "max_top_up_amount_usd", "max_top_up_per_day", "min_floor_usd", "stripe_customer_id", "stripe_payment_method_id", "tenant_id", "top_up_amount_usd", "top_up_trigger_balance_usd", "updated_at") on table public."company_credit_wallets" to "anon";
grant UPDATE ("auto_top_up_enabled", "balance_usd", "company_id", "created_at", "id", "max_top_up_amount_usd", "max_top_up_per_day", "min_floor_usd", "stripe_customer_id", "stripe_payment_method_id", "tenant_id", "top_up_amount_usd", "top_up_trigger_balance_usd", "updated_at") on table public."company_credit_wallets" to "anon";
grant INSERT ("auto_top_up_enabled", "balance_usd", "company_id", "created_at", "id", "max_top_up_amount_usd", "max_top_up_per_day", "min_floor_usd", "stripe_customer_id", "stripe_payment_method_id", "tenant_id", "top_up_amount_usd", "top_up_trigger_balance_usd", "updated_at") on table public."company_credit_wallets" to "authenticated";
grant REFERENCES ("auto_top_up_enabled", "balance_usd", "company_id", "created_at", "id", "max_top_up_amount_usd", "max_top_up_per_day", "min_floor_usd", "stripe_customer_id", "stripe_payment_method_id", "tenant_id", "top_up_amount_usd", "top_up_trigger_balance_usd", "updated_at") on table public."company_credit_wallets" to "authenticated";
grant SELECT ("auto_top_up_enabled", "balance_usd", "company_id", "created_at", "id", "max_top_up_amount_usd", "max_top_up_per_day", "min_floor_usd", "stripe_customer_id", "stripe_payment_method_id", "tenant_id", "top_up_amount_usd", "top_up_trigger_balance_usd", "updated_at") on table public."company_credit_wallets" to "authenticated";
grant UPDATE ("auto_top_up_enabled", "balance_usd", "company_id", "created_at", "id", "max_top_up_amount_usd", "max_top_up_per_day", "min_floor_usd", "stripe_customer_id", "stripe_payment_method_id", "tenant_id", "top_up_amount_usd", "top_up_trigger_balance_usd", "updated_at") on table public."company_credit_wallets" to "authenticated";
grant INSERT ("auto_top_up_enabled", "balance_usd", "company_id", "created_at", "id", "max_top_up_amount_usd", "max_top_up_per_day", "min_floor_usd", "stripe_customer_id", "stripe_payment_method_id", "tenant_id", "top_up_amount_usd", "top_up_trigger_balance_usd", "updated_at") on table public."company_credit_wallets" to "service_role";
grant REFERENCES ("auto_top_up_enabled", "balance_usd", "company_id", "created_at", "id", "max_top_up_amount_usd", "max_top_up_per_day", "min_floor_usd", "stripe_customer_id", "stripe_payment_method_id", "tenant_id", "top_up_amount_usd", "top_up_trigger_balance_usd", "updated_at") on table public."company_credit_wallets" to "service_role";
grant SELECT ("auto_top_up_enabled", "balance_usd", "company_id", "created_at", "id", "max_top_up_amount_usd", "max_top_up_per_day", "min_floor_usd", "stripe_customer_id", "stripe_payment_method_id", "tenant_id", "top_up_amount_usd", "top_up_trigger_balance_usd", "updated_at") on table public."company_credit_wallets" to "service_role";
grant UPDATE ("auto_top_up_enabled", "balance_usd", "company_id", "created_at", "id", "max_top_up_amount_usd", "max_top_up_per_day", "min_floor_usd", "stripe_customer_id", "stripe_payment_method_id", "tenant_id", "top_up_amount_usd", "top_up_trigger_balance_usd", "updated_at") on table public."company_credit_wallets" to "service_role";
grant INSERT ("approval_status", "company_id", "consent_obtained", "content_type", "id", "name", "shows_customer", "size", "uploaded_at", "uploaded_by") on table public."company_documents" to "anon";
grant REFERENCES ("approval_status", "company_id", "consent_obtained", "content_type", "id", "name", "shows_customer", "size", "uploaded_at", "uploaded_by") on table public."company_documents" to "anon";
grant SELECT ("approval_status", "company_id", "consent_obtained", "content_type", "id", "name", "shows_customer", "size", "uploaded_at", "uploaded_by") on table public."company_documents" to "anon";
grant UPDATE ("approval_status", "company_id", "consent_obtained", "content_type", "id", "name", "shows_customer", "size", "uploaded_at", "uploaded_by") on table public."company_documents" to "anon";
grant INSERT ("approval_status", "company_id", "consent_obtained", "content_type", "id", "name", "shows_customer", "size", "uploaded_at", "uploaded_by") on table public."company_documents" to "authenticated";
grant REFERENCES ("approval_status", "company_id", "consent_obtained", "content_type", "id", "name", "shows_customer", "size", "uploaded_at", "uploaded_by") on table public."company_documents" to "authenticated";
grant SELECT ("approval_status", "company_id", "consent_obtained", "content_type", "id", "name", "shows_customer", "size", "uploaded_at", "uploaded_by") on table public."company_documents" to "authenticated";
grant UPDATE ("approval_status", "company_id", "consent_obtained", "content_type", "id", "name", "shows_customer", "size", "uploaded_at", "uploaded_by") on table public."company_documents" to "authenticated";
grant INSERT ("approval_status", "company_id", "consent_obtained", "content_type", "id", "name", "shows_customer", "size", "uploaded_at", "uploaded_by") on table public."company_documents" to "service_role";
grant REFERENCES ("approval_status", "company_id", "consent_obtained", "content_type", "id", "name", "shows_customer", "size", "uploaded_at", "uploaded_by") on table public."company_documents" to "service_role";
grant SELECT ("approval_status", "company_id", "consent_obtained", "content_type", "id", "name", "shows_customer", "size", "uploaded_at", "uploaded_by") on table public."company_documents" to "service_role";
grant UPDATE ("approval_status", "company_id", "consent_obtained", "content_type", "id", "name", "shows_customer", "size", "uploaded_at", "uploaded_by") on table public."company_documents" to "service_role";
grant INSERT ("addon_id", "cancelled_at", "company_id", "enabled_at", "enabled_by", "id", "status", "stripe_subscription_id", "updated_at") on table public."company_entitlements" to "anon";
grant REFERENCES ("addon_id", "cancelled_at", "company_id", "enabled_at", "enabled_by", "id", "status", "stripe_subscription_id", "updated_at") on table public."company_entitlements" to "anon";
grant SELECT ("addon_id", "cancelled_at", "company_id", "enabled_at", "enabled_by", "id", "status", "stripe_subscription_id", "updated_at") on table public."company_entitlements" to "anon";
grant UPDATE ("addon_id", "cancelled_at", "company_id", "enabled_at", "enabled_by", "id", "status", "stripe_subscription_id", "updated_at") on table public."company_entitlements" to "anon";
grant INSERT ("addon_id", "cancelled_at", "company_id", "enabled_at", "enabled_by", "id", "status", "stripe_subscription_id", "updated_at") on table public."company_entitlements" to "authenticated";
grant REFERENCES ("addon_id", "cancelled_at", "company_id", "enabled_at", "enabled_by", "id", "status", "stripe_subscription_id", "updated_at") on table public."company_entitlements" to "authenticated";
grant SELECT ("addon_id", "cancelled_at", "company_id", "enabled_at", "enabled_by", "id", "status", "stripe_subscription_id", "updated_at") on table public."company_entitlements" to "authenticated";
grant UPDATE ("addon_id", "cancelled_at", "company_id", "enabled_at", "enabled_by", "id", "status", "stripe_subscription_id", "updated_at") on table public."company_entitlements" to "authenticated";
grant INSERT ("addon_id", "cancelled_at", "company_id", "enabled_at", "enabled_by", "id", "status", "stripe_subscription_id", "updated_at") on table public."company_entitlements" to "service_role";
grant REFERENCES ("addon_id", "cancelled_at", "company_id", "enabled_at", "enabled_by", "id", "status", "stripe_subscription_id", "updated_at") on table public."company_entitlements" to "service_role";
grant SELECT ("addon_id", "cancelled_at", "company_id", "enabled_at", "enabled_by", "id", "status", "stripe_subscription_id", "updated_at") on table public."company_entitlements" to "service_role";
grant UPDATE ("addon_id", "cancelled_at", "company_id", "enabled_at", "enabled_by", "id", "status", "stripe_subscription_id", "updated_at") on table public."company_entitlements" to "service_role";
grant INSERT ("author_name", "body", "company_id", "created_by", "draft_response", "escalation_required", "external_id", "id", "imported_at", "platform", "published_response", "rating", "responded_at", "reviewed_at", "sentiment", "status", "topics", "urgency") on table public."company_reviews" to "anon";
grant REFERENCES ("author_name", "body", "company_id", "created_by", "draft_response", "escalation_required", "external_id", "id", "imported_at", "platform", "published_response", "rating", "responded_at", "reviewed_at", "sentiment", "status", "topics", "urgency") on table public."company_reviews" to "anon";
grant SELECT ("author_name", "body", "company_id", "created_by", "draft_response", "escalation_required", "external_id", "id", "imported_at", "platform", "published_response", "rating", "responded_at", "reviewed_at", "sentiment", "status", "topics", "urgency") on table public."company_reviews" to "anon";
grant UPDATE ("author_name", "body", "company_id", "created_by", "draft_response", "escalation_required", "external_id", "id", "imported_at", "platform", "published_response", "rating", "responded_at", "reviewed_at", "sentiment", "status", "topics", "urgency") on table public."company_reviews" to "anon";
grant INSERT ("author_name", "body", "company_id", "created_by", "draft_response", "escalation_required", "external_id", "id", "imported_at", "platform", "published_response", "rating", "responded_at", "reviewed_at", "sentiment", "status", "topics", "urgency") on table public."company_reviews" to "authenticated";
grant REFERENCES ("author_name", "body", "company_id", "created_by", "draft_response", "escalation_required", "external_id", "id", "imported_at", "platform", "published_response", "rating", "responded_at", "reviewed_at", "sentiment", "status", "topics", "urgency") on table public."company_reviews" to "authenticated";
grant SELECT ("author_name", "body", "company_id", "created_by", "draft_response", "escalation_required", "external_id", "id", "imported_at", "platform", "published_response", "rating", "responded_at", "reviewed_at", "sentiment", "status", "topics", "urgency") on table public."company_reviews" to "authenticated";
grant UPDATE ("author_name", "body", "company_id", "created_by", "draft_response", "escalation_required", "external_id", "id", "imported_at", "platform", "published_response", "rating", "responded_at", "reviewed_at", "sentiment", "status", "topics", "urgency") on table public."company_reviews" to "authenticated";
grant INSERT ("author_name", "body", "company_id", "created_by", "draft_response", "escalation_required", "external_id", "id", "imported_at", "platform", "published_response", "rating", "responded_at", "reviewed_at", "sentiment", "status", "topics", "urgency") on table public."company_reviews" to "service_role";
grant REFERENCES ("author_name", "body", "company_id", "created_by", "draft_response", "escalation_required", "external_id", "id", "imported_at", "platform", "published_response", "rating", "responded_at", "reviewed_at", "sentiment", "status", "topics", "urgency") on table public."company_reviews" to "service_role";
grant SELECT ("author_name", "body", "company_id", "created_by", "draft_response", "escalation_required", "external_id", "id", "imported_at", "platform", "published_response", "rating", "responded_at", "reviewed_at", "sentiment", "status", "topics", "urgency") on table public."company_reviews" to "service_role";
grant UPDATE ("author_name", "body", "company_id", "created_by", "draft_response", "escalation_required", "external_id", "id", "imported_at", "platform", "published_response", "rating", "responded_at", "reviewed_at", "sentiment", "status", "topics", "urgency") on table public."company_reviews" to "service_role";
grant INSERT ("account_name_hint", "company_id", "completed_at", "created_at", "expires_at", "id", "integration_id", "invited_by", "platform", "recipient_email", "status", "tenant_id", "token", "updated_at") on table public."connect_invites" to "anon";
grant REFERENCES ("account_name_hint", "company_id", "completed_at", "created_at", "expires_at", "id", "integration_id", "invited_by", "platform", "recipient_email", "status", "tenant_id", "token", "updated_at") on table public."connect_invites" to "anon";
grant SELECT ("account_name_hint", "company_id", "completed_at", "created_at", "expires_at", "id", "integration_id", "invited_by", "platform", "recipient_email", "status", "tenant_id", "token", "updated_at") on table public."connect_invites" to "anon";
grant UPDATE ("account_name_hint", "company_id", "completed_at", "created_at", "expires_at", "id", "integration_id", "invited_by", "platform", "recipient_email", "status", "tenant_id", "token", "updated_at") on table public."connect_invites" to "anon";
grant INSERT ("account_name_hint", "company_id", "completed_at", "created_at", "expires_at", "id", "integration_id", "invited_by", "platform", "recipient_email", "status", "tenant_id", "token", "updated_at") on table public."connect_invites" to "authenticated";
grant REFERENCES ("account_name_hint", "company_id", "completed_at", "created_at", "expires_at", "id", "integration_id", "invited_by", "platform", "recipient_email", "status", "tenant_id", "token", "updated_at") on table public."connect_invites" to "authenticated";
grant SELECT ("account_name_hint", "company_id", "completed_at", "created_at", "expires_at", "id", "integration_id", "invited_by", "platform", "recipient_email", "status", "tenant_id", "token", "updated_at") on table public."connect_invites" to "authenticated";
grant UPDATE ("account_name_hint", "company_id", "completed_at", "created_at", "expires_at", "id", "integration_id", "invited_by", "platform", "recipient_email", "status", "tenant_id", "token", "updated_at") on table public."connect_invites" to "authenticated";
grant INSERT ("account_name_hint", "company_id", "completed_at", "created_at", "expires_at", "id", "integration_id", "invited_by", "platform", "recipient_email", "status", "tenant_id", "token", "updated_at") on table public."connect_invites" to "service_role";
grant REFERENCES ("account_name_hint", "company_id", "completed_at", "created_at", "expires_at", "id", "integration_id", "invited_by", "platform", "recipient_email", "status", "tenant_id", "token", "updated_at") on table public."connect_invites" to "service_role";
grant SELECT ("account_name_hint", "company_id", "completed_at", "created_at", "expires_at", "id", "integration_id", "invited_by", "platform", "recipient_email", "status", "tenant_id", "token", "updated_at") on table public."connect_invites" to "service_role";
grant UPDATE ("account_name_hint", "company_id", "completed_at", "created_at", "expires_at", "id", "integration_id", "invited_by", "platform", "recipient_email", "status", "tenant_id", "token", "updated_at") on table public."connect_invites" to "service_role";
grant INSERT ("approved_by", "company_id", "consent_obtained", "created_at", "document_name", "expiry_date", "id", "permitted_channels", "person_shown", "restrictions", "withdrawn") on table public."consents" to "anon";
grant REFERENCES ("approved_by", "company_id", "consent_obtained", "created_at", "document_name", "expiry_date", "id", "permitted_channels", "person_shown", "restrictions", "withdrawn") on table public."consents" to "anon";
grant SELECT ("approved_by", "company_id", "consent_obtained", "created_at", "document_name", "expiry_date", "id", "permitted_channels", "person_shown", "restrictions", "withdrawn") on table public."consents" to "anon";
grant UPDATE ("approved_by", "company_id", "consent_obtained", "created_at", "document_name", "expiry_date", "id", "permitted_channels", "person_shown", "restrictions", "withdrawn") on table public."consents" to "anon";
grant INSERT ("approved_by", "company_id", "consent_obtained", "created_at", "document_name", "expiry_date", "id", "permitted_channels", "person_shown", "restrictions", "withdrawn") on table public."consents" to "authenticated";
grant REFERENCES ("approved_by", "company_id", "consent_obtained", "created_at", "document_name", "expiry_date", "id", "permitted_channels", "person_shown", "restrictions", "withdrawn") on table public."consents" to "authenticated";
grant SELECT ("approved_by", "company_id", "consent_obtained", "created_at", "document_name", "expiry_date", "id", "permitted_channels", "person_shown", "restrictions", "withdrawn") on table public."consents" to "authenticated";
grant UPDATE ("approved_by", "company_id", "consent_obtained", "created_at", "document_name", "expiry_date", "id", "permitted_channels", "person_shown", "restrictions", "withdrawn") on table public."consents" to "authenticated";
grant INSERT ("approved_by", "company_id", "consent_obtained", "created_at", "document_name", "expiry_date", "id", "permitted_channels", "person_shown", "restrictions", "withdrawn") on table public."consents" to "service_role";
grant REFERENCES ("approved_by", "company_id", "consent_obtained", "created_at", "document_name", "expiry_date", "id", "permitted_channels", "person_shown", "restrictions", "withdrawn") on table public."consents" to "service_role";
grant SELECT ("approved_by", "company_id", "consent_obtained", "created_at", "document_name", "expiry_date", "id", "permitted_channels", "person_shown", "restrictions", "withdrawn") on table public."consents" to "service_role";
grant UPDATE ("approved_by", "company_id", "consent_obtained", "created_at", "document_name", "expiry_date", "id", "permitted_channels", "person_shown", "restrictions", "withdrawn") on table public."consents" to "service_role";
grant INSERT ("author_id", "author_kind", "author_name", "body", "company_id", "content_id", "created_at", "id") on table public."content_comments" to "anon";
grant REFERENCES ("author_id", "author_kind", "author_name", "body", "company_id", "content_id", "created_at", "id") on table public."content_comments" to "anon";
grant SELECT ("author_id", "author_kind", "author_name", "body", "company_id", "content_id", "created_at", "id") on table public."content_comments" to "anon";
grant UPDATE ("author_id", "author_kind", "author_name", "body", "company_id", "content_id", "created_at", "id") on table public."content_comments" to "anon";
grant INSERT ("author_id", "author_kind", "author_name", "body", "company_id", "content_id", "created_at", "id") on table public."content_comments" to "authenticated";
grant REFERENCES ("author_id", "author_kind", "author_name", "body", "company_id", "content_id", "created_at", "id") on table public."content_comments" to "authenticated";
grant SELECT ("author_id", "author_kind", "author_name", "body", "company_id", "content_id", "created_at", "id") on table public."content_comments" to "authenticated";
grant UPDATE ("author_id", "author_kind", "author_name", "body", "company_id", "content_id", "created_at", "id") on table public."content_comments" to "authenticated";
grant INSERT ("author_id", "author_kind", "author_name", "body", "company_id", "content_id", "created_at", "id") on table public."content_comments" to "service_role";
grant REFERENCES ("author_id", "author_kind", "author_name", "body", "company_id", "content_id", "created_at", "id") on table public."content_comments" to "service_role";
grant SELECT ("author_id", "author_kind", "author_name", "body", "company_id", "content_id", "created_at", "id") on table public."content_comments" to "service_role";
grant UPDATE ("author_id", "author_kind", "author_name", "body", "company_id", "content_id", "created_at", "id") on table public."content_comments" to "service_role";
grant INSERT ("ai_critique", "ai_model", "ai_prompt", "ai_run_id", "approved_at", "approved_by", "asset_ids", "body", "brand_fit_score", "campaign_id", "campaign_item_id", "claim_audit", "client_review", "company_id", "compliance", "created_at", "created_by", "duplicate_warning", "est_cost_usd", "expiry_date", "grounding_label", "id", "managed_channel_key", "managed_concept_id", "repurposed_from_id", "request_id", "reuse_channels", "reuse_permitted", "review_date", "routed_to", "source_refs", "sources_used", "status", "title", "type", "updated_at", "variant_group_id", "variant_label", "versions") on table public."content_items" to "anon";
grant REFERENCES ("ai_critique", "ai_model", "ai_prompt", "ai_run_id", "approved_at", "approved_by", "asset_ids", "body", "brand_fit_score", "campaign_id", "campaign_item_id", "claim_audit", "client_review", "company_id", "compliance", "created_at", "created_by", "duplicate_warning", "est_cost_usd", "expiry_date", "grounding_label", "id", "managed_channel_key", "managed_concept_id", "repurposed_from_id", "request_id", "reuse_channels", "reuse_permitted", "review_date", "routed_to", "source_refs", "sources_used", "status", "title", "type", "updated_at", "variant_group_id", "variant_label", "versions") on table public."content_items" to "anon";
grant SELECT ("ai_critique", "ai_model", "ai_prompt", "ai_run_id", "approved_at", "approved_by", "asset_ids", "body", "brand_fit_score", "campaign_id", "campaign_item_id", "claim_audit", "client_review", "company_id", "compliance", "created_at", "created_by", "duplicate_warning", "est_cost_usd", "expiry_date", "grounding_label", "id", "managed_channel_key", "managed_concept_id", "repurposed_from_id", "request_id", "reuse_channels", "reuse_permitted", "review_date", "routed_to", "source_refs", "sources_used", "status", "title", "type", "updated_at", "variant_group_id", "variant_label", "versions") on table public."content_items" to "anon";
grant UPDATE ("ai_critique", "ai_model", "ai_prompt", "ai_run_id", "approved_at", "approved_by", "asset_ids", "body", "brand_fit_score", "campaign_id", "campaign_item_id", "claim_audit", "client_review", "company_id", "compliance", "created_at", "created_by", "duplicate_warning", "est_cost_usd", "expiry_date", "grounding_label", "id", "managed_channel_key", "managed_concept_id", "repurposed_from_id", "request_id", "reuse_channels", "reuse_permitted", "review_date", "routed_to", "source_refs", "sources_used", "status", "title", "type", "updated_at", "variant_group_id", "variant_label", "versions") on table public."content_items" to "anon";
grant INSERT ("ai_critique", "ai_model", "ai_prompt", "ai_run_id", "approved_at", "approved_by", "asset_ids", "body", "brand_fit_score", "campaign_id", "campaign_item_id", "claim_audit", "client_review", "company_id", "compliance", "created_at", "created_by", "duplicate_warning", "est_cost_usd", "expiry_date", "grounding_label", "id", "managed_channel_key", "managed_concept_id", "repurposed_from_id", "request_id", "reuse_channels", "reuse_permitted", "review_date", "routed_to", "source_refs", "sources_used", "status", "title", "type", "updated_at", "variant_group_id", "variant_label", "versions") on table public."content_items" to "authenticated";
grant REFERENCES ("ai_critique", "ai_model", "ai_prompt", "ai_run_id", "approved_at", "approved_by", "asset_ids", "body", "brand_fit_score", "campaign_id", "campaign_item_id", "claim_audit", "client_review", "company_id", "compliance", "created_at", "created_by", "duplicate_warning", "est_cost_usd", "expiry_date", "grounding_label", "id", "managed_channel_key", "managed_concept_id", "repurposed_from_id", "request_id", "reuse_channels", "reuse_permitted", "review_date", "routed_to", "source_refs", "sources_used", "status", "title", "type", "updated_at", "variant_group_id", "variant_label", "versions") on table public."content_items" to "authenticated";
grant SELECT ("ai_critique", "ai_model", "ai_prompt", "ai_run_id", "approved_at", "approved_by", "asset_ids", "body", "brand_fit_score", "campaign_id", "campaign_item_id", "claim_audit", "client_review", "company_id", "compliance", "created_at", "created_by", "duplicate_warning", "est_cost_usd", "expiry_date", "grounding_label", "id", "managed_channel_key", "managed_concept_id", "repurposed_from_id", "request_id", "reuse_channels", "reuse_permitted", "review_date", "routed_to", "source_refs", "sources_used", "status", "title", "type", "updated_at", "variant_group_id", "variant_label", "versions") on table public."content_items" to "authenticated";
grant UPDATE ("ai_critique", "ai_model", "ai_prompt", "ai_run_id", "approved_at", "approved_by", "asset_ids", "body", "brand_fit_score", "campaign_id", "campaign_item_id", "claim_audit", "client_review", "company_id", "compliance", "created_at", "created_by", "duplicate_warning", "est_cost_usd", "expiry_date", "grounding_label", "id", "managed_channel_key", "managed_concept_id", "repurposed_from_id", "request_id", "reuse_channels", "reuse_permitted", "review_date", "routed_to", "source_refs", "sources_used", "status", "title", "type", "updated_at", "variant_group_id", "variant_label", "versions") on table public."content_items" to "authenticated";
grant INSERT ("ai_critique", "ai_model", "ai_prompt", "ai_run_id", "approved_at", "approved_by", "asset_ids", "body", "brand_fit_score", "campaign_id", "campaign_item_id", "claim_audit", "client_review", "company_id", "compliance", "created_at", "created_by", "duplicate_warning", "est_cost_usd", "expiry_date", "grounding_label", "id", "managed_channel_key", "managed_concept_id", "repurposed_from_id", "request_id", "reuse_channels", "reuse_permitted", "review_date", "routed_to", "source_refs", "sources_used", "status", "title", "type", "updated_at", "variant_group_id", "variant_label", "versions") on table public."content_items" to "service_role";
grant REFERENCES ("ai_critique", "ai_model", "ai_prompt", "ai_run_id", "approved_at", "approved_by", "asset_ids", "body", "brand_fit_score", "campaign_id", "campaign_item_id", "claim_audit", "client_review", "company_id", "compliance", "created_at", "created_by", "duplicate_warning", "est_cost_usd", "expiry_date", "grounding_label", "id", "managed_channel_key", "managed_concept_id", "repurposed_from_id", "request_id", "reuse_channels", "reuse_permitted", "review_date", "routed_to", "source_refs", "sources_used", "status", "title", "type", "updated_at", "variant_group_id", "variant_label", "versions") on table public."content_items" to "service_role";
grant SELECT ("ai_critique", "ai_model", "ai_prompt", "ai_run_id", "approved_at", "approved_by", "asset_ids", "body", "brand_fit_score", "campaign_id", "campaign_item_id", "claim_audit", "client_review", "company_id", "compliance", "created_at", "created_by", "duplicate_warning", "est_cost_usd", "expiry_date", "grounding_label", "id", "managed_channel_key", "managed_concept_id", "repurposed_from_id", "request_id", "reuse_channels", "reuse_permitted", "review_date", "routed_to", "source_refs", "sources_used", "status", "title", "type", "updated_at", "variant_group_id", "variant_label", "versions") on table public."content_items" to "service_role";
grant UPDATE ("ai_critique", "ai_model", "ai_prompt", "ai_run_id", "approved_at", "approved_by", "asset_ids", "body", "brand_fit_score", "campaign_id", "campaign_item_id", "claim_audit", "client_review", "company_id", "compliance", "created_at", "created_by", "duplicate_warning", "est_cost_usd", "expiry_date", "grounding_label", "id", "managed_channel_key", "managed_concept_id", "repurposed_from_id", "request_id", "reuse_channels", "reuse_permitted", "review_date", "routed_to", "source_refs", "sources_used", "status", "title", "type", "updated_at", "variant_group_id", "variant_label", "versions") on table public."content_items" to "service_role";
grant INSERT ("company_id", "created_at", "created_by", "id", "journey_id", "name", "stages", "status", "updated_at") on table public."conversion_funnels" to "anon";
grant REFERENCES ("company_id", "created_at", "created_by", "id", "journey_id", "name", "stages", "status", "updated_at") on table public."conversion_funnels" to "anon";
grant SELECT ("company_id", "created_at", "created_by", "id", "journey_id", "name", "stages", "status", "updated_at") on table public."conversion_funnels" to "anon";
grant UPDATE ("company_id", "created_at", "created_by", "id", "journey_id", "name", "stages", "status", "updated_at") on table public."conversion_funnels" to "anon";
grant INSERT ("company_id", "created_at", "created_by", "id", "journey_id", "name", "stages", "status", "updated_at") on table public."conversion_funnels" to "authenticated";
grant REFERENCES ("company_id", "created_at", "created_by", "id", "journey_id", "name", "stages", "status", "updated_at") on table public."conversion_funnels" to "authenticated";
grant SELECT ("company_id", "created_at", "created_by", "id", "journey_id", "name", "stages", "status", "updated_at") on table public."conversion_funnels" to "authenticated";
grant UPDATE ("company_id", "created_at", "created_by", "id", "journey_id", "name", "stages", "status", "updated_at") on table public."conversion_funnels" to "authenticated";
grant INSERT ("company_id", "created_at", "created_by", "id", "journey_id", "name", "stages", "status", "updated_at") on table public."conversion_funnels" to "service_role";
grant REFERENCES ("company_id", "created_at", "created_by", "id", "journey_id", "name", "stages", "status", "updated_at") on table public."conversion_funnels" to "service_role";
grant SELECT ("company_id", "created_at", "created_by", "id", "journey_id", "name", "stages", "status", "updated_at") on table public."conversion_funnels" to "service_role";
grant UPDATE ("company_id", "created_at", "created_by", "id", "journey_id", "name", "stages", "status", "updated_at") on table public."conversion_funnels" to "service_role";
grant INSERT ("company_id", "consent_status", "created_at", "created_by", "email", "first_name", "id", "last_name", "lead_id", "notes", "phone", "source", "tags", "updated_at") on table public."crm_contacts" to "anon";
grant REFERENCES ("company_id", "consent_status", "created_at", "created_by", "email", "first_name", "id", "last_name", "lead_id", "notes", "phone", "source", "tags", "updated_at") on table public."crm_contacts" to "anon";
grant SELECT ("company_id", "consent_status", "created_at", "created_by", "email", "first_name", "id", "last_name", "lead_id", "notes", "phone", "source", "tags", "updated_at") on table public."crm_contacts" to "anon";
grant UPDATE ("company_id", "consent_status", "created_at", "created_by", "email", "first_name", "id", "last_name", "lead_id", "notes", "phone", "source", "tags", "updated_at") on table public."crm_contacts" to "anon";
grant INSERT ("company_id", "consent_status", "created_at", "created_by", "email", "first_name", "id", "last_name", "lead_id", "notes", "phone", "source", "tags", "updated_at") on table public."crm_contacts" to "authenticated";
grant REFERENCES ("company_id", "consent_status", "created_at", "created_by", "email", "first_name", "id", "last_name", "lead_id", "notes", "phone", "source", "tags", "updated_at") on table public."crm_contacts" to "authenticated";
grant SELECT ("company_id", "consent_status", "created_at", "created_by", "email", "first_name", "id", "last_name", "lead_id", "notes", "phone", "source", "tags", "updated_at") on table public."crm_contacts" to "authenticated";
grant UPDATE ("company_id", "consent_status", "created_at", "created_by", "email", "first_name", "id", "last_name", "lead_id", "notes", "phone", "source", "tags", "updated_at") on table public."crm_contacts" to "authenticated";
grant INSERT ("company_id", "consent_status", "created_at", "created_by", "email", "first_name", "id", "last_name", "lead_id", "notes", "phone", "source", "tags", "updated_at") on table public."crm_contacts" to "service_role";
grant REFERENCES ("company_id", "consent_status", "created_at", "created_by", "email", "first_name", "id", "last_name", "lead_id", "notes", "phone", "source", "tags", "updated_at") on table public."crm_contacts" to "service_role";
grant SELECT ("company_id", "consent_status", "created_at", "created_by", "email", "first_name", "id", "last_name", "lead_id", "notes", "phone", "source", "tags", "updated_at") on table public."crm_contacts" to "service_role";
grant UPDATE ("company_id", "consent_status", "created_at", "created_by", "email", "first_name", "id", "last_name", "lead_id", "notes", "phone", "source", "tags", "updated_at") on table public."crm_contacts" to "service_role";
grant INSERT ("channel", "company_id", "contact_id", "created_by", "detail", "direction", "id", "metadata", "occurred_at", "summary") on table public."crm_interactions" to "anon";
grant REFERENCES ("channel", "company_id", "contact_id", "created_by", "detail", "direction", "id", "metadata", "occurred_at", "summary") on table public."crm_interactions" to "anon";
grant SELECT ("channel", "company_id", "contact_id", "created_by", "detail", "direction", "id", "metadata", "occurred_at", "summary") on table public."crm_interactions" to "anon";
grant UPDATE ("channel", "company_id", "contact_id", "created_by", "detail", "direction", "id", "metadata", "occurred_at", "summary") on table public."crm_interactions" to "anon";
grant INSERT ("channel", "company_id", "contact_id", "created_by", "detail", "direction", "id", "metadata", "occurred_at", "summary") on table public."crm_interactions" to "authenticated";
grant REFERENCES ("channel", "company_id", "contact_id", "created_by", "detail", "direction", "id", "metadata", "occurred_at", "summary") on table public."crm_interactions" to "authenticated";
grant SELECT ("channel", "company_id", "contact_id", "created_by", "detail", "direction", "id", "metadata", "occurred_at", "summary") on table public."crm_interactions" to "authenticated";
grant UPDATE ("channel", "company_id", "contact_id", "created_by", "detail", "direction", "id", "metadata", "occurred_at", "summary") on table public."crm_interactions" to "authenticated";
grant INSERT ("channel", "company_id", "contact_id", "created_by", "detail", "direction", "id", "metadata", "occurred_at", "summary") on table public."crm_interactions" to "service_role";
grant REFERENCES ("channel", "company_id", "contact_id", "created_by", "detail", "direction", "id", "metadata", "occurred_at", "summary") on table public."crm_interactions" to "service_role";
grant SELECT ("channel", "company_id", "contact_id", "created_by", "detail", "direction", "id", "metadata", "occurred_at", "summary") on table public."crm_interactions" to "service_role";
grant UPDATE ("channel", "company_id", "contact_id", "created_by", "detail", "direction", "id", "metadata", "occurred_at", "summary") on table public."crm_interactions" to "service_role";
grant INSERT ("company_id", "created_at", "created_by", "description", "id", "name", "rule_config", "rule_type", "updated_at") on table public."crm_segments" to "anon";
grant REFERENCES ("company_id", "created_at", "created_by", "description", "id", "name", "rule_config", "rule_type", "updated_at") on table public."crm_segments" to "anon";
grant SELECT ("company_id", "created_at", "created_by", "description", "id", "name", "rule_config", "rule_type", "updated_at") on table public."crm_segments" to "anon";
grant UPDATE ("company_id", "created_at", "created_by", "description", "id", "name", "rule_config", "rule_type", "updated_at") on table public."crm_segments" to "anon";
grant INSERT ("company_id", "created_at", "created_by", "description", "id", "name", "rule_config", "rule_type", "updated_at") on table public."crm_segments" to "authenticated";
grant REFERENCES ("company_id", "created_at", "created_by", "description", "id", "name", "rule_config", "rule_type", "updated_at") on table public."crm_segments" to "authenticated";
grant SELECT ("company_id", "created_at", "created_by", "description", "id", "name", "rule_config", "rule_type", "updated_at") on table public."crm_segments" to "authenticated";
grant UPDATE ("company_id", "created_at", "created_by", "description", "id", "name", "rule_config", "rule_type", "updated_at") on table public."crm_segments" to "authenticated";
grant INSERT ("company_id", "created_at", "created_by", "description", "id", "name", "rule_config", "rule_type", "updated_at") on table public."crm_segments" to "service_role";
grant REFERENCES ("company_id", "created_at", "created_by", "description", "id", "name", "rule_config", "rule_type", "updated_at") on table public."crm_segments" to "service_role";
grant SELECT ("company_id", "created_at", "created_by", "description", "id", "name", "rule_config", "rule_type", "updated_at") on table public."crm_segments" to "service_role";
grant UPDATE ("company_id", "created_at", "created_by", "description", "id", "name", "rule_config", "rule_type", "updated_at") on table public."crm_segments" to "service_role";
grant INSERT ("company_id", "created_at", "created_by", "id", "name", "scheduled_at", "segment_tag", "sent_at", "stats", "status", "subject", "template_id", "updated_at") on table public."email_campaigns" to "anon";
grant REFERENCES ("company_id", "created_at", "created_by", "id", "name", "scheduled_at", "segment_tag", "sent_at", "stats", "status", "subject", "template_id", "updated_at") on table public."email_campaigns" to "anon";
grant SELECT ("company_id", "created_at", "created_by", "id", "name", "scheduled_at", "segment_tag", "sent_at", "stats", "status", "subject", "template_id", "updated_at") on table public."email_campaigns" to "anon";
grant UPDATE ("company_id", "created_at", "created_by", "id", "name", "scheduled_at", "segment_tag", "sent_at", "stats", "status", "subject", "template_id", "updated_at") on table public."email_campaigns" to "anon";
grant INSERT ("company_id", "created_at", "created_by", "id", "name", "scheduled_at", "segment_tag", "sent_at", "stats", "status", "subject", "template_id", "updated_at") on table public."email_campaigns" to "authenticated";
grant REFERENCES ("company_id", "created_at", "created_by", "id", "name", "scheduled_at", "segment_tag", "sent_at", "stats", "status", "subject", "template_id", "updated_at") on table public."email_campaigns" to "authenticated";
grant SELECT ("company_id", "created_at", "created_by", "id", "name", "scheduled_at", "segment_tag", "sent_at", "stats", "status", "subject", "template_id", "updated_at") on table public."email_campaigns" to "authenticated";
grant UPDATE ("company_id", "created_at", "created_by", "id", "name", "scheduled_at", "segment_tag", "sent_at", "stats", "status", "subject", "template_id", "updated_at") on table public."email_campaigns" to "authenticated";
grant INSERT ("company_id", "created_at", "created_by", "id", "name", "scheduled_at", "segment_tag", "sent_at", "stats", "status", "subject", "template_id", "updated_at") on table public."email_campaigns" to "service_role";
grant REFERENCES ("company_id", "created_at", "created_by", "id", "name", "scheduled_at", "segment_tag", "sent_at", "stats", "status", "subject", "template_id", "updated_at") on table public."email_campaigns" to "service_role";
grant SELECT ("company_id", "created_at", "created_by", "id", "name", "scheduled_at", "segment_tag", "sent_at", "stats", "status", "subject", "template_id", "updated_at") on table public."email_campaigns" to "service_role";
grant UPDATE ("company_id", "created_at", "created_by", "id", "name", "scheduled_at", "segment_tag", "sent_at", "stats", "status", "subject", "template_id", "updated_at") on table public."email_campaigns" to "service_role";
grant INSERT ("company_id", "created_at", "email", "id", "marketing_consent", "name", "tags", "unsubscribed_at", "updated_at") on table public."email_subscribers" to "anon";
grant REFERENCES ("company_id", "created_at", "email", "id", "marketing_consent", "name", "tags", "unsubscribed_at", "updated_at") on table public."email_subscribers" to "anon";
grant SELECT ("company_id", "created_at", "email", "id", "marketing_consent", "name", "tags", "unsubscribed_at", "updated_at") on table public."email_subscribers" to "anon";
grant UPDATE ("company_id", "created_at", "email", "id", "marketing_consent", "name", "tags", "unsubscribed_at", "updated_at") on table public."email_subscribers" to "anon";
grant INSERT ("company_id", "created_at", "email", "id", "marketing_consent", "name", "tags", "unsubscribed_at", "updated_at") on table public."email_subscribers" to "authenticated";
grant REFERENCES ("company_id", "created_at", "email", "id", "marketing_consent", "name", "tags", "unsubscribed_at", "updated_at") on table public."email_subscribers" to "authenticated";
grant SELECT ("company_id", "created_at", "email", "id", "marketing_consent", "name", "tags", "unsubscribed_at", "updated_at") on table public."email_subscribers" to "authenticated";
grant UPDATE ("company_id", "created_at", "email", "id", "marketing_consent", "name", "tags", "unsubscribed_at", "updated_at") on table public."email_subscribers" to "authenticated";
grant INSERT ("company_id", "created_at", "email", "id", "marketing_consent", "name", "tags", "unsubscribed_at", "updated_at") on table public."email_subscribers" to "service_role";
grant REFERENCES ("company_id", "created_at", "email", "id", "marketing_consent", "name", "tags", "unsubscribed_at", "updated_at") on table public."email_subscribers" to "service_role";
grant SELECT ("company_id", "created_at", "email", "id", "marketing_consent", "name", "tags", "unsubscribed_at", "updated_at") on table public."email_subscribers" to "service_role";
grant UPDATE ("company_id", "created_at", "email", "id", "marketing_consent", "name", "tags", "unsubscribed_at", "updated_at") on table public."email_subscribers" to "service_role";
grant INSERT ("accent_color", "active", "company_id", "created_at", "created_by", "html_body", "id", "kind", "name", "preview_text", "subject", "updated_at") on table public."email_templates" to "anon";
grant REFERENCES ("accent_color", "active", "company_id", "created_at", "created_by", "html_body", "id", "kind", "name", "preview_text", "subject", "updated_at") on table public."email_templates" to "anon";
grant SELECT ("accent_color", "active", "company_id", "created_at", "created_by", "html_body", "id", "kind", "name", "preview_text", "subject", "updated_at") on table public."email_templates" to "anon";
grant UPDATE ("accent_color", "active", "company_id", "created_at", "created_by", "html_body", "id", "kind", "name", "preview_text", "subject", "updated_at") on table public."email_templates" to "anon";
grant INSERT ("accent_color", "active", "company_id", "created_at", "created_by", "html_body", "id", "kind", "name", "preview_text", "subject", "updated_at") on table public."email_templates" to "authenticated";
grant REFERENCES ("accent_color", "active", "company_id", "created_at", "created_by", "html_body", "id", "kind", "name", "preview_text", "subject", "updated_at") on table public."email_templates" to "authenticated";
grant SELECT ("accent_color", "active", "company_id", "created_at", "created_by", "html_body", "id", "kind", "name", "preview_text", "subject", "updated_at") on table public."email_templates" to "authenticated";
grant UPDATE ("accent_color", "active", "company_id", "created_at", "created_by", "html_body", "id", "kind", "name", "preview_text", "subject", "updated_at") on table public."email_templates" to "authenticated";
grant INSERT ("accent_color", "active", "company_id", "created_at", "created_by", "html_body", "id", "kind", "name", "preview_text", "subject", "updated_at") on table public."email_templates" to "service_role";
grant REFERENCES ("accent_color", "active", "company_id", "created_at", "created_by", "html_body", "id", "kind", "name", "preview_text", "subject", "updated_at") on table public."email_templates" to "service_role";
grant SELECT ("accent_color", "active", "company_id", "created_at", "created_by", "html_body", "id", "kind", "name", "preview_text", "subject", "updated_at") on table public."email_templates" to "service_role";
grant UPDATE ("accent_color", "active", "company_id", "created_at", "created_by", "html_body", "id", "kind", "name", "preview_text", "subject", "updated_at") on table public."email_templates" to "service_role";
grant INSERT ("company_id", "created_at", "created_by", "detail", "document_name", "evidence_type", "id", "title", "valid_until") on table public."evidence" to "anon";
grant REFERENCES ("company_id", "created_at", "created_by", "detail", "document_name", "evidence_type", "id", "title", "valid_until") on table public."evidence" to "anon";
grant SELECT ("company_id", "created_at", "created_by", "detail", "document_name", "evidence_type", "id", "title", "valid_until") on table public."evidence" to "anon";
grant UPDATE ("company_id", "created_at", "created_by", "detail", "document_name", "evidence_type", "id", "title", "valid_until") on table public."evidence" to "anon";
grant INSERT ("company_id", "created_at", "created_by", "detail", "document_name", "evidence_type", "id", "title", "valid_until") on table public."evidence" to "authenticated";
grant REFERENCES ("company_id", "created_at", "created_by", "detail", "document_name", "evidence_type", "id", "title", "valid_until") on table public."evidence" to "authenticated";
grant SELECT ("company_id", "created_at", "created_by", "detail", "document_name", "evidence_type", "id", "title", "valid_until") on table public."evidence" to "authenticated";
grant UPDATE ("company_id", "created_at", "created_by", "detail", "document_name", "evidence_type", "id", "title", "valid_until") on table public."evidence" to "authenticated";
grant INSERT ("company_id", "created_at", "created_by", "detail", "document_name", "evidence_type", "id", "title", "valid_until") on table public."evidence" to "service_role";
grant REFERENCES ("company_id", "created_at", "created_by", "detail", "document_name", "evidence_type", "id", "title", "valid_until") on table public."evidence" to "service_role";
grant SELECT ("company_id", "created_at", "created_by", "detail", "document_name", "evidence_type", "id", "title", "valid_until") on table public."evidence" to "service_role";
grant UPDATE ("company_id", "created_at", "created_by", "detail", "document_name", "evidence_type", "id", "title", "valid_until") on table public."evidence" to "service_role";
grant INSERT ("company_id", "created_at", "created_by", "funnel_id", "id", "landing_page_id", "name", "status", "updated_at", "variants", "winner_variant_id") on table public."funnel_ab_experiments" to "anon";
grant REFERENCES ("company_id", "created_at", "created_by", "funnel_id", "id", "landing_page_id", "name", "status", "updated_at", "variants", "winner_variant_id") on table public."funnel_ab_experiments" to "anon";
grant SELECT ("company_id", "created_at", "created_by", "funnel_id", "id", "landing_page_id", "name", "status", "updated_at", "variants", "winner_variant_id") on table public."funnel_ab_experiments" to "anon";
grant UPDATE ("company_id", "created_at", "created_by", "funnel_id", "id", "landing_page_id", "name", "status", "updated_at", "variants", "winner_variant_id") on table public."funnel_ab_experiments" to "anon";
grant INSERT ("company_id", "created_at", "created_by", "funnel_id", "id", "landing_page_id", "name", "status", "updated_at", "variants", "winner_variant_id") on table public."funnel_ab_experiments" to "authenticated";
grant REFERENCES ("company_id", "created_at", "created_by", "funnel_id", "id", "landing_page_id", "name", "status", "updated_at", "variants", "winner_variant_id") on table public."funnel_ab_experiments" to "authenticated";
grant SELECT ("company_id", "created_at", "created_by", "funnel_id", "id", "landing_page_id", "name", "status", "updated_at", "variants", "winner_variant_id") on table public."funnel_ab_experiments" to "authenticated";
grant UPDATE ("company_id", "created_at", "created_by", "funnel_id", "id", "landing_page_id", "name", "status", "updated_at", "variants", "winner_variant_id") on table public."funnel_ab_experiments" to "authenticated";
grant INSERT ("company_id", "created_at", "created_by", "funnel_id", "id", "landing_page_id", "name", "status", "updated_at", "variants", "winner_variant_id") on table public."funnel_ab_experiments" to "service_role";
grant REFERENCES ("company_id", "created_at", "created_by", "funnel_id", "id", "landing_page_id", "name", "status", "updated_at", "variants", "winner_variant_id") on table public."funnel_ab_experiments" to "service_role";
grant SELECT ("company_id", "created_at", "created_by", "funnel_id", "id", "landing_page_id", "name", "status", "updated_at", "variants", "winner_variant_id") on table public."funnel_ab_experiments" to "service_role";
grant UPDATE ("company_id", "created_at", "created_by", "funnel_id", "id", "landing_page_id", "name", "status", "updated_at", "variants", "winner_variant_id") on table public."funnel_ab_experiments" to "service_role";
grant INSERT ("company_id", "created_at", "created_by", "description", "id", "name", "status", "touchpoints", "updated_at") on table public."funnel_journeys" to "anon";
grant REFERENCES ("company_id", "created_at", "created_by", "description", "id", "name", "status", "touchpoints", "updated_at") on table public."funnel_journeys" to "anon";
grant SELECT ("company_id", "created_at", "created_by", "description", "id", "name", "status", "touchpoints", "updated_at") on table public."funnel_journeys" to "anon";
grant UPDATE ("company_id", "created_at", "created_by", "description", "id", "name", "status", "touchpoints", "updated_at") on table public."funnel_journeys" to "anon";
grant INSERT ("company_id", "created_at", "created_by", "description", "id", "name", "status", "touchpoints", "updated_at") on table public."funnel_journeys" to "authenticated";
grant REFERENCES ("company_id", "created_at", "created_by", "description", "id", "name", "status", "touchpoints", "updated_at") on table public."funnel_journeys" to "authenticated";
grant SELECT ("company_id", "created_at", "created_by", "description", "id", "name", "status", "touchpoints", "updated_at") on table public."funnel_journeys" to "authenticated";
grant UPDATE ("company_id", "created_at", "created_by", "description", "id", "name", "status", "touchpoints", "updated_at") on table public."funnel_journeys" to "authenticated";
grant INSERT ("company_id", "created_at", "created_by", "description", "id", "name", "status", "touchpoints", "updated_at") on table public."funnel_journeys" to "service_role";
grant REFERENCES ("company_id", "created_at", "created_by", "description", "id", "name", "status", "touchpoints", "updated_at") on table public."funnel_journeys" to "service_role";
grant SELECT ("company_id", "created_at", "created_by", "description", "id", "name", "status", "touchpoints", "updated_at") on table public."funnel_journeys" to "service_role";
grant UPDATE ("company_id", "created_at", "created_by", "description", "id", "name", "status", "touchpoints", "updated_at") on table public."funnel_journeys" to "service_role";
grant INSERT ("avg_time_on_page_sec", "bounce_rate_pct", "company_id", "created_at", "cta_clicks", "form_submissions", "funnel_id", "id", "slug", "title", "unique_visitors", "updated_at", "url", "view_count") on table public."funnel_landing_pages" to "anon";
grant REFERENCES ("avg_time_on_page_sec", "bounce_rate_pct", "company_id", "created_at", "cta_clicks", "form_submissions", "funnel_id", "id", "slug", "title", "unique_visitors", "updated_at", "url", "view_count") on table public."funnel_landing_pages" to "anon";
grant SELECT ("avg_time_on_page_sec", "bounce_rate_pct", "company_id", "created_at", "cta_clicks", "form_submissions", "funnel_id", "id", "slug", "title", "unique_visitors", "updated_at", "url", "view_count") on table public."funnel_landing_pages" to "anon";
grant UPDATE ("avg_time_on_page_sec", "bounce_rate_pct", "company_id", "created_at", "cta_clicks", "form_submissions", "funnel_id", "id", "slug", "title", "unique_visitors", "updated_at", "url", "view_count") on table public."funnel_landing_pages" to "anon";
grant INSERT ("avg_time_on_page_sec", "bounce_rate_pct", "company_id", "created_at", "cta_clicks", "form_submissions", "funnel_id", "id", "slug", "title", "unique_visitors", "updated_at", "url", "view_count") on table public."funnel_landing_pages" to "authenticated";
grant REFERENCES ("avg_time_on_page_sec", "bounce_rate_pct", "company_id", "created_at", "cta_clicks", "form_submissions", "funnel_id", "id", "slug", "title", "unique_visitors", "updated_at", "url", "view_count") on table public."funnel_landing_pages" to "authenticated";
grant SELECT ("avg_time_on_page_sec", "bounce_rate_pct", "company_id", "created_at", "cta_clicks", "form_submissions", "funnel_id", "id", "slug", "title", "unique_visitors", "updated_at", "url", "view_count") on table public."funnel_landing_pages" to "authenticated";
grant UPDATE ("avg_time_on_page_sec", "bounce_rate_pct", "company_id", "created_at", "cta_clicks", "form_submissions", "funnel_id", "id", "slug", "title", "unique_visitors", "updated_at", "url", "view_count") on table public."funnel_landing_pages" to "authenticated";
grant INSERT ("avg_time_on_page_sec", "bounce_rate_pct", "company_id", "created_at", "cta_clicks", "form_submissions", "funnel_id", "id", "slug", "title", "unique_visitors", "updated_at", "url", "view_count") on table public."funnel_landing_pages" to "service_role";
grant REFERENCES ("avg_time_on_page_sec", "bounce_rate_pct", "company_id", "created_at", "cta_clicks", "form_submissions", "funnel_id", "id", "slug", "title", "unique_visitors", "updated_at", "url", "view_count") on table public."funnel_landing_pages" to "service_role";
grant SELECT ("avg_time_on_page_sec", "bounce_rate_pct", "company_id", "created_at", "cta_clicks", "form_submissions", "funnel_id", "id", "slug", "title", "unique_visitors", "updated_at", "url", "view_count") on table public."funnel_landing_pages" to "service_role";
grant UPDATE ("avg_time_on_page_sec", "bounce_rate_pct", "company_id", "created_at", "cta_clicks", "form_submissions", "funnel_id", "id", "slug", "title", "unique_visitors", "updated_at", "url", "view_count") on table public."funnel_landing_pages" to "service_role";
grant INSERT ("added_by", "company_id", "content", "created_at", "id", "previous_versions", "source_type", "status", "title", "updated_at", "version") on table public."knowledge_documents" to "anon";
grant REFERENCES ("added_by", "company_id", "content", "created_at", "id", "previous_versions", "source_type", "status", "title", "updated_at", "version") on table public."knowledge_documents" to "anon";
grant SELECT ("added_by", "company_id", "content", "created_at", "id", "previous_versions", "source_type", "status", "title", "updated_at", "version") on table public."knowledge_documents" to "anon";
grant UPDATE ("added_by", "company_id", "content", "created_at", "id", "previous_versions", "source_type", "status", "title", "updated_at", "version") on table public."knowledge_documents" to "anon";
grant INSERT ("added_by", "company_id", "content", "created_at", "id", "previous_versions", "source_type", "status", "title", "updated_at", "version") on table public."knowledge_documents" to "authenticated";
grant REFERENCES ("added_by", "company_id", "content", "created_at", "id", "previous_versions", "source_type", "status", "title", "updated_at", "version") on table public."knowledge_documents" to "authenticated";
grant SELECT ("added_by", "company_id", "content", "created_at", "id", "previous_versions", "source_type", "status", "title", "updated_at", "version") on table public."knowledge_documents" to "authenticated";
grant UPDATE ("added_by", "company_id", "content", "created_at", "id", "previous_versions", "source_type", "status", "title", "updated_at", "version") on table public."knowledge_documents" to "authenticated";
grant INSERT ("added_by", "company_id", "content", "created_at", "id", "previous_versions", "source_type", "status", "title", "updated_at", "version") on table public."knowledge_documents" to "service_role";
grant REFERENCES ("added_by", "company_id", "content", "created_at", "id", "previous_versions", "source_type", "status", "title", "updated_at", "version") on table public."knowledge_documents" to "service_role";
grant SELECT ("added_by", "company_id", "content", "created_at", "id", "previous_versions", "source_type", "status", "title", "updated_at", "version") on table public."knowledge_documents" to "service_role";
grant UPDATE ("added_by", "company_id", "content", "created_at", "id", "previous_versions", "source_type", "status", "title", "updated_at", "version") on table public."knowledge_documents" to "service_role";
grant INSERT ("answer", "answered_at", "answered_by", "blocking", "company_id", "context", "created_at", "id", "question", "request_id", "status") on table public."knowledge_gaps" to "anon";
grant REFERENCES ("answer", "answered_at", "answered_by", "blocking", "company_id", "context", "created_at", "id", "question", "request_id", "status") on table public."knowledge_gaps" to "anon";
grant SELECT ("answer", "answered_at", "answered_by", "blocking", "company_id", "context", "created_at", "id", "question", "request_id", "status") on table public."knowledge_gaps" to "anon";
grant UPDATE ("answer", "answered_at", "answered_by", "blocking", "company_id", "context", "created_at", "id", "question", "request_id", "status") on table public."knowledge_gaps" to "anon";
grant INSERT ("answer", "answered_at", "answered_by", "blocking", "company_id", "context", "created_at", "id", "question", "request_id", "status") on table public."knowledge_gaps" to "authenticated";
grant REFERENCES ("answer", "answered_at", "answered_by", "blocking", "company_id", "context", "created_at", "id", "question", "request_id", "status") on table public."knowledge_gaps" to "authenticated";
grant SELECT ("answer", "answered_at", "answered_by", "blocking", "company_id", "context", "created_at", "id", "question", "request_id", "status") on table public."knowledge_gaps" to "authenticated";
grant UPDATE ("answer", "answered_at", "answered_by", "blocking", "company_id", "context", "created_at", "id", "question", "request_id", "status") on table public."knowledge_gaps" to "authenticated";
grant INSERT ("answer", "answered_at", "answered_by", "blocking", "company_id", "context", "created_at", "id", "question", "request_id", "status") on table public."knowledge_gaps" to "service_role";
grant REFERENCES ("answer", "answered_at", "answered_by", "blocking", "company_id", "context", "created_at", "id", "question", "request_id", "status") on table public."knowledge_gaps" to "service_role";
grant SELECT ("answer", "answered_at", "answered_by", "blocking", "company_id", "context", "created_at", "id", "question", "request_id", "status") on table public."knowledge_gaps" to "service_role";
grant UPDATE ("answer", "answered_at", "answered_by", "blocking", "company_id", "context", "created_at", "id", "question", "request_id", "status") on table public."knowledge_gaps" to "service_role";
grant INSERT ("ad_campaign_id", "captured_at", "company_id", "contact", "external_lead_id", "id", "platform", "source", "status", "value_usd") on table public."leads" to "anon";
grant REFERENCES ("ad_campaign_id", "captured_at", "company_id", "contact", "external_lead_id", "id", "platform", "source", "status", "value_usd") on table public."leads" to "anon";
grant SELECT ("ad_campaign_id", "captured_at", "company_id", "contact", "external_lead_id", "id", "platform", "source", "status", "value_usd") on table public."leads" to "anon";
grant UPDATE ("ad_campaign_id", "captured_at", "company_id", "contact", "external_lead_id", "id", "platform", "source", "status", "value_usd") on table public."leads" to "anon";
grant INSERT ("ad_campaign_id", "captured_at", "company_id", "contact", "external_lead_id", "id", "platform", "source", "status", "value_usd") on table public."leads" to "authenticated";
grant REFERENCES ("ad_campaign_id", "captured_at", "company_id", "contact", "external_lead_id", "id", "platform", "source", "status", "value_usd") on table public."leads" to "authenticated";
grant SELECT ("ad_campaign_id", "captured_at", "company_id", "contact", "external_lead_id", "id", "platform", "source", "status", "value_usd") on table public."leads" to "authenticated";
grant UPDATE ("ad_campaign_id", "captured_at", "company_id", "contact", "external_lead_id", "id", "platform", "source", "status", "value_usd") on table public."leads" to "authenticated";
grant INSERT ("ad_campaign_id", "captured_at", "company_id", "contact", "external_lead_id", "id", "platform", "source", "status", "value_usd") on table public."leads" to "service_role";
grant REFERENCES ("ad_campaign_id", "captured_at", "company_id", "contact", "external_lead_id", "id", "platform", "source", "status", "value_usd") on table public."leads" to "service_role";
grant SELECT ("ad_campaign_id", "captured_at", "company_id", "contact", "external_lead_id", "id", "platform", "source", "status", "value_usd") on table public."leads" to "service_role";
grant UPDATE ("ad_campaign_id", "captured_at", "company_id", "contact", "external_lead_id", "id", "platform", "source", "status", "value_usd") on table public."leads" to "service_role";
grant INSERT ("company_id", "created_at", "created_by", "experiment_outcome", "id", "metric", "outcome_notes", "resolved_at", "source_recommendation_type", "statement", "status", "tenant_id", "title", "updated_at") on table public."learning_hypotheses" to "anon";
grant REFERENCES ("company_id", "created_at", "created_by", "experiment_outcome", "id", "metric", "outcome_notes", "resolved_at", "source_recommendation_type", "statement", "status", "tenant_id", "title", "updated_at") on table public."learning_hypotheses" to "anon";
grant SELECT ("company_id", "created_at", "created_by", "experiment_outcome", "id", "metric", "outcome_notes", "resolved_at", "source_recommendation_type", "statement", "status", "tenant_id", "title", "updated_at") on table public."learning_hypotheses" to "anon";
grant UPDATE ("company_id", "created_at", "created_by", "experiment_outcome", "id", "metric", "outcome_notes", "resolved_at", "source_recommendation_type", "statement", "status", "tenant_id", "title", "updated_at") on table public."learning_hypotheses" to "anon";
grant INSERT ("company_id", "created_at", "created_by", "experiment_outcome", "id", "metric", "outcome_notes", "resolved_at", "source_recommendation_type", "statement", "status", "tenant_id", "title", "updated_at") on table public."learning_hypotheses" to "authenticated";
grant REFERENCES ("company_id", "created_at", "created_by", "experiment_outcome", "id", "metric", "outcome_notes", "resolved_at", "source_recommendation_type", "statement", "status", "tenant_id", "title", "updated_at") on table public."learning_hypotheses" to "authenticated";
grant SELECT ("company_id", "created_at", "created_by", "experiment_outcome", "id", "metric", "outcome_notes", "resolved_at", "source_recommendation_type", "statement", "status", "tenant_id", "title", "updated_at") on table public."learning_hypotheses" to "authenticated";
grant UPDATE ("company_id", "created_at", "created_by", "experiment_outcome", "id", "metric", "outcome_notes", "resolved_at", "source_recommendation_type", "statement", "status", "tenant_id", "title", "updated_at") on table public."learning_hypotheses" to "authenticated";
grant INSERT ("company_id", "created_at", "created_by", "experiment_outcome", "id", "metric", "outcome_notes", "resolved_at", "source_recommendation_type", "statement", "status", "tenant_id", "title", "updated_at") on table public."learning_hypotheses" to "service_role";
grant REFERENCES ("company_id", "created_at", "created_by", "experiment_outcome", "id", "metric", "outcome_notes", "resolved_at", "source_recommendation_type", "statement", "status", "tenant_id", "title", "updated_at") on table public."learning_hypotheses" to "service_role";
grant SELECT ("company_id", "created_at", "created_by", "experiment_outcome", "id", "metric", "outcome_notes", "resolved_at", "source_recommendation_type", "statement", "status", "tenant_id", "title", "updated_at") on table public."learning_hypotheses" to "service_role";
grant UPDATE ("company_id", "created_at", "created_by", "experiment_outcome", "id", "metric", "outcome_notes", "resolved_at", "source_recommendation_type", "statement", "status", "tenant_id", "title", "updated_at") on table public."learning_hypotheses" to "service_role";
grant INSERT ("company_id", "created_at", "created_by", "dismiss_reason", "hypothesis_id", "id", "lesson", "recommendation_type", "source", "tenant_id", "title") on table public."learning_lessons" to "anon";
grant REFERENCES ("company_id", "created_at", "created_by", "dismiss_reason", "hypothesis_id", "id", "lesson", "recommendation_type", "source", "tenant_id", "title") on table public."learning_lessons" to "anon";
grant SELECT ("company_id", "created_at", "created_by", "dismiss_reason", "hypothesis_id", "id", "lesson", "recommendation_type", "source", "tenant_id", "title") on table public."learning_lessons" to "anon";
grant UPDATE ("company_id", "created_at", "created_by", "dismiss_reason", "hypothesis_id", "id", "lesson", "recommendation_type", "source", "tenant_id", "title") on table public."learning_lessons" to "anon";
grant INSERT ("company_id", "created_at", "created_by", "dismiss_reason", "hypothesis_id", "id", "lesson", "recommendation_type", "source", "tenant_id", "title") on table public."learning_lessons" to "authenticated";
grant REFERENCES ("company_id", "created_at", "created_by", "dismiss_reason", "hypothesis_id", "id", "lesson", "recommendation_type", "source", "tenant_id", "title") on table public."learning_lessons" to "authenticated";
grant SELECT ("company_id", "created_at", "created_by", "dismiss_reason", "hypothesis_id", "id", "lesson", "recommendation_type", "source", "tenant_id", "title") on table public."learning_lessons" to "authenticated";
grant UPDATE ("company_id", "created_at", "created_by", "dismiss_reason", "hypothesis_id", "id", "lesson", "recommendation_type", "source", "tenant_id", "title") on table public."learning_lessons" to "authenticated";
grant INSERT ("company_id", "created_at", "created_by", "dismiss_reason", "hypothesis_id", "id", "lesson", "recommendation_type", "source", "tenant_id", "title") on table public."learning_lessons" to "service_role";
grant REFERENCES ("company_id", "created_at", "created_by", "dismiss_reason", "hypothesis_id", "id", "lesson", "recommendation_type", "source", "tenant_id", "title") on table public."learning_lessons" to "service_role";
grant SELECT ("company_id", "created_at", "created_by", "dismiss_reason", "hypothesis_id", "id", "lesson", "recommendation_type", "source", "tenant_id", "title") on table public."learning_lessons" to "service_role";
grant UPDATE ("company_id", "created_at", "created_by", "dismiss_reason", "hypothesis_id", "id", "lesson", "recommendation_type", "source", "tenant_id", "title") on table public."learning_lessons" to "service_role";
grant INSERT ("active", "applied_at", "applied_by", "company_id", "id", "reason", "released_at", "released_by", "scope", "target_id", "tenant_id") on table public."legal_holds" to "anon";
grant REFERENCES ("active", "applied_at", "applied_by", "company_id", "id", "reason", "released_at", "released_by", "scope", "target_id", "tenant_id") on table public."legal_holds" to "anon";
grant SELECT ("active", "applied_at", "applied_by", "company_id", "id", "reason", "released_at", "released_by", "scope", "target_id", "tenant_id") on table public."legal_holds" to "anon";
grant UPDATE ("active", "applied_at", "applied_by", "company_id", "id", "reason", "released_at", "released_by", "scope", "target_id", "tenant_id") on table public."legal_holds" to "anon";
grant INSERT ("active", "applied_at", "applied_by", "company_id", "id", "reason", "released_at", "released_by", "scope", "target_id", "tenant_id") on table public."legal_holds" to "authenticated";
grant REFERENCES ("active", "applied_at", "applied_by", "company_id", "id", "reason", "released_at", "released_by", "scope", "target_id", "tenant_id") on table public."legal_holds" to "authenticated";
grant SELECT ("active", "applied_at", "applied_by", "company_id", "id", "reason", "released_at", "released_by", "scope", "target_id", "tenant_id") on table public."legal_holds" to "authenticated";
grant UPDATE ("active", "applied_at", "applied_by", "company_id", "id", "reason", "released_at", "released_by", "scope", "target_id", "tenant_id") on table public."legal_holds" to "authenticated";
grant INSERT ("active", "applied_at", "applied_by", "company_id", "id", "reason", "released_at", "released_by", "scope", "target_id", "tenant_id") on table public."legal_holds" to "service_role";
grant REFERENCES ("active", "applied_at", "applied_by", "company_id", "id", "reason", "released_at", "released_by", "scope", "target_id", "tenant_id") on table public."legal_holds" to "service_role";
grant SELECT ("active", "applied_at", "applied_by", "company_id", "id", "reason", "released_at", "released_by", "scope", "target_id", "tenant_id") on table public."legal_holds" to "service_role";
grant UPDATE ("active", "applied_at", "applied_by", "company_id", "id", "reason", "released_at", "released_by", "scope", "target_id", "tenant_id") on table public."legal_holds" to "service_role";
grant INSERT ("buying_triggers", "common_needs", "company_id", "competitors", "demographics", "local_events", "search_terms", "seasonal_patterns", "suburbs", "updated_at") on table public."local_area_profiles" to "anon";
grant REFERENCES ("buying_triggers", "common_needs", "company_id", "competitors", "demographics", "local_events", "search_terms", "seasonal_patterns", "suburbs", "updated_at") on table public."local_area_profiles" to "anon";
grant SELECT ("buying_triggers", "common_needs", "company_id", "competitors", "demographics", "local_events", "search_terms", "seasonal_patterns", "suburbs", "updated_at") on table public."local_area_profiles" to "anon";
grant UPDATE ("buying_triggers", "common_needs", "company_id", "competitors", "demographics", "local_events", "search_terms", "seasonal_patterns", "suburbs", "updated_at") on table public."local_area_profiles" to "anon";
grant INSERT ("buying_triggers", "common_needs", "company_id", "competitors", "demographics", "local_events", "search_terms", "seasonal_patterns", "suburbs", "updated_at") on table public."local_area_profiles" to "authenticated";
grant REFERENCES ("buying_triggers", "common_needs", "company_id", "competitors", "demographics", "local_events", "search_terms", "seasonal_patterns", "suburbs", "updated_at") on table public."local_area_profiles" to "authenticated";
grant SELECT ("buying_triggers", "common_needs", "company_id", "competitors", "demographics", "local_events", "search_terms", "seasonal_patterns", "suburbs", "updated_at") on table public."local_area_profiles" to "authenticated";
grant UPDATE ("buying_triggers", "common_needs", "company_id", "competitors", "demographics", "local_events", "search_terms", "seasonal_patterns", "suburbs", "updated_at") on table public."local_area_profiles" to "authenticated";
grant INSERT ("buying_triggers", "common_needs", "company_id", "competitors", "demographics", "local_events", "search_terms", "seasonal_patterns", "suburbs", "updated_at") on table public."local_area_profiles" to "service_role";
grant REFERENCES ("buying_triggers", "common_needs", "company_id", "competitors", "demographics", "local_events", "search_terms", "seasonal_patterns", "suburbs", "updated_at") on table public."local_area_profiles" to "service_role";
grant SELECT ("buying_triggers", "common_needs", "company_id", "competitors", "demographics", "local_events", "search_terms", "seasonal_patterns", "suburbs", "updated_at") on table public."local_area_profiles" to "service_role";
grant UPDATE ("buying_triggers", "common_needs", "company_id", "competitors", "demographics", "local_events", "search_terms", "seasonal_patterns", "suburbs", "updated_at") on table public."local_area_profiles" to "service_role";
grant INSERT ("channels", "code", "company_id", "created_at", "created_by", "expires_at", "id", "kind", "max_redemptions", "min_spend", "name", "per_member_limit", "redemption_count", "segment_tag", "status", "updated_at", "value") on table public."loyalty_coupons" to "anon";
grant REFERENCES ("channels", "code", "company_id", "created_at", "created_by", "expires_at", "id", "kind", "max_redemptions", "min_spend", "name", "per_member_limit", "redemption_count", "segment_tag", "status", "updated_at", "value") on table public."loyalty_coupons" to "anon";
grant SELECT ("channels", "code", "company_id", "created_at", "created_by", "expires_at", "id", "kind", "max_redemptions", "min_spend", "name", "per_member_limit", "redemption_count", "segment_tag", "status", "updated_at", "value") on table public."loyalty_coupons" to "anon";
grant UPDATE ("channels", "code", "company_id", "created_at", "created_by", "expires_at", "id", "kind", "max_redemptions", "min_spend", "name", "per_member_limit", "redemption_count", "segment_tag", "status", "updated_at", "value") on table public."loyalty_coupons" to "anon";
grant INSERT ("channels", "code", "company_id", "created_at", "created_by", "expires_at", "id", "kind", "max_redemptions", "min_spend", "name", "per_member_limit", "redemption_count", "segment_tag", "status", "updated_at", "value") on table public."loyalty_coupons" to "authenticated";
grant REFERENCES ("channels", "code", "company_id", "created_at", "created_by", "expires_at", "id", "kind", "max_redemptions", "min_spend", "name", "per_member_limit", "redemption_count", "segment_tag", "status", "updated_at", "value") on table public."loyalty_coupons" to "authenticated";
grant SELECT ("channels", "code", "company_id", "created_at", "created_by", "expires_at", "id", "kind", "max_redemptions", "min_spend", "name", "per_member_limit", "redemption_count", "segment_tag", "status", "updated_at", "value") on table public."loyalty_coupons" to "authenticated";
grant UPDATE ("channels", "code", "company_id", "created_at", "created_by", "expires_at", "id", "kind", "max_redemptions", "min_spend", "name", "per_member_limit", "redemption_count", "segment_tag", "status", "updated_at", "value") on table public."loyalty_coupons" to "authenticated";
grant INSERT ("channels", "code", "company_id", "created_at", "created_by", "expires_at", "id", "kind", "max_redemptions", "min_spend", "name", "per_member_limit", "redemption_count", "segment_tag", "status", "updated_at", "value") on table public."loyalty_coupons" to "service_role";
grant REFERENCES ("channels", "code", "company_id", "created_at", "created_by", "expires_at", "id", "kind", "max_redemptions", "min_spend", "name", "per_member_limit", "redemption_count", "segment_tag", "status", "updated_at", "value") on table public."loyalty_coupons" to "service_role";
grant SELECT ("channels", "code", "company_id", "created_at", "created_by", "expires_at", "id", "kind", "max_redemptions", "min_spend", "name", "per_member_limit", "redemption_count", "segment_tag", "status", "updated_at", "value") on table public."loyalty_coupons" to "service_role";
grant UPDATE ("channels", "code", "company_id", "created_at", "created_by", "expires_at", "id", "kind", "max_redemptions", "min_spend", "name", "per_member_limit", "redemption_count", "segment_tag", "status", "updated_at", "value") on table public."loyalty_coupons" to "service_role";
grant INSERT ("company_id", "contact_id", "created_at", "display_name", "email", "id", "points_balance", "referral_code", "referred_by_code", "stamps_balance", "status", "tier_id", "updated_at") on table public."loyalty_members" to "anon";
grant REFERENCES ("company_id", "contact_id", "created_at", "display_name", "email", "id", "points_balance", "referral_code", "referred_by_code", "stamps_balance", "status", "tier_id", "updated_at") on table public."loyalty_members" to "anon";
grant SELECT ("company_id", "contact_id", "created_at", "display_name", "email", "id", "points_balance", "referral_code", "referred_by_code", "stamps_balance", "status", "tier_id", "updated_at") on table public."loyalty_members" to "anon";
grant UPDATE ("company_id", "contact_id", "created_at", "display_name", "email", "id", "points_balance", "referral_code", "referred_by_code", "stamps_balance", "status", "tier_id", "updated_at") on table public."loyalty_members" to "anon";
grant INSERT ("company_id", "contact_id", "created_at", "display_name", "email", "id", "points_balance", "referral_code", "referred_by_code", "stamps_balance", "status", "tier_id", "updated_at") on table public."loyalty_members" to "authenticated";
grant REFERENCES ("company_id", "contact_id", "created_at", "display_name", "email", "id", "points_balance", "referral_code", "referred_by_code", "stamps_balance", "status", "tier_id", "updated_at") on table public."loyalty_members" to "authenticated";
grant SELECT ("company_id", "contact_id", "created_at", "display_name", "email", "id", "points_balance", "referral_code", "referred_by_code", "stamps_balance", "status", "tier_id", "updated_at") on table public."loyalty_members" to "authenticated";
grant UPDATE ("company_id", "contact_id", "created_at", "display_name", "email", "id", "points_balance", "referral_code", "referred_by_code", "stamps_balance", "status", "tier_id", "updated_at") on table public."loyalty_members" to "authenticated";
grant INSERT ("company_id", "contact_id", "created_at", "display_name", "email", "id", "points_balance", "referral_code", "referred_by_code", "stamps_balance", "status", "tier_id", "updated_at") on table public."loyalty_members" to "service_role";
grant REFERENCES ("company_id", "contact_id", "created_at", "display_name", "email", "id", "points_balance", "referral_code", "referred_by_code", "stamps_balance", "status", "tier_id", "updated_at") on table public."loyalty_members" to "service_role";
grant SELECT ("company_id", "contact_id", "created_at", "display_name", "email", "id", "points_balance", "referral_code", "referred_by_code", "stamps_balance", "status", "tier_id", "updated_at") on table public."loyalty_members" to "service_role";
grant UPDATE ("company_id", "contact_id", "created_at", "display_name", "email", "id", "points_balance", "referral_code", "referred_by_code", "stamps_balance", "status", "tier_id", "updated_at") on table public."loyalty_members" to "service_role";
grant INSERT ("company_id", "enabled", "points_per_dollar", "referral_bonus_points", "reward_mode", "stamps_per_reward", "updated_at") on table public."loyalty_programs" to "anon";
grant REFERENCES ("company_id", "enabled", "points_per_dollar", "referral_bonus_points", "reward_mode", "stamps_per_reward", "updated_at") on table public."loyalty_programs" to "anon";
grant SELECT ("company_id", "enabled", "points_per_dollar", "referral_bonus_points", "reward_mode", "stamps_per_reward", "updated_at") on table public."loyalty_programs" to "anon";
grant UPDATE ("company_id", "enabled", "points_per_dollar", "referral_bonus_points", "reward_mode", "stamps_per_reward", "updated_at") on table public."loyalty_programs" to "anon";
grant INSERT ("company_id", "enabled", "points_per_dollar", "referral_bonus_points", "reward_mode", "stamps_per_reward", "updated_at") on table public."loyalty_programs" to "authenticated";
grant REFERENCES ("company_id", "enabled", "points_per_dollar", "referral_bonus_points", "reward_mode", "stamps_per_reward", "updated_at") on table public."loyalty_programs" to "authenticated";
grant SELECT ("company_id", "enabled", "points_per_dollar", "referral_bonus_points", "reward_mode", "stamps_per_reward", "updated_at") on table public."loyalty_programs" to "authenticated";
grant UPDATE ("company_id", "enabled", "points_per_dollar", "referral_bonus_points", "reward_mode", "stamps_per_reward", "updated_at") on table public."loyalty_programs" to "authenticated";
grant INSERT ("company_id", "enabled", "points_per_dollar", "referral_bonus_points", "reward_mode", "stamps_per_reward", "updated_at") on table public."loyalty_programs" to "service_role";
grant REFERENCES ("company_id", "enabled", "points_per_dollar", "referral_bonus_points", "reward_mode", "stamps_per_reward", "updated_at") on table public."loyalty_programs" to "service_role";
grant SELECT ("company_id", "enabled", "points_per_dollar", "referral_bonus_points", "reward_mode", "stamps_per_reward", "updated_at") on table public."loyalty_programs" to "service_role";
grant UPDATE ("company_id", "enabled", "points_per_dollar", "referral_bonus_points", "reward_mode", "stamps_per_reward", "updated_at") on table public."loyalty_programs" to "service_role";
grant INSERT ("abuse_flagged", "abuse_reason", "amount_off", "company_id", "coupon_id", "id", "member_id", "mode", "redeemed_at") on table public."loyalty_redemptions" to "anon";
grant REFERENCES ("abuse_flagged", "abuse_reason", "amount_off", "company_id", "coupon_id", "id", "member_id", "mode", "redeemed_at") on table public."loyalty_redemptions" to "anon";
grant SELECT ("abuse_flagged", "abuse_reason", "amount_off", "company_id", "coupon_id", "id", "member_id", "mode", "redeemed_at") on table public."loyalty_redemptions" to "anon";
grant UPDATE ("abuse_flagged", "abuse_reason", "amount_off", "company_id", "coupon_id", "id", "member_id", "mode", "redeemed_at") on table public."loyalty_redemptions" to "anon";
grant INSERT ("abuse_flagged", "abuse_reason", "amount_off", "company_id", "coupon_id", "id", "member_id", "mode", "redeemed_at") on table public."loyalty_redemptions" to "authenticated";
grant REFERENCES ("abuse_flagged", "abuse_reason", "amount_off", "company_id", "coupon_id", "id", "member_id", "mode", "redeemed_at") on table public."loyalty_redemptions" to "authenticated";
grant SELECT ("abuse_flagged", "abuse_reason", "amount_off", "company_id", "coupon_id", "id", "member_id", "mode", "redeemed_at") on table public."loyalty_redemptions" to "authenticated";
grant UPDATE ("abuse_flagged", "abuse_reason", "amount_off", "company_id", "coupon_id", "id", "member_id", "mode", "redeemed_at") on table public."loyalty_redemptions" to "authenticated";
grant INSERT ("abuse_flagged", "abuse_reason", "amount_off", "company_id", "coupon_id", "id", "member_id", "mode", "redeemed_at") on table public."loyalty_redemptions" to "service_role";
grant REFERENCES ("abuse_flagged", "abuse_reason", "amount_off", "company_id", "coupon_id", "id", "member_id", "mode", "redeemed_at") on table public."loyalty_redemptions" to "service_role";
grant SELECT ("abuse_flagged", "abuse_reason", "amount_off", "company_id", "coupon_id", "id", "member_id", "mode", "redeemed_at") on table public."loyalty_redemptions" to "service_role";
grant UPDATE ("abuse_flagged", "abuse_reason", "amount_off", "company_id", "coupon_id", "id", "member_id", "mode", "redeemed_at") on table public."loyalty_redemptions" to "service_role";
grant INSERT ("bonus_awarded", "company_id", "completed_at", "created_at", "id", "referee_email", "referrer_member_id", "status") on table public."loyalty_referrals" to "anon";
grant REFERENCES ("bonus_awarded", "company_id", "completed_at", "created_at", "id", "referee_email", "referrer_member_id", "status") on table public."loyalty_referrals" to "anon";
grant SELECT ("bonus_awarded", "company_id", "completed_at", "created_at", "id", "referee_email", "referrer_member_id", "status") on table public."loyalty_referrals" to "anon";
grant UPDATE ("bonus_awarded", "company_id", "completed_at", "created_at", "id", "referee_email", "referrer_member_id", "status") on table public."loyalty_referrals" to "anon";
grant INSERT ("bonus_awarded", "company_id", "completed_at", "created_at", "id", "referee_email", "referrer_member_id", "status") on table public."loyalty_referrals" to "authenticated";
grant REFERENCES ("bonus_awarded", "company_id", "completed_at", "created_at", "id", "referee_email", "referrer_member_id", "status") on table public."loyalty_referrals" to "authenticated";
grant SELECT ("bonus_awarded", "company_id", "completed_at", "created_at", "id", "referee_email", "referrer_member_id", "status") on table public."loyalty_referrals" to "authenticated";
grant UPDATE ("bonus_awarded", "company_id", "completed_at", "created_at", "id", "referee_email", "referrer_member_id", "status") on table public."loyalty_referrals" to "authenticated";
grant INSERT ("bonus_awarded", "company_id", "completed_at", "created_at", "id", "referee_email", "referrer_member_id", "status") on table public."loyalty_referrals" to "service_role";
grant REFERENCES ("bonus_awarded", "company_id", "completed_at", "created_at", "id", "referee_email", "referrer_member_id", "status") on table public."loyalty_referrals" to "service_role";
grant SELECT ("bonus_awarded", "company_id", "completed_at", "created_at", "id", "referee_email", "referrer_member_id", "status") on table public."loyalty_referrals" to "service_role";
grant UPDATE ("bonus_awarded", "company_id", "completed_at", "created_at", "id", "referee_email", "referrer_member_id", "status") on table public."loyalty_referrals" to "service_role";
grant INSERT ("benefits", "company_id", "created_at", "id", "name", "sort_order", "threshold_points", "updated_at") on table public."loyalty_tiers" to "anon";
grant REFERENCES ("benefits", "company_id", "created_at", "id", "name", "sort_order", "threshold_points", "updated_at") on table public."loyalty_tiers" to "anon";
grant SELECT ("benefits", "company_id", "created_at", "id", "name", "sort_order", "threshold_points", "updated_at") on table public."loyalty_tiers" to "anon";
grant UPDATE ("benefits", "company_id", "created_at", "id", "name", "sort_order", "threshold_points", "updated_at") on table public."loyalty_tiers" to "anon";
grant INSERT ("benefits", "company_id", "created_at", "id", "name", "sort_order", "threshold_points", "updated_at") on table public."loyalty_tiers" to "authenticated";
grant REFERENCES ("benefits", "company_id", "created_at", "id", "name", "sort_order", "threshold_points", "updated_at") on table public."loyalty_tiers" to "authenticated";
grant SELECT ("benefits", "company_id", "created_at", "id", "name", "sort_order", "threshold_points", "updated_at") on table public."loyalty_tiers" to "authenticated";
grant UPDATE ("benefits", "company_id", "created_at", "id", "name", "sort_order", "threshold_points", "updated_at") on table public."loyalty_tiers" to "authenticated";
grant INSERT ("benefits", "company_id", "created_at", "id", "name", "sort_order", "threshold_points", "updated_at") on table public."loyalty_tiers" to "service_role";
grant REFERENCES ("benefits", "company_id", "created_at", "id", "name", "sort_order", "threshold_points", "updated_at") on table public."loyalty_tiers" to "service_role";
grant SELECT ("benefits", "company_id", "created_at", "id", "name", "sort_order", "threshold_points", "updated_at") on table public."loyalty_tiers" to "service_role";
grant UPDATE ("benefits", "company_id", "created_at", "id", "name", "sort_order", "threshold_points", "updated_at") on table public."loyalty_tiers" to "service_role";
grant INSERT ("ad_campaign_id", "company_id", "concept_id", "content_id", "created_at", "direct_charge_disclosure_accepted_at", "due_at", "id", "planned_slot_id", "recipient_email", "reminder_3d_at", "reminder_3d_key", "reminder_7d_at", "reminder_7d_key", "reminder_claim_expires_at", "reminder_claim_kind", "reminder_claim_owner", "reminder_claimed_at", "responded_at", "response_payload", "revision_round", "scope", "staff_escalation_at", "staff_escalation_key", "status", "superseded_by_id", "tenant_id", "token_hash", "updated_at") on table public."managed_approval_requests" to "anon";
grant REFERENCES ("ad_campaign_id", "company_id", "concept_id", "content_id", "created_at", "direct_charge_disclosure_accepted_at", "due_at", "id", "planned_slot_id", "recipient_email", "reminder_3d_at", "reminder_3d_key", "reminder_7d_at", "reminder_7d_key", "reminder_claim_expires_at", "reminder_claim_kind", "reminder_claim_owner", "reminder_claimed_at", "responded_at", "response_payload", "revision_round", "scope", "staff_escalation_at", "staff_escalation_key", "status", "superseded_by_id", "tenant_id", "token_hash", "updated_at") on table public."managed_approval_requests" to "anon";
grant SELECT ("ad_campaign_id", "company_id", "concept_id", "content_id", "created_at", "direct_charge_disclosure_accepted_at", "due_at", "id", "planned_slot_id", "recipient_email", "reminder_3d_at", "reminder_3d_key", "reminder_7d_at", "reminder_7d_key", "reminder_claim_expires_at", "reminder_claim_kind", "reminder_claim_owner", "reminder_claimed_at", "responded_at", "response_payload", "revision_round", "scope", "staff_escalation_at", "staff_escalation_key", "status", "superseded_by_id", "tenant_id", "token_hash", "updated_at") on table public."managed_approval_requests" to "anon";
grant UPDATE ("ad_campaign_id", "company_id", "concept_id", "content_id", "created_at", "direct_charge_disclosure_accepted_at", "due_at", "id", "planned_slot_id", "recipient_email", "reminder_3d_at", "reminder_3d_key", "reminder_7d_at", "reminder_7d_key", "reminder_claim_expires_at", "reminder_claim_kind", "reminder_claim_owner", "reminder_claimed_at", "responded_at", "response_payload", "revision_round", "scope", "staff_escalation_at", "staff_escalation_key", "status", "superseded_by_id", "tenant_id", "token_hash", "updated_at") on table public."managed_approval_requests" to "anon";
grant INSERT ("ad_campaign_id", "company_id", "concept_id", "content_id", "created_at", "direct_charge_disclosure_accepted_at", "due_at", "id", "planned_slot_id", "recipient_email", "reminder_3d_at", "reminder_3d_key", "reminder_7d_at", "reminder_7d_key", "reminder_claim_expires_at", "reminder_claim_kind", "reminder_claim_owner", "reminder_claimed_at", "responded_at", "response_payload", "revision_round", "scope", "staff_escalation_at", "staff_escalation_key", "status", "superseded_by_id", "tenant_id", "token_hash", "updated_at") on table public."managed_approval_requests" to "authenticated";
grant REFERENCES ("ad_campaign_id", "company_id", "concept_id", "content_id", "created_at", "direct_charge_disclosure_accepted_at", "due_at", "id", "planned_slot_id", "recipient_email", "reminder_3d_at", "reminder_3d_key", "reminder_7d_at", "reminder_7d_key", "reminder_claim_expires_at", "reminder_claim_kind", "reminder_claim_owner", "reminder_claimed_at", "responded_at", "response_payload", "revision_round", "scope", "staff_escalation_at", "staff_escalation_key", "status", "superseded_by_id", "tenant_id", "token_hash", "updated_at") on table public."managed_approval_requests" to "authenticated";
grant SELECT ("ad_campaign_id", "company_id", "concept_id", "content_id", "created_at", "direct_charge_disclosure_accepted_at", "due_at", "id", "planned_slot_id", "recipient_email", "reminder_3d_at", "reminder_3d_key", "reminder_7d_at", "reminder_7d_key", "responded_at", "revision_round", "scope", "staff_escalation_at", "staff_escalation_key", "status", "superseded_by_id", "tenant_id", "updated_at") on table public."managed_approval_requests" to "authenticated";
grant UPDATE ("ad_campaign_id", "company_id", "concept_id", "content_id", "created_at", "direct_charge_disclosure_accepted_at", "due_at", "id", "planned_slot_id", "recipient_email", "reminder_3d_at", "reminder_3d_key", "reminder_7d_at", "reminder_7d_key", "reminder_claim_expires_at", "reminder_claim_kind", "reminder_claim_owner", "reminder_claimed_at", "responded_at", "response_payload", "revision_round", "scope", "staff_escalation_at", "staff_escalation_key", "status", "superseded_by_id", "tenant_id", "token_hash", "updated_at") on table public."managed_approval_requests" to "authenticated";
grant INSERT ("ad_campaign_id", "company_id", "concept_id", "content_id", "created_at", "direct_charge_disclosure_accepted_at", "due_at", "id", "planned_slot_id", "recipient_email", "reminder_3d_at", "reminder_3d_key", "reminder_7d_at", "reminder_7d_key", "reminder_claim_expires_at", "reminder_claim_kind", "reminder_claim_owner", "reminder_claimed_at", "responded_at", "response_payload", "revision_round", "scope", "staff_escalation_at", "staff_escalation_key", "status", "superseded_by_id", "tenant_id", "token_hash", "updated_at") on table public."managed_approval_requests" to "service_role";
grant REFERENCES ("ad_campaign_id", "company_id", "concept_id", "content_id", "created_at", "direct_charge_disclosure_accepted_at", "due_at", "id", "planned_slot_id", "recipient_email", "reminder_3d_at", "reminder_3d_key", "reminder_7d_at", "reminder_7d_key", "reminder_claim_expires_at", "reminder_claim_kind", "reminder_claim_owner", "reminder_claimed_at", "responded_at", "response_payload", "revision_round", "scope", "staff_escalation_at", "staff_escalation_key", "status", "superseded_by_id", "tenant_id", "token_hash", "updated_at") on table public."managed_approval_requests" to "service_role";
grant SELECT ("ad_campaign_id", "company_id", "concept_id", "content_id", "created_at", "direct_charge_disclosure_accepted_at", "due_at", "id", "planned_slot_id", "recipient_email", "reminder_3d_at", "reminder_3d_key", "reminder_7d_at", "reminder_7d_key", "reminder_claim_expires_at", "reminder_claim_kind", "reminder_claim_owner", "reminder_claimed_at", "responded_at", "response_payload", "revision_round", "scope", "staff_escalation_at", "staff_escalation_key", "status", "superseded_by_id", "tenant_id", "token_hash", "updated_at") on table public."managed_approval_requests" to "service_role";
grant UPDATE ("ad_campaign_id", "company_id", "concept_id", "content_id", "created_at", "direct_charge_disclosure_accepted_at", "due_at", "id", "planned_slot_id", "recipient_email", "reminder_3d_at", "reminder_3d_key", "reminder_7d_at", "reminder_7d_key", "reminder_claim_expires_at", "reminder_claim_kind", "reminder_claim_owner", "reminder_claimed_at", "responded_at", "response_payload", "revision_round", "scope", "staff_escalation_at", "staff_escalation_key", "status", "superseded_by_id", "tenant_id", "token_hash", "updated_at") on table public."managed_approval_requests" to "service_role";
grant INSERT ("channel_key", "company_id", "concept_id", "copy", "created_at", "id", "status", "tenant_id", "updated_at") on table public."managed_channel_adaptations" to "anon";
grant REFERENCES ("channel_key", "company_id", "concept_id", "copy", "created_at", "id", "status", "tenant_id", "updated_at") on table public."managed_channel_adaptations" to "anon";
grant SELECT ("channel_key", "company_id", "concept_id", "copy", "created_at", "id", "status", "tenant_id", "updated_at") on table public."managed_channel_adaptations" to "anon";
grant UPDATE ("channel_key", "company_id", "concept_id", "copy", "created_at", "id", "status", "tenant_id", "updated_at") on table public."managed_channel_adaptations" to "anon";
grant INSERT ("channel_key", "company_id", "concept_id", "copy", "created_at", "id", "status", "tenant_id", "updated_at") on table public."managed_channel_adaptations" to "authenticated";
grant REFERENCES ("channel_key", "company_id", "concept_id", "copy", "created_at", "id", "status", "tenant_id", "updated_at") on table public."managed_channel_adaptations" to "authenticated";
grant SELECT ("channel_key", "company_id", "concept_id", "copy", "created_at", "id", "status", "tenant_id", "updated_at") on table public."managed_channel_adaptations" to "authenticated";
grant UPDATE ("channel_key", "company_id", "concept_id", "copy", "created_at", "id", "status", "tenant_id", "updated_at") on table public."managed_channel_adaptations" to "authenticated";
grant INSERT ("channel_key", "company_id", "concept_id", "copy", "created_at", "id", "status", "tenant_id", "updated_at") on table public."managed_channel_adaptations" to "service_role";
grant REFERENCES ("channel_key", "company_id", "concept_id", "copy", "created_at", "id", "status", "tenant_id", "updated_at") on table public."managed_channel_adaptations" to "service_role";
grant SELECT ("channel_key", "company_id", "concept_id", "copy", "created_at", "id", "status", "tenant_id", "updated_at") on table public."managed_channel_adaptations" to "service_role";
grant UPDATE ("channel_key", "company_id", "concept_id", "copy", "created_at", "id", "status", "tenant_id", "updated_at") on table public."managed_channel_adaptations" to "service_role";
grant INSERT ("campaign_id", "company_id", "created_at", "id", "package_period", "quota_consumed_at", "reusable_asset_id", "status", "strategy_cycle_id", "tenant_id", "theme", "title", "unit_key", "updated_at") on table public."managed_content_concepts" to "anon";
grant REFERENCES ("campaign_id", "company_id", "created_at", "id", "package_period", "quota_consumed_at", "reusable_asset_id", "status", "strategy_cycle_id", "tenant_id", "theme", "title", "unit_key", "updated_at") on table public."managed_content_concepts" to "anon";
grant SELECT ("campaign_id", "company_id", "created_at", "id", "package_period", "quota_consumed_at", "reusable_asset_id", "status", "strategy_cycle_id", "tenant_id", "theme", "title", "unit_key", "updated_at") on table public."managed_content_concepts" to "anon";
grant UPDATE ("campaign_id", "company_id", "created_at", "id", "package_period", "quota_consumed_at", "reusable_asset_id", "status", "strategy_cycle_id", "tenant_id", "theme", "title", "unit_key", "updated_at") on table public."managed_content_concepts" to "anon";
grant INSERT ("campaign_id", "company_id", "created_at", "id", "package_period", "quota_consumed_at", "reusable_asset_id", "status", "strategy_cycle_id", "tenant_id", "theme", "title", "unit_key", "updated_at") on table public."managed_content_concepts" to "authenticated";
grant REFERENCES ("campaign_id", "company_id", "created_at", "id", "package_period", "quota_consumed_at", "reusable_asset_id", "status", "strategy_cycle_id", "tenant_id", "theme", "title", "unit_key", "updated_at") on table public."managed_content_concepts" to "authenticated";
grant SELECT ("campaign_id", "company_id", "created_at", "id", "package_period", "quota_consumed_at", "reusable_asset_id", "status", "strategy_cycle_id", "tenant_id", "theme", "title", "unit_key", "updated_at") on table public."managed_content_concepts" to "authenticated";
grant UPDATE ("campaign_id", "company_id", "created_at", "id", "package_period", "quota_consumed_at", "reusable_asset_id", "status", "strategy_cycle_id", "tenant_id", "theme", "title", "unit_key", "updated_at") on table public."managed_content_concepts" to "authenticated";
grant INSERT ("campaign_id", "company_id", "created_at", "id", "package_period", "quota_consumed_at", "reusable_asset_id", "status", "strategy_cycle_id", "tenant_id", "theme", "title", "unit_key", "updated_at") on table public."managed_content_concepts" to "service_role";
grant REFERENCES ("campaign_id", "company_id", "created_at", "id", "package_period", "quota_consumed_at", "reusable_asset_id", "status", "strategy_cycle_id", "tenant_id", "theme", "title", "unit_key", "updated_at") on table public."managed_content_concepts" to "service_role";
grant SELECT ("campaign_id", "company_id", "created_at", "id", "package_period", "quota_consumed_at", "reusable_asset_id", "status", "strategy_cycle_id", "tenant_id", "theme", "title", "unit_key", "updated_at") on table public."managed_content_concepts" to "service_role";
grant UPDATE ("campaign_id", "company_id", "created_at", "id", "package_period", "quota_consumed_at", "reusable_asset_id", "status", "strategy_cycle_id", "tenant_id", "theme", "title", "unit_key", "updated_at") on table public."managed_content_concepts" to "service_role";
grant INSERT ("company_id", "completed_at", "event_id", "event_type", "job_id", "last_error", "lease_acquired_at", "lease_expires_at", "lease_owner", "payload_digest", "processing_status", "received_at", "tenant_id") on table public."managed_content_job_events" to "service_role";
grant REFERENCES ("company_id", "completed_at", "event_id", "event_type", "job_id", "last_error", "lease_acquired_at", "lease_expires_at", "lease_owner", "payload_digest", "processing_status", "received_at", "tenant_id") on table public."managed_content_job_events" to "service_role";
grant SELECT ("company_id", "completed_at", "event_id", "event_type", "job_id", "last_error", "lease_acquired_at", "lease_expires_at", "lease_owner", "payload_digest", "processing_status", "received_at", "tenant_id") on table public."managed_content_job_events" to "service_role";
grant UPDATE ("company_id", "completed_at", "event_id", "event_type", "job_id", "last_error", "lease_acquired_at", "lease_expires_at", "lease_owner", "payload_digest", "processing_status", "received_at", "tenant_id") on table public."managed_content_job_events" to "service_role";
grant INSERT ("company_id", "created_at", "id", "job_id", "kind", "message", "resolved_at", "status", "tenant_id") on table public."managed_content_job_exceptions" to "service_role";
grant REFERENCES ("company_id", "created_at", "id", "job_id", "kind", "message", "resolved_at", "status", "tenant_id") on table public."managed_content_job_exceptions" to "service_role";
grant SELECT ("company_id", "created_at", "id", "job_id", "kind", "message", "resolved_at", "status", "tenant_id") on table public."managed_content_job_exceptions" to "service_role";
grant UPDATE ("company_id", "created_at", "id", "job_id", "kind", "message", "resolved_at", "status", "tenant_id") on table public."managed_content_job_exceptions" to "service_role";
grant INSERT ("callback_target", "callback_url", "company_id", "concept_id", "created_at", "external_job_id", "external_status_url", "id", "idempotency_key", "imported_concept_id", "last_error", "next_poll_at", "poll_attempts", "private_provenance", "request_fingerprint", "request_id", "request_payload", "result_payload", "schema_version", "status", "strategy_cycle_id", "tenant_id", "updated_at") on table public."managed_content_jobs" to "service_role";
grant REFERENCES ("callback_target", "callback_url", "company_id", "concept_id", "created_at", "external_job_id", "external_status_url", "id", "idempotency_key", "imported_concept_id", "last_error", "next_poll_at", "poll_attempts", "private_provenance", "request_fingerprint", "request_id", "request_payload", "result_payload", "schema_version", "status", "strategy_cycle_id", "tenant_id", "updated_at") on table public."managed_content_jobs" to "service_role";
grant SELECT ("callback_target", "callback_url", "company_id", "concept_id", "created_at", "external_job_id", "external_status_url", "id", "idempotency_key", "imported_concept_id", "last_error", "next_poll_at", "poll_attempts", "private_provenance", "request_fingerprint", "request_id", "request_payload", "result_payload", "schema_version", "status", "strategy_cycle_id", "tenant_id", "updated_at") on table public."managed_content_jobs" to "service_role";
grant UPDATE ("callback_target", "callback_url", "company_id", "concept_id", "created_at", "external_job_id", "external_status_url", "id", "idempotency_key", "imported_concept_id", "last_error", "next_poll_at", "poll_attempts", "private_provenance", "request_fingerprint", "request_id", "request_payload", "result_payload", "schema_version", "status", "strategy_cycle_id", "tenant_id", "updated_at") on table public."managed_content_jobs" to "service_role";
grant INSERT ("assumptions", "calendar_completed_at", "calendar_version", "campaign_id", "company_id", "created_at", "enqueue_reason", "errors", "id", "implementation_plan_emailed_at", "missing_info", "onboarding_completed_at", "phase", "retry_count", "service_level", "status_message_key", "strategy_completed_at", "strategy_due_at", "strategy_eligible_at", "strategy_started_at", "strategy_version", "tenant_id", "updated_at") on table public."managed_delivery_runs" to "anon";
grant REFERENCES ("assumptions", "calendar_completed_at", "calendar_version", "campaign_id", "company_id", "created_at", "enqueue_reason", "errors", "id", "implementation_plan_emailed_at", "missing_info", "onboarding_completed_at", "phase", "retry_count", "service_level", "status_message_key", "strategy_completed_at", "strategy_due_at", "strategy_eligible_at", "strategy_started_at", "strategy_version", "tenant_id", "updated_at") on table public."managed_delivery_runs" to "anon";
grant SELECT ("assumptions", "calendar_completed_at", "calendar_version", "campaign_id", "company_id", "created_at", "enqueue_reason", "errors", "id", "implementation_plan_emailed_at", "missing_info", "onboarding_completed_at", "phase", "retry_count", "service_level", "status_message_key", "strategy_completed_at", "strategy_due_at", "strategy_eligible_at", "strategy_started_at", "strategy_version", "tenant_id", "updated_at") on table public."managed_delivery_runs" to "anon";
grant UPDATE ("assumptions", "calendar_completed_at", "calendar_version", "campaign_id", "company_id", "created_at", "enqueue_reason", "errors", "id", "implementation_plan_emailed_at", "missing_info", "onboarding_completed_at", "phase", "retry_count", "service_level", "status_message_key", "strategy_completed_at", "strategy_due_at", "strategy_eligible_at", "strategy_started_at", "strategy_version", "tenant_id", "updated_at") on table public."managed_delivery_runs" to "anon";
grant INSERT ("assumptions", "calendar_completed_at", "calendar_version", "campaign_id", "company_id", "created_at", "enqueue_reason", "errors", "id", "implementation_plan_emailed_at", "missing_info", "onboarding_completed_at", "phase", "retry_count", "service_level", "status_message_key", "strategy_completed_at", "strategy_due_at", "strategy_eligible_at", "strategy_started_at", "strategy_version", "tenant_id", "updated_at") on table public."managed_delivery_runs" to "authenticated";
grant REFERENCES ("assumptions", "calendar_completed_at", "calendar_version", "campaign_id", "company_id", "created_at", "enqueue_reason", "errors", "id", "implementation_plan_emailed_at", "missing_info", "onboarding_completed_at", "phase", "retry_count", "service_level", "status_message_key", "strategy_completed_at", "strategy_due_at", "strategy_eligible_at", "strategy_started_at", "strategy_version", "tenant_id", "updated_at") on table public."managed_delivery_runs" to "authenticated";
grant SELECT ("assumptions", "calendar_completed_at", "calendar_version", "campaign_id", "company_id", "created_at", "enqueue_reason", "errors", "id", "implementation_plan_emailed_at", "missing_info", "onboarding_completed_at", "phase", "retry_count", "service_level", "status_message_key", "strategy_completed_at", "strategy_due_at", "strategy_eligible_at", "strategy_started_at", "strategy_version", "tenant_id", "updated_at") on table public."managed_delivery_runs" to "authenticated";
grant UPDATE ("assumptions", "calendar_completed_at", "calendar_version", "campaign_id", "company_id", "created_at", "enqueue_reason", "errors", "id", "implementation_plan_emailed_at", "missing_info", "onboarding_completed_at", "phase", "retry_count", "service_level", "status_message_key", "strategy_completed_at", "strategy_due_at", "strategy_eligible_at", "strategy_started_at", "strategy_version", "tenant_id", "updated_at") on table public."managed_delivery_runs" to "authenticated";
grant INSERT ("assumptions", "calendar_completed_at", "calendar_version", "campaign_id", "company_id", "created_at", "enqueue_reason", "errors", "id", "implementation_plan_emailed_at", "missing_info", "onboarding_completed_at", "phase", "retry_count", "service_level", "status_message_key", "strategy_completed_at", "strategy_due_at", "strategy_eligible_at", "strategy_started_at", "strategy_version", "tenant_id", "updated_at") on table public."managed_delivery_runs" to "service_role";
grant REFERENCES ("assumptions", "calendar_completed_at", "calendar_version", "campaign_id", "company_id", "created_at", "enqueue_reason", "errors", "id", "implementation_plan_emailed_at", "missing_info", "onboarding_completed_at", "phase", "retry_count", "service_level", "status_message_key", "strategy_completed_at", "strategy_due_at", "strategy_eligible_at", "strategy_started_at", "strategy_version", "tenant_id", "updated_at") on table public."managed_delivery_runs" to "service_role";
grant SELECT ("assumptions", "calendar_completed_at", "calendar_version", "campaign_id", "company_id", "created_at", "enqueue_reason", "errors", "id", "implementation_plan_emailed_at", "missing_info", "onboarding_completed_at", "phase", "retry_count", "service_level", "status_message_key", "strategy_completed_at", "strategy_due_at", "strategy_eligible_at", "strategy_started_at", "strategy_version", "tenant_id", "updated_at") on table public."managed_delivery_runs" to "service_role";
grant UPDATE ("assumptions", "calendar_completed_at", "calendar_version", "campaign_id", "company_id", "created_at", "enqueue_reason", "errors", "id", "implementation_plan_emailed_at", "missing_info", "onboarding_completed_at", "phase", "retry_count", "service_level", "status_message_key", "strategy_completed_at", "strategy_due_at", "strategy_eligible_at", "strategy_started_at", "strategy_version", "tenant_id", "updated_at") on table public."managed_delivery_runs" to "service_role";
grant INSERT ("company_id", "confidence", "created_at", "decision", "id", "published_at", "reason", "risk_level", "sentiment", "source_id", "source_kind", "tenant_id") on table public."managed_engagement_routes" to "anon";
grant REFERENCES ("company_id", "confidence", "created_at", "decision", "id", "published_at", "reason", "risk_level", "sentiment", "source_id", "source_kind", "tenant_id") on table public."managed_engagement_routes" to "anon";
grant SELECT ("company_id", "confidence", "created_at", "decision", "id", "published_at", "reason", "risk_level", "sentiment", "source_id", "source_kind", "tenant_id") on table public."managed_engagement_routes" to "anon";
grant UPDATE ("company_id", "confidence", "created_at", "decision", "id", "published_at", "reason", "risk_level", "sentiment", "source_id", "source_kind", "tenant_id") on table public."managed_engagement_routes" to "anon";
grant INSERT ("company_id", "confidence", "created_at", "decision", "id", "published_at", "reason", "risk_level", "sentiment", "source_id", "source_kind", "tenant_id") on table public."managed_engagement_routes" to "authenticated";
grant REFERENCES ("company_id", "confidence", "created_at", "decision", "id", "published_at", "reason", "risk_level", "sentiment", "source_id", "source_kind", "tenant_id") on table public."managed_engagement_routes" to "authenticated";
grant SELECT ("company_id", "confidence", "created_at", "decision", "id", "published_at", "reason", "risk_level", "sentiment", "source_id", "source_kind", "tenant_id") on table public."managed_engagement_routes" to "authenticated";
grant UPDATE ("company_id", "confidence", "created_at", "decision", "id", "published_at", "reason", "risk_level", "sentiment", "source_id", "source_kind", "tenant_id") on table public."managed_engagement_routes" to "authenticated";
grant INSERT ("company_id", "confidence", "created_at", "decision", "id", "published_at", "reason", "risk_level", "sentiment", "source_id", "source_kind", "tenant_id") on table public."managed_engagement_routes" to "service_role";
grant REFERENCES ("company_id", "confidence", "created_at", "decision", "id", "published_at", "reason", "risk_level", "sentiment", "source_id", "source_kind", "tenant_id") on table public."managed_engagement_routes" to "service_role";
grant SELECT ("company_id", "confidence", "created_at", "decision", "id", "published_at", "reason", "risk_level", "sentiment", "source_id", "source_kind", "tenant_id") on table public."managed_engagement_routes" to "service_role";
grant UPDATE ("company_id", "confidence", "created_at", "decision", "id", "published_at", "reason", "risk_level", "sentiment", "source_id", "source_kind", "tenant_id") on table public."managed_engagement_routes" to "service_role";
grant INSERT ("ad_campaign_id", "budget_targeting_approval_id", "client_monthly_cap_aud", "company_id", "created_at", "creative_approval_id", "disclosure_accepted_at", "id", "month_key", "requested_budget_aud", "status", "tenant_id", "updated_at") on table public."managed_paid_authorizations" to "anon";
grant REFERENCES ("ad_campaign_id", "budget_targeting_approval_id", "client_monthly_cap_aud", "company_id", "created_at", "creative_approval_id", "disclosure_accepted_at", "id", "month_key", "requested_budget_aud", "status", "tenant_id", "updated_at") on table public."managed_paid_authorizations" to "anon";
grant SELECT ("ad_campaign_id", "budget_targeting_approval_id", "client_monthly_cap_aud", "company_id", "created_at", "creative_approval_id", "disclosure_accepted_at", "id", "month_key", "requested_budget_aud", "status", "tenant_id", "updated_at") on table public."managed_paid_authorizations" to "anon";
grant UPDATE ("ad_campaign_id", "budget_targeting_approval_id", "client_monthly_cap_aud", "company_id", "created_at", "creative_approval_id", "disclosure_accepted_at", "id", "month_key", "requested_budget_aud", "status", "tenant_id", "updated_at") on table public."managed_paid_authorizations" to "anon";
grant INSERT ("ad_campaign_id", "budget_targeting_approval_id", "client_monthly_cap_aud", "company_id", "created_at", "creative_approval_id", "disclosure_accepted_at", "id", "month_key", "requested_budget_aud", "status", "tenant_id", "updated_at") on table public."managed_paid_authorizations" to "authenticated";
grant REFERENCES ("ad_campaign_id", "budget_targeting_approval_id", "client_monthly_cap_aud", "company_id", "created_at", "creative_approval_id", "disclosure_accepted_at", "id", "month_key", "requested_budget_aud", "status", "tenant_id", "updated_at") on table public."managed_paid_authorizations" to "authenticated";
grant SELECT ("ad_campaign_id", "budget_targeting_approval_id", "client_monthly_cap_aud", "company_id", "created_at", "creative_approval_id", "disclosure_accepted_at", "id", "month_key", "requested_budget_aud", "status", "tenant_id", "updated_at") on table public."managed_paid_authorizations" to "authenticated";
grant UPDATE ("ad_campaign_id", "budget_targeting_approval_id", "client_monthly_cap_aud", "company_id", "created_at", "creative_approval_id", "disclosure_accepted_at", "id", "month_key", "requested_budget_aud", "status", "tenant_id", "updated_at") on table public."managed_paid_authorizations" to "authenticated";
grant INSERT ("ad_campaign_id", "budget_targeting_approval_id", "client_monthly_cap_aud", "company_id", "created_at", "creative_approval_id", "disclosure_accepted_at", "id", "month_key", "requested_budget_aud", "status", "tenant_id", "updated_at") on table public."managed_paid_authorizations" to "service_role";
grant REFERENCES ("ad_campaign_id", "budget_targeting_approval_id", "client_monthly_cap_aud", "company_id", "created_at", "creative_approval_id", "disclosure_accepted_at", "id", "month_key", "requested_budget_aud", "status", "tenant_id", "updated_at") on table public."managed_paid_authorizations" to "service_role";
grant SELECT ("ad_campaign_id", "budget_targeting_approval_id", "client_monthly_cap_aud", "company_id", "created_at", "creative_approval_id", "disclosure_accepted_at", "id", "month_key", "requested_budget_aud", "status", "tenant_id", "updated_at") on table public."managed_paid_authorizations" to "service_role";
grant UPDATE ("ad_campaign_id", "budget_targeting_approval_id", "client_monthly_cap_aud", "company_id", "created_at", "creative_approval_id", "disclosure_accepted_at", "id", "month_key", "requested_budget_aud", "status", "tenant_id", "updated_at") on table public."managed_paid_authorizations" to "service_role";
grant INSERT ("adaptation_id", "company_id", "concept_id", "created_at", "final_content_due_at", "id", "planned_publish_at", "scheduled_post_id", "status", "tenant_id", "updated_at") on table public."managed_planned_slots" to "anon";
grant REFERENCES ("adaptation_id", "company_id", "concept_id", "created_at", "final_content_due_at", "id", "planned_publish_at", "scheduled_post_id", "status", "tenant_id", "updated_at") on table public."managed_planned_slots" to "anon";
grant SELECT ("adaptation_id", "company_id", "concept_id", "created_at", "final_content_due_at", "id", "planned_publish_at", "scheduled_post_id", "status", "tenant_id", "updated_at") on table public."managed_planned_slots" to "anon";
grant UPDATE ("adaptation_id", "company_id", "concept_id", "created_at", "final_content_due_at", "id", "planned_publish_at", "scheduled_post_id", "status", "tenant_id", "updated_at") on table public."managed_planned_slots" to "anon";
grant INSERT ("adaptation_id", "company_id", "concept_id", "created_at", "final_content_due_at", "id", "planned_publish_at", "scheduled_post_id", "status", "tenant_id", "updated_at") on table public."managed_planned_slots" to "authenticated";
grant REFERENCES ("adaptation_id", "company_id", "concept_id", "created_at", "final_content_due_at", "id", "planned_publish_at", "scheduled_post_id", "status", "tenant_id", "updated_at") on table public."managed_planned_slots" to "authenticated";
grant SELECT ("adaptation_id", "company_id", "concept_id", "created_at", "final_content_due_at", "id", "planned_publish_at", "scheduled_post_id", "status", "tenant_id", "updated_at") on table public."managed_planned_slots" to "authenticated";
grant UPDATE ("adaptation_id", "company_id", "concept_id", "created_at", "final_content_due_at", "id", "planned_publish_at", "scheduled_post_id", "status", "tenant_id", "updated_at") on table public."managed_planned_slots" to "authenticated";
grant INSERT ("adaptation_id", "company_id", "concept_id", "created_at", "final_content_due_at", "id", "planned_publish_at", "scheduled_post_id", "status", "tenant_id", "updated_at") on table public."managed_planned_slots" to "service_role";
grant REFERENCES ("adaptation_id", "company_id", "concept_id", "created_at", "final_content_due_at", "id", "planned_publish_at", "scheduled_post_id", "status", "tenant_id", "updated_at") on table public."managed_planned_slots" to "service_role";
grant SELECT ("adaptation_id", "company_id", "concept_id", "created_at", "final_content_due_at", "id", "planned_publish_at", "scheduled_post_id", "status", "tenant_id", "updated_at") on table public."managed_planned_slots" to "service_role";
grant UPDATE ("adaptation_id", "company_id", "concept_id", "created_at", "final_content_due_at", "id", "planned_publish_at", "scheduled_post_id", "status", "tenant_id", "updated_at") on table public."managed_planned_slots" to "service_role";
grant INSERT ("approved_at", "company_id", "confirmed_inputs", "created_at", "guardrails", "id", "quarter_start", "status", "superseded_at", "tenant_id", "updated_at") on table public."managed_strategy_cycles" to "anon";
grant REFERENCES ("approved_at", "company_id", "confirmed_inputs", "created_at", "guardrails", "id", "quarter_start", "status", "superseded_at", "tenant_id", "updated_at") on table public."managed_strategy_cycles" to "anon";
grant SELECT ("approved_at", "company_id", "confirmed_inputs", "created_at", "guardrails", "id", "quarter_start", "status", "superseded_at", "tenant_id", "updated_at") on table public."managed_strategy_cycles" to "anon";
grant UPDATE ("approved_at", "company_id", "confirmed_inputs", "created_at", "guardrails", "id", "quarter_start", "status", "superseded_at", "tenant_id", "updated_at") on table public."managed_strategy_cycles" to "anon";
grant INSERT ("approved_at", "company_id", "confirmed_inputs", "created_at", "guardrails", "id", "quarter_start", "status", "superseded_at", "tenant_id", "updated_at") on table public."managed_strategy_cycles" to "authenticated";
grant REFERENCES ("approved_at", "company_id", "confirmed_inputs", "created_at", "guardrails", "id", "quarter_start", "status", "superseded_at", "tenant_id", "updated_at") on table public."managed_strategy_cycles" to "authenticated";
grant SELECT ("approved_at", "company_id", "confirmed_inputs", "created_at", "guardrails", "id", "quarter_start", "status", "superseded_at", "tenant_id", "updated_at") on table public."managed_strategy_cycles" to "authenticated";
grant UPDATE ("approved_at", "company_id", "confirmed_inputs", "created_at", "guardrails", "id", "quarter_start", "status", "superseded_at", "tenant_id", "updated_at") on table public."managed_strategy_cycles" to "authenticated";
grant INSERT ("approved_at", "company_id", "confirmed_inputs", "created_at", "guardrails", "id", "quarter_start", "status", "superseded_at", "tenant_id", "updated_at") on table public."managed_strategy_cycles" to "service_role";
grant REFERENCES ("approved_at", "company_id", "confirmed_inputs", "created_at", "guardrails", "id", "quarter_start", "status", "superseded_at", "tenant_id", "updated_at") on table public."managed_strategy_cycles" to "service_role";
grant SELECT ("approved_at", "company_id", "confirmed_inputs", "created_at", "guardrails", "id", "quarter_start", "status", "superseded_at", "tenant_id", "updated_at") on table public."managed_strategy_cycles" to "service_role";
grant UPDATE ("approved_at", "company_id", "confirmed_inputs", "created_at", "guardrails", "id", "quarter_start", "status", "superseded_at", "tenant_id", "updated_at") on table public."managed_strategy_cycles" to "service_role";
grant INSERT ("assigned_reviewer_id", "call_to_action", "company_id", "consent", "created_at", "id", "location_id", "notes", "objective", "offer", "platform", "preferred_date", "preferred_time", "request_type", "requester_id", "status", "status_history", "target_audience", "topic", "updated_at", "uploads", "urgency") on table public."marketing_requests" to "anon";
grant REFERENCES ("assigned_reviewer_id", "call_to_action", "company_id", "consent", "created_at", "id", "location_id", "notes", "objective", "offer", "platform", "preferred_date", "preferred_time", "request_type", "requester_id", "status", "status_history", "target_audience", "topic", "updated_at", "uploads", "urgency") on table public."marketing_requests" to "anon";
grant SELECT ("assigned_reviewer_id", "call_to_action", "company_id", "consent", "created_at", "id", "location_id", "notes", "objective", "offer", "platform", "preferred_date", "preferred_time", "request_type", "requester_id", "status", "status_history", "target_audience", "topic", "updated_at", "uploads", "urgency") on table public."marketing_requests" to "anon";
grant UPDATE ("assigned_reviewer_id", "call_to_action", "company_id", "consent", "created_at", "id", "location_id", "notes", "objective", "offer", "platform", "preferred_date", "preferred_time", "request_type", "requester_id", "status", "status_history", "target_audience", "topic", "updated_at", "uploads", "urgency") on table public."marketing_requests" to "anon";
grant INSERT ("assigned_reviewer_id", "call_to_action", "company_id", "consent", "created_at", "id", "location_id", "notes", "objective", "offer", "platform", "preferred_date", "preferred_time", "request_type", "requester_id", "status", "status_history", "target_audience", "topic", "updated_at", "uploads", "urgency") on table public."marketing_requests" to "authenticated";
grant REFERENCES ("assigned_reviewer_id", "call_to_action", "company_id", "consent", "created_at", "id", "location_id", "notes", "objective", "offer", "platform", "preferred_date", "preferred_time", "request_type", "requester_id", "status", "status_history", "target_audience", "topic", "updated_at", "uploads", "urgency") on table public."marketing_requests" to "authenticated";
grant SELECT ("assigned_reviewer_id", "call_to_action", "company_id", "consent", "created_at", "id", "location_id", "notes", "objective", "offer", "platform", "preferred_date", "preferred_time", "request_type", "requester_id", "status", "status_history", "target_audience", "topic", "updated_at", "uploads", "urgency") on table public."marketing_requests" to "authenticated";
grant UPDATE ("assigned_reviewer_id", "call_to_action", "company_id", "consent", "created_at", "id", "location_id", "notes", "objective", "offer", "platform", "preferred_date", "preferred_time", "request_type", "requester_id", "status", "status_history", "target_audience", "topic", "updated_at", "uploads", "urgency") on table public."marketing_requests" to "authenticated";
grant INSERT ("assigned_reviewer_id", "call_to_action", "company_id", "consent", "created_at", "id", "location_id", "notes", "objective", "offer", "platform", "preferred_date", "preferred_time", "request_type", "requester_id", "status", "status_history", "target_audience", "topic", "updated_at", "uploads", "urgency") on table public."marketing_requests" to "service_role";
grant REFERENCES ("assigned_reviewer_id", "call_to_action", "company_id", "consent", "created_at", "id", "location_id", "notes", "objective", "offer", "platform", "preferred_date", "preferred_time", "request_type", "requester_id", "status", "status_history", "target_audience", "topic", "updated_at", "uploads", "urgency") on table public."marketing_requests" to "service_role";
grant SELECT ("assigned_reviewer_id", "call_to_action", "company_id", "consent", "created_at", "id", "location_id", "notes", "objective", "offer", "platform", "preferred_date", "preferred_time", "request_type", "requester_id", "status", "status_history", "target_audience", "topic", "updated_at", "uploads", "urgency") on table public."marketing_requests" to "service_role";
grant UPDATE ("assigned_reviewer_id", "call_to_action", "company_id", "consent", "created_at", "id", "location_id", "notes", "objective", "offer", "platform", "preferred_date", "preferred_time", "request_type", "requester_id", "status", "status_history", "target_audience", "topic", "updated_at", "uploads", "urgency") on table public."marketing_requests" to "service_role";
grant INSERT ("company_id", "frequency_cap_per_week", "quiet_hours_end", "quiet_hours_start", "updated_at", "updated_by") on table public."marketing_workflow_settings" to "anon";
grant REFERENCES ("company_id", "frequency_cap_per_week", "quiet_hours_end", "quiet_hours_start", "updated_at", "updated_by") on table public."marketing_workflow_settings" to "anon";
grant SELECT ("company_id", "frequency_cap_per_week", "quiet_hours_end", "quiet_hours_start", "updated_at", "updated_by") on table public."marketing_workflow_settings" to "anon";
grant UPDATE ("company_id", "frequency_cap_per_week", "quiet_hours_end", "quiet_hours_start", "updated_at", "updated_by") on table public."marketing_workflow_settings" to "anon";
grant INSERT ("company_id", "frequency_cap_per_week", "quiet_hours_end", "quiet_hours_start", "updated_at", "updated_by") on table public."marketing_workflow_settings" to "authenticated";
grant REFERENCES ("company_id", "frequency_cap_per_week", "quiet_hours_end", "quiet_hours_start", "updated_at", "updated_by") on table public."marketing_workflow_settings" to "authenticated";
grant SELECT ("company_id", "frequency_cap_per_week", "quiet_hours_end", "quiet_hours_start", "updated_at", "updated_by") on table public."marketing_workflow_settings" to "authenticated";
grant UPDATE ("company_id", "frequency_cap_per_week", "quiet_hours_end", "quiet_hours_start", "updated_at", "updated_by") on table public."marketing_workflow_settings" to "authenticated";
grant INSERT ("company_id", "frequency_cap_per_week", "quiet_hours_end", "quiet_hours_start", "updated_at", "updated_by") on table public."marketing_workflow_settings" to "service_role";
grant REFERENCES ("company_id", "frequency_cap_per_week", "quiet_hours_end", "quiet_hours_start", "updated_at", "updated_by") on table public."marketing_workflow_settings" to "service_role";
grant SELECT ("company_id", "frequency_cap_per_week", "quiet_hours_end", "quiet_hours_start", "updated_at", "updated_by") on table public."marketing_workflow_settings" to "service_role";
grant UPDATE ("company_id", "frequency_cap_per_week", "quiet_hours_end", "quiet_hours_start", "updated_at", "updated_by") on table public."marketing_workflow_settings" to "service_role";
grant INSERT ("company_id", "created_at", "created_by", "deployed_from_template_id", "description", "id", "is_agency_template", "name", "status", "steps", "template_kind", "tenant_id", "trigger_kind", "updated_at") on table public."marketing_workflows" to "anon";
grant REFERENCES ("company_id", "created_at", "created_by", "deployed_from_template_id", "description", "id", "is_agency_template", "name", "status", "steps", "template_kind", "tenant_id", "trigger_kind", "updated_at") on table public."marketing_workflows" to "anon";
grant SELECT ("company_id", "created_at", "created_by", "deployed_from_template_id", "description", "id", "is_agency_template", "name", "status", "steps", "template_kind", "tenant_id", "trigger_kind", "updated_at") on table public."marketing_workflows" to "anon";
grant UPDATE ("company_id", "created_at", "created_by", "deployed_from_template_id", "description", "id", "is_agency_template", "name", "status", "steps", "template_kind", "tenant_id", "trigger_kind", "updated_at") on table public."marketing_workflows" to "anon";
grant INSERT ("company_id", "created_at", "created_by", "deployed_from_template_id", "description", "id", "is_agency_template", "name", "status", "steps", "template_kind", "tenant_id", "trigger_kind", "updated_at") on table public."marketing_workflows" to "authenticated";
grant REFERENCES ("company_id", "created_at", "created_by", "deployed_from_template_id", "description", "id", "is_agency_template", "name", "status", "steps", "template_kind", "tenant_id", "trigger_kind", "updated_at") on table public."marketing_workflows" to "authenticated";
grant SELECT ("company_id", "created_at", "created_by", "deployed_from_template_id", "description", "id", "is_agency_template", "name", "status", "steps", "template_kind", "tenant_id", "trigger_kind", "updated_at") on table public."marketing_workflows" to "authenticated";
grant UPDATE ("company_id", "created_at", "created_by", "deployed_from_template_id", "description", "id", "is_agency_template", "name", "status", "steps", "template_kind", "tenant_id", "trigger_kind", "updated_at") on table public."marketing_workflows" to "authenticated";
grant INSERT ("company_id", "created_at", "created_by", "deployed_from_template_id", "description", "id", "is_agency_template", "name", "status", "steps", "template_kind", "tenant_id", "trigger_kind", "updated_at") on table public."marketing_workflows" to "service_role";
grant REFERENCES ("company_id", "created_at", "created_by", "deployed_from_template_id", "description", "id", "is_agency_template", "name", "status", "steps", "template_kind", "tenant_id", "trigger_kind", "updated_at") on table public."marketing_workflows" to "service_role";
grant SELECT ("company_id", "created_at", "created_by", "deployed_from_template_id", "description", "id", "is_agency_template", "name", "status", "steps", "template_kind", "tenant_id", "trigger_kind", "updated_at") on table public."marketing_workflows" to "service_role";
grant UPDATE ("company_id", "created_at", "created_by", "deployed_from_template_id", "description", "id", "is_agency_template", "name", "status", "steps", "template_kind", "tenant_id", "trigger_kind", "updated_at") on table public."marketing_workflows" to "service_role";
grant INSERT ("billing_class", "brief", "company_id", "created_at", "created_by", "deliverable_asset_ids", "designer_notes", "format", "id", "quota_year", "status", "title", "updated_at") on table public."menu_designs" to "anon";
grant REFERENCES ("billing_class", "brief", "company_id", "created_at", "created_by", "deliverable_asset_ids", "designer_notes", "format", "id", "quota_year", "status", "title", "updated_at") on table public."menu_designs" to "anon";
grant SELECT ("billing_class", "brief", "company_id", "created_at", "created_by", "deliverable_asset_ids", "designer_notes", "format", "id", "quota_year", "status", "title", "updated_at") on table public."menu_designs" to "anon";
grant UPDATE ("billing_class", "brief", "company_id", "created_at", "created_by", "deliverable_asset_ids", "designer_notes", "format", "id", "quota_year", "status", "title", "updated_at") on table public."menu_designs" to "anon";
grant INSERT ("billing_class", "brief", "company_id", "created_at", "created_by", "deliverable_asset_ids", "designer_notes", "format", "id", "quota_year", "status", "title", "updated_at") on table public."menu_designs" to "authenticated";
grant REFERENCES ("billing_class", "brief", "company_id", "created_at", "created_by", "deliverable_asset_ids", "designer_notes", "format", "id", "quota_year", "status", "title", "updated_at") on table public."menu_designs" to "authenticated";
grant SELECT ("billing_class", "brief", "company_id", "created_at", "created_by", "deliverable_asset_ids", "designer_notes", "format", "id", "quota_year", "status", "title", "updated_at") on table public."menu_designs" to "authenticated";
grant UPDATE ("billing_class", "brief", "company_id", "created_at", "created_by", "deliverable_asset_ids", "designer_notes", "format", "id", "quota_year", "status", "title", "updated_at") on table public."menu_designs" to "authenticated";
grant INSERT ("billing_class", "brief", "company_id", "created_at", "created_by", "deliverable_asset_ids", "designer_notes", "format", "id", "quota_year", "status", "title", "updated_at") on table public."menu_designs" to "service_role";
grant REFERENCES ("billing_class", "brief", "company_id", "created_at", "created_by", "deliverable_asset_ids", "designer_notes", "format", "id", "quota_year", "status", "title", "updated_at") on table public."menu_designs" to "service_role";
grant SELECT ("billing_class", "brief", "company_id", "created_at", "created_by", "deliverable_asset_ids", "designer_notes", "format", "id", "quota_year", "status", "title", "updated_at") on table public."menu_designs" to "service_role";
grant UPDATE ("billing_class", "brief", "company_id", "created_at", "created_by", "deliverable_asset_ids", "designer_notes", "format", "id", "quota_year", "status", "title", "updated_at") on table public."menu_designs" to "service_role";
grant INSERT ("approval_status", "approved_wording", "channels_allowed", "company_id", "coupon_code", "created_at", "discount_amount", "discount_percentage", "eligible_categories", "eligible_products", "eligible_regions", "eligible_segments", "end_date", "excluded_customers", "excluded_products", "excluded_regions", "exclusions", "id", "inventory_allocation", "maximum_discount", "minimum_purchase_amount", "name", "offer_description", "per_customer_usage_limit", "promotion_meta", "promotion_type", "redemption_channel", "required_disclaimer", "start_date", "status", "terms", "total_usage_limit", "updated_at") on table public."offers" to "anon";
grant REFERENCES ("approval_status", "approved_wording", "channels_allowed", "company_id", "coupon_code", "created_at", "discount_amount", "discount_percentage", "eligible_categories", "eligible_products", "eligible_regions", "eligible_segments", "end_date", "excluded_customers", "excluded_products", "excluded_regions", "exclusions", "id", "inventory_allocation", "maximum_discount", "minimum_purchase_amount", "name", "offer_description", "per_customer_usage_limit", "promotion_meta", "promotion_type", "redemption_channel", "required_disclaimer", "start_date", "status", "terms", "total_usage_limit", "updated_at") on table public."offers" to "anon";
grant SELECT ("approval_status", "approved_wording", "channels_allowed", "company_id", "coupon_code", "created_at", "discount_amount", "discount_percentage", "eligible_categories", "eligible_products", "eligible_regions", "eligible_segments", "end_date", "excluded_customers", "excluded_products", "excluded_regions", "exclusions", "id", "inventory_allocation", "maximum_discount", "minimum_purchase_amount", "name", "offer_description", "per_customer_usage_limit", "promotion_meta", "promotion_type", "redemption_channel", "required_disclaimer", "start_date", "status", "terms", "total_usage_limit", "updated_at") on table public."offers" to "anon";
grant UPDATE ("approval_status", "approved_wording", "channels_allowed", "company_id", "coupon_code", "created_at", "discount_amount", "discount_percentage", "eligible_categories", "eligible_products", "eligible_regions", "eligible_segments", "end_date", "excluded_customers", "excluded_products", "excluded_regions", "exclusions", "id", "inventory_allocation", "maximum_discount", "minimum_purchase_amount", "name", "offer_description", "per_customer_usage_limit", "promotion_meta", "promotion_type", "redemption_channel", "required_disclaimer", "start_date", "status", "terms", "total_usage_limit", "updated_at") on table public."offers" to "anon";
grant INSERT ("approval_status", "approved_wording", "channels_allowed", "company_id", "coupon_code", "created_at", "discount_amount", "discount_percentage", "eligible_categories", "eligible_products", "eligible_regions", "eligible_segments", "end_date", "excluded_customers", "excluded_products", "excluded_regions", "exclusions", "id", "inventory_allocation", "maximum_discount", "minimum_purchase_amount", "name", "offer_description", "per_customer_usage_limit", "promotion_meta", "promotion_type", "redemption_channel", "required_disclaimer", "start_date", "status", "terms", "total_usage_limit", "updated_at") on table public."offers" to "authenticated";
grant REFERENCES ("approval_status", "approved_wording", "channels_allowed", "company_id", "coupon_code", "created_at", "discount_amount", "discount_percentage", "eligible_categories", "eligible_products", "eligible_regions", "eligible_segments", "end_date", "excluded_customers", "excluded_products", "excluded_regions", "exclusions", "id", "inventory_allocation", "maximum_discount", "minimum_purchase_amount", "name", "offer_description", "per_customer_usage_limit", "promotion_meta", "promotion_type", "redemption_channel", "required_disclaimer", "start_date", "status", "terms", "total_usage_limit", "updated_at") on table public."offers" to "authenticated";
grant SELECT ("approval_status", "approved_wording", "channels_allowed", "company_id", "coupon_code", "created_at", "discount_amount", "discount_percentage", "eligible_categories", "eligible_products", "eligible_regions", "eligible_segments", "end_date", "excluded_customers", "excluded_products", "excluded_regions", "exclusions", "id", "inventory_allocation", "maximum_discount", "minimum_purchase_amount", "name", "offer_description", "per_customer_usage_limit", "promotion_meta", "promotion_type", "redemption_channel", "required_disclaimer", "start_date", "status", "terms", "total_usage_limit", "updated_at") on table public."offers" to "authenticated";
grant UPDATE ("approval_status", "approved_wording", "channels_allowed", "company_id", "coupon_code", "created_at", "discount_amount", "discount_percentage", "eligible_categories", "eligible_products", "eligible_regions", "eligible_segments", "end_date", "excluded_customers", "excluded_products", "excluded_regions", "exclusions", "id", "inventory_allocation", "maximum_discount", "minimum_purchase_amount", "name", "offer_description", "per_customer_usage_limit", "promotion_meta", "promotion_type", "redemption_channel", "required_disclaimer", "start_date", "status", "terms", "total_usage_limit", "updated_at") on table public."offers" to "authenticated";
grant INSERT ("approval_status", "approved_wording", "channels_allowed", "company_id", "coupon_code", "created_at", "discount_amount", "discount_percentage", "eligible_categories", "eligible_products", "eligible_regions", "eligible_segments", "end_date", "excluded_customers", "excluded_products", "excluded_regions", "exclusions", "id", "inventory_allocation", "maximum_discount", "minimum_purchase_amount", "name", "offer_description", "per_customer_usage_limit", "promotion_meta", "promotion_type", "redemption_channel", "required_disclaimer", "start_date", "status", "terms", "total_usage_limit", "updated_at") on table public."offers" to "service_role";
grant REFERENCES ("approval_status", "approved_wording", "channels_allowed", "company_id", "coupon_code", "created_at", "discount_amount", "discount_percentage", "eligible_categories", "eligible_products", "eligible_regions", "eligible_segments", "end_date", "excluded_customers", "excluded_products", "excluded_regions", "exclusions", "id", "inventory_allocation", "maximum_discount", "minimum_purchase_amount", "name", "offer_description", "per_customer_usage_limit", "promotion_meta", "promotion_type", "redemption_channel", "required_disclaimer", "start_date", "status", "terms", "total_usage_limit", "updated_at") on table public."offers" to "service_role";
grant SELECT ("approval_status", "approved_wording", "channels_allowed", "company_id", "coupon_code", "created_at", "discount_amount", "discount_percentage", "eligible_categories", "eligible_products", "eligible_regions", "eligible_segments", "end_date", "excluded_customers", "excluded_products", "excluded_regions", "exclusions", "id", "inventory_allocation", "maximum_discount", "minimum_purchase_amount", "name", "offer_description", "per_customer_usage_limit", "promotion_meta", "promotion_type", "redemption_channel", "required_disclaimer", "start_date", "status", "terms", "total_usage_limit", "updated_at") on table public."offers" to "service_role";
grant UPDATE ("approval_status", "approved_wording", "channels_allowed", "company_id", "coupon_code", "created_at", "discount_amount", "discount_percentage", "eligible_categories", "eligible_products", "eligible_regions", "eligible_segments", "end_date", "excluded_customers", "excluded_products", "excluded_regions", "exclusions", "id", "inventory_allocation", "maximum_discount", "minimum_purchase_amount", "name", "offer_description", "per_customer_usage_limit", "promotion_meta", "promotion_type", "redemption_channel", "required_disclaimer", "start_date", "status", "terms", "total_usage_limit", "updated_at") on table public."offers" to "service_role";
grant INSERT ("available", "category", "company_id", "created_at", "description", "id", "name", "price_cents", "sort_order", "updated_at") on table public."order_menu_items" to "anon";
grant REFERENCES ("available", "category", "company_id", "created_at", "description", "id", "name", "price_cents", "sort_order", "updated_at") on table public."order_menu_items" to "anon";
grant SELECT ("available", "category", "company_id", "created_at", "description", "id", "name", "price_cents", "sort_order", "updated_at") on table public."order_menu_items" to "anon";
grant UPDATE ("available", "category", "company_id", "created_at", "description", "id", "name", "price_cents", "sort_order", "updated_at") on table public."order_menu_items" to "anon";
grant INSERT ("available", "category", "company_id", "created_at", "description", "id", "name", "price_cents", "sort_order", "updated_at") on table public."order_menu_items" to "authenticated";
grant REFERENCES ("available", "category", "company_id", "created_at", "description", "id", "name", "price_cents", "sort_order", "updated_at") on table public."order_menu_items" to "authenticated";
grant SELECT ("available", "category", "company_id", "created_at", "description", "id", "name", "price_cents", "sort_order", "updated_at") on table public."order_menu_items" to "authenticated";
grant UPDATE ("available", "category", "company_id", "created_at", "description", "id", "name", "price_cents", "sort_order", "updated_at") on table public."order_menu_items" to "authenticated";
grant INSERT ("available", "category", "company_id", "created_at", "description", "id", "name", "price_cents", "sort_order", "updated_at") on table public."order_menu_items" to "service_role";
grant REFERENCES ("available", "category", "company_id", "created_at", "description", "id", "name", "price_cents", "sort_order", "updated_at") on table public."order_menu_items" to "service_role";
grant SELECT ("available", "category", "company_id", "created_at", "description", "id", "name", "price_cents", "sort_order", "updated_at") on table public."order_menu_items" to "service_role";
grant UPDATE ("available", "category", "company_id", "created_at", "description", "id", "name", "price_cents", "sort_order", "updated_at") on table public."order_menu_items" to "service_role";
grant INSERT ("button_label", "company_id", "connect_status", "delivery_enabled", "min_order_cents", "pickup_enabled", "stripe_connect_account_id", "updated_at") on table public."ordering_settings" to "anon";
grant REFERENCES ("button_label", "company_id", "connect_status", "delivery_enabled", "min_order_cents", "pickup_enabled", "stripe_connect_account_id", "updated_at") on table public."ordering_settings" to "anon";
grant SELECT ("button_label", "company_id", "connect_status", "delivery_enabled", "min_order_cents", "pickup_enabled", "stripe_connect_account_id", "updated_at") on table public."ordering_settings" to "anon";
grant UPDATE ("button_label", "company_id", "connect_status", "delivery_enabled", "min_order_cents", "pickup_enabled", "stripe_connect_account_id", "updated_at") on table public."ordering_settings" to "anon";
grant INSERT ("button_label", "company_id", "connect_status", "delivery_enabled", "min_order_cents", "pickup_enabled", "stripe_connect_account_id", "updated_at") on table public."ordering_settings" to "authenticated";
grant REFERENCES ("button_label", "company_id", "connect_status", "delivery_enabled", "min_order_cents", "pickup_enabled", "stripe_connect_account_id", "updated_at") on table public."ordering_settings" to "authenticated";
grant SELECT ("button_label", "company_id", "connect_status", "delivery_enabled", "min_order_cents", "pickup_enabled", "stripe_connect_account_id", "updated_at") on table public."ordering_settings" to "authenticated";
grant UPDATE ("button_label", "company_id", "connect_status", "delivery_enabled", "min_order_cents", "pickup_enabled", "stripe_connect_account_id", "updated_at") on table public."ordering_settings" to "authenticated";
grant INSERT ("button_label", "company_id", "connect_status", "delivery_enabled", "min_order_cents", "pickup_enabled", "stripe_connect_account_id", "updated_at") on table public."ordering_settings" to "service_role";
grant REFERENCES ("button_label", "company_id", "connect_status", "delivery_enabled", "min_order_cents", "pickup_enabled", "stripe_connect_account_id", "updated_at") on table public."ordering_settings" to "service_role";
grant SELECT ("button_label", "company_id", "connect_status", "delivery_enabled", "min_order_cents", "pickup_enabled", "stripe_connect_account_id", "updated_at") on table public."ordering_settings" to "service_role";
grant UPDATE ("button_label", "company_id", "connect_status", "delivery_enabled", "min_order_cents", "pickup_enabled", "stripe_connect_account_id", "updated_at") on table public."ordering_settings" to "service_role";
grant INSERT ("created_at", "created_by", "events", "id", "label", "last_delivery_at", "last_delivery_status", "secret_enc", "status", "tenant_id", "updated_at", "url", "verified_at") on table public."partner_webhooks" to "anon";
grant REFERENCES ("created_at", "created_by", "events", "id", "label", "last_delivery_at", "last_delivery_status", "secret_enc", "status", "tenant_id", "updated_at", "url", "verified_at") on table public."partner_webhooks" to "anon";
grant SELECT ("created_at", "created_by", "events", "id", "label", "last_delivery_at", "last_delivery_status", "secret_enc", "status", "tenant_id", "updated_at", "url", "verified_at") on table public."partner_webhooks" to "anon";
grant UPDATE ("created_at", "created_by", "events", "id", "label", "last_delivery_at", "last_delivery_status", "secret_enc", "status", "tenant_id", "updated_at", "url", "verified_at") on table public."partner_webhooks" to "anon";
grant INSERT ("created_at", "created_by", "events", "id", "label", "last_delivery_at", "last_delivery_status", "secret_enc", "status", "tenant_id", "updated_at", "url", "verified_at") on table public."partner_webhooks" to "authenticated";
grant REFERENCES ("created_at", "created_by", "events", "id", "label", "last_delivery_at", "last_delivery_status", "secret_enc", "status", "tenant_id", "updated_at", "url", "verified_at") on table public."partner_webhooks" to "authenticated";
grant SELECT ("created_at", "created_by", "events", "id", "label", "last_delivery_at", "last_delivery_status", "secret_enc", "status", "tenant_id", "updated_at", "url", "verified_at") on table public."partner_webhooks" to "authenticated";
grant UPDATE ("created_at", "created_by", "events", "id", "label", "last_delivery_at", "last_delivery_status", "secret_enc", "status", "tenant_id", "updated_at", "url", "verified_at") on table public."partner_webhooks" to "authenticated";
grant INSERT ("created_at", "created_by", "events", "id", "label", "last_delivery_at", "last_delivery_status", "secret_enc", "status", "tenant_id", "updated_at", "url", "verified_at") on table public."partner_webhooks" to "service_role";
grant REFERENCES ("created_at", "created_by", "events", "id", "label", "last_delivery_at", "last_delivery_status", "secret_enc", "status", "tenant_id", "updated_at", "url", "verified_at") on table public."partner_webhooks" to "service_role";
grant SELECT ("created_at", "created_by", "events", "id", "label", "last_delivery_at", "last_delivery_status", "secret_enc", "status", "tenant_id", "updated_at", "url", "verified_at") on table public."partner_webhooks" to "service_role";
grant UPDATE ("created_at", "created_by", "events", "id", "label", "last_delivery_at", "last_delivery_status", "secret_enc", "status", "tenant_id", "updated_at", "url", "verified_at") on table public."partner_webhooks" to "service_role";
grant INSERT ("booked_by", "brief", "company_id", "created_at", "id", "location", "marketplace_fee_cents", "package_id", "payment_status", "payout_status", "photo_shoot_id", "photographer_id", "photographer_payout_cents", "scheduled_slot", "status", "stripe_checkout_session_id", "total_cents", "updated_at") on table public."photo_marketplace_bookings" to "anon";
grant REFERENCES ("booked_by", "brief", "company_id", "created_at", "id", "location", "marketplace_fee_cents", "package_id", "payment_status", "payout_status", "photo_shoot_id", "photographer_id", "photographer_payout_cents", "scheduled_slot", "status", "stripe_checkout_session_id", "total_cents", "updated_at") on table public."photo_marketplace_bookings" to "anon";
grant SELECT ("booked_by", "brief", "company_id", "created_at", "id", "location", "marketplace_fee_cents", "package_id", "payment_status", "payout_status", "photo_shoot_id", "photographer_id", "photographer_payout_cents", "scheduled_slot", "status", "stripe_checkout_session_id", "total_cents", "updated_at") on table public."photo_marketplace_bookings" to "anon";
grant UPDATE ("booked_by", "brief", "company_id", "created_at", "id", "location", "marketplace_fee_cents", "package_id", "payment_status", "payout_status", "photo_shoot_id", "photographer_id", "photographer_payout_cents", "scheduled_slot", "status", "stripe_checkout_session_id", "total_cents", "updated_at") on table public."photo_marketplace_bookings" to "anon";
grant INSERT ("booked_by", "brief", "company_id", "created_at", "id", "location", "marketplace_fee_cents", "package_id", "payment_status", "payout_status", "photo_shoot_id", "photographer_id", "photographer_payout_cents", "scheduled_slot", "status", "stripe_checkout_session_id", "total_cents", "updated_at") on table public."photo_marketplace_bookings" to "authenticated";
grant REFERENCES ("booked_by", "brief", "company_id", "created_at", "id", "location", "marketplace_fee_cents", "package_id", "payment_status", "payout_status", "photo_shoot_id", "photographer_id", "photographer_payout_cents", "scheduled_slot", "status", "stripe_checkout_session_id", "total_cents", "updated_at") on table public."photo_marketplace_bookings" to "authenticated";
grant SELECT ("booked_by", "brief", "company_id", "created_at", "id", "location", "marketplace_fee_cents", "package_id", "payment_status", "payout_status", "photo_shoot_id", "photographer_id", "photographer_payout_cents", "scheduled_slot", "status", "stripe_checkout_session_id", "total_cents", "updated_at") on table public."photo_marketplace_bookings" to "authenticated";
grant UPDATE ("booked_by", "brief", "company_id", "created_at", "id", "location", "marketplace_fee_cents", "package_id", "payment_status", "payout_status", "photo_shoot_id", "photographer_id", "photographer_payout_cents", "scheduled_slot", "status", "stripe_checkout_session_id", "total_cents", "updated_at") on table public."photo_marketplace_bookings" to "authenticated";
grant INSERT ("booked_by", "brief", "company_id", "created_at", "id", "location", "marketplace_fee_cents", "package_id", "payment_status", "payout_status", "photo_shoot_id", "photographer_id", "photographer_payout_cents", "scheduled_slot", "status", "stripe_checkout_session_id", "total_cents", "updated_at") on table public."photo_marketplace_bookings" to "service_role";
grant REFERENCES ("booked_by", "brief", "company_id", "created_at", "id", "location", "marketplace_fee_cents", "package_id", "payment_status", "payout_status", "photo_shoot_id", "photographer_id", "photographer_payout_cents", "scheduled_slot", "status", "stripe_checkout_session_id", "total_cents", "updated_at") on table public."photo_marketplace_bookings" to "service_role";
grant SELECT ("booked_by", "brief", "company_id", "created_at", "id", "location", "marketplace_fee_cents", "package_id", "payment_status", "payout_status", "photo_shoot_id", "photographer_id", "photographer_payout_cents", "scheduled_slot", "status", "stripe_checkout_session_id", "total_cents", "updated_at") on table public."photo_marketplace_bookings" to "service_role";
grant UPDATE ("booked_by", "brief", "company_id", "created_at", "id", "location", "marketplace_fee_cents", "package_id", "payment_status", "payout_status", "photo_shoot_id", "photographer_id", "photographer_payout_cents", "scheduled_slot", "status", "stripe_checkout_session_id", "total_cents", "updated_at") on table public."photo_marketplace_bookings" to "service_role";
grant INSERT ("brief", "company_id", "created_at", "created_by", "deliverable_asset_ids", "id", "location", "marketplace_booking_id", "photographer_notes", "scheduled_at", "status", "target_channels", "target_content_id", "updated_at") on table public."photo_shoots" to "anon";
grant REFERENCES ("brief", "company_id", "created_at", "created_by", "deliverable_asset_ids", "id", "location", "marketplace_booking_id", "photographer_notes", "scheduled_at", "status", "target_channels", "target_content_id", "updated_at") on table public."photo_shoots" to "anon";
grant SELECT ("brief", "company_id", "created_at", "created_by", "deliverable_asset_ids", "id", "location", "marketplace_booking_id", "photographer_notes", "scheduled_at", "status", "target_channels", "target_content_id", "updated_at") on table public."photo_shoots" to "anon";
grant UPDATE ("brief", "company_id", "created_at", "created_by", "deliverable_asset_ids", "id", "location", "marketplace_booking_id", "photographer_notes", "scheduled_at", "status", "target_channels", "target_content_id", "updated_at") on table public."photo_shoots" to "anon";
grant INSERT ("brief", "company_id", "created_at", "created_by", "deliverable_asset_ids", "id", "location", "marketplace_booking_id", "photographer_notes", "scheduled_at", "status", "target_channels", "target_content_id", "updated_at") on table public."photo_shoots" to "authenticated";
grant REFERENCES ("brief", "company_id", "created_at", "created_by", "deliverable_asset_ids", "id", "location", "marketplace_booking_id", "photographer_notes", "scheduled_at", "status", "target_channels", "target_content_id", "updated_at") on table public."photo_shoots" to "authenticated";
grant SELECT ("brief", "company_id", "created_at", "created_by", "deliverable_asset_ids", "id", "location", "marketplace_booking_id", "photographer_notes", "scheduled_at", "status", "target_channels", "target_content_id", "updated_at") on table public."photo_shoots" to "authenticated";
grant UPDATE ("brief", "company_id", "created_at", "created_by", "deliverable_asset_ids", "id", "location", "marketplace_booking_id", "photographer_notes", "scheduled_at", "status", "target_channels", "target_content_id", "updated_at") on table public."photo_shoots" to "authenticated";
grant INSERT ("brief", "company_id", "created_at", "created_by", "deliverable_asset_ids", "id", "location", "marketplace_booking_id", "photographer_notes", "scheduled_at", "status", "target_channels", "target_content_id", "updated_at") on table public."photo_shoots" to "service_role";
grant REFERENCES ("brief", "company_id", "created_at", "created_by", "deliverable_asset_ids", "id", "location", "marketplace_booking_id", "photographer_notes", "scheduled_at", "status", "target_channels", "target_content_id", "updated_at") on table public."photo_shoots" to "service_role";
grant SELECT ("brief", "company_id", "created_at", "created_by", "deliverable_asset_ids", "id", "location", "marketplace_booking_id", "photographer_notes", "scheduled_at", "status", "target_channels", "target_content_id", "updated_at") on table public."photo_shoots" to "service_role";
grant UPDATE ("brief", "company_id", "created_at", "created_by", "deliverable_asset_ids", "id", "location", "marketplace_booking_id", "photographer_notes", "scheduled_at", "status", "target_channels", "target_content_id", "updated_at") on table public."photo_shoots" to "service_role";
grant INSERT ("active", "created_at", "description", "duration_minutes", "id", "includes", "photographer_id", "price_cents", "title", "updated_at") on table public."photographer_packages" to "anon";
grant REFERENCES ("active", "created_at", "description", "duration_minutes", "id", "includes", "photographer_id", "price_cents", "title", "updated_at") on table public."photographer_packages" to "anon";
grant SELECT ("active", "created_at", "description", "duration_minutes", "id", "includes", "photographer_id", "price_cents", "title", "updated_at") on table public."photographer_packages" to "anon";
grant UPDATE ("active", "created_at", "description", "duration_minutes", "id", "includes", "photographer_id", "price_cents", "title", "updated_at") on table public."photographer_packages" to "anon";
grant INSERT ("active", "created_at", "description", "duration_minutes", "id", "includes", "photographer_id", "price_cents", "title", "updated_at") on table public."photographer_packages" to "authenticated";
grant REFERENCES ("active", "created_at", "description", "duration_minutes", "id", "includes", "photographer_id", "price_cents", "title", "updated_at") on table public."photographer_packages" to "authenticated";
grant SELECT ("active", "created_at", "description", "duration_minutes", "id", "includes", "photographer_id", "price_cents", "title", "updated_at") on table public."photographer_packages" to "authenticated";
grant UPDATE ("active", "created_at", "description", "duration_minutes", "id", "includes", "photographer_id", "price_cents", "title", "updated_at") on table public."photographer_packages" to "authenticated";
grant INSERT ("active", "created_at", "description", "duration_minutes", "id", "includes", "photographer_id", "price_cents", "title", "updated_at") on table public."photographer_packages" to "service_role";
grant REFERENCES ("active", "created_at", "description", "duration_minutes", "id", "includes", "photographer_id", "price_cents", "title", "updated_at") on table public."photographer_packages" to "service_role";
grant SELECT ("active", "created_at", "description", "duration_minutes", "id", "includes", "photographer_id", "price_cents", "title", "updated_at") on table public."photographer_packages" to "service_role";
grant UPDATE ("active", "created_at", "description", "duration_minutes", "id", "includes", "photographer_id", "price_cents", "title", "updated_at") on table public."photographer_packages" to "service_role";
grant INSERT ("active", "bio", "connect_status", "created_at", "id", "name", "service_area", "specialty", "stripe_connect_account_id", "tenant_id", "updated_at") on table public."photographer_profiles" to "anon";
grant REFERENCES ("active", "bio", "connect_status", "created_at", "id", "name", "service_area", "specialty", "stripe_connect_account_id", "tenant_id", "updated_at") on table public."photographer_profiles" to "anon";
grant SELECT ("active", "bio", "connect_status", "created_at", "id", "name", "service_area", "specialty", "stripe_connect_account_id", "tenant_id", "updated_at") on table public."photographer_profiles" to "anon";
grant UPDATE ("active", "bio", "connect_status", "created_at", "id", "name", "service_area", "specialty", "stripe_connect_account_id", "tenant_id", "updated_at") on table public."photographer_profiles" to "anon";
grant INSERT ("active", "bio", "connect_status", "created_at", "id", "name", "service_area", "specialty", "stripe_connect_account_id", "tenant_id", "updated_at") on table public."photographer_profiles" to "authenticated";
grant REFERENCES ("active", "bio", "connect_status", "created_at", "id", "name", "service_area", "specialty", "stripe_connect_account_id", "tenant_id", "updated_at") on table public."photographer_profiles" to "authenticated";
grant SELECT ("active", "bio", "connect_status", "created_at", "id", "name", "service_area", "specialty", "stripe_connect_account_id", "tenant_id", "updated_at") on table public."photographer_profiles" to "authenticated";
grant UPDATE ("active", "bio", "connect_status", "created_at", "id", "name", "service_area", "specialty", "stripe_connect_account_id", "tenant_id", "updated_at") on table public."photographer_profiles" to "authenticated";
grant INSERT ("active", "bio", "connect_status", "created_at", "id", "name", "service_area", "specialty", "stripe_connect_account_id", "tenant_id", "updated_at") on table public."photographer_profiles" to "service_role";
grant REFERENCES ("active", "bio", "connect_status", "created_at", "id", "name", "service_area", "specialty", "stripe_connect_account_id", "tenant_id", "updated_at") on table public."photographer_profiles" to "service_role";
grant SELECT ("active", "bio", "connect_status", "created_at", "id", "name", "service_area", "specialty", "stripe_connect_account_id", "tenant_id", "updated_at") on table public."photographer_profiles" to "service_role";
grant UPDATE ("active", "bio", "connect_status", "created_at", "id", "name", "service_area", "specialty", "stripe_connect_account_id", "tenant_id", "updated_at") on table public."photographer_profiles" to "service_role";
grant INSERT ("company_id", "completed_at", "created_at", "created_by", "due_at", "id", "jurisdiction", "lawful_basis", "notes", "request_type", "status", "subject_ref", "tenant_id") on table public."privacy_requests" to "anon";
grant REFERENCES ("company_id", "completed_at", "created_at", "created_by", "due_at", "id", "jurisdiction", "lawful_basis", "notes", "request_type", "status", "subject_ref", "tenant_id") on table public."privacy_requests" to "anon";
grant SELECT ("company_id", "completed_at", "created_at", "created_by", "due_at", "id", "jurisdiction", "lawful_basis", "notes", "request_type", "status", "subject_ref", "tenant_id") on table public."privacy_requests" to "anon";
grant UPDATE ("company_id", "completed_at", "created_at", "created_by", "due_at", "id", "jurisdiction", "lawful_basis", "notes", "request_type", "status", "subject_ref", "tenant_id") on table public."privacy_requests" to "anon";
grant INSERT ("company_id", "completed_at", "created_at", "created_by", "due_at", "id", "jurisdiction", "lawful_basis", "notes", "request_type", "status", "subject_ref", "tenant_id") on table public."privacy_requests" to "authenticated";
grant REFERENCES ("company_id", "completed_at", "created_at", "created_by", "due_at", "id", "jurisdiction", "lawful_basis", "notes", "request_type", "status", "subject_ref", "tenant_id") on table public."privacy_requests" to "authenticated";
grant SELECT ("company_id", "completed_at", "created_at", "created_by", "due_at", "id", "jurisdiction", "lawful_basis", "notes", "request_type", "status", "subject_ref", "tenant_id") on table public."privacy_requests" to "authenticated";
grant UPDATE ("company_id", "completed_at", "created_at", "created_by", "due_at", "id", "jurisdiction", "lawful_basis", "notes", "request_type", "status", "subject_ref", "tenant_id") on table public."privacy_requests" to "authenticated";
grant INSERT ("company_id", "completed_at", "created_at", "created_by", "due_at", "id", "jurisdiction", "lawful_basis", "notes", "request_type", "status", "subject_ref", "tenant_id") on table public."privacy_requests" to "service_role";
grant REFERENCES ("company_id", "completed_at", "created_at", "created_by", "due_at", "id", "jurisdiction", "lawful_basis", "notes", "request_type", "status", "subject_ref", "tenant_id") on table public."privacy_requests" to "service_role";
grant SELECT ("company_id", "completed_at", "created_at", "created_by", "due_at", "id", "jurisdiction", "lawful_basis", "notes", "request_type", "status", "subject_ref", "tenant_id") on table public."privacy_requests" to "service_role";
grant UPDATE ("company_id", "completed_at", "created_at", "created_by", "due_at", "id", "jurisdiction", "lawful_basis", "notes", "request_type", "status", "subject_ref", "tenant_id") on table public."privacy_requests" to "service_role";
grant INSERT ("active", "audience", "channel", "company_id", "content_type", "created_at", "created_by", "id", "name", "objective", "tenant_id", "tone", "topic") on table public."prompt_templates" to "anon";
grant REFERENCES ("active", "audience", "channel", "company_id", "content_type", "created_at", "created_by", "id", "name", "objective", "tenant_id", "tone", "topic") on table public."prompt_templates" to "anon";
grant SELECT ("active", "audience", "channel", "company_id", "content_type", "created_at", "created_by", "id", "name", "objective", "tenant_id", "tone", "topic") on table public."prompt_templates" to "anon";
grant UPDATE ("active", "audience", "channel", "company_id", "content_type", "created_at", "created_by", "id", "name", "objective", "tenant_id", "tone", "topic") on table public."prompt_templates" to "anon";
grant INSERT ("active", "audience", "channel", "company_id", "content_type", "created_at", "created_by", "id", "name", "objective", "tenant_id", "tone", "topic") on table public."prompt_templates" to "authenticated";
grant REFERENCES ("active", "audience", "channel", "company_id", "content_type", "created_at", "created_by", "id", "name", "objective", "tenant_id", "tone", "topic") on table public."prompt_templates" to "authenticated";
grant SELECT ("active", "audience", "channel", "company_id", "content_type", "created_at", "created_by", "id", "name", "objective", "tenant_id", "tone", "topic") on table public."prompt_templates" to "authenticated";
grant UPDATE ("active", "audience", "channel", "company_id", "content_type", "created_at", "created_by", "id", "name", "objective", "tenant_id", "tone", "topic") on table public."prompt_templates" to "authenticated";
grant INSERT ("active", "audience", "channel", "company_id", "content_type", "created_at", "created_by", "id", "name", "objective", "tenant_id", "tone", "topic") on table public."prompt_templates" to "service_role";
grant REFERENCES ("active", "audience", "channel", "company_id", "content_type", "created_at", "created_by", "id", "name", "objective", "tenant_id", "tone", "topic") on table public."prompt_templates" to "service_role";
grant SELECT ("active", "audience", "channel", "company_id", "content_type", "created_at", "created_by", "id", "name", "objective", "tenant_id", "tone", "topic") on table public."prompt_templates" to "service_role";
grant UPDATE ("active", "audience", "channel", "company_id", "content_type", "created_at", "created_by", "id", "name", "objective", "tenant_id", "tone", "topic") on table public."prompt_templates" to "service_role";
grant INSERT ("actor_id", "attempt", "company_id", "content_id", "created_at", "detail", "id", "integration_id", "platform", "scheduled_post_id", "social_response_id", "status") on table public."publish_logs" to "anon";
grant REFERENCES ("actor_id", "attempt", "company_id", "content_id", "created_at", "detail", "id", "integration_id", "platform", "scheduled_post_id", "social_response_id", "status") on table public."publish_logs" to "anon";
grant SELECT ("actor_id", "attempt", "company_id", "content_id", "created_at", "detail", "id", "integration_id", "platform", "scheduled_post_id", "social_response_id", "status") on table public."publish_logs" to "anon";
grant UPDATE ("actor_id", "attempt", "company_id", "content_id", "created_at", "detail", "id", "integration_id", "platform", "scheduled_post_id", "social_response_id", "status") on table public."publish_logs" to "anon";
grant INSERT ("actor_id", "attempt", "company_id", "content_id", "created_at", "detail", "id", "integration_id", "platform", "scheduled_post_id", "social_response_id", "status") on table public."publish_logs" to "authenticated";
grant REFERENCES ("actor_id", "attempt", "company_id", "content_id", "created_at", "detail", "id", "integration_id", "platform", "scheduled_post_id", "social_response_id", "status") on table public."publish_logs" to "authenticated";
grant SELECT ("actor_id", "attempt", "company_id", "content_id", "created_at", "detail", "id", "integration_id", "platform", "scheduled_post_id", "social_response_id", "status") on table public."publish_logs" to "authenticated";
grant UPDATE ("actor_id", "attempt", "company_id", "content_id", "created_at", "detail", "id", "integration_id", "platform", "scheduled_post_id", "social_response_id", "status") on table public."publish_logs" to "authenticated";
grant INSERT ("actor_id", "attempt", "company_id", "content_id", "created_at", "detail", "id", "integration_id", "platform", "scheduled_post_id", "social_response_id", "status") on table public."publish_logs" to "service_role";
grant REFERENCES ("actor_id", "attempt", "company_id", "content_id", "created_at", "detail", "id", "integration_id", "platform", "scheduled_post_id", "social_response_id", "status") on table public."publish_logs" to "service_role";
grant SELECT ("actor_id", "attempt", "company_id", "content_id", "created_at", "detail", "id", "integration_id", "platform", "scheduled_post_id", "social_response_id", "status") on table public."publish_logs" to "service_role";
grant UPDATE ("actor_id", "attempt", "company_id", "content_id", "created_at", "detail", "id", "integration_id", "platform", "scheduled_post_id", "social_response_id", "status") on table public."publish_logs" to "service_role";
grant INSERT ("automated_publishing_disabled", "freeze_all", "frozen_campaign_ids", "frozen_company_ids", "frozen_platforms", "social_replies_disabled", "tenant_id") on table public."publishing_controls" to "anon";
grant REFERENCES ("automated_publishing_disabled", "freeze_all", "frozen_campaign_ids", "frozen_company_ids", "frozen_platforms", "social_replies_disabled", "tenant_id") on table public."publishing_controls" to "anon";
grant SELECT ("automated_publishing_disabled", "freeze_all", "frozen_campaign_ids", "frozen_company_ids", "frozen_platforms", "social_replies_disabled", "tenant_id") on table public."publishing_controls" to "anon";
grant UPDATE ("automated_publishing_disabled", "freeze_all", "frozen_campaign_ids", "frozen_company_ids", "frozen_platforms", "social_replies_disabled", "tenant_id") on table public."publishing_controls" to "anon";
grant INSERT ("automated_publishing_disabled", "freeze_all", "frozen_campaign_ids", "frozen_company_ids", "frozen_platforms", "social_replies_disabled", "tenant_id") on table public."publishing_controls" to "authenticated";
grant REFERENCES ("automated_publishing_disabled", "freeze_all", "frozen_campaign_ids", "frozen_company_ids", "frozen_platforms", "social_replies_disabled", "tenant_id") on table public."publishing_controls" to "authenticated";
grant SELECT ("automated_publishing_disabled", "freeze_all", "frozen_campaign_ids", "frozen_company_ids", "frozen_platforms", "social_replies_disabled", "tenant_id") on table public."publishing_controls" to "authenticated";
grant UPDATE ("automated_publishing_disabled", "freeze_all", "frozen_campaign_ids", "frozen_company_ids", "frozen_platforms", "social_replies_disabled", "tenant_id") on table public."publishing_controls" to "authenticated";
grant INSERT ("automated_publishing_disabled", "freeze_all", "frozen_campaign_ids", "frozen_company_ids", "frozen_platforms", "social_replies_disabled", "tenant_id") on table public."publishing_controls" to "service_role";
grant REFERENCES ("automated_publishing_disabled", "freeze_all", "frozen_campaign_ids", "frozen_company_ids", "frozen_platforms", "social_replies_disabled", "tenant_id") on table public."publishing_controls" to "service_role";
grant SELECT ("automated_publishing_disabled", "freeze_all", "frozen_campaign_ids", "frozen_company_ids", "frozen_platforms", "social_replies_disabled", "tenant_id") on table public."publishing_controls" to "service_role";
grant UPDATE ("automated_publishing_disabled", "freeze_all", "frozen_campaign_ids", "frozen_company_ids", "frozen_platforms", "social_replies_disabled", "tenant_id") on table public."publishing_controls" to "service_role";
grant INSERT ("account_name", "company_id", "connected_at", "connected_by", "encrypted_token", "id", "platform", "status", "token_last_four", "updated_at") on table public."publishing_integrations" to "anon";
grant REFERENCES ("account_name", "company_id", "connected_at", "connected_by", "encrypted_token", "id", "platform", "status", "token_last_four", "updated_at") on table public."publishing_integrations" to "anon";
grant SELECT ("account_name", "company_id", "connected_at", "connected_by", "encrypted_token", "id", "platform", "status", "token_last_four", "updated_at") on table public."publishing_integrations" to "anon";
grant UPDATE ("account_name", "company_id", "connected_at", "connected_by", "encrypted_token", "id", "platform", "status", "token_last_four", "updated_at") on table public."publishing_integrations" to "anon";
grant INSERT ("account_name", "company_id", "connected_at", "connected_by", "encrypted_token", "id", "platform", "status", "token_last_four", "updated_at") on table public."publishing_integrations" to "authenticated";
grant REFERENCES ("account_name", "company_id", "connected_at", "connected_by", "encrypted_token", "id", "platform", "status", "token_last_four", "updated_at") on table public."publishing_integrations" to "authenticated";
grant SELECT ("account_name", "company_id", "connected_at", "connected_by", "encrypted_token", "id", "platform", "status", "token_last_four", "updated_at") on table public."publishing_integrations" to "authenticated";
grant UPDATE ("account_name", "company_id", "connected_at", "connected_by", "encrypted_token", "id", "platform", "status", "token_last_four", "updated_at") on table public."publishing_integrations" to "authenticated";
grant INSERT ("account_name", "company_id", "connected_at", "connected_by", "encrypted_token", "id", "platform", "status", "token_last_four", "updated_at") on table public."publishing_integrations" to "service_role";
grant REFERENCES ("account_name", "company_id", "connected_at", "connected_by", "encrypted_token", "id", "platform", "status", "token_last_four", "updated_at") on table public."publishing_integrations" to "service_role";
grant SELECT ("account_name", "company_id", "connected_at", "connected_by", "encrypted_token", "id", "platform", "status", "token_last_four", "updated_at") on table public."publishing_integrations" to "service_role";
grant UPDATE ("account_name", "company_id", "connected_at", "connected_by", "encrypted_token", "id", "platform", "status", "token_last_four", "updated_at") on table public."publishing_integrations" to "service_role";
grant INSERT ("added_by", "approved_version_id", "company_id", "created_at", "current_version_id", "id", "source_type", "status", "title", "updated_at") on table public."rag_knowledge_sources" to "anon";
grant REFERENCES ("added_by", "approved_version_id", "company_id", "created_at", "current_version_id", "id", "source_type", "status", "title", "updated_at") on table public."rag_knowledge_sources" to "anon";
grant SELECT ("added_by", "approved_version_id", "company_id", "created_at", "current_version_id", "id", "source_type", "status", "title", "updated_at") on table public."rag_knowledge_sources" to "anon";
grant UPDATE ("added_by", "approved_version_id", "company_id", "created_at", "current_version_id", "id", "source_type", "status", "title", "updated_at") on table public."rag_knowledge_sources" to "anon";
grant INSERT ("added_by", "approved_version_id", "company_id", "created_at", "current_version_id", "id", "source_type", "status", "title", "updated_at") on table public."rag_knowledge_sources" to "authenticated";
grant REFERENCES ("added_by", "approved_version_id", "company_id", "created_at", "current_version_id", "id", "source_type", "status", "title", "updated_at") on table public."rag_knowledge_sources" to "authenticated";
grant SELECT ("added_by", "approved_version_id", "company_id", "created_at", "current_version_id", "id", "source_type", "status", "title", "updated_at") on table public."rag_knowledge_sources" to "authenticated";
grant UPDATE ("added_by", "approved_version_id", "company_id", "created_at", "current_version_id", "id", "source_type", "status", "title", "updated_at") on table public."rag_knowledge_sources" to "authenticated";
grant INSERT ("added_by", "approved_version_id", "company_id", "created_at", "current_version_id", "id", "source_type", "status", "title", "updated_at") on table public."rag_knowledge_sources" to "service_role";
grant REFERENCES ("added_by", "approved_version_id", "company_id", "created_at", "current_version_id", "id", "source_type", "status", "title", "updated_at") on table public."rag_knowledge_sources" to "service_role";
grant SELECT ("added_by", "approved_version_id", "company_id", "created_at", "current_version_id", "id", "source_type", "status", "title", "updated_at") on table public."rag_knowledge_sources" to "service_role";
grant UPDATE ("added_by", "approved_version_id", "company_id", "created_at", "current_version_id", "id", "source_type", "status", "title", "updated_at") on table public."rag_knowledge_sources" to "service_role";
grant INSERT ("approved_at", "approved_by", "company_id", "content", "content_type", "created_at", "created_by", "file_name", "id", "source_id", "status", "superseded_by_id", "title", "version_number") on table public."rag_knowledge_versions" to "anon";
grant REFERENCES ("approved_at", "approved_by", "company_id", "content", "content_type", "created_at", "created_by", "file_name", "id", "source_id", "status", "superseded_by_id", "title", "version_number") on table public."rag_knowledge_versions" to "anon";
grant SELECT ("approved_at", "approved_by", "company_id", "content", "content_type", "created_at", "created_by", "file_name", "id", "source_id", "status", "superseded_by_id", "title", "version_number") on table public."rag_knowledge_versions" to "anon";
grant UPDATE ("approved_at", "approved_by", "company_id", "content", "content_type", "created_at", "created_by", "file_name", "id", "source_id", "status", "superseded_by_id", "title", "version_number") on table public."rag_knowledge_versions" to "anon";
grant INSERT ("approved_at", "approved_by", "company_id", "content", "content_type", "created_at", "created_by", "file_name", "id", "source_id", "status", "superseded_by_id", "title", "version_number") on table public."rag_knowledge_versions" to "authenticated";
grant REFERENCES ("approved_at", "approved_by", "company_id", "content", "content_type", "created_at", "created_by", "file_name", "id", "source_id", "status", "superseded_by_id", "title", "version_number") on table public."rag_knowledge_versions" to "authenticated";
grant SELECT ("approved_at", "approved_by", "company_id", "content", "content_type", "created_at", "created_by", "file_name", "id", "source_id", "status", "superseded_by_id", "title", "version_number") on table public."rag_knowledge_versions" to "authenticated";
grant UPDATE ("approved_at", "approved_by", "company_id", "content", "content_type", "created_at", "created_by", "file_name", "id", "source_id", "status", "superseded_by_id", "title", "version_number") on table public."rag_knowledge_versions" to "authenticated";
grant INSERT ("approved_at", "approved_by", "company_id", "content", "content_type", "created_at", "created_by", "file_name", "id", "source_id", "status", "superseded_by_id", "title", "version_number") on table public."rag_knowledge_versions" to "service_role";
grant REFERENCES ("approved_at", "approved_by", "company_id", "content", "content_type", "created_at", "created_by", "file_name", "id", "source_id", "status", "superseded_by_id", "title", "version_number") on table public."rag_knowledge_versions" to "service_role";
grant SELECT ("approved_at", "approved_by", "company_id", "content", "content_type", "created_at", "created_by", "file_name", "id", "source_id", "status", "superseded_by_id", "title", "version_number") on table public."rag_knowledge_versions" to "service_role";
grant UPDATE ("approved_at", "approved_by", "company_id", "content", "content_type", "created_at", "created_by", "file_name", "id", "source_id", "status", "superseded_by_id", "title", "version_number") on table public."rag_knowledge_versions" to "service_role";
grant INSERT ("company_id", "dismissed_at", "dismissed_by", "id", "reason", "recommendation_type", "title") on table public."recommendation_dismiss_history" to "anon";
grant REFERENCES ("company_id", "dismissed_at", "dismissed_by", "id", "reason", "recommendation_type", "title") on table public."recommendation_dismiss_history" to "anon";
grant SELECT ("company_id", "dismissed_at", "dismissed_by", "id", "reason", "recommendation_type", "title") on table public."recommendation_dismiss_history" to "anon";
grant UPDATE ("company_id", "dismissed_at", "dismissed_by", "id", "reason", "recommendation_type", "title") on table public."recommendation_dismiss_history" to "anon";
grant INSERT ("company_id", "dismissed_at", "dismissed_by", "id", "reason", "recommendation_type", "title") on table public."recommendation_dismiss_history" to "authenticated";
grant REFERENCES ("company_id", "dismissed_at", "dismissed_by", "id", "reason", "recommendation_type", "title") on table public."recommendation_dismiss_history" to "authenticated";
grant SELECT ("company_id", "dismissed_at", "dismissed_by", "id", "reason", "recommendation_type", "title") on table public."recommendation_dismiss_history" to "authenticated";
grant UPDATE ("company_id", "dismissed_at", "dismissed_by", "id", "reason", "recommendation_type", "title") on table public."recommendation_dismiss_history" to "authenticated";
grant INSERT ("company_id", "dismissed_at", "dismissed_by", "id", "reason", "recommendation_type", "title") on table public."recommendation_dismiss_history" to "service_role";
grant REFERENCES ("company_id", "dismissed_at", "dismissed_by", "id", "reason", "recommendation_type", "title") on table public."recommendation_dismiss_history" to "service_role";
grant SELECT ("company_id", "dismissed_at", "dismissed_by", "id", "reason", "recommendation_type", "title") on table public."recommendation_dismiss_history" to "service_role";
grant UPDATE ("company_id", "dismissed_at", "dismissed_by", "id", "reason", "recommendation_type", "title") on table public."recommendation_dismiss_history" to "service_role";
grant INSERT ("action", "company_id", "created_at", "created_by", "dismiss_reason", "evidence", "id", "rationale", "result_id", "result_type", "score", "snoozed_until", "status", "title", "type") on table public."recommendations" to "anon";
grant REFERENCES ("action", "company_id", "created_at", "created_by", "dismiss_reason", "evidence", "id", "rationale", "result_id", "result_type", "score", "snoozed_until", "status", "title", "type") on table public."recommendations" to "anon";
grant SELECT ("action", "company_id", "created_at", "created_by", "dismiss_reason", "evidence", "id", "rationale", "result_id", "result_type", "score", "snoozed_until", "status", "title", "type") on table public."recommendations" to "anon";
grant UPDATE ("action", "company_id", "created_at", "created_by", "dismiss_reason", "evidence", "id", "rationale", "result_id", "result_type", "score", "snoozed_until", "status", "title", "type") on table public."recommendations" to "anon";
grant INSERT ("action", "company_id", "created_at", "created_by", "dismiss_reason", "evidence", "id", "rationale", "result_id", "result_type", "score", "snoozed_until", "status", "title", "type") on table public."recommendations" to "authenticated";
grant REFERENCES ("action", "company_id", "created_at", "created_by", "dismiss_reason", "evidence", "id", "rationale", "result_id", "result_type", "score", "snoozed_until", "status", "title", "type") on table public."recommendations" to "authenticated";
grant SELECT ("action", "company_id", "created_at", "created_by", "dismiss_reason", "evidence", "id", "rationale", "result_id", "result_type", "score", "snoozed_until", "status", "title", "type") on table public."recommendations" to "authenticated";
grant UPDATE ("action", "company_id", "created_at", "created_by", "dismiss_reason", "evidence", "id", "rationale", "result_id", "result_type", "score", "snoozed_until", "status", "title", "type") on table public."recommendations" to "authenticated";
grant INSERT ("action", "company_id", "created_at", "created_by", "dismiss_reason", "evidence", "id", "rationale", "result_id", "result_type", "score", "snoozed_until", "status", "title", "type") on table public."recommendations" to "service_role";
grant REFERENCES ("action", "company_id", "created_at", "created_by", "dismiss_reason", "evidence", "id", "rationale", "result_id", "result_type", "score", "snoozed_until", "status", "title", "type") on table public."recommendations" to "service_role";
grant SELECT ("action", "company_id", "created_at", "created_by", "dismiss_reason", "evidence", "id", "rationale", "result_id", "result_type", "score", "snoozed_until", "status", "title", "type") on table public."recommendations" to "service_role";
grant UPDATE ("action", "company_id", "created_at", "created_by", "dismiss_reason", "evidence", "id", "rationale", "result_id", "result_type", "score", "snoozed_until", "status", "title", "type") on table public."recommendations" to "service_role";
grant INSERT ("company_id", "confirmation_mode", "created_at", "guest_email", "guest_name", "guest_phone", "id", "notes", "party_size", "scheduled_at", "service_period_id", "status", "updated_at") on table public."reservations" to "anon";
grant REFERENCES ("company_id", "confirmation_mode", "created_at", "guest_email", "guest_name", "guest_phone", "id", "notes", "party_size", "scheduled_at", "service_period_id", "status", "updated_at") on table public."reservations" to "anon";
grant SELECT ("company_id", "confirmation_mode", "created_at", "guest_email", "guest_name", "guest_phone", "id", "notes", "party_size", "scheduled_at", "service_period_id", "status", "updated_at") on table public."reservations" to "anon";
grant UPDATE ("company_id", "confirmation_mode", "created_at", "guest_email", "guest_name", "guest_phone", "id", "notes", "party_size", "scheduled_at", "service_period_id", "status", "updated_at") on table public."reservations" to "anon";
grant INSERT ("company_id", "confirmation_mode", "created_at", "guest_email", "guest_name", "guest_phone", "id", "notes", "party_size", "scheduled_at", "service_period_id", "status", "updated_at") on table public."reservations" to "authenticated";
grant REFERENCES ("company_id", "confirmation_mode", "created_at", "guest_email", "guest_name", "guest_phone", "id", "notes", "party_size", "scheduled_at", "service_period_id", "status", "updated_at") on table public."reservations" to "authenticated";
grant SELECT ("company_id", "confirmation_mode", "created_at", "guest_email", "guest_name", "guest_phone", "id", "notes", "party_size", "scheduled_at", "service_period_id", "status", "updated_at") on table public."reservations" to "authenticated";
grant UPDATE ("company_id", "confirmation_mode", "created_at", "guest_email", "guest_name", "guest_phone", "id", "notes", "party_size", "scheduled_at", "service_period_id", "status", "updated_at") on table public."reservations" to "authenticated";
grant INSERT ("company_id", "confirmation_mode", "created_at", "guest_email", "guest_name", "guest_phone", "id", "notes", "party_size", "scheduled_at", "service_period_id", "status", "updated_at") on table public."reservations" to "service_role";
grant REFERENCES ("company_id", "confirmation_mode", "created_at", "guest_email", "guest_name", "guest_phone", "id", "notes", "party_size", "scheduled_at", "service_period_id", "status", "updated_at") on table public."reservations" to "service_role";
grant SELECT ("company_id", "confirmation_mode", "created_at", "guest_email", "guest_name", "guest_phone", "id", "notes", "party_size", "scheduled_at", "service_period_id", "status", "updated_at") on table public."reservations" to "service_role";
grant UPDATE ("company_id", "confirmation_mode", "created_at", "guest_email", "guest_name", "guest_phone", "id", "notes", "party_size", "scheduled_at", "service_period_id", "status", "updated_at") on table public."reservations" to "service_role";
grant INSERT ("company_id", "created_at", "customer_email", "customer_name", "customer_phone", "delivery_address", "fulfillment", "id", "lines", "notes", "payment_status", "status", "stripe_checkout_session_id", "subtotal_cents", "total_cents", "updated_at") on table public."restaurant_orders" to "anon";
grant REFERENCES ("company_id", "created_at", "customer_email", "customer_name", "customer_phone", "delivery_address", "fulfillment", "id", "lines", "notes", "payment_status", "status", "stripe_checkout_session_id", "subtotal_cents", "total_cents", "updated_at") on table public."restaurant_orders" to "anon";
grant SELECT ("company_id", "created_at", "customer_email", "customer_name", "customer_phone", "delivery_address", "fulfillment", "id", "lines", "notes", "payment_status", "status", "stripe_checkout_session_id", "subtotal_cents", "total_cents", "updated_at") on table public."restaurant_orders" to "anon";
grant UPDATE ("company_id", "created_at", "customer_email", "customer_name", "customer_phone", "delivery_address", "fulfillment", "id", "lines", "notes", "payment_status", "status", "stripe_checkout_session_id", "subtotal_cents", "total_cents", "updated_at") on table public."restaurant_orders" to "anon";
grant INSERT ("company_id", "created_at", "customer_email", "customer_name", "customer_phone", "delivery_address", "fulfillment", "id", "lines", "notes", "payment_status", "status", "stripe_checkout_session_id", "subtotal_cents", "total_cents", "updated_at") on table public."restaurant_orders" to "authenticated";
grant REFERENCES ("company_id", "created_at", "customer_email", "customer_name", "customer_phone", "delivery_address", "fulfillment", "id", "lines", "notes", "payment_status", "status", "stripe_checkout_session_id", "subtotal_cents", "total_cents", "updated_at") on table public."restaurant_orders" to "authenticated";
grant SELECT ("company_id", "created_at", "customer_email", "customer_name", "customer_phone", "delivery_address", "fulfillment", "id", "lines", "notes", "payment_status", "status", "stripe_checkout_session_id", "subtotal_cents", "total_cents", "updated_at") on table public."restaurant_orders" to "authenticated";
grant UPDATE ("company_id", "created_at", "customer_email", "customer_name", "customer_phone", "delivery_address", "fulfillment", "id", "lines", "notes", "payment_status", "status", "stripe_checkout_session_id", "subtotal_cents", "total_cents", "updated_at") on table public."restaurant_orders" to "authenticated";
grant INSERT ("company_id", "created_at", "customer_email", "customer_name", "customer_phone", "delivery_address", "fulfillment", "id", "lines", "notes", "payment_status", "status", "stripe_checkout_session_id", "subtotal_cents", "total_cents", "updated_at") on table public."restaurant_orders" to "service_role";
grant REFERENCES ("company_id", "created_at", "customer_email", "customer_name", "customer_phone", "delivery_address", "fulfillment", "id", "lines", "notes", "payment_status", "status", "stripe_checkout_session_id", "subtotal_cents", "total_cents", "updated_at") on table public."restaurant_orders" to "service_role";
grant SELECT ("company_id", "created_at", "customer_email", "customer_name", "customer_phone", "delivery_address", "fulfillment", "id", "lines", "notes", "payment_status", "status", "stripe_checkout_session_id", "subtotal_cents", "total_cents", "updated_at") on table public."restaurant_orders" to "service_role";
grant UPDATE ("company_id", "created_at", "customer_email", "customer_name", "customer_phone", "delivery_address", "fulfillment", "id", "lines", "notes", "payment_status", "status", "stripe_checkout_session_id", "subtotal_cents", "total_cents", "updated_at") on table public."restaurant_orders" to "service_role";
grant INSERT ("activated_at", "channel", "click_count", "company_id", "created_at", "created_by", "id", "message_template", "name", "review_count", "sent_count", "status", "target_segment", "updated_at") on table public."review_request_campaigns" to "anon";
grant REFERENCES ("activated_at", "channel", "click_count", "company_id", "created_at", "created_by", "id", "message_template", "name", "review_count", "sent_count", "status", "target_segment", "updated_at") on table public."review_request_campaigns" to "anon";
grant SELECT ("activated_at", "channel", "click_count", "company_id", "created_at", "created_by", "id", "message_template", "name", "review_count", "sent_count", "status", "target_segment", "updated_at") on table public."review_request_campaigns" to "anon";
grant UPDATE ("activated_at", "channel", "click_count", "company_id", "created_at", "created_by", "id", "message_template", "name", "review_count", "sent_count", "status", "target_segment", "updated_at") on table public."review_request_campaigns" to "anon";
grant INSERT ("activated_at", "channel", "click_count", "company_id", "created_at", "created_by", "id", "message_template", "name", "review_count", "sent_count", "status", "target_segment", "updated_at") on table public."review_request_campaigns" to "authenticated";
grant REFERENCES ("activated_at", "channel", "click_count", "company_id", "created_at", "created_by", "id", "message_template", "name", "review_count", "sent_count", "status", "target_segment", "updated_at") on table public."review_request_campaigns" to "authenticated";
grant SELECT ("activated_at", "channel", "click_count", "company_id", "created_at", "created_by", "id", "message_template", "name", "review_count", "sent_count", "status", "target_segment", "updated_at") on table public."review_request_campaigns" to "authenticated";
grant UPDATE ("activated_at", "channel", "click_count", "company_id", "created_at", "created_by", "id", "message_template", "name", "review_count", "sent_count", "status", "target_segment", "updated_at") on table public."review_request_campaigns" to "authenticated";
grant INSERT ("activated_at", "channel", "click_count", "company_id", "created_at", "created_by", "id", "message_template", "name", "review_count", "sent_count", "status", "target_segment", "updated_at") on table public."review_request_campaigns" to "service_role";
grant REFERENCES ("activated_at", "channel", "click_count", "company_id", "created_at", "created_by", "id", "message_template", "name", "review_count", "sent_count", "status", "target_segment", "updated_at") on table public."review_request_campaigns" to "service_role";
grant SELECT ("activated_at", "channel", "click_count", "company_id", "created_at", "created_by", "id", "message_template", "name", "review_count", "sent_count", "status", "target_segment", "updated_at") on table public."review_request_campaigns" to "service_role";
grant UPDATE ("activated_at", "channel", "click_count", "company_id", "created_at", "created_by", "id", "message_template", "name", "review_count", "sent_count", "status", "target_segment", "updated_at") on table public."review_request_campaigns" to "service_role";
grant INSERT ("company_id", "content_id", "created_at", "created_by", "id", "platform", "scheduled_date", "scheduled_time", "status", "updated_at") on table public."scheduled_posts" to "anon";
grant REFERENCES ("company_id", "content_id", "created_at", "created_by", "id", "platform", "scheduled_date", "scheduled_time", "status", "updated_at") on table public."scheduled_posts" to "anon";
grant SELECT ("company_id", "content_id", "created_at", "created_by", "id", "platform", "scheduled_date", "scheduled_time", "status", "updated_at") on table public."scheduled_posts" to "anon";
grant UPDATE ("company_id", "content_id", "created_at", "created_by", "id", "platform", "scheduled_date", "scheduled_time", "status", "updated_at") on table public."scheduled_posts" to "anon";
grant INSERT ("company_id", "content_id", "created_at", "created_by", "id", "platform", "scheduled_date", "scheduled_time", "status", "updated_at") on table public."scheduled_posts" to "authenticated";
grant REFERENCES ("company_id", "content_id", "created_at", "created_by", "id", "platform", "scheduled_date", "scheduled_time", "status", "updated_at") on table public."scheduled_posts" to "authenticated";
grant SELECT ("company_id", "content_id", "created_at", "created_by", "id", "platform", "scheduled_date", "scheduled_time", "status", "updated_at") on table public."scheduled_posts" to "authenticated";
grant UPDATE ("company_id", "content_id", "created_at", "created_by", "id", "platform", "scheduled_date", "scheduled_time", "status", "updated_at") on table public."scheduled_posts" to "authenticated";
grant INSERT ("company_id", "content_id", "created_at", "created_by", "id", "platform", "scheduled_date", "scheduled_time", "status", "updated_at") on table public."scheduled_posts" to "service_role";
grant REFERENCES ("company_id", "content_id", "created_at", "created_by", "id", "platform", "scheduled_date", "scheduled_time", "status", "updated_at") on table public."scheduled_posts" to "service_role";
grant SELECT ("company_id", "content_id", "created_at", "created_by", "id", "platform", "scheduled_date", "scheduled_time", "status", "updated_at") on table public."scheduled_posts" to "service_role";
grant UPDATE ("company_id", "content_id", "created_at", "created_by", "id", "platform", "scheduled_date", "scheduled_time", "status", "updated_at") on table public."scheduled_posts" to "service_role";
grant INSERT ("ai_monthly_cap_usd", "crisis_mode", "crisis_note", "retention_days", "sandbox_mode", "tenant_id", "updated_at", "updated_by") on table public."security_settings" to "anon";
grant REFERENCES ("ai_monthly_cap_usd", "crisis_mode", "crisis_note", "retention_days", "sandbox_mode", "tenant_id", "updated_at", "updated_by") on table public."security_settings" to "anon";
grant SELECT ("ai_monthly_cap_usd", "crisis_mode", "crisis_note", "retention_days", "sandbox_mode", "tenant_id", "updated_at", "updated_by") on table public."security_settings" to "anon";
grant UPDATE ("ai_monthly_cap_usd", "crisis_mode", "crisis_note", "retention_days", "sandbox_mode", "tenant_id", "updated_at", "updated_by") on table public."security_settings" to "anon";
grant INSERT ("ai_monthly_cap_usd", "crisis_mode", "crisis_note", "retention_days", "sandbox_mode", "tenant_id", "updated_at", "updated_by") on table public."security_settings" to "authenticated";
grant REFERENCES ("ai_monthly_cap_usd", "crisis_mode", "crisis_note", "retention_days", "sandbox_mode", "tenant_id", "updated_at", "updated_by") on table public."security_settings" to "authenticated";
grant SELECT ("ai_monthly_cap_usd", "crisis_mode", "crisis_note", "retention_days", "sandbox_mode", "tenant_id", "updated_at", "updated_by") on table public."security_settings" to "authenticated";
grant UPDATE ("ai_monthly_cap_usd", "crisis_mode", "crisis_note", "retention_days", "sandbox_mode", "tenant_id", "updated_at", "updated_by") on table public."security_settings" to "authenticated";
grant INSERT ("ai_monthly_cap_usd", "crisis_mode", "crisis_note", "retention_days", "sandbox_mode", "tenant_id", "updated_at", "updated_by") on table public."security_settings" to "service_role";
grant REFERENCES ("ai_monthly_cap_usd", "crisis_mode", "crisis_note", "retention_days", "sandbox_mode", "tenant_id", "updated_at", "updated_by") on table public."security_settings" to "service_role";
grant SELECT ("ai_monthly_cap_usd", "crisis_mode", "crisis_note", "retention_days", "sandbox_mode", "tenant_id", "updated_at", "updated_by") on table public."security_settings" to "service_role";
grant UPDATE ("ai_monthly_cap_usd", "crisis_mode", "crisis_note", "retention_days", "sandbox_mode", "tenant_id", "updated_at", "updated_by") on table public."security_settings" to "service_role";
grant INSERT ("active", "company_id", "created_at", "description", "id", "locations", "margin_priority", "name", "price_approved", "price_range", "required_disclaimer", "restrictions", "seasonality", "target_customer", "updated_at") on table public."services" to "anon";
grant REFERENCES ("active", "company_id", "created_at", "description", "id", "locations", "margin_priority", "name", "price_approved", "price_range", "required_disclaimer", "restrictions", "seasonality", "target_customer", "updated_at") on table public."services" to "anon";
grant SELECT ("active", "company_id", "created_at", "description", "id", "locations", "margin_priority", "name", "price_approved", "price_range", "required_disclaimer", "restrictions", "seasonality", "target_customer", "updated_at") on table public."services" to "anon";
grant UPDATE ("active", "company_id", "created_at", "description", "id", "locations", "margin_priority", "name", "price_approved", "price_range", "required_disclaimer", "restrictions", "seasonality", "target_customer", "updated_at") on table public."services" to "anon";
grant INSERT ("active", "company_id", "created_at", "description", "id", "locations", "margin_priority", "name", "price_approved", "price_range", "required_disclaimer", "restrictions", "seasonality", "target_customer", "updated_at") on table public."services" to "authenticated";
grant REFERENCES ("active", "company_id", "created_at", "description", "id", "locations", "margin_priority", "name", "price_approved", "price_range", "required_disclaimer", "restrictions", "seasonality", "target_customer", "updated_at") on table public."services" to "authenticated";
grant SELECT ("active", "company_id", "created_at", "description", "id", "locations", "margin_priority", "name", "price_approved", "price_range", "required_disclaimer", "restrictions", "seasonality", "target_customer", "updated_at") on table public."services" to "authenticated";
grant UPDATE ("active", "company_id", "created_at", "description", "id", "locations", "margin_priority", "name", "price_approved", "price_range", "required_disclaimer", "restrictions", "seasonality", "target_customer", "updated_at") on table public."services" to "authenticated";
grant INSERT ("active", "company_id", "created_at", "description", "id", "locations", "margin_priority", "name", "price_approved", "price_range", "required_disclaimer", "restrictions", "seasonality", "target_customer", "updated_at") on table public."services" to "service_role";
grant REFERENCES ("active", "company_id", "created_at", "description", "id", "locations", "margin_priority", "name", "price_approved", "price_range", "required_disclaimer", "restrictions", "seasonality", "target_customer", "updated_at") on table public."services" to "service_role";
grant SELECT ("active", "company_id", "created_at", "description", "id", "locations", "margin_priority", "name", "price_approved", "price_range", "required_disclaimer", "restrictions", "seasonality", "target_customer", "updated_at") on table public."services" to "service_role";
grant UPDATE ("active", "company_id", "created_at", "description", "id", "locations", "margin_priority", "name", "price_approved", "price_range", "required_disclaimer", "restrictions", "seasonality", "target_customer", "updated_at") on table public."services" to "service_role";
grant INSERT ("body", "company_id", "created_at", "created_by", "id", "kind", "name", "scheduled_at", "segment_tag", "sent_at", "short_link", "stats", "status", "updated_at", "utm_campaign") on table public."sms_campaigns" to "anon";
grant REFERENCES ("body", "company_id", "created_at", "created_by", "id", "kind", "name", "scheduled_at", "segment_tag", "sent_at", "short_link", "stats", "status", "updated_at", "utm_campaign") on table public."sms_campaigns" to "anon";
grant SELECT ("body", "company_id", "created_at", "created_by", "id", "kind", "name", "scheduled_at", "segment_tag", "sent_at", "short_link", "stats", "status", "updated_at", "utm_campaign") on table public."sms_campaigns" to "anon";
grant UPDATE ("body", "company_id", "created_at", "created_by", "id", "kind", "name", "scheduled_at", "segment_tag", "sent_at", "short_link", "stats", "status", "updated_at", "utm_campaign") on table public."sms_campaigns" to "anon";
grant INSERT ("body", "company_id", "created_at", "created_by", "id", "kind", "name", "scheduled_at", "segment_tag", "sent_at", "short_link", "stats", "status", "updated_at", "utm_campaign") on table public."sms_campaigns" to "authenticated";
grant REFERENCES ("body", "company_id", "created_at", "created_by", "id", "kind", "name", "scheduled_at", "segment_tag", "sent_at", "short_link", "stats", "status", "updated_at", "utm_campaign") on table public."sms_campaigns" to "authenticated";
grant SELECT ("body", "company_id", "created_at", "created_by", "id", "kind", "name", "scheduled_at", "segment_tag", "sent_at", "short_link", "stats", "status", "updated_at", "utm_campaign") on table public."sms_campaigns" to "authenticated";
grant UPDATE ("body", "company_id", "created_at", "created_by", "id", "kind", "name", "scheduled_at", "segment_tag", "sent_at", "short_link", "stats", "status", "updated_at", "utm_campaign") on table public."sms_campaigns" to "authenticated";
grant INSERT ("body", "company_id", "created_at", "created_by", "id", "kind", "name", "scheduled_at", "segment_tag", "sent_at", "short_link", "stats", "status", "updated_at", "utm_campaign") on table public."sms_campaigns" to "service_role";
grant REFERENCES ("body", "company_id", "created_at", "created_by", "id", "kind", "name", "scheduled_at", "segment_tag", "sent_at", "short_link", "stats", "status", "updated_at", "utm_campaign") on table public."sms_campaigns" to "service_role";
grant SELECT ("body", "company_id", "created_at", "created_by", "id", "kind", "name", "scheduled_at", "segment_tag", "sent_at", "short_link", "stats", "status", "updated_at", "utm_campaign") on table public."sms_campaigns" to "service_role";
grant UPDATE ("body", "company_id", "created_at", "created_by", "id", "kind", "name", "scheduled_at", "segment_tag", "sent_at", "short_link", "stats", "status", "updated_at", "utm_campaign") on table public."sms_campaigns" to "service_role";
grant INSERT ("company_id", "country_code", "monthly_spend_cap_usd", "quiet_hours_end", "quiet_hours_start", "sender_id", "updated_at", "updated_by") on table public."sms_company_settings" to "anon";
grant REFERENCES ("company_id", "country_code", "monthly_spend_cap_usd", "quiet_hours_end", "quiet_hours_start", "sender_id", "updated_at", "updated_by") on table public."sms_company_settings" to "anon";
grant SELECT ("company_id", "country_code", "monthly_spend_cap_usd", "quiet_hours_end", "quiet_hours_start", "sender_id", "updated_at", "updated_by") on table public."sms_company_settings" to "anon";
grant UPDATE ("company_id", "country_code", "monthly_spend_cap_usd", "quiet_hours_end", "quiet_hours_start", "sender_id", "updated_at", "updated_by") on table public."sms_company_settings" to "anon";
grant INSERT ("company_id", "country_code", "monthly_spend_cap_usd", "quiet_hours_end", "quiet_hours_start", "sender_id", "updated_at", "updated_by") on table public."sms_company_settings" to "authenticated";
grant REFERENCES ("company_id", "country_code", "monthly_spend_cap_usd", "quiet_hours_end", "quiet_hours_start", "sender_id", "updated_at", "updated_by") on table public."sms_company_settings" to "authenticated";
grant SELECT ("company_id", "country_code", "monthly_spend_cap_usd", "quiet_hours_end", "quiet_hours_start", "sender_id", "updated_at", "updated_by") on table public."sms_company_settings" to "authenticated";
grant UPDATE ("company_id", "country_code", "monthly_spend_cap_usd", "quiet_hours_end", "quiet_hours_start", "sender_id", "updated_at", "updated_by") on table public."sms_company_settings" to "authenticated";
grant INSERT ("company_id", "country_code", "monthly_spend_cap_usd", "quiet_hours_end", "quiet_hours_start", "sender_id", "updated_at", "updated_by") on table public."sms_company_settings" to "service_role";
grant REFERENCES ("company_id", "country_code", "monthly_spend_cap_usd", "quiet_hours_end", "quiet_hours_start", "sender_id", "updated_at", "updated_by") on table public."sms_company_settings" to "service_role";
grant SELECT ("company_id", "country_code", "monthly_spend_cap_usd", "quiet_hours_end", "quiet_hours_start", "sender_id", "updated_at", "updated_by") on table public."sms_company_settings" to "service_role";
grant UPDATE ("company_id", "country_code", "monthly_spend_cap_usd", "quiet_hours_end", "quiet_hours_start", "sender_id", "updated_at", "updated_by") on table public."sms_company_settings" to "service_role";
grant INSERT ("company_id", "consent_status", "consented_at", "created_at", "id", "name", "opted_out_at", "phone_e164", "source", "tags", "updated_at") on table public."sms_subscribers" to "anon";
grant REFERENCES ("company_id", "consent_status", "consented_at", "created_at", "id", "name", "opted_out_at", "phone_e164", "source", "tags", "updated_at") on table public."sms_subscribers" to "anon";
grant SELECT ("company_id", "consent_status", "consented_at", "created_at", "id", "name", "opted_out_at", "phone_e164", "source", "tags", "updated_at") on table public."sms_subscribers" to "anon";
grant UPDATE ("company_id", "consent_status", "consented_at", "created_at", "id", "name", "opted_out_at", "phone_e164", "source", "tags", "updated_at") on table public."sms_subscribers" to "anon";
grant INSERT ("company_id", "consent_status", "consented_at", "created_at", "id", "name", "opted_out_at", "phone_e164", "source", "tags", "updated_at") on table public."sms_subscribers" to "authenticated";
grant REFERENCES ("company_id", "consent_status", "consented_at", "created_at", "id", "name", "opted_out_at", "phone_e164", "source", "tags", "updated_at") on table public."sms_subscribers" to "authenticated";
grant SELECT ("company_id", "consent_status", "consented_at", "created_at", "id", "name", "opted_out_at", "phone_e164", "source", "tags", "updated_at") on table public."sms_subscribers" to "authenticated";
grant UPDATE ("company_id", "consent_status", "consented_at", "created_at", "id", "name", "opted_out_at", "phone_e164", "source", "tags", "updated_at") on table public."sms_subscribers" to "authenticated";
grant INSERT ("company_id", "consent_status", "consented_at", "created_at", "id", "name", "opted_out_at", "phone_e164", "source", "tags", "updated_at") on table public."sms_subscribers" to "service_role";
grant REFERENCES ("company_id", "consent_status", "consented_at", "created_at", "id", "name", "opted_out_at", "phone_e164", "source", "tags", "updated_at") on table public."sms_subscribers" to "service_role";
grant SELECT ("company_id", "consent_status", "consented_at", "created_at", "id", "name", "opted_out_at", "phone_e164", "source", "tags", "updated_at") on table public."sms_subscribers" to "service_role";
grant UPDATE ("company_id", "consent_status", "consented_at", "created_at", "id", "name", "opted_out_at", "phone_e164", "source", "tags", "updated_at") on table public."sms_subscribers" to "service_role";
grant INSERT ("author_name", "company_id", "created_at", "external_id", "id", "linked_draft_id", "platform", "received_at", "status", "text") on table public."social_mentions" to "anon";
grant REFERENCES ("author_name", "company_id", "created_at", "external_id", "id", "linked_draft_id", "platform", "received_at", "status", "text") on table public."social_mentions" to "anon";
grant SELECT ("author_name", "company_id", "created_at", "external_id", "id", "linked_draft_id", "platform", "received_at", "status", "text") on table public."social_mentions" to "anon";
grant UPDATE ("author_name", "company_id", "created_at", "external_id", "id", "linked_draft_id", "platform", "received_at", "status", "text") on table public."social_mentions" to "anon";
grant INSERT ("author_name", "company_id", "created_at", "external_id", "id", "linked_draft_id", "platform", "received_at", "status", "text") on table public."social_mentions" to "authenticated";
grant REFERENCES ("author_name", "company_id", "created_at", "external_id", "id", "linked_draft_id", "platform", "received_at", "status", "text") on table public."social_mentions" to "authenticated";
grant SELECT ("author_name", "company_id", "created_at", "external_id", "id", "linked_draft_id", "platform", "received_at", "status", "text") on table public."social_mentions" to "authenticated";
grant UPDATE ("author_name", "company_id", "created_at", "external_id", "id", "linked_draft_id", "platform", "received_at", "status", "text") on table public."social_mentions" to "authenticated";
grant INSERT ("author_name", "company_id", "created_at", "external_id", "id", "linked_draft_id", "platform", "received_at", "status", "text") on table public."social_mentions" to "service_role";
grant REFERENCES ("author_name", "company_id", "created_at", "external_id", "id", "linked_draft_id", "platform", "received_at", "status", "text") on table public."social_mentions" to "service_role";
grant SELECT ("author_name", "company_id", "created_at", "external_id", "id", "linked_draft_id", "platform", "received_at", "status", "text") on table public."social_mentions" to "service_role";
grant UPDATE ("author_name", "company_id", "created_at", "external_id", "id", "linked_draft_id", "platform", "received_at", "status", "text") on table public."social_mentions" to "service_role";
grant INSERT ("approved_by", "company_id", "created_at", "created_by", "draft_response", "escalation_required", "id", "intent", "library_ref", "original_comment", "platform", "risk_level", "sentiment", "status") on table public."social_responses" to "anon";
grant REFERENCES ("approved_by", "company_id", "created_at", "created_by", "draft_response", "escalation_required", "id", "intent", "library_ref", "original_comment", "platform", "risk_level", "sentiment", "status") on table public."social_responses" to "anon";
grant SELECT ("approved_by", "company_id", "created_at", "created_by", "draft_response", "escalation_required", "id", "intent", "library_ref", "original_comment", "platform", "risk_level", "sentiment", "status") on table public."social_responses" to "anon";
grant UPDATE ("approved_by", "company_id", "created_at", "created_by", "draft_response", "escalation_required", "id", "intent", "library_ref", "original_comment", "platform", "risk_level", "sentiment", "status") on table public."social_responses" to "anon";
grant INSERT ("approved_by", "company_id", "created_at", "created_by", "draft_response", "escalation_required", "id", "intent", "library_ref", "original_comment", "platform", "risk_level", "sentiment", "status") on table public."social_responses" to "authenticated";
grant REFERENCES ("approved_by", "company_id", "created_at", "created_by", "draft_response", "escalation_required", "id", "intent", "library_ref", "original_comment", "platform", "risk_level", "sentiment", "status") on table public."social_responses" to "authenticated";
grant SELECT ("approved_by", "company_id", "created_at", "created_by", "draft_response", "escalation_required", "id", "intent", "library_ref", "original_comment", "platform", "risk_level", "sentiment", "status") on table public."social_responses" to "authenticated";
grant UPDATE ("approved_by", "company_id", "created_at", "created_by", "draft_response", "escalation_required", "id", "intent", "library_ref", "original_comment", "platform", "risk_level", "sentiment", "status") on table public."social_responses" to "authenticated";
grant INSERT ("approved_by", "company_id", "created_at", "created_by", "draft_response", "escalation_required", "id", "intent", "library_ref", "original_comment", "platform", "risk_level", "sentiment", "status") on table public."social_responses" to "service_role";
grant REFERENCES ("approved_by", "company_id", "created_at", "created_by", "draft_response", "escalation_required", "id", "intent", "library_ref", "original_comment", "platform", "risk_level", "sentiment", "status") on table public."social_responses" to "service_role";
grant SELECT ("approved_by", "company_id", "created_at", "created_by", "draft_response", "escalation_required", "id", "intent", "library_ref", "original_comment", "platform", "risk_level", "sentiment", "status") on table public."social_responses" to "service_role";
grant UPDATE ("approved_by", "company_id", "created_at", "created_by", "draft_response", "escalation_required", "id", "intent", "library_ref", "original_comment", "platform", "risk_level", "sentiment", "status") on table public."social_responses" to "service_role";
grant INSERT ("event_id", "event_type", "processed_at") on table public."stripe_webhook_events" to "service_role";
grant REFERENCES ("event_id", "event_type", "processed_at") on table public."stripe_webhook_events" to "service_role";
grant SELECT ("event_id", "event_type", "processed_at") on table public."stripe_webhook_events" to "service_role";
grant UPDATE ("event_id", "event_type", "processed_at") on table public."stripe_webhook_events" to "service_role";
grant INSERT ("company_id", "created_at", "created_by", "detail", "done_at", "id", "source_recommendation_id", "status", "title") on table public."tasks" to "anon";
grant REFERENCES ("company_id", "created_at", "created_by", "detail", "done_at", "id", "source_recommendation_id", "status", "title") on table public."tasks" to "anon";
grant SELECT ("company_id", "created_at", "created_by", "detail", "done_at", "id", "source_recommendation_id", "status", "title") on table public."tasks" to "anon";
grant UPDATE ("company_id", "created_at", "created_by", "detail", "done_at", "id", "source_recommendation_id", "status", "title") on table public."tasks" to "anon";
grant INSERT ("company_id", "created_at", "created_by", "detail", "done_at", "id", "source_recommendation_id", "status", "title") on table public."tasks" to "authenticated";
grant REFERENCES ("company_id", "created_at", "created_by", "detail", "done_at", "id", "source_recommendation_id", "status", "title") on table public."tasks" to "authenticated";
grant SELECT ("company_id", "created_at", "created_by", "detail", "done_at", "id", "source_recommendation_id", "status", "title") on table public."tasks" to "authenticated";
grant UPDATE ("company_id", "created_at", "created_by", "detail", "done_at", "id", "source_recommendation_id", "status", "title") on table public."tasks" to "authenticated";
grant INSERT ("company_id", "created_at", "created_by", "detail", "done_at", "id", "source_recommendation_id", "status", "title") on table public."tasks" to "service_role";
grant REFERENCES ("company_id", "created_at", "created_by", "detail", "done_at", "id", "source_recommendation_id", "status", "title") on table public."tasks" to "service_role";
grant SELECT ("company_id", "created_at", "created_by", "detail", "done_at", "id", "source_recommendation_id", "status", "title") on table public."tasks" to "service_role";
grant UPDATE ("company_id", "created_at", "created_by", "detail", "done_at", "id", "source_recommendation_id", "status", "title") on table public."tasks" to "service_role";
grant INSERT ("buyer", "company_id", "created_at", "created_by", "credits_invoice_id", "currency", "gst_amount", "gst_inclusive", "id", "invoice_number", "issued_at", "kind", "lines", "notes", "related_id", "related_type", "seller", "status", "stripe_checkout_session_id", "stripe_invoice_id", "stripe_payment_intent_id", "subtotal_ex_gst", "tenant_id", "total_inc_gst", "updated_at", "voided_at") on table public."tax_invoices" to "anon";
grant REFERENCES ("buyer", "company_id", "created_at", "created_by", "credits_invoice_id", "currency", "gst_amount", "gst_inclusive", "id", "invoice_number", "issued_at", "kind", "lines", "notes", "related_id", "related_type", "seller", "status", "stripe_checkout_session_id", "stripe_invoice_id", "stripe_payment_intent_id", "subtotal_ex_gst", "tenant_id", "total_inc_gst", "updated_at", "voided_at") on table public."tax_invoices" to "anon";
grant SELECT ("buyer", "company_id", "created_at", "created_by", "credits_invoice_id", "currency", "gst_amount", "gst_inclusive", "id", "invoice_number", "issued_at", "kind", "lines", "notes", "related_id", "related_type", "seller", "status", "stripe_checkout_session_id", "stripe_invoice_id", "stripe_payment_intent_id", "subtotal_ex_gst", "tenant_id", "total_inc_gst", "updated_at", "voided_at") on table public."tax_invoices" to "anon";
grant UPDATE ("buyer", "company_id", "created_at", "created_by", "credits_invoice_id", "currency", "gst_amount", "gst_inclusive", "id", "invoice_number", "issued_at", "kind", "lines", "notes", "related_id", "related_type", "seller", "status", "stripe_checkout_session_id", "stripe_invoice_id", "stripe_payment_intent_id", "subtotal_ex_gst", "tenant_id", "total_inc_gst", "updated_at", "voided_at") on table public."tax_invoices" to "anon";
grant INSERT ("buyer", "company_id", "created_at", "created_by", "credits_invoice_id", "currency", "gst_amount", "gst_inclusive", "id", "invoice_number", "issued_at", "kind", "lines", "notes", "related_id", "related_type", "seller", "status", "stripe_checkout_session_id", "stripe_invoice_id", "stripe_payment_intent_id", "subtotal_ex_gst", "tenant_id", "total_inc_gst", "updated_at", "voided_at") on table public."tax_invoices" to "authenticated";
grant REFERENCES ("buyer", "company_id", "created_at", "created_by", "credits_invoice_id", "currency", "gst_amount", "gst_inclusive", "id", "invoice_number", "issued_at", "kind", "lines", "notes", "related_id", "related_type", "seller", "status", "stripe_checkout_session_id", "stripe_invoice_id", "stripe_payment_intent_id", "subtotal_ex_gst", "tenant_id", "total_inc_gst", "updated_at", "voided_at") on table public."tax_invoices" to "authenticated";
grant SELECT ("buyer", "company_id", "created_at", "created_by", "credits_invoice_id", "currency", "gst_amount", "gst_inclusive", "id", "invoice_number", "issued_at", "kind", "lines", "notes", "related_id", "related_type", "seller", "status", "stripe_checkout_session_id", "stripe_invoice_id", "stripe_payment_intent_id", "subtotal_ex_gst", "tenant_id", "total_inc_gst", "updated_at", "voided_at") on table public."tax_invoices" to "authenticated";
grant UPDATE ("buyer", "company_id", "created_at", "created_by", "credits_invoice_id", "currency", "gst_amount", "gst_inclusive", "id", "invoice_number", "issued_at", "kind", "lines", "notes", "related_id", "related_type", "seller", "status", "stripe_checkout_session_id", "stripe_invoice_id", "stripe_payment_intent_id", "subtotal_ex_gst", "tenant_id", "total_inc_gst", "updated_at", "voided_at") on table public."tax_invoices" to "authenticated";
grant INSERT ("buyer", "company_id", "created_at", "created_by", "credits_invoice_id", "currency", "gst_amount", "gst_inclusive", "id", "invoice_number", "issued_at", "kind", "lines", "notes", "related_id", "related_type", "seller", "status", "stripe_checkout_session_id", "stripe_invoice_id", "stripe_payment_intent_id", "subtotal_ex_gst", "tenant_id", "total_inc_gst", "updated_at", "voided_at") on table public."tax_invoices" to "service_role";
grant REFERENCES ("buyer", "company_id", "created_at", "created_by", "credits_invoice_id", "currency", "gst_amount", "gst_inclusive", "id", "invoice_number", "issued_at", "kind", "lines", "notes", "related_id", "related_type", "seller", "status", "stripe_checkout_session_id", "stripe_invoice_id", "stripe_payment_intent_id", "subtotal_ex_gst", "tenant_id", "total_inc_gst", "updated_at", "voided_at") on table public."tax_invoices" to "service_role";
grant SELECT ("buyer", "company_id", "created_at", "created_by", "credits_invoice_id", "currency", "gst_amount", "gst_inclusive", "id", "invoice_number", "issued_at", "kind", "lines", "notes", "related_id", "related_type", "seller", "status", "stripe_checkout_session_id", "stripe_invoice_id", "stripe_payment_intent_id", "subtotal_ex_gst", "tenant_id", "total_inc_gst", "updated_at", "voided_at") on table public."tax_invoices" to "service_role";
grant UPDATE ("buyer", "company_id", "created_at", "created_by", "credits_invoice_id", "currency", "gst_amount", "gst_inclusive", "id", "invoice_number", "issued_at", "kind", "lines", "notes", "related_id", "related_type", "seller", "status", "stripe_checkout_session_id", "stripe_invoice_id", "stripe_payment_intent_id", "subtotal_ex_gst", "tenant_id", "total_inc_gst", "updated_at", "voided_at") on table public."tax_invoices" to "service_role";
grant INSERT ("capabilities", "created_at", "portal_only", "role", "role_title", "tenant_id", "user_id") on table public."tenant_members" to "anon";
grant REFERENCES ("capabilities", "created_at", "portal_only", "role", "role_title", "tenant_id", "user_id") on table public."tenant_members" to "anon";
grant SELECT ("capabilities", "created_at", "portal_only", "role", "role_title", "tenant_id", "user_id") on table public."tenant_members" to "anon";
grant UPDATE ("capabilities", "created_at", "portal_only", "role", "role_title", "tenant_id", "user_id") on table public."tenant_members" to "anon";
grant INSERT ("capabilities", "created_at", "portal_only", "role", "role_title", "tenant_id", "user_id") on table public."tenant_members" to "authenticated";
grant REFERENCES ("capabilities", "created_at", "portal_only", "role", "role_title", "tenant_id", "user_id") on table public."tenant_members" to "authenticated";
grant SELECT ("capabilities", "created_at", "portal_only", "role", "role_title", "tenant_id", "user_id") on table public."tenant_members" to "authenticated";
grant UPDATE ("capabilities", "created_at", "portal_only", "role", "role_title", "tenant_id", "user_id") on table public."tenant_members" to "authenticated";
grant INSERT ("capabilities", "created_at", "portal_only", "role", "role_title", "tenant_id", "user_id") on table public."tenant_members" to "service_role";
grant REFERENCES ("capabilities", "created_at", "portal_only", "role", "role_title", "tenant_id", "user_id") on table public."tenant_members" to "service_role";
grant SELECT ("capabilities", "created_at", "portal_only", "role", "role_title", "tenant_id", "user_id") on table public."tenant_members" to "service_role";
grant UPDATE ("capabilities", "created_at", "portal_only", "role", "role_title", "tenant_id", "user_id") on table public."tenant_members" to "service_role";
grant INSERT ("branding", "created_at", "id", "kind", "marketing_package_catalog", "name", "onboarding", "onboarding_completed_at", "plan", "promo_catalog", "promo_industries", "status", "stripe_customer_id", "stripe_subscription_id", "timezone", "updated_at") on table public."tenants" to "anon";
grant REFERENCES ("branding", "created_at", "id", "kind", "marketing_package_catalog", "name", "onboarding", "onboarding_completed_at", "plan", "promo_catalog", "promo_industries", "status", "stripe_customer_id", "stripe_subscription_id", "timezone", "updated_at") on table public."tenants" to "anon";
grant SELECT ("branding", "created_at", "id", "kind", "marketing_package_catalog", "name", "onboarding", "onboarding_completed_at", "plan", "promo_catalog", "promo_industries", "status", "stripe_customer_id", "stripe_subscription_id", "timezone", "updated_at") on table public."tenants" to "anon";
grant UPDATE ("branding", "created_at", "id", "kind", "marketing_package_catalog", "name", "onboarding", "onboarding_completed_at", "plan", "promo_catalog", "promo_industries", "status", "stripe_customer_id", "stripe_subscription_id", "timezone", "updated_at") on table public."tenants" to "anon";
grant INSERT ("branding", "created_at", "id", "kind", "marketing_package_catalog", "name", "onboarding", "onboarding_completed_at", "plan", "promo_catalog", "promo_industries", "status", "stripe_customer_id", "stripe_subscription_id", "timezone", "updated_at") on table public."tenants" to "authenticated";
grant REFERENCES ("branding", "created_at", "id", "kind", "marketing_package_catalog", "name", "onboarding", "onboarding_completed_at", "plan", "promo_catalog", "promo_industries", "status", "stripe_customer_id", "stripe_subscription_id", "timezone", "updated_at") on table public."tenants" to "authenticated";
grant SELECT ("branding", "created_at", "id", "kind", "marketing_package_catalog", "name", "onboarding", "onboarding_completed_at", "plan", "promo_catalog", "promo_industries", "status", "stripe_customer_id", "stripe_subscription_id", "timezone", "updated_at") on table public."tenants" to "authenticated";
grant UPDATE ("branding", "created_at", "id", "kind", "marketing_package_catalog", "name", "onboarding", "onboarding_completed_at", "plan", "promo_catalog", "promo_industries", "status", "stripe_customer_id", "stripe_subscription_id", "timezone", "updated_at") on table public."tenants" to "authenticated";
grant INSERT ("branding", "created_at", "id", "kind", "marketing_package_catalog", "name", "onboarding", "onboarding_completed_at", "plan", "promo_catalog", "promo_industries", "status", "stripe_customer_id", "stripe_subscription_id", "timezone", "updated_at") on table public."tenants" to "service_role";
grant REFERENCES ("branding", "created_at", "id", "kind", "marketing_package_catalog", "name", "onboarding", "onboarding_completed_at", "plan", "promo_catalog", "promo_industries", "status", "stripe_customer_id", "stripe_subscription_id", "timezone", "updated_at") on table public."tenants" to "service_role";
grant SELECT ("branding", "created_at", "id", "kind", "marketing_package_catalog", "name", "onboarding", "onboarding_completed_at", "plan", "promo_catalog", "promo_industries", "status", "stripe_customer_id", "stripe_subscription_id", "timezone", "updated_at") on table public."tenants" to "service_role";
grant UPDATE ("branding", "created_at", "id", "kind", "marketing_package_catalog", "name", "onboarding", "onboarding_completed_at", "plan", "promo_catalog", "promo_industries", "status", "stripe_customer_id", "stripe_subscription_id", "timezone", "updated_at") on table public."tenants" to "service_role";
grant INSERT ("accepted_at", "id", "ip", "kind", "tenant_id", "user_id", "version") on table public."terms_acceptances" to "anon";
grant REFERENCES ("accepted_at", "id", "ip", "kind", "tenant_id", "user_id", "version") on table public."terms_acceptances" to "anon";
grant SELECT ("accepted_at", "id", "ip", "kind", "tenant_id", "user_id", "version") on table public."terms_acceptances" to "anon";
grant UPDATE ("accepted_at", "id", "ip", "kind", "tenant_id", "user_id", "version") on table public."terms_acceptances" to "anon";
grant INSERT ("accepted_at", "id", "ip", "kind", "tenant_id", "user_id", "version") on table public."terms_acceptances" to "authenticated";
grant REFERENCES ("accepted_at", "id", "ip", "kind", "tenant_id", "user_id", "version") on table public."terms_acceptances" to "authenticated";
grant SELECT ("accepted_at", "id", "ip", "kind", "tenant_id", "user_id", "version") on table public."terms_acceptances" to "authenticated";
grant UPDATE ("accepted_at", "id", "ip", "kind", "tenant_id", "user_id", "version") on table public."terms_acceptances" to "authenticated";
grant INSERT ("accepted_at", "id", "ip", "kind", "tenant_id", "user_id", "version") on table public."terms_acceptances" to "service_role";
grant REFERENCES ("accepted_at", "id", "ip", "kind", "tenant_id", "user_id", "version") on table public."terms_acceptances" to "service_role";
grant SELECT ("accepted_at", "id", "ip", "kind", "tenant_id", "user_id", "version") on table public."terms_acceptances" to "service_role";
grant UPDATE ("accepted_at", "id", "ip", "kind", "tenant_id", "user_id", "version") on table public."terms_acceptances" to "service_role";
grant INSERT ("active", "body", "effective_date", "id", "kind", "notified_at", "notified_count", "published_at", "published_by", "summary", "title", "version") on table public."terms_versions" to "anon";
grant REFERENCES ("active", "body", "effective_date", "id", "kind", "notified_at", "notified_count", "published_at", "published_by", "summary", "title", "version") on table public."terms_versions" to "anon";
grant SELECT ("active", "body", "effective_date", "id", "kind", "notified_at", "notified_count", "published_at", "published_by", "summary", "title", "version") on table public."terms_versions" to "anon";
grant UPDATE ("active", "body", "effective_date", "id", "kind", "notified_at", "notified_count", "published_at", "published_by", "summary", "title", "version") on table public."terms_versions" to "anon";
grant INSERT ("active", "body", "effective_date", "id", "kind", "notified_at", "notified_count", "published_at", "published_by", "summary", "title", "version") on table public."terms_versions" to "authenticated";
grant REFERENCES ("active", "body", "effective_date", "id", "kind", "notified_at", "notified_count", "published_at", "published_by", "summary", "title", "version") on table public."terms_versions" to "authenticated";
grant SELECT ("active", "body", "effective_date", "id", "kind", "notified_at", "notified_count", "published_at", "published_by", "summary", "title", "version") on table public."terms_versions" to "authenticated";
grant UPDATE ("active", "body", "effective_date", "id", "kind", "notified_at", "notified_count", "published_at", "published_by", "summary", "title", "version") on table public."terms_versions" to "authenticated";
grant INSERT ("active", "body", "effective_date", "id", "kind", "notified_at", "notified_count", "published_at", "published_by", "summary", "title", "version") on table public."terms_versions" to "service_role";
grant REFERENCES ("active", "body", "effective_date", "id", "kind", "notified_at", "notified_count", "published_at", "published_by", "summary", "title", "version") on table public."terms_versions" to "service_role";
grant SELECT ("active", "body", "effective_date", "id", "kind", "notified_at", "notified_count", "published_at", "published_by", "summary", "title", "version") on table public."terms_versions" to "service_role";
grant UPDATE ("active", "body", "effective_date", "id", "kind", "notified_at", "notified_count", "published_at", "published_by", "summary", "title", "version") on table public."terms_versions" to "service_role";
grant INSERT ("campaign", "campaign_id", "company_id", "content_id", "content_type", "created_at", "created_by", "destination_url", "id", "medium", "request_id", "source") on table public."utm_links" to "anon";
grant REFERENCES ("campaign", "campaign_id", "company_id", "content_id", "content_type", "created_at", "created_by", "destination_url", "id", "medium", "request_id", "source") on table public."utm_links" to "anon";
grant SELECT ("campaign", "campaign_id", "company_id", "content_id", "content_type", "created_at", "created_by", "destination_url", "id", "medium", "request_id", "source") on table public."utm_links" to "anon";
grant UPDATE ("campaign", "campaign_id", "company_id", "content_id", "content_type", "created_at", "created_by", "destination_url", "id", "medium", "request_id", "source") on table public."utm_links" to "anon";
grant INSERT ("campaign", "campaign_id", "company_id", "content_id", "content_type", "created_at", "created_by", "destination_url", "id", "medium", "request_id", "source") on table public."utm_links" to "authenticated";
grant REFERENCES ("campaign", "campaign_id", "company_id", "content_id", "content_type", "created_at", "created_by", "destination_url", "id", "medium", "request_id", "source") on table public."utm_links" to "authenticated";
grant SELECT ("campaign", "campaign_id", "company_id", "content_id", "content_type", "created_at", "created_by", "destination_url", "id", "medium", "request_id", "source") on table public."utm_links" to "authenticated";
grant UPDATE ("campaign", "campaign_id", "company_id", "content_id", "content_type", "created_at", "created_by", "destination_url", "id", "medium", "request_id", "source") on table public."utm_links" to "authenticated";
grant INSERT ("campaign", "campaign_id", "company_id", "content_id", "content_type", "created_at", "created_by", "destination_url", "id", "medium", "request_id", "source") on table public."utm_links" to "service_role";
grant REFERENCES ("campaign", "campaign_id", "company_id", "content_id", "content_type", "created_at", "created_by", "destination_url", "id", "medium", "request_id", "source") on table public."utm_links" to "service_role";
grant SELECT ("campaign", "campaign_id", "company_id", "content_id", "content_type", "created_at", "created_by", "destination_url", "id", "medium", "request_id", "source") on table public."utm_links" to "service_role";
grant UPDATE ("campaign", "campaign_id", "company_id", "content_id", "content_type", "created_at", "created_by", "destination_url", "id", "medium", "request_id", "source") on table public."utm_links" to "service_role";
grant INSERT ("channel", "company_id", "contact_id", "created_at", "detail", "id", "status", "step_id", "workflow_id") on table public."workflow_dispatch_logs" to "anon";
grant REFERENCES ("channel", "company_id", "contact_id", "created_at", "detail", "id", "status", "step_id", "workflow_id") on table public."workflow_dispatch_logs" to "anon";
grant SELECT ("channel", "company_id", "contact_id", "created_at", "detail", "id", "status", "step_id", "workflow_id") on table public."workflow_dispatch_logs" to "anon";
grant UPDATE ("channel", "company_id", "contact_id", "created_at", "detail", "id", "status", "step_id", "workflow_id") on table public."workflow_dispatch_logs" to "anon";
grant INSERT ("channel", "company_id", "contact_id", "created_at", "detail", "id", "status", "step_id", "workflow_id") on table public."workflow_dispatch_logs" to "authenticated";
grant REFERENCES ("channel", "company_id", "contact_id", "created_at", "detail", "id", "status", "step_id", "workflow_id") on table public."workflow_dispatch_logs" to "authenticated";
grant SELECT ("channel", "company_id", "contact_id", "created_at", "detail", "id", "status", "step_id", "workflow_id") on table public."workflow_dispatch_logs" to "authenticated";
grant UPDATE ("channel", "company_id", "contact_id", "created_at", "detail", "id", "status", "step_id", "workflow_id") on table public."workflow_dispatch_logs" to "authenticated";
grant INSERT ("channel", "company_id", "contact_id", "created_at", "detail", "id", "status", "step_id", "workflow_id") on table public."workflow_dispatch_logs" to "service_role";
grant REFERENCES ("channel", "company_id", "contact_id", "created_at", "detail", "id", "status", "step_id", "workflow_id") on table public."workflow_dispatch_logs" to "service_role";
grant SELECT ("channel", "company_id", "contact_id", "created_at", "detail", "id", "status", "step_id", "workflow_id") on table public."workflow_dispatch_logs" to "service_role";
grant UPDATE ("channel", "company_id", "contact_id", "created_at", "detail", "id", "status", "step_id", "workflow_id") on table public."workflow_dispatch_logs" to "service_role";

comment on table public."company_credit_ledger" is 'Append-only credit ledger; amount_usd signed (+ credit / - debit)';
comment on table public."company_credit_wallets" is 'Prepaid company credit wallet (C2); $50 floor enforced in app; auto top-up is ledger-simulated until Stripe';
comment on table public."managed_content_job_events" is 'Durable HMAC callback replay and deduplication ledger';
comment on table public."managed_delivery_runs" is 'Managed-service delivery pipeline; drafts/suggestions only ΓÇö never auto-publishes';
comment on table public."privacy_requests" is 'GDPR / Privacy Act data-subject requests; restriction status blocks marketing use';
comment on table public."tax_invoices" is 'Local AU tax invoices (GST); Stripe session/PI/invoice ids are payment proof only';
comment on column public."assets"."private_provenance" is 'Service-only generation provenance; never expose in client-facing copy';
comment on column public."campaigns"."campaign_type" is 'brand_awareness | product_launch | lead_generation | ΓÇª (AI campaign layer)';
comment on column public."campaigns"."layer_meta" is 'AI assumptions, risks, missing info, performance targets (jsonb)';
comment on column public."company_credit_wallets"."stripe_customer_id" is 'Stripe customer for company credit Checkout / portal / off-session top-up';
comment on column public."company_credit_wallets"."stripe_payment_method_id" is 'Saved payment method from Checkout setup_future_usage=off_session';
comment on column public."managed_approval_requests"."token_hash" is 'SHA-256 digest only; plaintext magic-link tokens are never persisted';
comment on column public."managed_content_jobs"."private_provenance" is 'Service-only import/correlation provenance; never serialize to client surfaces';
comment on column public."managed_delivery_runs"."strategy_eligible_at" is 'Do not start generating until now >= this (onboard + 6h; package_change may be immediate). SLA ceiling remains strategy_due_at.';
comment on column public."managed_delivery_runs"."implementation_plan_emailed_at" is 'Idempotency stamp for client implementation-plan email after strategy+calendar.';
comment on column public."managed_delivery_runs"."enqueue_reason" is 'signup | onboarding | service_level | package_change | manual';
comment on column public."tenant_members"."portal_only" is 'Client-portal login (field sales). When true, app treats member as portal user; else infers from single company_access.';
comment on column public."tenant_members"."capabilities" is 'Optional permission strings (see src/lib/rbac-matrix.ts). Empty = legacy isAdmin/isOwner fallback.';


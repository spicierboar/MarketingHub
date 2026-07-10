// Marketing automation workflow engine (W4 M36).

import {
  createMarketingWorkflow,
  createWorkflowDispatchLog,
  getCrmContact,
  getMarketingWorkflowSettings,
  listEmailSubscribers,
  listSmsSubscribers,
  listWorkflowDispatchLogs,
  updateCrmContact,
} from "@/lib/db";
import {
  dispatchWorkflowEmail,
  dispatchWorkflowSms,
  workflowConfigured,
  workflowLive,
} from "@/lib/marketing-automation-connectors";
import { resolveQueueClockAt } from "@/lib/tenant-timezone";
import type {
  CrmContact,
  MarketingWorkflow,
  MarketingWorkflowSettings,
  WorkflowActionKind,
  WorkflowDispatchLog,
  WorkflowDispatchStatus,
  WorkflowRunResult,
  WorkflowRunStats,
  WorkflowStep,
  WorkflowTemplateKind,
  WorkflowTriggerKind,
} from "@/lib/types";

export { workflowConfigured, workflowLive } from "@/lib/marketing-automation-connectors";

export interface WorkflowTriggerDef {
  kind: WorkflowTriggerKind;
  label: string;
  description: string;
}

export const WORKFLOW_TRIGGERS: WorkflowTriggerDef[] = [
  { kind: "customer_created", label: "Customer created", description: "Fires when a new CRM contact is added." },
  { kind: "booking_made", label: "Booking made", description: "Guest completes a booking or reservation." },
  { kind: "review_received", label: "Review received", description: "A new public review is captured." },
  { kind: "birthday", label: "Birthday", description: "Contact birthday is today." },
  { kind: "cart_abandoned", label: "Cart abandoned", description: "Checkout started but not completed." },
  { kind: "tag_added", label: "Tag added", description: "A segment tag is applied to the contact." },
  { kind: "manual", label: "Manual run", description: "Triggered by an admin from the workflows UI." },
];

export const WORKFLOW_TEMPLATE_KINDS: WorkflowTemplateKind[] = [
  "welcome",
  "win_back",
  "review_request",
  "post_stay",
  "birthday_offer",
];

const DEFAULT_SETTINGS: Omit<MarketingWorkflowSettings, "companyId"> = {
  quietHoursStart: "20:00",
  quietHoursEnd: "08:00",
  frequencyCapPerWeek: 3,
  updatedAt: new Date().toISOString(),
};

function stepId(prefix: string, order: number): string {
  return `${prefix}_${order}`;
}

function renderTokens(text: string, contact: CrmContact, companyName: string): string {
  const name = [contact.firstName, contact.lastName].filter(Boolean).join(" ").trim() || contact.firstName;
  return text
    .replace(/\{\{name\}\}/g, name)
    .replace(/\{\{firstName\}\}/g, contact.firstName)
    .replace(/\{\{company\}\}/g, companyName)
    .replace(/\{\{email\}\}/g, contact.email ?? "");
}

function emptyStats(): WorkflowRunStats {
  return { triggered: 0, dispatched: 0, blockedConsent: 0, blockedQuietHours: 0, blockedFrequency: 0, simulated: 0 };
}

export function defaultMarketingWorkflowSettings(companyId: string): MarketingWorkflowSettings {
  return { companyId, ...DEFAULT_SETTINGS };
}

function hhmToMinutes(hhm: string): number {
  const [h, m] = hhm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

export function isWithinWorkflowQuietHours(localHhm: string, start: string, end: string): boolean {
  const nowMin = hhmToMinutes(localHhm);
  const startMin = hhmToMinutes(start);
  const endMin = hhmToMinutes(end);
  if (startMin === endMin) return false;
  if (startMin > endMin) return nowMin >= startMin || nowMin < endMin;
  return nowMin >= startMin && nowMin < endMin;
}

export function quietHoursActive(settings: MarketingWorkflowSettings, atIso: string, timezone?: string): boolean {
  return isWithinWorkflowQuietHours(
    resolveQueueClockAt(atIso, { timezone }).hhmm,
    settings.quietHoursStart,
    settings.quietHoursEnd,
  );
}

export async function resolveWorkflowSettings(companyId: string): Promise<MarketingWorkflowSettings> {
  return (await getMarketingWorkflowSettings(companyId)) ?? defaultMarketingWorkflowSettings(companyId);
}

export function contactHasMarketingConsent(contact: CrmContact): boolean {
  return contact.consentStatus === "subscribed";
}

export async function contactChannelEligible(contact: CrmContact, channel: "email" | "sms"): Promise<boolean> {
  if (!contactHasMarketingConsent(contact)) return false;
  if (channel === "email") {
    if (!contact.email) return false;
    const sub = (await listEmailSubscribers(contact.companyId)).find(
      (s) => s.email.toLowerCase() === contact.email!.toLowerCase(),
    );
    return !sub || (sub.marketingConsent && !sub.unsubscribedAt);
  }
  if (!contact.phone) return false;
  const sub = (await listSmsSubscribers(contact.companyId)).find((s) => s.phoneE164 === contact.phone);
  return !sub || sub.consentStatus === "opted_in";
}

export async function frequencyCapExceeded(
  tenantId: string,
  companyId: string,
  contactId: string,
  settings: MarketingWorkflowSettings,
  atIso: string,
): Promise<boolean> {
  const since = new Date(atIso);
  since.setDate(since.getDate() - 7);
  const recent = (await listWorkflowDispatchLogs(tenantId, companyId)).filter(
    (l) =>
      l.contactId === contactId &&
      l.createdAt >= since.toISOString() &&
      (l.status === "sent" || l.status === "simulated"),
  );
  return recent.length >= settings.frequencyCapPerWeek;
}

export function evaluateStepCondition(contact: CrmContact, step: WorkflowStep): boolean {
  const cond = step.condition;
  if (!cond) return true;
  const raw =
    cond.field === "tag"
      ? contact.tags.join(",")
      : cond.field === "consent"
        ? contact.consentStatus
        : cond.field === "email"
          ? (contact.email ?? "")
          : cond.field === "source"
            ? contact.source
            : "";
  switch (cond.operator) {
    case "eq":
      return raw === cond.value;
    case "neq":
      return raw !== cond.value;
    case "contains":
      return raw.toLowerCase().includes(cond.value.toLowerCase());
    case "gt":
      return Number(raw) > Number(cond.value);
    case "lt":
      return Number(raw) < Number(cond.value);
    default:
      return true;
  }
}

function templateSteps(kind: WorkflowTemplateKind): WorkflowStep[] {
  const mk = (steps: Omit<WorkflowStep, "id">[]): WorkflowStep[] =>
    steps.map((s, i) => ({ ...s, id: stepId(kind, i + 1) }));
  if (kind === "welcome") {
    return mk([
      { kind: "action", action: { kind: "send_email", subject: "Welcome to {{company}}", body: "<p>Hi {{firstName}}</p>" } },
      { kind: "delay", delay: { amount: 2, unit: "days" } },
      { kind: "action", action: { kind: "send_email", subject: "Getting started", body: "<p>Tips from {{company}}</p>" } },
    ]);
  }
  if (kind === "win_back") {
    return mk([
      { kind: "delay", delay: { amount: 30, unit: "days" } },
      { kind: "action", action: { kind: "send_email", subject: "We miss you", body: "<p>Hi {{name}}</p>" } },
      { kind: "action", action: { kind: "send_sms", body: "Win-back offer. Reply STOP to opt out." } },
    ]);
  }
  if (kind === "review_request") {
    return mk([
      { kind: "delay", delay: { amount: 1, unit: "days" } },
      { kind: "action", action: { kind: "send_email", subject: "How was your stay?", body: "<p>Review {{company}}</p>" } },
    ]);
  }
  if (kind === "post_stay") {
    return mk([
      { kind: "delay", delay: { amount: 4, unit: "hours" } },
      { kind: "action", action: { kind: "send_email", subject: "Thanks for staying", body: "<p>Hi {{firstName}}</p>" } },
      { kind: "action", action: { kind: "send_sms", body: "Thanks from {{company}}. Reply STOP to opt out." } },
    ]);
  }
  return mk([
    { kind: "action", action: { kind: "send_email", subject: "Happy birthday", body: "<p>Happy birthday {{firstName}}</p>" } },
    { kind: "action", action: { kind: "send_sms", body: "Birthday gift at {{company}}. Reply STOP to opt out." } },
  ]);
}

export function buildAgencyTemplateSequence(kind: WorkflowTemplateKind) {
  const meta: Record<WorkflowTemplateKind, { name: string; description: string; triggerKind: WorkflowTriggerKind }> = {
    welcome: { name: "Welcome sequence", description: "Onboard new subscribers.", triggerKind: "customer_created" },
    win_back: { name: "Win-back sequence", description: "Re-engage lapsed guests.", triggerKind: "cart_abandoned" },
    review_request: { name: "Review request", description: "Ask for a review.", triggerKind: "review_received" },
    post_stay: { name: "Post-stay follow-up", description: "Thank-you after a stay.", triggerKind: "booking_made" },
    birthday_offer: { name: "Birthday offer", description: "Birthday perk.", triggerKind: "birthday" },
  };
  return { ...meta[kind], steps: templateSteps(kind) };
}

async function executeActionStep(input: {
  step: WorkflowStep;
  contact: CrmContact;
  companyName: string;
  fromName?: string;
  settings: MarketingWorkflowSettings;
  tenantId: string;
  atIso: string;
  timezone?: string;
}): Promise<{ status: WorkflowDispatchStatus; detail: string; channel: "email" | "sms" | "internal" }> {
  const action = input.step.action;
  if (!action) return { status: "failed", detail: "missing action", channel: "internal" };
  if (action.kind === "add_tag") {
    if (action.tag) {
      await updateCrmContact(input.contact.id, { tags: [...new Set([...input.contact.tags, action.tag])] });
    }
    return { status: "simulated", detail: "tag applied", channel: "internal" };
  }
  if (action.kind === "create_task") return { status: "simulated", detail: "task created", channel: "internal" };
  const channel: "email" | "sms" = action.kind === "send_sms" ? "sms" : "email";
  if (!(await contactChannelEligible(input.contact, channel))) {
    return { status: "blocked_consent", detail: "consent/opt-out", channel };
  }
  if (quietHoursActive(input.settings, input.atIso, input.timezone)) {
    return { status: "blocked_quiet_hours", detail: "quiet hours", channel };
  }
  if (await frequencyCapExceeded(input.tenantId, input.contact.companyId, input.contact.id, input.settings, input.atIso)) {
    return { status: "blocked_frequency", detail: "frequency cap", channel };
  }
  if (channel === "email") {
    const result = await dispatchWorkflowEmail({
      to: input.contact.email!,
      subject: renderTokens(action.subject ?? "Message", input.contact, input.companyName),
      htmlBody: renderTokens(action.body ?? "<p>Hi</p>", input.contact, input.companyName),
      fromName: input.fromName,
    });
    return { status: result.ok ? (result.mode === "live" ? "sent" : "simulated") : "failed", detail: result.detail, channel: "email" };
  }
  const result = await dispatchWorkflowSms({
    to: input.contact.phone!,
    body: renderTokens(action.body ?? "Hi", input.contact, input.companyName),
  });
  return { status: result.ok ? (result.mode === "live" ? "sent" : "simulated") : "failed", detail: result.detail, channel: "sms" };
}

export async function deployAgencyTemplate(input: {
  tenantId: string;
  companyId: string;
  template: MarketingWorkflow;
  createdById: string;
}): Promise<MarketingWorkflow> {
  if (!input.template.isAgencyTemplate) throw new Error("Not an agency template.");
  return createMarketingWorkflow({
    tenantId: input.tenantId,
    companyId: input.companyId,
    name: input.template.name,
    description: input.template.description,
    triggerKind: input.template.triggerKind,
    templateKind: input.template.templateKind ?? null,
    status: "draft",
    steps: input.template.steps.map((s, i) => ({ ...s, id: stepId("deploy", i + 1) })),
    isAgencyTemplate: false,
    deployedFromTemplateId: input.template.id,
    createdById: input.createdById,
  });
}

export async function runWorkflowForContact(input: {
  workflow: MarketingWorkflow;
  contactId: string;
  tenantId: string;
  companyName: string;
  fromName?: string;
  timezone?: string;
  atIso?: string;
  skipQuietHours?: boolean;
  skipFrequencyCap?: boolean;
}): Promise<WorkflowRunResult> {
  const stats = emptyStats();
  stats.triggered = 1;
  const logs: WorkflowDispatchLog[] = [];
  const atIso = input.atIso ?? new Date().toISOString();
  if (input.workflow.status !== "active") return { ok: false, stats, logs, blockedReason: "workflow not active" };
  if (!input.workflow.companyId) return { ok: false, stats, logs, blockedReason: "agency template cannot run directly" };
  const contact = await getCrmContact(input.contactId);
  if (!contact || contact.companyId !== input.workflow.companyId) {
    return { ok: false, stats, logs, blockedReason: "contact not found" };
  }
  const base = await resolveWorkflowSettings(input.workflow.companyId);
  const settings: MarketingWorkflowSettings = {
    ...base,
    quietHoursStart: input.skipQuietHours ? "00:00" : base.quietHoursStart,
    quietHoursEnd: input.skipQuietHours ? "00:00" : base.quietHoursEnd,
    frequencyCapPerWeek: input.skipFrequencyCap ? 999 : base.frequencyCapPerWeek,
  };
  for (const step of input.workflow.steps) {
    if (step.kind === "condition" && !evaluateStepCondition(contact, step)) continue;
    if (step.kind === "delay" || step.kind !== "action" || !step.action) continue;
    const channelForCap = step.action.kind === "send_sms" ? "sms" : step.action.kind === "send_email" ? "email" : "internal";
    if (channelForCap !== "internal" && !contactHasMarketingConsent(contact)) {
      stats.blockedConsent += 1;
      logs.push(await createWorkflowDispatchLog({
        workflowId: input.workflow.id, companyId: input.workflow.companyId, contactId: contact.id,
        channel: channelForCap, stepId: step.id, status: "blocked_consent", detail: "CRM consent required",
      }));
      continue;
    }
    const outcome = await executeActionStep({
      step, contact, companyName: input.companyName, fromName: input.fromName, settings,
      tenantId: input.tenantId, atIso, timezone: input.timezone,
    });
    if (outcome.status === "blocked_consent") stats.blockedConsent += 1;
    if (outcome.status === "blocked_quiet_hours") stats.blockedQuietHours += 1;
    if (outcome.status === "blocked_frequency") stats.blockedFrequency += 1;
    if (outcome.status === "simulated") stats.simulated += 1;
    if (outcome.status === "sent" || outcome.status === "simulated") stats.dispatched += 1;
    logs.push(await createWorkflowDispatchLog({
      workflowId: input.workflow.id, companyId: input.workflow.companyId, contactId: contact.id,
      channel: outcome.channel, stepId: step.id, status: outcome.status, detail: outcome.detail,
    }));
  }
  return { ok: stats.dispatched > 0 || logs.length === 0, stats, logs };
}

export function actionKindLabel(kind: WorkflowActionKind): string {
  return ({ send_email: "Send email", send_sms: "Send SMS", add_tag: "Add tag", create_task: "Create task" } as const)[kind];
}

export function triggerLabel(kind: WorkflowTriggerKind): string {
  return WORKFLOW_TRIGGERS.find((t) => t.kind === kind)?.label ?? kind;
}

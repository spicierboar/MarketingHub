// Scheduled tick — the real heartbeat behind automated publishing + automation
// (closes the "no scheduler, only manual buttons" gap).
//
// runScheduledTick() iterates every ACTIVE tenant and, per tenant:
//   • publishes any scheduled posts that are due (publishDuePosts), and
//   • runs the automation engine when the tenant has it enabled AND in-plan.
// Each tenant is isolated (its own system actor scoped to tenant.id) and a
// failure in one tenant never aborts the others. Nothing here bypasses a gate:
// publishDuePosts still runs the full eligibility chain, and runAutomations
// never publishes — it only drafts/queues for human approval.
//
// Two drivers call this: the authenticated /api/cron/tick route (Vercel Cron in
// production) and an optional in-process heartbeat (CC_SCHEDULER=1, local dev).

import { randomUUID } from "node:crypto";
import {
  getAutomationSettings,
  listTenants,
} from "@/lib/db";
import { runInServiceContext } from "@/lib/db/service-context";
import { planIncludesAutomations } from "@/lib/billing";
import { emptyQueueCounts, publishDuePosts } from "@/lib/publish-queue";
import { runAutomations } from "@/lib/automation";
import { runScheduledClientReportsForTenant } from "@/lib/client-reports";
import { progressManagedSchedulesForTenant } from "@/lib/managed-service/auto-progress";
import { processDueManagedDeliveries } from "@/lib/managed-service/delivery-runner";
import { maintainRollingCalendarsForTenant } from "@/lib/managed-service/rolling-calendar";
import { processManagedApprovalReminders } from "@/lib/managed-service/workflow-service";
import { pollDueManagedContentJobs } from "@/lib/managed-content-jobs/service";
import {
  claimNextSchedulerCursor,
  releaseSchedulerCursorClaim,
} from "@/lib/scheduler-cursor";
import {
  createChildScheduledExecution,
  createScheduledExecution,
  isScheduledDeadlineError,
  runWithScheduledExecution,
  type ScheduledExecution,
} from "@/lib/scheduled-execution";
import type { ActingUser } from "@/lib/types";

// A synthetic actor scoped to one tenant. Its audit entries are honestly
// attributed to "system:cron" so automated actions are distinguishable.
function systemActor(tenantId: string): ActingUser {
  return {
    id: "system:cron",
    email: "cron@marketing-command-centre.system",
    name: "Scheduler",
    role: "super_admin",
    active: true,
    tenantId,
    tenantRole: "owner",
    createdAt: "1970-01-01T00:00:00.000Z",
  };
}

export interface TenantTickResult {
  tenantId: string;
  taskClass: ScheduledTaskClass;
  published: number;
  failed: number;
  skipped: number;
  deferred: number; // held under a platform ceiling (see src/lib/platform-limits.ts)
  unknown: number; // provider response lost; requires reconciliation
  dead: number; // dead-lettered this tick after exhausting retries
  automationOutcomes: number;
  clientReportsSent: number;
  managedDeliveryProcessed?: number;
  rollingCalendarSuggestions?: number;
  managedAutoScheduled?: number;
  approvalRemindersSent?: number;
  managedContentPolled?: number;
  managedContentRecovered?: number;
  managedContentDeferred?: number;
  deadlineExceeded: boolean;
}

function envPositiveInt(name: string, fallback: number): number {
  const parsed = Number(process.env[name]);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export const CRON_MAX_DURATION_SECONDS = 90;
export const CRON_RESPONSE_RESERVE_MS = 15_000;
export const MAX_SCHEDULED_TICK_BUDGET_MS =
  CRON_MAX_DURATION_SECONDS * 1_000 - CRON_RESPONSE_RESERVE_MS;
export const DEFAULT_SCHEDULED_TICK_BUDGET_MS = 60_000;
export const DEFAULT_SCHEDULED_TASK_SLICE_MS = 6_000;
const MIN_TASK_START_MS = 750;

export function resolveScheduledTickBudgetMs(configured?: number): number {
  const requested =
    configured ??
    envPositiveInt(
      "CC_SCHEDULED_TICK_BUDGET_MS",
      DEFAULT_SCHEDULED_TICK_BUDGET_MS,
    );
  return Math.max(1_000, Math.min(requested, MAX_SCHEDULED_TICK_BUDGET_MS));
}

export type ScheduledTaskClass =
  | "publishing"
  | "automation"
  | "managed_delivery"
  | "rolling_calendar"
  | "managed_auto_schedule"
  | "approval_reminders"
  | "engine_polling"
  | "client_reports";

export const SCHEDULED_TASK_CLASSES: readonly ScheduledTaskClass[] = [
  "publishing",
  "automation",
  "managed_delivery",
  "rolling_calendar",
  "managed_auto_schedule",
  "approval_reminders",
  "engine_polling",
  "client_reports",
];

export interface ScheduledTickReport {
  results: TenantTickResult[];
  deadlineExceeded: boolean;
  deferred: {
    tenants: number;
    tasks: number;
    managedContentJobs: number;
  };
  budgetMs: number;
  durationMs: number;
}

function emptyTenantResult(
  tenantId: string,
  taskClass: ScheduledTaskClass,
): TenantTickResult {
  return {
    tenantId,
    taskClass,
    ...emptyQueueCounts(),
    automationOutcomes: 0,
    clientReportsSent: 0,
    managedDeliveryProcessed: 0,
    rollingCalendarSuggestions: 0,
    managedAutoScheduled: 0,
    approvalRemindersSent: 0,
    managedContentPolled: 0,
    managedContentRecovered: 0,
    managedContentDeferred: 0,
    deadlineExceeded: false,
  };
}

function canStartTask(execution: ScheduledExecution): boolean {
  return !execution.signal.aborted &&
    Date.now() + MIN_TASK_START_MS < execution.deadlineMs;
}

export async function runScheduledTick(
  options: { budgetMs?: number; taskSliceMs?: number } = {},
): Promise<ScheduledTickReport> {
  const startedAt = Date.now();
  const budgetMs = resolveScheduledTickBudgetMs(options.budgetMs);
  const deadlineMs = startedAt + budgetMs;
  const { execution, dispose } = createScheduledExecution(deadlineMs);
  try {
    return await runWithScheduledExecution(execution, () =>
      runScheduledTickWithExecution(
        options,
        startedAt,
        budgetMs,
        deadlineMs,
        execution,
      ),
    );
  } finally {
    dispose();
  }
}

async function runScheduledTickWithExecution(
  options: { budgetMs?: number; taskSliceMs?: number },
  startedAt: number,
  budgetMs: number,
  deadlineMs: number,
  execution: ScheduledExecution,
): Promise<ScheduledTickReport> {
  const taskSliceMs =
    options.taskSliceMs ??
    envPositiveInt(
      "CC_SCHEDULED_TASK_SLICE_MS",
      DEFAULT_SCHEDULED_TASK_SLICE_MS,
    );
  const origin =
    process.env.APP_ORIGIN?.trim().replace(/\/+$/, "") ??
    "http://localhost:3000";
  const results: TenantTickResult[] = [];
  let managedContentDeferred = 0;
  let processedTenants = 0;
  const activeTenants = (await listTenants())
    .filter((tenant) => tenant.status === "active")
    .sort((left, right) => left.id.localeCompare(right.id));
  const tenantsById = new Map(
    activeTenants.map((tenant) => [tenant.id, tenant]),
  );
  const remainingTenantIds = activeTenants.map((tenant) => tenant.id);

  while (remainingTenantIds.length > 0) {
      if (!canStartTask(execution)) break;
      const owner = randomUUID();
      const tenantClaim = await claimNextSchedulerCursor(
        "scheduler:tenants",
        remainingTenantIds,
        owner,
        { signal: execution.signal },
      );
      if (!tenantClaim) break;
      const tenant = tenantsById.get(tenantClaim.key);
      if (!tenant) {
        await releaseSchedulerCursorClaim(tenantClaim, {
          signal: execution.signal,
        });
        remainingTenantIds.splice(remainingTenantIds.indexOf(tenantClaim.key), 1);
        continue;
      }
      const taskClaim = await claimNextSchedulerCursor(
        `scheduler:tasks:${tenant.id}`,
        SCHEDULED_TASK_CLASSES,
        owner,
        { signal: execution.signal },
      );
      if (!taskClaim) {
        await releaseSchedulerCursorClaim(tenantClaim, {
          signal: execution.signal,
        });
        break;
      }
      const taskClass = taskClaim.key as ScheduledTaskClass;
      const actor = systemActor(tenant.id);
      const taskDeadlineMs = Math.min(
        execution.deadlineMs,
        Date.now() + taskSliceMs,
      );
      const {
        execution: taskExecution,
        dispose: disposeTaskExecution,
      } = createChildScheduledExecution(execution, taskDeadlineMs);
      const result = emptyTenantResult(tenant.id, taskClass);

      try {
        try {
          await runWithScheduledExecution(
            taskExecution,
            () =>
              runInServiceContext(tenant.id, async () => {
          switch (taskClass) {
            case "publishing":
              Object.assign(
                result,
                await publishDuePosts(actor, {
                  deadlineMs: taskDeadlineMs,
                  signal: taskExecution.signal,
                }),
              );
              break;
            case "automation": {
              const settings = await getAutomationSettings(tenant.id);
              if (
                settings.enabled &&
                (await planIncludesAutomations(tenant.id)) &&
                canStartTask(execution)
              ) {
                result.automationOutcomes = (
                  await runAutomations(actor, {
                    trigger: "cron",
                    signal: taskExecution.signal,
                    deadlineMs: taskDeadlineMs,
                  })
                ).outcomes.length;
              }
              break;
            }
            case "managed_delivery":
              result.managedDeliveryProcessed =
                await processDueManagedDeliveries(actor, tenant.id, {
                  signal: taskExecution.signal,
                  deadlineMs: taskDeadlineMs,
                });
              break;
            case "rolling_calendar":
              result.rollingCalendarSuggestions =
                await maintainRollingCalendarsForTenant(actor, tenant.id, {
                  signal: taskExecution.signal,
                  deadlineMs: taskDeadlineMs,
                });
              break;
            case "managed_auto_schedule":
              result.managedAutoScheduled =
                await progressManagedSchedulesForTenant(actor, tenant.id, {
                  signal: taskExecution.signal,
                  deadlineMs: taskDeadlineMs,
                });
              break;
            case "approval_reminders":
              result.approvalRemindersSent =
                await processManagedApprovalReminders(
                  actor,
                  new Date(startedAt).toISOString(),
                  { deadlineMs: taskDeadlineMs, signal: taskExecution.signal },
                );
              break;
            case "engine_polling": {
              const polled = await pollDueManagedContentJobs(tenant.id, {
                deadlineMs: taskDeadlineMs,
                signal: taskExecution.signal,
              });
              result.managedContentPolled = polled.processed;
              result.managedContentRecovered = polled.recovered;
              result.managedContentDeferred = polled.deferred;
              result.deadlineExceeded = polled.deadlineExceeded;
              managedContentDeferred += polled.deferred;
              break;
            }
            case "client_reports":
              result.clientReportsSent = (
                await runScheduledClientReportsForTenant(tenant.id, origin, {
                  deadlineMs: taskDeadlineMs,
                  signal: taskExecution.signal,
                })
              ).reportsSent;
              break;
          }
              }),
          );
        } catch (error) {
          if (
            taskExecution.signal.aborted ||
            Date.now() >= taskDeadlineMs ||
            isScheduledDeadlineError(error)
          ) {
            result.deadlineExceeded = true;
          }
        }
      } finally {
        disposeTaskExecution();
        await Promise.allSettled([
          releaseSchedulerCursorClaim(taskClaim, {
            signal: execution.signal,
          }),
          releaseSchedulerCursorClaim(tenantClaim, {
            signal: execution.signal,
          }),
        ]);
      }

      results.push(result);
      processedTenants += 1;
      remainingTenantIds.splice(
        remainingTenantIds.indexOf(tenant.id),
        1,
      );
  }

  const deadlineExceeded =
    execution.signal.aborted ||
    Date.now() >= deadlineMs ||
    processedTenants < activeTenants.length ||
    results.some((result) => result.deadlineExceeded);
  return {
    results,
    deadlineExceeded,
    deferred: {
      tenants: Math.max(0, activeTenants.length - processedTenants),
      tasks:
        processedTenants * (SCHEDULED_TASK_CLASSES.length - 1) +
        Math.max(0, activeTenants.length - processedTenants) *
          SCHEDULED_TASK_CLASSES.length,
      managedContentJobs: managedContentDeferred,
    },
    budgetMs,
    durationMs: Date.now() - startedAt,
  };
}

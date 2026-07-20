import { AsyncLocalStorage } from "node:async_hooks";

export class ScheduledDeadlineError extends Error {
  constructor(message = "Scheduled work deadline exceeded") {
    super(message);
    this.name = "ScheduledDeadlineError";
  }
}

export interface ScheduledExecution {
  deadlineMs: number;
  signal: AbortSignal;
}

const executionStorage = new AsyncLocalStorage<ScheduledExecution>();

export function currentScheduledExecution(): ScheduledExecution | undefined {
  return executionStorage.getStore();
}

export function runWithScheduledExecution<T>(
  execution: ScheduledExecution,
  task: () => Promise<T>,
): Promise<T> {
  return executionStorage.run(execution, task);
}

export function isScheduledDeadlineError(error: unknown): boolean {
  return (
    error instanceof ScheduledDeadlineError ||
    (error instanceof DOMException && error.name === "AbortError") ||
    (error instanceof Error &&
      (error.name === "AbortError" || error.name === "TimeoutError"))
  );
}

export function throwIfScheduledAborted(
  execution?: Partial<ScheduledExecution>,
  minimumRemainingMs = 0,
): void {
  if (!execution) return;
  if (
    execution.signal?.aborted ||
    (execution.deadlineMs !== undefined &&
      Date.now() + minimumRemainingMs >= execution.deadlineMs)
  ) {
    throw new ScheduledDeadlineError();
  }
}

export function remainingScheduledMs(execution: ScheduledExecution): number {
  return Math.max(0, execution.deadlineMs - Date.now());
}

export function createScheduledExecution(deadlineMs: number): {
  execution: ScheduledExecution;
  dispose: () => void;
} {
  const controller = new AbortController();
  const delayMs = Math.max(0, deadlineMs - Date.now());
  const timer = setTimeout(
    () => controller.abort(new ScheduledDeadlineError()),
    delayMs,
  );
  timer.unref?.();
  return {
    execution: { deadlineMs, signal: controller.signal },
    dispose: () => clearTimeout(timer),
  };
}

export function createChildScheduledExecution(
  parent: ScheduledExecution,
  deadlineMs: number,
): {
  execution: ScheduledExecution;
  dispose: () => void;
} {
  const controller = new AbortController();
  const abortFromParent = () =>
    controller.abort(
      parent.signal.reason ?? new ScheduledDeadlineError("Parent deadline exceeded"),
    );
  if (parent.signal.aborted) abortFromParent();
  else parent.signal.addEventListener("abort", abortFromParent, { once: true });
  const timer = setTimeout(
    () => controller.abort(new ScheduledDeadlineError("Task slice exceeded")),
    Math.max(0, deadlineMs - Date.now()),
  );
  timer.unref?.();
  return {
    execution: { deadlineMs, signal: controller.signal },
    dispose: () => {
      clearTimeout(timer);
      parent.signal.removeEventListener("abort", abortFromParent);
    },
  };
}

"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/form";

/** Common agency / SMB marketing tasks — keeps the form scannable. */
export const TASK_TEMPLATES = [
  "Draft social post",
  "Schedule calendar content",
  "Reply to reviews",
  "Check social inbox",
  "Update offer / promotion",
  "Prepare campaign brief",
  "Request client approval",
  "Connect publishing account",
  "Upload Brand Brain document",
  "Follow up recommendation",
  "Review analytics",
  "Other (write your own)",
] as const;

export function AddTaskForm({
  companies,
  action,
}: {
  companies: { id: string; name: string }[];
  action: (formData: FormData) => void | Promise<void>;
}) {
  const [template, setTemplate] = useState<string>(TASK_TEMPLATES[0]);
  const isOther = template === "Other (write your own)";

  return (
    <form action={action} className="space-y-4">
      <Field label="Company" htmlFor="companyId">
        <Select id="companyId" name="companyId" required>
          {companies.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </Field>

      <Field
        label="Task"
        htmlFor="taskTemplate"
        hint="Pick a common action, or choose Other to type your own"
      >
        <Select
          id="taskTemplate"
          value={template}
          onChange={(e) => setTemplate(e.target.value)}
          required
        >
          {TASK_TEMPLATES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </Select>
      </Field>

      {/* Submitted title: template value, or custom when Other */}
      {!isOther && <input type="hidden" name="title" value={template} />}
      {isOther && (
        <Field label="Custom task" htmlFor="title">
          <Input
            id="title"
            name="title"
            required
            placeholder="e.g. Call client about winter menu shoot"
          />
        </Field>
      )}

      <Field label="Detail" htmlFor="detail" hint="Optional — extra context">
        <Input id="detail" name="detail" placeholder="Optional notes" />
      </Field>
      <Button type="submit">Add task</Button>
    </form>
  );
}

"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signUpAction } from "./actions";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function SignUpPage() {
  const [state, formAction, pending] = useActionState(signUpAction, null);

  return (
    <div className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-lg font-bold text-primary-foreground">
            MC
          </div>
          <h1 className="text-2xl font-bold tracking-tight">
            Create your workspace
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            One workspace per agency or business group. You&apos;ll be the owner.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Get started</CardTitle>
            <CardDescription>
              Free to start — add your companies after sign-up.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={formAction} className="space-y-4">
              <Field label="Workspace name" htmlFor="orgName">
                <Input id="orgName" name="orgName" placeholder="e.g. BrightSpark Marketing" required />
              </Field>
              <Field label="Workspace type" htmlFor="kind">
                <Select id="kind" name="kind" defaultValue="agency">
                  <option value="agency">Marketing agency (manage client companies)</option>
                  <option value="business_group">Business group (my own companies)</option>
                </Select>
              </Field>
              <Field label="Your name" htmlFor="name">
                <Input id="name" name="name" placeholder="Jane Smith" required />
              </Field>
              <Field label="Work email" htmlFor="email">
                <Input id="email" name="email" type="email" autoComplete="email" required />
              </Field>
              {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
              <Button type="submit" className="w-full" disabled={pending}>
                {pending ? "Creating workspace…" : "Create workspace"}
              </Button>
              <p className="text-center text-xs text-muted-foreground">
                By creating a workspace you agree to our{" "}
                <a href="/terms" className="underline">Terms of Service</a>.
              </p>
            </form>
          </CardContent>
        </Card>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link href="/login" className="text-primary hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}

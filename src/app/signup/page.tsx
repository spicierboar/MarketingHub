import Link from "next/link";

export default function SignUpPage() {
  return (
    <div className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-md text-center">
        <div className="mb-8">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-lg font-bold text-primary-foreground">
            MC
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Invite only</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            New workspaces are created by invitation. If your agency uses Marketing Command Centre,
            ask your administrator for an invite link or sign-in email.
          </p>
        </div>

        <p className="text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link href="/login" className="text-primary hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}

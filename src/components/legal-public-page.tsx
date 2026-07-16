import Link from "next/link";
import type { ReactNode } from "react";
import type { LegalDocKind, TermsVersion } from "@/lib/types";
import {
  formatLegalDate,
  publicLegalHref,
  publicLegalPath,
  splitCurrentAndArchive,
} from "@/lib/legal-display";
import { legalDocLabel } from "@/lib/terms";

/** Shared public Terms / Privacy Policy page with dated version archive. */
export function LegalPublicPage({
  kind,
  versions,
  viewVersion,
  fallback,
}: {
  kind: LegalDocKind;
  versions: TermsVersion[];
  /** Specific archived (or current) version from ?v= */
  viewVersion?: number;
  /** Shown when nothing has been published yet (demo / pre-publish). */
  fallback?: ReactNode;
}) {
  const label = legalDocLabel(kind);
  const { current, archive } = splitCurrentAndArchive(versions);
  const selected =
    viewVersion != null
      ? (versions.find((v) => v.version === viewVersion) ?? current)
      : current;
  const viewingArchive =
    selected != null && current != null && selected.id !== current.id;

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-3xl px-5 py-12">
        <div className="mb-2 flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 text-sm font-bold text-white">
            MC
          </div>
          <span className="text-sm font-semibold text-slate-900">
            Marketing Command Centre
          </span>
        </div>

        {!selected && !fallback ? (
          <>
            <h1 className="mt-6 text-3xl font-bold tracking-tight text-slate-900">{label}</h1>
            <p className="mt-4 text-sm text-slate-600">
              No {label.toLowerCase()} has been published yet. Check back soon, or contact the
              workspace administrator.
            </p>
          </>
        ) : !selected && fallback ? (
          fallback
        ) : selected ? (
          <>
            <h1 className="mt-6 text-3xl font-bold tracking-tight text-slate-900">
              {selected.title || label}
            </h1>
            <p className="mt-2 text-sm text-slate-500">
              Version {selected.version}
              {selected.active ? " · current" : " · archived"}
              {" · "}effective {formatLegalDate(selected.effectiveDate)}
              {" · "}published {formatLegalDate(selected.publishedAt)}
            </p>
            {viewingArchive && (
              <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                You are viewing an <strong>archived</strong> version.{" "}
                <Link href={publicLegalPath(kind)} className="font-medium underline">
                  View the current {label.toLowerCase()}
                </Link>
                .
              </div>
            )}
            {selected.summary && (
              <p className="mt-4 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
                <span className="font-medium">What changed: </span>
                {selected.summary}
              </p>
            )}
            <div className="mt-8 whitespace-pre-wrap text-[15px] leading-relaxed text-slate-700">
              {selected.body}
            </div>
          </>
        ) : null}

        {(current || archive.length > 0) && (
          <section className="mt-12 border-t border-slate-200 pt-8">
            <h2 className="text-base font-semibold text-slate-900">Version archive</h2>
            <p className="mt-1 text-sm text-slate-500">
              Previous published versions with effective and published dates.
            </p>
            <ul className="mt-4 space-y-2">
              {current && (
                <li>
                  <Link
                    href={publicLegalHref(kind)}
                    className={`block rounded-md border px-3 py-2 text-sm ${
                      !viewingArchive && selected?.id === current.id
                        ? "border-slate-900 bg-white"
                        : "border-slate-200 bg-white hover:border-slate-400"
                    }`}
                  >
                    <span className="font-medium">
                      v{current.version} — {current.title || label}
                    </span>
                    <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800">
                      current
                    </span>
                    <p className="mt-0.5 text-xs text-slate-500">
                      effective {formatLegalDate(current.effectiveDate)} · published{" "}
                      {formatLegalDate(current.publishedAt)}
                    </p>
                  </Link>
                </li>
              )}
              {archive.map((v) => (
                <li key={v.id}>
                  <Link
                    href={publicLegalHref(kind, v.version)}
                    className={`block rounded-md border px-3 py-2 text-sm ${
                      selected?.id === v.id
                        ? "border-slate-900 bg-white"
                        : "border-slate-200 bg-white hover:border-slate-400"
                    }`}
                  >
                    <span className="font-medium">
                      v{v.version} — {v.title || label}
                    </span>
                    <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                      archived
                    </span>
                    <p className="mt-0.5 text-xs text-slate-500">
                      effective {formatLegalDate(v.effectiveDate)} · published{" "}
                      {formatLegalDate(v.publishedAt)}
                    </p>
                  </Link>
                </li>
              ))}
              {archive.length === 0 && current && (
                <li className="text-sm text-slate-500">No prior versions yet.</li>
              )}
            </ul>
          </section>
        )}

        <div className="mt-12 border-t border-slate-200 pt-6 text-sm text-slate-500">
          <Link href="/login" className="text-slate-700 underline">
            ← Back to sign in
          </Link>
          {kind === "terms" ? (
            <span className="mx-2">·</span>
          ) : null}
          {kind === "terms" ? (
            <Link href="/privacy-policy" className="text-slate-700 underline">
              Privacy Policy
            </Link>
          ) : (
            <>
              <span className="mx-2">·</span>
              <Link href="/terms" className="text-slate-700 underline">
                Terms of Service
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

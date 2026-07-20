import {
  createHash,
} from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const supabaseDir = dirname(here);
const migrationsDir = join(supabaseDir, "migrations");
const archiveDir = join(supabaseDir, "legacy-migrations");
const pendingDir = join(archiveDir, "pending");
const catalogPath = join(
  here,
  "command-centre-staging-public-catalog-20260719.json",
);
const supplementalPath = join(
  here,
  "command-centre-staging-public-catalog-supplemental-20260719.json",
);
const baselineName =
  "20260719044000_command_centre_staging_canonical_baseline.sql";
const replayName =
  "20260719044100_content_desk_delegation_replay_ledger.sql";

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8").replace(/^\uFEFF/, ""));
}

function sha256(content) {
  return createHash("sha256").update(content).digest("hex");
}

function identifier(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function literal(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function normalizedName(value) {
  return value.replace(/^public\./i, "").replaceAll('"', "").toLowerCase();
}

function rolesSql(roles) {
  return roles
    .map((role) =>
      String(role).toLowerCase() === "public" ? "public" : identifier(role),
    )
    .join(", ");
}

function canonicalLegacyOrder(fileNames) {
  return fileNames.toSorted((left, right) => left.localeCompare(right, "en"));
}

function marker(status, kind, name, detail) {
  return { status, kind, name, ...(detail ? { detail } : {}) };
}

function verifyLegacyFile(fileName, sql, catalog, supplemental) {
  const tableByName = new Map(
    catalog.tables.map((value) => [value.name.toLowerCase(), value]),
  );
  const columns = new Set(
    catalog.columns.map(
      (value) => `${value.table.toLowerCase()}.${value.name.toLowerCase()}`,
    ),
  );
  const columnByName = new Map(
    catalog.columns.map((value) => [
      `${value.table.toLowerCase()}.${value.name.toLowerCase()}`,
      value,
    ]),
  );
  const constraints = new Set(
    catalog.constraints.map((value) => value.name.toLowerCase()),
  );
  const indexes = new Set(
    catalog.indexes.map((value) => value.name.toLowerCase()),
  );
  const functions = new Map(
    catalog.functions.map((value) => [value.name.toLowerCase(), value]),
  );
  const policies = new Set(
    catalog.policies.map(
      (value) =>
        `${value.tablename.toLowerCase()}.${value.policyname.toLowerCase()}`,
    ),
  );
  const enums = new Set(catalog.enums.map((value) => value.name.toLowerCase()));
  const grants = [
    ...catalog.table_grants,
    ...supplemental.column_grants,
  ];
  const checks = [];

  const collect = (regex, callback) => {
    for (const match of sql.matchAll(regex)) callback(match);
  };

  collect(
    /\bcreate\s+table(?:\s+if\s+not\s+exists)?\s+([a-zA-Z0-9_."]+)/gi,
    (match) => {
      const name = normalizedName(match[1]);
      checks.push(marker(tableByName.has(name), "table", name));
    },
  );
  collect(
    /\bcreate\s+type\s+([a-zA-Z0-9_."]+)\s+as\s+enum/gi,
    (match) => {
      const name = normalizedName(match[1]);
      checks.push(marker(enums.has(name), "enum", name));
    },
  );
  collect(
    /\bcreate\s+(?:unique\s+)?index(?:\s+if\s+not\s+exists)?\s+([a-zA-Z0-9_."]+)/gi,
    (match) => {
      const name = normalizedName(match[1]);
      const supersedingIndex =
        fileName.startsWith("0007_") &&
        {
          idx_terms_versions_active: "idx_terms_versions_kind_active",
          idx_terms_acceptances_user: "idx_terms_acceptances_user_kind",
        }[name];
      checks.push(
        marker(
          indexes.has(name) ||
            (supersedingIndex ? indexes.has(supersedingIndex) : false),
          "index",
          name,
          supersedingIndex
            ? `Superseded by ${supersedingIndex} in migration 0046.`
            : undefined,
        ),
      );
    },
  );
  collect(
    /\bcreate\s+or\s+replace\s+function\s+([a-zA-Z0-9_."]+)/gi,
    (match) => {
      const name = normalizedName(match[1]);
      checks.push(marker(functions.has(name), "function", name));
    },
  );
  collect(
    /\bcreate\s+policy\s+(?:"([^"]+)"|([a-zA-Z0-9_]+))\s+on\s+([a-zA-Z0-9_."]+)/gi,
    (match) => {
      const name = `${normalizedName(match[3])}.${(
        match[1] ?? match[2]
      ).toLowerCase()}`;
      checks.push(marker(policies.has(name), "policy", name));
    },
  );
  collect(
    /\balter\s+table\s+([a-zA-Z0-9_."]+)\s+enable\s+row\s+level\s+security/gi,
    (match) => {
      const name = normalizedName(match[1]);
      checks.push(
        marker(tableByName.get(name)?.rls === true, "row-level-security", name),
      );
    },
  );
  collect(
    /\balter\s+table\s+([a-zA-Z0-9_."]+)\s+add\s+column(?:\s+if\s+not\s+exists)?\s+([a-zA-Z0-9_"]+)/gi,
    (match) => {
      const name = `${normalizedName(match[1])}.${normalizedName(match[2])}`;
      checks.push(marker(columns.has(name), "column", name));
    },
  );

  for (const statement of sql.split(";")) {
    const tableMatch = statement.match(
      /\balter\s+table\s+([a-zA-Z0-9_."]+)/i,
    );
    if (!tableMatch) continue;
    collect.call;
    for (const match of statement.matchAll(
      /\badd\s+constraint\s+([a-zA-Z0-9_"]+)/gi,
    )) {
      const name = normalizedName(match[1]);
      checks.push(marker(constraints.has(name), "constraint", name));
    }
  }

  collect(
    /\brevoke\s+all\s+on\s+table\s+([a-zA-Z0-9_."]+)\s+from\s+([^;]+)/gi,
    (match) => {
      const table = normalizedName(match[1]);
      for (const role of match[2].split(",").map((value) => value.trim())) {
        const normalizedRole =
          role.toLowerCase() === "public" ? "PUBLIC" : normalizedName(role);
        const present = grants.some(
          (grant) =>
            grant.table_name?.toLowerCase() === table &&
            grant.grantee?.toLowerCase() === normalizedRole.toLowerCase(),
        );
        checks.push(
          marker(!present, "table-revoke", `${table}:${normalizedRole}`),
        );
      }
    },
  );

  if (fileName.startsWith("0003_")) {
    const actorColumns = [
      ...sql.matchAll(/\('([^']+)','([^']+)'\)/g),
    ].map((match) => `${match[1]}.${match[2]}`.toLowerCase());
    for (const name of actorColumns) {
      checks.push(
        marker(
          columnByName.get(name)?.type === "text",
          "opaque-actor-column",
          name,
          columnByName.get(name)?.type,
        ),
      );
      checks.push(
        marker(
          !constraints.has(`${name.replace(".", "_")}_fkey`),
          "opaque-actor-foreign-key-removed",
          name,
        ),
      );
    }
  }

  if (fileName.startsWith("0044_")) {
    checks.push(
      marker(
        true,
        "data-invariant",
        "managed_delivery_runs.strategy_eligible_at",
        "Read-only query returned zero unbackfilled rows on 2026-07-19.",
      ),
    );
  }

  if (fileName.startsWith("0047_")) {
    checks.push(
      marker(
        true,
        "data-invariant",
        "companies.profile.managedService",
        "Read-only query returned zero legacy package ids and zero missing serviceBilling objects on 2026-07-19.",
      ),
    );
  }

  if (fileName.startsWith("0048_")) {
    for (const functionName of [
      "is_company_staff",
      "client_respond_managed_approval",
      "respond_managed_approval_with_token",
      "claim_managed_approval_reminder",
    ]) {
      const acl = functions.get(functionName)?.acl ?? [];
      const publicExecute = acl.some((entry) => entry.startsWith("=X/"));
      checks.push(
        marker(!publicExecute, "security-definer-public-revoke", functionName),
      );
    }
  }

  if (fileName.startsWith("0049_")) {
    const acl = functions.get("claim_managed_content_job_event")?.acl ?? [];
    checks.push(
      marker(
        !acl.some((entry) => entry.startsWith("=X/")),
        "security-definer-public-revoke",
        "claim_managed_content_job_event",
      ),
    );
    checks.push(
      marker(
        acl.some((entry) => entry.startsWith("service_role=X/")),
        "service-role-execute",
        "claim_managed_content_job_event",
      ),
    );
  }

  const present = checks.filter((check) => check.status).length;
  const status =
    checks.length > 0 && present === checks.length
      ? "PRESENT"
      : present === 0
        ? "ABSENT"
        : "PARTIAL";
  return {
    status,
    checkCount: checks.length,
    presentCheckCount: present,
    failedChecks: checks.filter((check) => !check.status),
  };
}

function buildBaseline(catalog, supplemental, lineage) {
  const lines = [
    "-- Canonical schema-only baseline for command-centre-staging.",
    "-- Generated from read-only pg_catalog snapshots captured 2026-07-19.",
    `-- Legacy lineage manifest SHA-256: ${lineage.manifestSha256}`,
    "-- This file contains no row data and has not been applied remotely.",
    "",
    "set check_function_bodies = false;",
    "set search_path = public;",
    "",
  ];

  for (const value of catalog.enums) {
    lines.push(
      `create type public.${identifier(value.name)} as enum (${value.labels
        .map(literal)
        .join(", ")});`,
      "",
    );
  }

  const columnsByTable = Map.groupBy(
    catalog.columns,
    (value) => value.table,
  );
  for (const table of catalog.tables.filter((value) => value.kind === "r")) {
    const columnDefinitions = (columnsByTable.get(table.name) ?? []).map(
      (column) => {
        let definition = `  ${identifier(column.name)} ${column.type}`;
        if (column.identity === "a") {
          definition += " generated always as identity";
        } else if (column.identity === "d") {
          definition += " generated by default as identity";
        } else if (column.generated === "s") {
          definition += ` generated always as (${column.default}) stored`;
        } else if (column.default !== null) {
          definition += ` default ${column.default}`;
        }
        if (column.not_null) definition += " not null";
        return definition;
      },
    );
    lines.push(
      `create table public.${identifier(table.name)} (`,
      columnDefinitions.join(",\n"),
      ");",
      "",
    );
  }

  const constraintNames = new Set(
    catalog.constraints.map((value) => value.name),
  );
  const standaloneIndexes = catalog.indexes.filter(
    (value) => !constraintNames.has(value.name),
  );
  const appendConstraints = (types) => {
    for (const constraint of catalog.constraints.filter((value) =>
      types.includes(value.type),
    )) {
      lines.push(
        `alter table only public.${identifier(constraint.table)} add constraint ${identifier(constraint.name)} ${constraint.definition};`,
      );
    }
    lines.push("");
  };
  const appendIndexes = (predicate) => {
    for (const index of standaloneIndexes.filter(predicate)) {
      lines.push(`${index.definition.replace(/^CREATE /, "create ")};`);
    }
    lines.push("");
  };

  // Referenced uniqueness must exist before foreign keys are added. Some
  // composite references use standalone unique indexes rather than UNIQUE
  // constraints, so those indexes are also created before foreign keys.
  appendConstraints(["p", "u", "x"]);
  appendIndexes((index) => /^CREATE UNIQUE INDEX /i.test(index.definition));
  appendConstraints(["c"]);
  appendConstraints(["f"]);
  appendIndexes((index) => !/^CREATE UNIQUE INDEX /i.test(index.definition));

  const knownConstraintTypes = new Set(["p", "u", "x", "c", "f"]);
  const unknownConstraintTypes = catalog.constraints.filter(
    (value) => !knownConstraintTypes.has(value.type),
  );
  if (unknownConstraintTypes.length > 0) {
    throw new Error(
      `Unsupported constraint types: ${[
        ...new Set(unknownConstraintTypes.map((value) => value.type)),
      ].join(", ")}`,
    );
  }

  for (const fn of catalog.functions) {
    lines.push(`${fn.definition.trim()};`, "");
    const signature = `public.${identifier(fn.name)}(${fn.identity_arguments})`;
    lines.push(
      `revoke all on function ${signature} from public, anon, authenticated, service_role;`,
    );
    for (const acl of fn.acl ?? []) {
      const [grantee, privileges] = acl.split("=")[0] === ""
        ? ["public", acl.split("=")[1]?.split("/")[0] ?? ""]
        : [acl.split("=")[0], acl.split("=")[1]?.split("/")[0] ?? ""];
      if (
        privileges.includes("X") &&
        ["public", "anon", "authenticated", "service_role"].includes(grantee)
      ) {
        lines.push(
          `grant execute on function ${signature} to ${
            grantee === "public" ? "public" : identifier(grantee)
          };`,
        );
      }
    }
    lines.push("");
  }

  for (const table of catalog.tables.filter((value) => value.kind === "r")) {
    if (table.rls) {
      lines.push(
        `alter table public.${identifier(table.name)} enable row level security;`,
      );
    }
    if (table.force_rls) {
      lines.push(
        `alter table public.${identifier(table.name)} force row level security;`,
      );
    }
  }
  lines.push("");

  for (const policy of catalog.policies) {
    const roles = Array.isArray(policy.roles)
      ? policy.roles
      : [policy.roles];
    let definition =
      `create policy ${identifier(policy.policyname)} on public.${identifier(policy.tablename)}` +
      ` as ${policy.permissive} for ${policy.cmd} to ${rolesSql(roles)}`;
    if (policy.qual !== null) definition += ` using (${policy.qual})`;
    if (policy.with_check !== null) {
      definition += ` with check (${policy.with_check})`;
    }
    lines.push(`${definition};`);
  }
  lines.push("");

  const tableGrantGroups = Map.groupBy(
    catalog.table_grants,
    (value) => `${value.table_name}\0${value.grantee}`,
  );
  const columnGrantGroups = Map.groupBy(
    supplemental.column_grants,
    (value) =>
      `${value.table_name}\0${value.grantee}\0${value.privilege_type}`,
  );
  for (const table of catalog.tables.filter((value) => value.kind === "r")) {
    lines.push(
      `revoke all on table public.${identifier(table.name)} from public, anon, authenticated, service_role;`,
    );
  }
  for (const [key, grants] of tableGrantGroups) {
    const [table, grantee] = key.split("\0");
    const privileges = [
      ...new Set(grants.map((value) => value.privilege_type)),
    ].toSorted();
    lines.push(
      `grant ${privileges.join(", ")} on table public.${identifier(table)} to ${identifier(grantee)};`,
    );
  }
  for (const [key, grants] of columnGrantGroups) {
    const [table, grantee, privilege] = key.split("\0");
    const columns = [
      ...new Set(grants.map((value) => value.column_name)),
    ].toSorted();
    lines.push(
      `grant ${privilege} (${columns.map(identifier).join(", ")}) on table public.${identifier(table)} to ${identifier(grantee)};`,
    );
  }
  lines.push("");

  for (const value of supplemental.table_comments) {
    lines.push(
      `comment on table public.${identifier(value.table)} is ${literal(value.comment)};`,
    );
  }
  for (const value of supplemental.column_comments) {
    lines.push(
      `comment on column public.${identifier(value.table)}.${identifier(value.column)} is ${literal(value.comment)};`,
    );
  }
  lines.push("");

  return `${lines.join("\n")}\n`;
}

function main() {
  const catalogEnvelope = readJson(catalogPath);
  const supplementalEnvelope = readJson(supplementalPath);
  const catalog = catalogEnvelope.rows?.[0]?.catalog;
  const supplemental = supplementalEnvelope.rows?.[0]?.supplemental;
  if (!catalog || !supplemental) throw new Error("Catalog snapshot is invalid.");
  if (catalog.history_table_present !== false) {
    throw new Error("Expected remote migration history to be absent.");
  }

  const archivedMode =
    existsSync(archiveDir) &&
    readdirSync(archiveDir).filter((name) => /^\d{4}_.+\.sql$/.test(name))
      .length === 49;
  const sourceDir = archivedMode ? archiveDir : migrationsDir;
  const activeNames = readdirSync(sourceDir)
    .filter((name) => /^\d{4}_.+\.sql$/.test(name))
    .concat(
      archivedMode
        ? readdirSync(pendingDir).filter((name) =>
            /^0050_.+\.sql$/.test(name),
          )
        : [],
    );
  const legacyNames = canonicalLegacyOrder(
    activeNames.filter((name) => !name.startsWith("0050_")),
  );
  const replaySourceName = activeNames.find((name) => name.startsWith("0050_"));
  if (
    legacyNames.length !== 49 ||
    !replaySourceName ||
    new Set(legacyNames.map((name) => name.slice(0, 4))).size !== 38
  ) {
    throw new Error("Unexpected legacy migration inventory.");
  }
  if (
    (!archivedMode &&
      (existsSync(join(migrationsDir, baselineName)) ||
        existsSync(join(migrationsDir, replayName))))
  ) {
    throw new Error("Canonical output already exists or inventory is invalid.");
  }

  const entries = legacyNames.map((fileName, index) => {
    const content = readFileSync(join(sourceDir, fileName));
    const verification = verifyLegacyFile(
      fileName,
      content.toString("utf8"),
      catalog,
      supplemental,
    );
    const supersededEffects = fileName.startsWith("0007_")
      ? [
          {
            original: "idx_terms_versions_active",
            replacement: "idx_terms_versions_kind_active",
            migration: "0046_legal_docs_kind.sql",
          },
          {
            original: "idx_terms_acceptances_user",
            replacement: "idx_terms_acceptances_user_kind",
            migration: "0046_legal_docs_kind.sql",
          },
        ]
      : [];
    return {
      canonicalOrder: index + 1,
      originalFileName: fileName,
      originalVersion: fileName.slice(0, 4),
      sha256: sha256(content),
      ...verification,
      ...(supersededEffects.length > 0 ? { supersededEffects } : {}),
    };
  });

  const manifest = {
    formatVersion: 1,
    generatedAt: "2026-07-19T04:40:00Z",
    sourceProject: "command-centre-staging",
    sourceSchema: "public",
    postgresVersion: catalog.postgres_version,
    remoteMigrationHistoryPresent: catalog.history_table_present,
    legacyFileCount: entries.length,
    distinctLegacyVersionCount: new Set(
      entries.map((entry) => entry.originalVersion),
    ).size,
    canonicalOrderRule:
      "Original four-digit version ascending; filename lexical order resolves legacy collisions.",
    verificationMethod:
      "Read-only pg_catalog snapshot plus explicit data-invariant queries for migrations 0044 and 0047.",
    entries,
  };
  const manifestContent = `${JSON.stringify(manifest, null, 2)}\n`;
  const manifestSha256 = sha256(manifestContent);
  const baseline = buildBaseline(catalog, supplemental, { manifestSha256 });

  mkdirSync(archiveDir, { recursive: true });
  mkdirSync(pendingDir, { recursive: true });
  writeFileSync(join(archiveDir, "legacy-effect-manifest.json"), manifestContent);
  writeFileSync(join(migrationsDir, baselineName), baseline);

  const replaySourcePath = archivedMode
    ? join(pendingDir, replaySourceName)
    : join(migrationsDir, replaySourceName);
  const replaySource = readFileSync(replaySourcePath, "utf8");
  writeFileSync(
    join(migrationsDir, replayName),
    [
      "-- Canonical timestamped successor to the archived logical migration 0050.",
      `-- Source: ../legacy-migrations/pending/${replaySourceName}`,
      `-- Source SHA-256: ${sha256(replaySource)}`,
      "-- This migration remains unapplied.",
      "",
      replaySource,
    ].join("\n"),
  );

  if (!archivedMode) {
    for (const entry of entries) {
      const source = join(migrationsDir, entry.originalFileName);
      const target = join(archiveDir, entry.originalFileName);
      if (existsSync(target)) throw new Error(`Archive target exists: ${target}`);
      renameSync(source, target);
      const archivedHash = sha256(readFileSync(target));
      if (archivedHash !== entry.sha256) {
        throw new Error(`Hash changed while archiving ${entry.originalFileName}`);
      }
    }
    renameSync(
      join(migrationsDir, replaySourceName),
      join(pendingDir, replaySourceName),
    );
  }
  console.log(
    JSON.stringify({
      baselineName,
      replayName,
      archivedLegacyFiles: entries.length,
      present: entries.filter((entry) => entry.status === "PRESENT").length,
      partial: entries.filter((entry) => entry.status === "PARTIAL").length,
      absent: entries.filter((entry) => entry.status === "ABSENT").length,
      manifestSha256,
    }),
  );
}

main();

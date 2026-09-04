// OSV-based production-dependency audit fallback.
//
// `pnpm audit` depends on npm's bulk-advisory endpoint, which has recurring
// outages while the registry itself stays up. This script answers the same
// question — does the production dependency closure contain high/critical
// advisories? — using the OSV API (which mirrors the GitHub Advisory Database
// that npm audit is built on).
//
// The production closure is computed from pnpm-lock.yaml: each importer's
// `dependencies` (never `devDependencies`) walked through the `snapshots:`
// section (peer-suffix keys collapsed to their base name@version), so every
// version queried is the exact resolved one.
//
// Usage: node scripts/audit-osv-fallback.mjs
// Exit 0 = no high/critical advisories in the prod closure.
// Exit 1 = advisories found, or OSV itself unreachable.

import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const LOCKFILE = "pnpm-lock.yaml";
const OSV_QUERYBATCH = "https://api.osv.dev/v1/querybatch";
const OSV_VULN = "https://api.osv.dev/v1/vulns";

function exactVersion(value) {
  const raw = value.startsWith("npm:") ? value.slice(4) : value;
  if (/^(link|file):/.test(raw)) return undefined;
  return raw.split("(")[0];
}

/** Parse pnpm-lock.yaml into importer dep maps and exact-version snapshot maps. */
export function parseLockfile(text) {
  const importers = new Map(); // importer path -> Map(depName -> version value)
  const snapshots = new Map(); // "name@version" (base key) -> Map(depName -> version value)

  let section = null;
  let importerPath = null;
  let snapshotKey = null;
  let depTarget = null;

  for (const line of text.split("\n")) {
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const indent = line.length - line.trimStart().length;
    const trimmed = line.trim();

    if (indent === 0) {
      section =
        trimmed === "importers:" || trimmed === "packages:" || trimmed === "snapshots:"
          ? trimmed.slice(0, -1)
          : null;
      importerPath = null;
      snapshotKey = null;
      depTarget = null;
      continue;
    }
    if (section === "importers" && indent === 2) {
      importerPath = trimmed.replace(/:$/, "");
      depTarget = null;
      continue;
    }
    if (section === "importers" && indent === 4) {
      if (trimmed === "dependencies:" || trimmed === "optionalDependencies:") {
        depTarget = new Map();
        importers.set(importerPath, depTarget);
      } else {
        depTarget = null;
      }
      continue;
    }
    if (section === "importers" && depTarget && indent === 6) {
      const match = /^(?:'([^']+)'|([^:]+)):$/.exec(trimmed);
      if (match) depTarget.set(match[1] ?? match[2], "");
      continue;
    }
    if (section === "importers" && depTarget && indent === 8 && trimmed.startsWith("version:")) {
      const name = [...depTarget.keys()].at(-1);
      depTarget.set(name, trimmed.slice("version:".length).trim());
      continue;
    }
    if ((section === "packages" || section === "snapshots") && indent === 2) {
      // Snapshot keys carry peer-suffix parens (`pkg@1.0.0(peer@2)`); collapse
      // every variant onto its base name@version.
      const key = trimmed.replace(/:$/, "").replace(/^'|'$/g, "").replace(/\(.*$/, "");
      const at = key.lastIndexOf("@");
      snapshotKey = at > 0 ? key : null;
      depTarget = null;
      continue;
    }
    if ((section === "packages" || section === "snapshots") && snapshotKey && indent === 4) {
      if (trimmed === "dependencies:" || trimmed === "optionalDependencies:") {
        depTarget = snapshots.get(snapshotKey) ?? new Map();
        snapshots.set(snapshotKey, depTarget);
      } else {
        depTarget = null;
      }
      continue;
    }
    if ((section === "packages" || section === "snapshots") && snapshotKey && depTarget && indent === 6) {
      const match = /^(?:'([^']+)'|([^:]+)):\s?(.*)$/.exec(trimmed);
      if (match) depTarget.set(match[1] ?? match[2], match[3]);
    }
  }
  return { importers, snapshots };
}

/** Walk importer `dependencies` (prod only) through snapshots to exact versions. */
export function productionClosure({ importers, snapshots }) {
  const closure = new Set();
  const queue = [];

  const visit = (name, value) => {
    const version = exactVersion(value);
    if (version === undefined) return; // workspace link — its importer is already a root
    const node = `${name}@${version}`;
    if (!closure.has(node)) {
      closure.add(node);
      queue.push(node);
    }
  };

  for (const deps of importers.values()) {
    for (const [name, value] of deps) visit(name, value);
  }
  while (queue.length > 0) {
    const deps = snapshots.get(queue.pop());
    if (!deps) continue;
    for (const [name, value] of deps) visit(name, value);
  }
  return [...closure];
}

function cvssBaseScore(entry) {
  const score = String(entry?.score ?? "").split("/")[0];
  const parsed = Number.parseFloat(score);
  return Number.isFinite(parsed) ? parsed : 0;
}

function severityOf(vuln) {
  const databaseSeverity = vuln.database_specific?.Severity ?? vuln.database_specific?.severity;
  if (typeof databaseSeverity === "string" && /high|critical/i.test(databaseSeverity)) {
    return databaseSeverity.toUpperCase();
  }
  const score = Math.max(0, ...(vuln.severity ?? []).map(cvssBaseScore));
  return score >= 9 ? "CRITICAL" : score >= 7 ? "HIGH" : undefined;
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) throw new Error(`${url} responded ${response.status}`);
  return response.json();
}

async function main() {
  const lockfile = parseLockfile(readFileSync(LOCKFILE, "utf8"));
  const packages = productionClosure(lockfile);
  console.log(`auditing ${packages.length} production dependencies against OSV`);

  const queries = packages.map((key) => {
    const at = key.lastIndexOf("@");
    // OSV query schema: version is a sibling of package, not a field inside it.
    return {
      package: { name: key.slice(0, at), ecosystem: "npm" },
      version: key.slice(at + 1),
    };
  });

  const advisoryIds = new Set();
  for (let start = 0; start < queries.length; start += 500) {
    const body = JSON.stringify({ queries: queries.slice(start, start + 500) });
    const { results } = await fetchJson(OSV_QUERYBATCH, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    });
    for (const result of results ?? []) {
      for (const vuln of result.vulns ?? []) advisoryIds.add(vuln.id);
    }
  }

  const findings = [];
  for (const id of advisoryIds) {
    const vuln = await fetchJson(`${OSV_VULN}/${id}`);
    const severity = severityOf(vuln);
    if (severity !== undefined) findings.push({ id, severity, summary: vuln.summary ?? "" });
  }

  if (findings.length === 0) {
    console.log(`0 high/critical advisories across ${packages.length} production dependencies (via OSV)`);
    process.exit(0);
  }

  console.error(`Found ${findings.length} high/critical advisories in production dependencies:`);
  for (const finding of findings) {
    console.error(`  ${finding.id} [${finding.severity}] ${finding.summary}`);
  }
  process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}

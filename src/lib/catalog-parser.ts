// Parses a user-uploaded control catalog (YAML in the same shape as
// controls/catalog.yaml, or a flat CSV) into the normalized shape the
// dashboard renders. Uploaded catalogs are never written to the shared
// database — this is a single-tenant public demo, so persisting an upload
// would let one visitor overwrite what every other visitor sees. Parsing
// stays server-side (reuses the already-installed js-yaml) and the result
// is held in the browser for that session only.
import { load } from "js-yaml";

export interface NormalizedControl {
  id: string;
  name: string;
  description: string;
  category: string;
  nistCsf: string;
  iso27001: string;
  soc2: string;
  pciDss: string;
  euAiAct: string;
  owaspLlm: string;
}

export class CatalogParseError extends Error {}

const REQUIRED_CSV_COLUMNS = [
  "id",
  "name",
  "description",
  "category",
  "nist_csf",
  "iso27001",
  "soc2",
  "pci_dss",
] as const;

function normalizeRow(raw: Record<string, unknown>, rowLabel: string): NormalizedControl {
  const get = (key: string): string => {
    const value = raw[key];
    return value === undefined || value === null ? "" : String(value).trim();
  };

  const id = get("id");
  const name = get("name");
  if (!id) throw new CatalogParseError(`${rowLabel}: missing required field "id"`);
  if (!name) throw new CatalogParseError(`${rowLabel}: missing required field "name"`);

  return {
    id,
    name,
    description: get("description"),
    category: get("category") || "Uncategorized",
    nistCsf: get("nist_csf") || "N/A",
    iso27001: get("iso27001") || "N/A",
    soc2: get("soc2") || "N/A",
    pciDss: get("pci_dss") || "N/A",
    euAiAct: get("eu_ai_act") || "N/A",
    owaspLlm: get("owasp_llm") || "N/A",
  };
}

function parseCsv(text: string): NormalizedControl[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) {
    throw new CatalogParseError("CSV must have a header row and at least one data row");
  }
  const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
  for (const required of REQUIRED_CSV_COLUMNS) {
    if (!header.includes(required)) {
      throw new CatalogParseError(`CSV is missing required column "${required}"`);
    }
  }

  return lines.slice(1).map((line, i) => {
    const cells = line.split(",").map((c) => c.trim());
    const row: Record<string, string> = {};
    header.forEach((col, idx) => {
      row[col] = cells[idx] ?? "";
    });
    return normalizeRow(row, `Row ${i + 2}`);
  });
}

function parseYaml(text: string): NormalizedControl[] {
  const parsed = load(text);
  if (!Array.isArray(parsed)) {
    throw new CatalogParseError("YAML catalog must be a top-level list of controls");
  }
  return parsed.map((entry, i) => {
    if (typeof entry !== "object" || entry === null) {
      throw new CatalogParseError(`Entry ${i + 1}: expected an object`);
    }
    const e = entry as Record<string, unknown>;
    const mappings = (e.mappings as Record<string, unknown>) ?? {};
    return normalizeRow(
      {
        id: e.id,
        name: e.name,
        description: e.description,
        category: e.category,
        nist_csf: mappings.nist_csf,
        iso27001: mappings.iso27001,
        soc2: mappings.soc2,
        pci_dss: mappings.pci_dss,
        eu_ai_act: mappings.eu_ai_act,
        owasp_llm: mappings.owasp_llm,
      },
      `Entry ${i + 1}`
    );
  });
}

export function parseCatalog(text: string, filename: string): NormalizedControl[] {
  const isYaml = /\.ya?ml$/i.test(filename);
  const isCsv = /\.csv$/i.test(filename);
  if (!isYaml && !isCsv) {
    throw new CatalogParseError("Only .yaml, .yml, or .csv files are supported");
  }

  const entries = isYaml ? parseYaml(text) : parseCsv(text);
  if (entries.length === 0) {
    throw new CatalogParseError("Catalog contained no controls");
  }

  const seenIds = new Set<string>();
  for (const entry of entries) {
    if (seenIds.has(entry.id)) {
      throw new CatalogParseError(`Duplicate control id "${entry.id}"`);
    }
    seenIds.add(entry.id);
  }

  return entries;
}

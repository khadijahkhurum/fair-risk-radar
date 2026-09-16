import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export interface ReportInput {
  scenarioLabel: string;
  threat: string;
  sourceCitation: string;
  toleranceUsd: number;
  controlCoverage: { name: string; coveragePct: number; source: string; mappings: Record<string, string> }[];
  assessment: {
    trials: number;
    expectedAnnualLoss: number;
    p50: number;
    p95: number;
    p99: number;
    lossEventFrequency: number;
    createdAt: string;
  };
}

const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

export function buildCsv(input: ReportInput): string {
  const lines: string[] = [];
  lines.push("FAIR Risk Radar — Audit Evidence Export");
  lines.push(`Scenario,${input.scenarioLabel}`);
  lines.push(`Threat,${input.threat}`);
  lines.push(`Loss data source,${input.sourceCitation}`);
  lines.push(`Tolerance (USD/yr),${input.toleranceUsd}`);
  lines.push(`Assessment date,${input.assessment.createdAt}`);
  lines.push(`Monte Carlo trials,${input.assessment.trials}`);
  lines.push("");
  lines.push("Metric,Value");
  lines.push(`Expected annual loss,${usd(input.assessment.expectedAnnualLoss)}`);
  lines.push(`Median annual loss (P50),${usd(input.assessment.p50)}`);
  lines.push(`Value at risk (P95),${usd(input.assessment.p95)}`);
  lines.push(`Value at risk (P99),${usd(input.assessment.p99)}`);
  lines.push(`Loss event frequency (events/yr),${input.assessment.lossEventFrequency.toFixed(2)}`);
  lines.push("");
  lines.push("Control,Coverage %,Source,NIST CSF 2.0,ISO 27001:2022,SOC 2,PCI DSS v4.0");
  for (const c of input.controlCoverage) {
    lines.push(
      [
        c.name,
        c.coveragePct.toFixed(0),
        c.source,
        c.mappings["NIST CSF 2.0"] ?? "",
        c.mappings["ISO 27001:2022"] ?? "",
        c.mappings["SOC 2"] ?? "",
        c.mappings["PCI DSS v4.0"] ?? "",
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(",")
    );
  }
  return lines.join("\n");
}

export async function buildPdf(input: ReportInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]); // US Letter
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  let y = 740;
  const left = 56;
  const ink = rgb(0.11, 0.1, 0.09);
  const muted = rgb(0.42, 0.4, 0.35);
  const gold = rgb(0.54, 0.39, 0.08);

  function line(text: string, opts: { size?: number; f?: typeof font; color?: typeof ink; gap?: number } = {}) {
    const { size = 11, f = font, color = ink, gap = 16 } = opts;
    page.drawText(text, { x: left, y, size, font: f, color });
    y -= gap;
  }

  line("FAIR Risk Radar", { size: 20, f: bold, color: gold, gap: 24 });
  line("Audit evidence export", { size: 12, color: muted, gap: 22 });

  line(`Scenario: ${input.scenarioLabel}`, { f: bold });
  line(`Threat: ${input.threat}`, { color: muted });
  line(`Assessed: ${new Date(input.assessment.createdAt).toISOString()}`, { color: muted, gap: 22 });

  line("Expected annual loss", { f: bold, gap: 14 });
  line(usd(input.assessment.expectedAnnualLoss), { size: 16, f: bold, color: gold, gap: 22 });

  line(
    `P50: ${usd(input.assessment.p50)}   ·   P95: ${usd(input.assessment.p95)}   ·   P99: ${usd(
      input.assessment.p99
    )}`,
    { gap: 16 }
  );
  line(`Loss event frequency: ${input.assessment.lossEventFrequency.toFixed(2)} events/yr`, { gap: 16 });
  line(`Tolerance ceiling: ${usd(input.toleranceUsd)}/yr`, { gap: 16 });
  line(`Monte Carlo trials: ${input.assessment.trials.toLocaleString()}`, { gap: 24 });

  line("Control coverage at time of assessment", { f: bold, gap: 16 });
  for (const c of input.controlCoverage) {
    line(`${c.name} — ${c.coveragePct.toFixed(0)}% (source: ${c.source})`, { size: 10, gap: 13 });
    line(
      `  NIST CSF 2.0: ${c.mappings["NIST CSF 2.0"] ?? "—"}   ISO 27001:2022: ${
        c.mappings["ISO 27001:2022"] ?? "—"
      }`,
      { size: 9, color: muted, gap: 13 }
    );
    line(`  SOC 2: ${c.mappings["SOC 2"] ?? "—"}   PCI DSS v4.0: ${c.mappings["PCI DSS v4.0"] ?? "—"}`, {
      size: 9,
      color: muted,
      gap: 18,
    });
  }

  y -= 6;
  line(`Loss data: ${input.sourceCitation}.`, { size: 8.5, color: muted, gap: 12 });
  line(
    "Threat event frequency and vulnerability baseline are modeled assumptions, not published data — see the app's methodology panel.",
    { size: 8.5, color: muted, gap: 12 }
  );

  return doc.save();
}

import type { Triangular } from "./fair";

export interface ControlPayload {
  key: string;
  name: string;
  weight: number;
  description: string;
  mappings: Record<string, string>;
  coveragePct: number;
  source: string; // "manual" | "aws-config" | "demo"
}

export interface AssessmentPayload {
  id: string;
  trials: number;
  expectedAnnualLoss: number;
  p50: number;
  p95: number;
  p99: number;
  lossEventFrequency: number;
  controlSnapshot: Record<string, number>;
  createdAt: string;
}

export interface ScenarioPayload {
  key: string;
  label: string;
  threat: string;
  sourceCitation: string;
  toleranceUsd: number;
  tef: Triangular;
  vulnBaseline: Triangular;
  secProb: Triangular;
  lossPrimary: Triangular;
  lossSecondary: Triangular;
  controls: ControlPayload[];
  latestAssessment: AssessmentPayload | null;
}

export interface SensitivityRow {
  name: string;
  low: number;
  high: number;
  range: number;
}

export interface CurvePoint {
  x: number;
  y: number;
}

export interface HistogramBin {
  start: number;
  count: number;
}

export interface RunResult {
  assessment: AssessmentPayload;
  curve: CurvePoint[];
  histogram: HistogramBin[];
  coverage: number;
  sensitivity: SensitivityRow[] | null;
}

import type { FairProfile, Triangular } from "./fair";

/**
 * Industry loss profiles.
 *
 * lossPrimary/lossSecondary are SOURCED: calibrated to IBM's 2025 Cost of a
 * Data Breach Report industry averages (Figure 3), split into primary vs.
 * secondary using the report's own global cost-category breakdown.
 *
 * tef, vulnBaseline, secProb are MODELED: not published at this granularity
 * anywhere, so they're explicit assumptions meant to be recalibrated against
 * your own telemetry (see README § Methodology). The min/max spread around
 * each sourced loss figure is also modeled, since IBM publishes the mean only.
 */

const GLOBAL_TOTAL = 4_440_000;
const GLOBAL_SECONDARY = 1_380_000 + 1_200_000 + 390_000; // lost business + post-breach response + notification
const SECONDARY_FRACTION = GLOBAL_SECONDARY / GLOBAL_TOTAL; // ~0.67
const PRIMARY_FRACTION = 1 - SECONDARY_FRACTION; // ~0.33

function scale(mode: number, low: number, high: number): Triangular {
  return { min: mode * low, mode, max: mode * high };
}

function splitLoss(industryAverage: number) {
  return {
    lossPrimary: scale(industryAverage * PRIMARY_FRACTION, 0.4, 2.4),
    lossSecondary: scale(industryAverage * SECONDARY_FRACTION, 0.4, 2.4),
  };
}

export interface ScenarioDefinition {
  key: string;
  label: string;
  threat: string;
  sourceCitation: string;
  toleranceUsd: number;
  profile: FairProfile;
}

export const SCENARIO_DEFINITIONS: ScenarioDefinition[] = [
  {
    key: "healthcare",
    label: "Healthcare — $7.42M avg breach cost",
    threat: "Encrypt-and-extort against clinical and patient-record systems",
    sourceCitation: "IBM Cost of a Data Breach Report 2025, Figure 3",
    toleranceUsd: 3_500_000,
    profile: {
      tef: { min: 6, mode: 15, max: 32 },
      vulnBaseline: { min: 0.1, mode: 0.32, max: 0.6 },
      secProb: { min: 0.55, mode: 0.8, max: 0.95 },
      ...splitLoss(7_420_000),
    },
  },
  {
    key: "financial",
    label: "Financial services — $5.56M avg breach cost",
    threat: "Third-party processor compromise exposing account data",
    sourceCitation: "IBM Cost of a Data Breach Report 2025, Figure 3",
    toleranceUsd: 2_800_000,
    profile: {
      tef: { min: 6, mode: 14, max: 30 },
      vulnBaseline: { min: 0.08, mode: 0.27, max: 0.55 },
      secProb: { min: 0.55, mode: 0.78, max: 0.95 },
      ...splitLoss(5_560_000),
    },
  },
  {
    key: "technology",
    label: "Technology — $4.79M avg breach cost",
    threat: "Cloud misconfiguration exposing customer data",
    sourceCitation: "IBM Cost of a Data Breach Report 2025, Figure 3",
    toleranceUsd: 2_400_000,
    profile: {
      tef: { min: 5, mode: 12, max: 26 },
      vulnBaseline: { min: 0.09, mode: 0.28, max: 0.55 },
      secProb: { min: 0.5, mode: 0.75, max: 0.93 },
      ...splitLoss(4_790_000),
    },
  },
  {
    key: "retail",
    label: "Retail — $3.54M avg breach cost",
    threat: "Point-of-sale / e-commerce credential compromise",
    sourceCitation: "IBM Cost of a Data Breach Report 2025, Figure 3",
    toleranceUsd: 1_800_000,
    profile: {
      tef: { min: 4, mode: 10, max: 22 },
      vulnBaseline: { min: 0.08, mode: 0.26, max: 0.52 },
      secProb: { min: 0.5, mode: 0.73, max: 0.92 },
      ...splitLoss(3_540_000),
    },
  },
  {
    key: "public",
    label: "Public sector — $2.86M avg breach cost",
    threat: "Phishing-driven access into constituent-data systems",
    sourceCitation: "IBM Cost of a Data Breach Report 2025, Figure 3",
    toleranceUsd: 1_400_000,
    profile: {
      tef: { min: 4, mode: 9, max: 20 },
      vulnBaseline: { min: 0.08, mode: 0.25, max: 0.5 },
      secProb: { min: 0.45, mode: 0.7, max: 0.9 },
      ...splitLoss(2_860_000),
    },
  },
];

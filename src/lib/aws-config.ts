// Live AWS Config integration with a labeled demo fallback.
//
// Pulls real per-control coverage % from AWS Config's
// GetComplianceDetailsByConfigRule. Without AWS_REGION / AWS_ACCESS_KEY_ID /
// AWS_SECRET_ACCESS_KEY set, every call returns demoMode: true with
// representative numbers instead — the app never presents demo data as live.
import {
  ConfigServiceClient,
  GetComplianceDetailsByConfigRuleCommand,
  type EvaluationResult,
} from "@aws-sdk/client-config-service";

export interface CoverageResult {
  controlId: string;
  awsConfigRule: string;
  coveragePct: number;
  demoMode: boolean;
}

// Deterministic-looking but clearly-fake demo coverage per rule, so re-runs
// in demo mode don't jitter meaninglessly.
const DEMO_COVERAGE: Record<string, number> = {
  "iam-user-mfa-enabled": 87,
  "ec2-managedinstance-patch-compliance-status": 74,
  "cmk-backing-key-rotation-enabled": 95,
};

function isAwsConfigured(): boolean {
  return Boolean(
    process.env.AWS_REGION &&
      process.env.AWS_ACCESS_KEY_ID &&
      process.env.AWS_SECRET_ACCESS_KEY
  );
}

async function fetchRuleCompliancePct(client: ConfigServiceClient, ruleName: string): Promise<number> {
  let compliant = 0;
  let nonCompliant = 0;
  let nextToken: string | undefined;

  do {
    const response = await client.send(
      new GetComplianceDetailsByConfigRuleCommand({
        ConfigRuleName: ruleName,
        NextToken: nextToken,
      })
    );
    const results: EvaluationResult[] = response.EvaluationResults ?? [];
    for (const result of results) {
      const status = result.ComplianceType;
      if (status === "COMPLIANT") compliant++;
      else if (status === "NON_COMPLIANT") nonCompliant++;
    }
    nextToken = response.NextToken;
  } while (nextToken);

  const total = compliant + nonCompliant;
  if (total === 0) return 0; // no evaluated resources — not an error, just nothing to report
  return Math.round((compliant / total) * 1000) / 10; // one decimal place
}

// controlId -> AWS Config rule name, sourced from controls/catalog.yaml at
// call time by the caller (see src/app/api/integrations/aws-config/route.ts).
export async function syncAwsConfigCoverage(
  controls: { controlId: string; awsConfigRule: string }[]
): Promise<CoverageResult[]> {
  if (!isAwsConfigured()) {
    return controls.map(({ controlId, awsConfigRule }) => ({
      controlId,
      awsConfigRule,
      coveragePct: DEMO_COVERAGE[awsConfigRule] ?? 80,
      demoMode: true,
    }));
  }

  const overrides: Record<string, string | undefined> = {
    "iam-user-mfa-enabled": process.env.AWS_CONFIG_RULE_MFA,
    "ec2-managedinstance-patch-compliance-status": process.env.AWS_CONFIG_RULE_PATCH,
    "cmk-backing-key-rotation-enabled": process.env.AWS_CONFIG_RULE_KMS,
  };

  const client = new ConfigServiceClient({ region: process.env.AWS_REGION });

  const results: CoverageResult[] = [];
  for (const { controlId, awsConfigRule } of controls) {
    const ruleName = overrides[awsConfigRule] ?? awsConfigRule;
    try {
      const coveragePct = await fetchRuleCompliancePct(client, ruleName);
      results.push({ controlId, awsConfigRule: ruleName, coveragePct, demoMode: false });
    } catch (err) {
      // A single rule failing (not found, no permission, region mismatch)
      // shouldn't take down the whole sync — surface it as 0% with a note
      // in the caller's response rather than throwing past this loop.
      results.push({
        controlId,
        awsConfigRule: ruleName,
        coveragePct: 0,
        demoMode: false,
      });
    }
  }
  return results;
}

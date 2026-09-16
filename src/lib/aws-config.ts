/**
 * Live control-coverage sync from AWS Config.
 *
 * This is a real integration, not a mock with a nice name: it calls
 * GetComplianceDetailsByConfigRule, pages through every evaluation result for
 * the rule, and computes the coverage percentage as
 * (COMPLIANT resources) / (COMPLIANT + NON_COMPLIANT resources).
 * DescribeComplianceByConfigRule was deliberately not used instead — it only
 * returns a rule's overall COMPLIANT/NON_COMPLIANT status, not a resource-level
 * percentage, which is what the FAIR model's coverage sliders actually need.
 *
 * If DATABASE credentials for AWS aren't configured, fetchAwsControlCoverage()
 * returns null and the API route falls back to labeled demo data — the app
 * never silently pretends demo numbers are live.
 *
 * Required IAM permissions (read-only):
 *   config:GetComplianceDetailsByConfigRule
 */
import {
  ConfigServiceClient,
  GetComplianceDetailsByConfigRuleCommand,
  ComplianceType,
} from "@aws-sdk/client-config-service";

export type ControlKey = "mfa" | "patch" | "kms";

const DEFAULT_RULES: Record<ControlKey, string> = {
  mfa: "iam-user-mfa-enabled",
  patch: "ec2-managedinstance-patch-compliance-status",
  kms: "cmk-backing-key-rotation-enabled",
};

function ruleNameFor(control: ControlKey): string {
  const envKey = `AWS_CONFIG_RULE_${control.toUpperCase()}`;
  return process.env[envKey] || DEFAULT_RULES[control];
}

export function isAwsConfigured(): boolean {
  return Boolean(
    process.env.AWS_REGION && process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
  );
}

async function ruleCoveragePercent(client: ConfigServiceClient, ruleName: string): Promise<number | null> {
  let nextToken: string | undefined;
  let compliant = 0;
  let total = 0;

  do {
    const res = await client.send(
      new GetComplianceDetailsByConfigRuleCommand({
        ConfigRuleName: ruleName,
        NextToken: nextToken,
      })
    );
    for (const result of res.EvaluationResults ?? []) {
      const type = result.ComplianceType;
      if (type === ComplianceType.COMPLIANT || type === ComplianceType.NON_COMPLIANT) {
        total++;
        if (type === ComplianceType.COMPLIANT) compliant++;
      }
    }
    nextToken = res.NextToken;
  } while (nextToken);

  if (total === 0) return null; // rule exists but has no evaluated resources yet
  return (compliant / total) * 100;
}

/**
 * Returns coverage % per control from live AWS Config data, or null if AWS
 * credentials aren't configured (caller should fall back to demo/manual data).
 * A control whose rule has no evaluated resources yet comes back as null for
 * that key specifically, rather than silently defaulting to 0 or 100.
 */
export async function fetchAwsControlCoverage(): Promise<Record<ControlKey, number | null> | null> {
  if (!isAwsConfigured()) return null;

  const client = new ConfigServiceClient({
    region: process.env.AWS_REGION,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    },
  });

  const keys: ControlKey[] = ["mfa", "patch", "kms"];
  const entries = await Promise.all(
    keys.map(async (key) => {
      try {
        const pct = await ruleCoveragePercent(client, ruleNameFor(key));
        return [key, pct] as const;
      } catch (err) {
        // A single misnamed/missing rule shouldn't take down the whole sync.
        console.error(`AWS Config sync failed for control "${key}" (rule "${ruleNameFor(key)}"):`, err);
        return [key, null] as const;
      }
    })
  );

  return Object.fromEntries(entries) as Record<ControlKey, number | null>;
}

/** Representative fallback so the UI has something to show before AWS is connected. */
export const DEMO_COVERAGE: Record<ControlKey, number> = {
  mfa: 71,
  patch: 58,
  kms: 64,
};

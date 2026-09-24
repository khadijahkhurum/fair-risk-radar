// Demo evidence: the files the Evidence viewer shows on first load, and the
// files the AI reconciliation reads.
//
// This lives here rather than inside the seed script because the numbers in it
// are load-bearing. Each file is built so the reconciliation can be JUDGED
// rather than merely demonstrated: a reviewer clicking "Analyse" should be able
// to check the model's arithmetic by hand against the rows on screen. That
// means every file has to carry its own denominator — an export listing only
// the people who DID enrol can never substantiate a coverage percentage,
// however many rows it has.
//
// demo-evidence.test.ts asserts the ratios the comments below claim, so editing
// a row cannot quietly turn this documentation into fiction.

/**
 * A date this many days before the seed ran, as YYYY-MM-DD.
 *
 * The demo evidence turns on date arithmetic — a 90-day rotation interval, a
 * 30-day patching SLA — so hardcoded dates would quietly change what the files
 * MEAN as the calendar moves. A key that was comfortably inside its interval
 * when these were written crosses it a few weeks later, and a demo that shows
 * something different every month is not a demo. Offsets keep each file saying
 * the same thing whenever it is seeded.
 */
export function daysAgo(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

// One representative evidence file per control so the Evidence viewer isn't
// an empty box on first load — the same DEMO labeling as coverage above.
// Plain CSV text; parsedRows is derived from it below rather than hand-kept
// in sync as a second copy of the same data.
//
// These files are also what the AI reconciliation reads, and they are built so
// that the feature can be JUDGED rather than merely demonstrated. A reviewer
// clicking "Analyse" should be able to check the model's arithmetic by hand
// against the rows on screen, which means each file has to carry its own
// denominator — an export listing only the people who DID enrol can never
// substantiate a coverage percentage, however many rows it has.
//
// The set is deliberately mixed:
//
//   mfa-enforcement   CONTRADICTS its claim. 15 accounts, 4 with no MFA
//                     method — 73%, not the 87% claimed — and two of those
//                     four are privileged, which is what the control text
//                     specifically requires.
//   key-rotation      CONTRADICTS its claim on dates rather than a count: two
//                     of four keys are past their 90-day rotation interval,
//                     one of them by only five days, and every row is labelled
//                     "ok". Catching it means arithmetic, not keyword-spotting.
//   patch-management  AGREES with its claim: 11 of 15 compliant is 73.3%
//                     against 74% claimed. A tool that finds a problem in
//                     every document is not assessing anything, and this is
//                     the file that shows the difference. Note it is the SAME
//                     ratio as the MFA file — 11 of 15 — with the opposite
//                     verdict, because the claims differ. Whatever the model
//                     reports here, it is reporting on the comparison and not
//                     on the document.
//   access-review     A STALENESS gap: the review itself is sound, but it
//                     covers Q1 and the quarter is long past.
//
// The others are ordinary clean artifacts. Nothing here guarantees what a
// model will say — that is the nature of the feature, and why every finding
// is checked against the file before it is shown.
export function buildDemoEvidence(): Record<string, { filename: string; csv: string }> {
  return {
    // 15 accounts, 4 with mfa_method "none" — 11/15 = 73%, against 87% claimed.
    // Two of the four (dan, frank) are privileged, which the control text calls
    // out by name.
    "mfa-enforcement": {
      filename: "mfa-enrollment-export.csv",
      csv: [
        "account,account_type,mfa_method,enrolled_at,status",
        `alice@corp.com,privileged,WebAuthn,${daysAgo(253)},active`,
        `bob@corp.com,privileged,TOTP,${daysAgo(247)},active`,
        `carol@corp.com,standard,TOTP,${daysAgo(234)},active`,
        "dan@corp.com,privileged,none,,active",
        `erin@corp.com,standard,TOTP,${daysAgo(225)},active`,
        "frank@corp.com,privileged,none,,active",
        `grace@corp.com,standard,WebAuthn,${daysAgo(207)},active`,
        `heidi@corp.com,standard,TOTP,${daysAgo(204)},active`,
        "ivan@corp.com,standard,none,,active",
        `judy@corp.com,standard,TOTP,${daysAgo(189)},active`,
        `ken@corp.com,privileged,TOTP,${daysAgo(175)},active`,
        "laura@corp.com,standard,none,,active",
        `mallory@corp.com,standard,TOTP,${daysAgo(155)},active`,
        `niaj@corp.com,standard,WebAuthn,${daysAgo(141)},active`,
        `olivia@corp.com,standard,TOTP,${daysAgo(129)},active`,
      ].join("\n"),
    },
    // 11 of 15 compliant = 73.3%, against 74% claimed. This one AGREES, and it
    // is here so the feature has something to be right about in both directions.
    "patch-management": {
      filename: "patch-compliance-report.csv",
      csv: [
        "host,os,last_patched,sla_days,status",
        `web-01,Ubuntu 22.04,${daysAgo(8)},30,compliant`,
        `web-02,Ubuntu 22.04,${daysAgo(8)},30,compliant`,
        `web-03,Ubuntu 22.04,${daysAgo(8)},30,compliant`,
        `app-01,Ubuntu 22.04,${daysAgo(5)},30,compliant`,
        `app-02,Ubuntu 22.04,${daysAgo(5)},30,compliant`,
        `app-03,Ubuntu 22.04,${daysAgo(84)},30,overdue`,
        `db-01,RHEL 9,${daysAgo(14)},30,compliant`,
        `db-02,RHEL 9,${daysAgo(14)},30,compliant`,
        `db-03,RHEL 9,${daysAgo(98)},30,overdue`,
        `cache-01,Ubuntu 22.04,${daysAgo(3)},30,compliant`,
        `cache-02,Ubuntu 22.04,${daysAgo(3)},30,compliant`,
        `queue-01,Ubuntu 22.04,${daysAgo(19)},30,compliant`,
        `build-01,Ubuntu 22.04,${daysAgo(117)},30,overdue`,
        `jump-01,RHEL 9,${daysAgo(11)},30,compliant`,
        `legacy-01,CentOS 7,${daysAgo(166)},30,overdue`,
      ].join("\n"),
    },
    // Two of four keys are past their 90-day interval — 50%, against 95%
    // claimed. One is 260 days old and obvious; the other is 95 days old, five
    // days over, and is the interesting one. Neither is labelled: every status
    // column says "ok", because a real export reports what the system believes
    // rather than what an auditor would conclude. Finding these means doing
    // arithmetic on dates, not pattern-matching the word "overdue".
    "key-rotation": {
      filename: "kms-key-rotation-log.csv",
      csv: [
        "key_id,purpose,last_rotated,rotation_interval_days,status",
        `kms-prod-primary,database encryption,${daysAgo(45)},90,ok`,
        `kms-prod-backup,backup encryption,${daysAgo(95)},90,ok`,
        `kms-prod-archive,long-term archive,${daysAgo(260)},90,ok`,
        `kms-staging,non-production,${daysAgo(20)},90,ok`,
      ].join("\n"),
    },
    // Sound as far as it goes, and out of date: every row was reviewed in Q1.
    "access-review": {
      filename: "quarterly-access-review.csv",
      csv: [
        "user,system,access_level,reviewed_by,review_date,decision",
        `dave@corp.com,prod-db,read-write,security-team,${daysAgo(182)},retained`,
        `eve@corp.com,prod-db,read-only,security-team,${daysAgo(182)},revoked`,
        `frank@corp.com,prod-db,read-write,security-team,${daysAgo(182)},retained`,
        `grace@corp.com,billing,read-only,finance-lead,${daysAgo(181)},retained`,
        `heidi@corp.com,billing,admin,finance-lead,${daysAgo(181)},downgraded`,
        `ivan@corp.com,crm,read-write,sales-lead,${daysAgo(181)},retained`,
      ].join("\n"),
    },
    "logging-monitoring": {
      filename: "siem-coverage-summary.csv",
      csv: "source,ingested,alert_rules\naws-cloudtrail,yes,12\nvpc-flow-logs,yes,6\napp-audit-log,yes,9",
    },
    "vendor-risk-assessment": {
      filename: "vendor-risk-register.csv",
      csv: "vendor,data_access,last_assessed,risk_rating\nStripe,payment data,2026-05-01,Low\nSendGrid,email metadata,2026-04-10,Low\nAcmeAnalytics,usage data,2026-03-02,Moderate",
    },
    "incident-response-plan": {
      filename: "ir-tabletop-test-log.csv",
      csv: "date,scenario,participants,outcome\n2026-06-12,Ransomware tabletop,8,Playbook updated\n2026-02-20,Data exfil tabletop,6,No gaps found",
    },
    "data-encryption-at-rest": {
      filename: "encryption-at-rest-audit.csv",
      csv: "resource,encryption,algorithm\nprod-rds,enabled,AES-256\nprod-s3-primary,enabled,AES-256\nbackups-s3,enabled,AES-256",
    },
  };
}

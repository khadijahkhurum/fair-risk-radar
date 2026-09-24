// Methodology — what the model does, what it assumes, and how to drive it.
//
// A quantitative risk tool that will not show its working is just a dashboard
// with bigger numbers. This page states the model, the constants, and the
// limits plainly enough that someone can disagree with it specifically.
//
// The constants are IMPORTED, not retyped, so the documentation cannot drift
// away from the engine it describes.
import { AppShell } from "@/components/AppShell";
import { DEFAULT_TRIALS, WHATIF_TRIALS, LEC_POINTS, MAX_CONTROL_RISK_REDUCTION } from "@/lib/fair";
// E3: threshold and trial counts come from the modules the engine uses, so
// this page cannot document a number the simulation is not running.
import { GREEN_THRESHOLD as TARGET_EXCEED_PROBABILITY } from "@/lib/stats";
// G9: the provenance register is data, so this page cannot drift from it.
import { PARAMETER_PROVENANCE, BASIS_LABEL, provenanceSummary } from "@/lib/provenance";
// G8: the retention schedule is data, so the page and the policy agree.
import { RETENTION_SCHEDULE } from "@/lib/risk-governance";
import { StatusBadge } from "@/components/StatusBadge";
import { DEFAULT_PREMIUM_LOADING } from "@/lib/insurance";
import { frameworks } from "@/lib/frameworks";

export const metadata = {
  title: "Methodology · FAIR Risk Radar",
  description: "The FAIR model, Monte Carlo engine, assumptions and limitations behind FAIR Risk Radar.",
};


function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="rounded-xl border border-border bg-surface p-6 mb-6 scroll-mt-6">
      <h2 className="text-lg font-semibold text-slate-100 mb-3">{title}</h2>
      <div className="space-y-3 text-sm text-slate-400 leading-relaxed">{children}</div>
    </section>
  );
}

function Term({ children }: { children: React.ReactNode }) {
  return <span className="font-mono text-[13px] text-accent2">{children}</span>;
}

export default function MethodologyPage() {
  const summary = provenanceSummary();
  return (
    <AppShell>
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Methodology</h1>
        <p className="text-slate-400 mt-1">
          What the model is, what it assumes, and where it stops being trustworthy. Read this before quoting any number
          from this tool in a decision.
        </p>
      </header>

      <nav className="rounded-xl border border-border bg-surface p-4 mb-6 text-sm">
        <span className="text-xs font-medium text-slate-500 block mb-2">On this page</span>
        <div className="flex flex-wrap gap-x-5 gap-y-1.5">
          {[
            ["problem", "The problem"],
            ["model", "The FAIR model"],
            ["engine", "Monte Carlo engine"],
            ["controls", "Controls and coverage"],
            ["scope", "Framework coverage"],
            ["lec", "Reading the curve"],
            ["tolerance", "Tolerance and the bar"],
            ["roi", "Cost-benefit"],
            ["transfer", "Risk transfer"],
            ["provenance", "Data provenance"],
            ["provenance-table", "Parameter provenance"],
            ["governance", "Model governance"],
            ["retention", "Retention and erasure"],
            ["ai", "AI assistance"],
            ["validation", "Validation evidence"],
            ["limits", "Assumptions and limits"],
            ["howto", "How to use it"],
            ["sources", "Sources"],
          ].map(([id, label]) => (
            <a key={id} href={`#${id}`} className="text-slate-400 hover:text-accent2">
              {label}
            </a>
          ))}
        </div>
      </nav>

      <Section id="problem" title="The problem this exists to solve">
        <p>
          Most risk registers are qualitative: a risk is &ldquo;High&rdquo;, a control is &ldquo;Amber&rdquo;, and a
          heat map turns that into colour. Those labels cannot be added up, cannot be compared against a budget, and
          cannot answer the only question an executive actually asks — <em>how much, and is fixing it worth it?</em>
        </p>
        <p>
          FAIR (Factor Analysis of Information Risk) replaces the adjectives with distributions. Instead of
          &ldquo;High&rdquo;, you get &ldquo;a 90th-percentile year costs $14.2M, and we breach our $5M appetite 32% of
          the time.&rdquo; That is a sentence you can budget against.
        </p>
      </Section>

      <Section id="model" title="The FAIR model">
        <p>Risk decomposes into how often you get hit, and how much it costs when you do.</p>
        <ul className="list-disc pl-5 space-y-1.5">
          <li>
            <Term>Threat Event Frequency (TEF)</Term> — how many times per year a threat actor attempts something
            relevant. Sampled per year from a Poisson distribution.
          </li>
          <li>
            <Term>Vulnerability</Term> — the probability an attempt succeeds. Each attempt is an independent roll.
          </li>
          <li>
            <Term>Loss Event Frequency</Term> — the attempts that actually land. Not an input; it falls out of the two
            above.
          </li>
          <li>
            <Term>Primary Loss</Term> — direct cost of a loss event: response, forensics, restoration, downtime.
            Applies every time.
          </li>
          <li>
            <Term>Secondary Loss</Term> — fallout from other parties: fines, legal, churn, reputational damage. Only
            materialises a fraction of the time, so it is modelled with its own probability and its own magnitude
            range.
          </li>
        </ul>
        <p>
          Splitting primary from secondary matters. A single flat &ldquo;impact&rdquo; range hides the fat tail, and
          the fat tail is the entire reason anyone buys insurance.
        </p>
        <p>
          Each selected threat is simulated as its <strong>own independent threat community</strong> with its own event
          stream, and their losses are summed per year. Selecting no threats falls back to the scenario&apos;s
          unmodified baseline.
        </p>
      </Section>

      <Section id="engine" title="The Monte Carlo engine">
        <p>
          There is no closed-form answer here, so the engine simulates{" "}
          <Term>{DEFAULT_TRIALS.toLocaleString()}</Term> independent years per run ({WHATIF_TRIALS.toLocaleString()} for
          live what-if dragging, where responsiveness beats the last decimal place). For each simulated year it samples
          a threat-event count, rolls each event against vulnerability, and sums the magnitude of the events that land.
        </p>
        <p>
          Loss magnitudes are sampled from <strong>triangular distributions</strong> defined by a minimum, most-likely
          and maximum value. Practitioners often prefer Beta-PERT for its smoother tails; triangular needs only three
          numbers a human can actually defend in a workshop, with no shape parameter to tune, and lands in the same
          order of magnitude. That is a deliberate trade of precision for defensibility.
        </p>
        <p>
          The sorted results give the mean, the 10th, 50th and 90th percentiles, a histogram, and a Loss Exceedance
          Curve sampled at <Term>{LEC_POINTS}</Term> points.
        </p>
        <p>
          <strong>Every run is seeded and reproducible.</strong> Each simulation draws from a seeded generator, and the
          seed is stored on the assessment alongside the engine version and parameter-set version. A persisted result
          can therefore be re-derived exactly — which is what an auditor means when they ask you to reproduce a number
          that went into a budget decision. An unseeded model can be right and still fail validation, because there is
          no evidence it was right at any specific point in time.
        </p>
        <p>
          <strong>Every figure carries its sampling error.</strong> The engine reports the standard error of the mean
          and of each exceedance probability, and the interface renders the interval rather than the point:{" "}
          <Term>57.0% ± 0.9pp</Term>, not <Term>56.65%</Term>. Printing four significant figures on an estimate with
          about one is the most corrosive thing a quantitative tool can do, because false precision is exactly what
          earns unwarranted trust.
        </p>
      </Section>

      <Section id="controls" title="Controls and coverage">
        <p>
          Control coverage reduces effective vulnerability linearly, capped at a{" "}
          <Term>{Math.round(MAX_CONTROL_RISK_REDUCTION * 100)}%</Term> reduction. At 100% nominal coverage, residual
          vulnerability is {Math.round((1 - MAX_CONTROL_RISK_REDUCTION) * 100)}% of the uncontrolled figure — never
          zero.
        </p>
        <p>
          That cap is the most opinionated assumption in the tool, and it is deliberate: perfectly implemented controls
          still fail. Fully patched estates get hit by zero-days; trained staff still get phished. A model that lets
          coverage drive risk to zero produces a business case for infinite security spend, which is how quantitative
          risk loses credibility.
        </p>
        <p>
          Coverage is stored <strong>per control</strong>, not per control-per-framework. Two frameworks mapping the
          same controls therefore share one <em>implementation</em> figure — that is the data model, not a bug. What
          differs between them is <em>scope</em>, because each framework has its own requirement population. The
          catalogue cross-maps to {frameworks.length} frameworks: {frameworks.map((f) => f.label).join(", ")}.
        </p>
      </Section>

      <Section id="scope" title="Framework coverage: scope, implementation, assessed">
        <p>
          A single percentage beside a framework&apos;s name is the most dangerous number a GRC tool can print. Read
          &ldquo;NIST CSF 2.0 — 57%&rdquo; and you will conclude the organisation meets 57% of NIST CSF. If that 57%
          is actually the mean implementation of a handful of mapped controls, the claim is wrong by more than an
          order of magnitude — and screenshotted into a board pack, a vendor questionnaire or an insurer&apos;s
          underwriting file, it stops being a technical problem.
        </p>
        <p>This tool therefore reports three separate figures and never collapses them:</p>
        <ul className="list-disc pl-5 space-y-1.5">
          <li>
            <Term>Scope</Term> — distinct requirement references this catalogue maps, divided by the framework&apos;s
            published requirement population.
          </li>
          <li>
            <Term>Implementation</Term> — mean coverage across the controls that are mapped. Says nothing about the
            requirements that are not.
          </li>
          <li>
            <Term>Assessed coverage</Term> — scope x implementation. The only one of the three that belongs beside a
            framework&apos;s name.
          </li>
        </ul>
        <p>
          The requirement populations are taken from each framework&apos;s published text:{" "}
          {frameworks
            .filter((f) => f.population !== null)
            .map((f) => `${f.label} (${f.approximate ? "~" : ""}${f.population} ${f.unit})`)
            .join(", ")}
          .
        </p>
        <p>
          The EU AI Act deliberately has <strong>no scope figure</strong>. Its obligations depend on a system&apos;s
          risk classification, so there is no single denominator to divide by. Inventing one to produce a tidy
          percentage would be the same error in the opposite direction, so the tool reports implementation for it and
          says scope is not quantified.
        </p>
        <p>
          PCI DSS is counted at <em>sub-requirement</em> level, which is the level this catalogue maps to. Counting
          its 12 principal requirements instead would flatter the scope figure roughly twenty-five-fold — an example
          of how much a denominator choice can move a compliance claim, and why the basis for each is stated rather
          than assumed.
        </p>
      </Section>

      <Section id="lec" title="Reading the Loss Exceedance Curve">
        <p>
          The LEC plots <Term>P(annual loss &gt; x)</Term> for every loss level x. Read it as: pick a dollar figure on
          the horizontal axis, and the curve gives the probability a year costs you more than that.
        </p>
        <p>
          It is the most useful chart in the tool because it answers threshold questions directly rather than through
          an average. An average annual loss of $2M tells you nothing about whether a $20M year is plausible; the curve
          does.
        </p>
        <p>
          <strong>One estimator, everywhere.</strong> Every probability in this tool — on screen, in the export and in
          the database — is the exact empirical fraction of the simulated sample, found by binary search. The curve
          above is built from that same function, so a point on the chart and the figure beside it cannot disagree.
          The {LEC_POINTS}-point grid is for drawing only; nothing is estimated from it.
        </p>
        <p>
          The same discipline makes <Term>P90</Term> and &ldquo;the tolerance that would be green&rdquo; the{" "}
          <em>same number</em> rather than two estimates of it: both are the 90th-percentile order statistic of the
          sample. Type the displayed P90 into the tolerance box and it lands on the 10% bar, by construction.
        </p>
      </Section>

      <Section id="tolerance" title="Risk tolerance and the 10% bar">
        <p>
          Risk tolerance is the annual loss you are willing to accept. The tool reports{" "}
          <Term>P(loss &gt; tolerance)</Term> and treats{" "}
          <Term>{(TARGET_EXCEED_PROBABILITY * 100).toFixed(0)}%</Term> as the pass mark: breaching your stated appetite
          in more than one year out of ten is not an appetite, it is a wish.
        </p>
        <p>
          That threshold is a convention chosen for this tool, not a standard. Organisations with real appetite
          statements should set it to whatever their board actually signed.
        </p>
      </Section>

      <Section id="roi" title="Cost-benefit and the shape of the cost curve">
        <p>
          The ROI page sweeps coverage from 0% to 100%, simulating each level, and compares avoided loss against
          control spend.
        </p>
        <p>
          Cost is modelled as scaling with the <strong>square</strong> of coverage, not linearly: early coverage is
          cheap and high-leverage (enforce MFA, patch the obvious), while closing the last gap costs
          disproportionately more. This is not a sourced budget curve — it is a shape. But the shape matters: a linear
          cost curve against a roughly linear risk-reduction curve can only ever optimise at 0% or 100%, never in
          between, which is a degenerate result rather than a trade-off.
        </p>
        <p>
          Returns are shown as a benefit-cost ratio (&ldquo;$87 avoided per $1 spent&rdquo;) rather than a percentage,
          because at realistic loss magnitudes a percentage runs into the thousands and reads as a broken calculation.
        </p>
      </Section>

      <Section id="transfer" title="Risk transfer">
        <p>
          FAIR has three levers: mitigate, accept, transfer. The Risk Transfer page prices an excess-of-loss cyber
          layer — you retain loss up to the attachment point, the policy pays the next slice up to its limit, and
          anything beyond that returns to you.
        </p>
        <p>
          Expected recovery uses the standard layer-pricing identity{" "}
          <Term>E[(L−A)⁺] = ∫ P(L &gt; x) dx</Term>, integrated over the existing curve — so pricing a layer costs no
          additional simulation. Post-transfer breach probability has a closed form: retained loss is monotonic in
          gross loss, so the tolerance maps back to a single gross level and is read straight off the curve.
        </p>
        <p>
          The indicative premium is expected payout loaded{" "}
          <Term>{DEFAULT_PREMIUM_LOADING}x</Term> for the insurer&apos;s capital, expenses and margin. That is a
          plausible mid-market figure for demonstration, <strong>not a quote</strong>; enter a real premium when you
          have one.
        </p>
      </Section>

      <Section id="provenance" title="Data provenance">
        <p>Every coverage figure carries a tag showing where it came from, because a number without a source is an opinion:</p>
        <ul className="list-disc pl-5 space-y-1.5">
          <li>
            <Term>DEMO</Term> — seeded sample data shipped with the tool.
          </li>
          <li>
            <Term>MANUAL</Term> — set by a person in the UI, with a timestamped audit record.
          </li>
          <li>
            <Term>AWS_CONFIG</Term> — pulled from an AWS Config rule evaluation.
          </li>
        </ul>
        <p>
          Coverage changes are appended, never overwritten, so the history of what was claimed and when survives. Every
          simulation run is likewise persisted as an audit trail entry.
        </p>
      </Section>

      <Section id="provenance-table" title="Parameter provenance">
        <p>
          Coverage figures in this tool carry a provenance tag because a number without a source is an opinion. The
          model&apos;s own parameters are held to the same standard here. The column that matters is <strong>basis</strong>:
          whether a value is taken from a publication, derived from one, or a judgement call with nothing behind it but
          reasoning.
        </p>
        <p className="text-slate-300">
          Of {summary.total} parameters: <strong>{summary.SOURCED}</strong> sourced,{" "}
          <strong>{summary.DERIVED}</strong> derived from a sourced figure, and{" "}
          <strong>{summary.JUDGEMENT}</strong> unsourced judgement. That last number is the honest headline — most of
          what drives the frequency side of this model is assumption, and the table says which.
        </p>
        <div className="overflow-x-auto -mx-1">
          <table className="w-full text-[13px] border-collapse">
            <caption className="sr-only">
              Model parameters with their value, evidential basis, source, derivation and last review date
            </caption>
            <thead>
              <tr className="text-left text-slate-400 border-b border-border">
                <th scope="col" className="py-2 pr-3 font-medium">Parameter</th>
                <th scope="col" className="py-2 pr-3 font-medium">Value</th>
                <th scope="col" className="py-2 pr-3 font-medium">Basis</th>
                <th scope="col" className="py-2 pr-3 font-medium">Source</th>
                <th scope="col" className="py-2 pr-3 font-medium">Derivation</th>
                <th scope="col" className="py-2 font-medium">Reviewed</th>
              </tr>
            </thead>
            <tbody>
              {PARAMETER_PROVENANCE.map((row) => (
                <tr key={row.parameter} className="border-b border-white/5 align-top">
                  <th scope="row" className="py-2 pr-3 font-medium text-slate-200 text-left">
                    {row.parameter}
                  </th>
                  <td className="py-2 pr-3 font-mono text-[12px] text-slate-300">{row.value}</td>
                  <td className="py-2 pr-3">
                    <StatusBadge
                      status={row.basis === "SOURCED" ? "pass" : row.basis === "DERIVED" ? "neutral" : "warn"}
                    >
                      {BASIS_LABEL[row.basis]}
                    </StatusBadge>
                  </td>
                  <td className="py-2 pr-3 text-slate-400">{row.source}</td>
                  <td className="py-2 pr-3 text-slate-400">{row.derivation}</td>
                  <td className="py-2 text-slate-500 whitespace-nowrap">{row.lastReviewed}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>
          A judgement parameter is not a defect — every risk model has them. Presenting one as though it were sourced
          would be. If you are evaluating whether to rely on a figure from this tool, read the judgement rows first:
          they are where it could be most wrong.
        </p>
      </Section>

      <Section id="governance" title="Model governance">
        <p>
          A figure that goes into a budget decision has to be defensible at a specific point in time. That means an
          auditor can ask three questions and get answers: <em>which model produced this</em>, <em>can you produce it
          again</em>, and <em>who put their name to it</em>.
        </p>
        <ul className="list-disc pl-5 space-y-1.5">
          <li>
            <strong>Engine version.</strong> Every persisted assessment, audit event and export carries{" "}
            <Term>engineVersion</Term>, bumped whenever a change would move the numbers.
          </li>
          <li>
            <strong>Seed.</strong> Every run draws from a seeded generator and stores its <Term>seed</Term>. The same
            seed, engine version and trial count reproduce the figures exactly — not approximately.
          </li>
          <li>
            <strong>Parameter-set hash.</strong> The scenario loss distributions, threat multipliers and the control
            cap are hashed together into a short <Term>parameterSetHash</Term> stamped on every row. If that hash no
            longer matches the live one, the assessment is marked as no longer re-derivable rather than quietly
            recomputed against today&apos;s values. A hash cannot disagree with the data it was taken over, which is
            why this is used in place of a mutable parameter table: the parameters themselves are source code, already
            immutably versioned.
          </li>
          <li>
            <strong>Sign-off.</strong> An assessment is <Term>DRAFT</Term> until an administrator approves it. Three
            things block approval, and all three are enforced server-side: you cannot approve an assessment you ran
            yourself, you cannot approve one twice, and you cannot approve one whose parameters have moved since it
            ran. The approval is written into the hash-chained audit trail carrying the exact figures attested to, so
            it binds numbers rather than a row ID.
          </li>
        </ul>
        <p>
          What this deliberately does <strong>not</strong> do: recover superseded parameters. If the hash no longer
          matches, the tool says the assessment cannot be reproduced. That is a true and useful answer; silently
          producing a different number would not be.
        </p>
      </Section>

      <Section id="validation" title="Validation evidence">
        <p>
          Model validation asks whether there is evidence the model is right — not whether it looks right. Here is what
          has been tested, and, more importantly, what has not.
        </p>
        <p className="font-medium text-slate-200">What is evidenced by automated tests</p>
        <ul className="list-disc pl-5 space-y-1.5">
          <li>
            <strong>Reproducibility.</strong> The same seed reproduces a run exactly; different seeds differ by no more
            than the reported sampling error.
          </li>
          <li>
            <strong>Monotonicity.</strong> More control coverage never increases mean ALE. Adding a threat community
            never decreases threat event frequency. The loss exceedance curve never rises.
          </li>
          <li>
            <strong>Single estimator.</strong> The headline probability and the plotted curve come from one sorted
            sample via one function, so the chart cannot disagree with the number beside it. Typing the displayed P90
            into the tolerance box lands exactly on the 10% bar.
          </li>
          <li>
            <strong>Reported error is real.</strong> Standard errors are positive, shrink as the square root of the
            trial count, and match the closed binomial form for proportions. Displayed precision follows the standard
            error rather than the float.
          </li>
          <li>
            <strong>Generator quality.</strong> The seeded PRNG is uniform on [0, 1), matches the expected mean and
            variance, and shows no short cycle over a long stream.
          </li>
          <li>
            <strong>Insurance layer.</strong> Expected recovery matches the closed form for a uniform loss; a
            full-cover layer recovers the whole expected loss; transfer never helps below the attachment point.
          </li>
          <li>
            <strong>Tamper evidence.</strong> Altering, deleting or re-hashing any audit record breaks the chain at
            that record.
          </li>
          <li>
            <strong>Governance rules.</strong> The four approval refusals — not an approver, already approved, self
            approval, parameters moved — are each tested directly, including that seniority does not waive
            segregation of duties.
          </li>
        </ul>
        <p className="font-medium text-slate-200">What is NOT validated</p>
        <ul className="list-disc pl-5 space-y-1.5">
          <li>
            <strong>No back-testing against realised losses.</strong> Nothing here has been compared to what any
            organisation actually lost. The engine is verified to compute the model correctly; the model is not
            verified to describe reality.
          </li>
          <li>
            <strong>Threat event frequency and vulnerability are unsourced.</strong> They are stated modelling
            assumptions, not measurements, and they drive the frequency side of every figure.
          </li>
          <li>
            <strong>No independent review.</strong> There is no second party who has re-derived these results. The
            tests are written by the same author as the engine, which is verification, not validation.
          </li>
          <li>
            <strong>No benchmark comparison.</strong> The outputs have not been placed alongside another FAIR
            implementation on the same inputs.
          </li>
          <li>
            <strong>The 70% control cap is asserted, not derived.</strong> It is documented as an assumption, and it is
            inside the parameter hash so a change to it invalidates prior assessments — but nothing evidences the
            number itself.
          </li>
        </ul>
        <p>
          Under SR 11-7 or comparable expectations, that second list is the gap between this and a model a validation
          function would sign off. It is listed rather than omitted because a validation artefact that only records
          successes is not one.
        </p>
      </Section>

      <Section id="retention" title="Retention and erasure">
        <p>
          The audit trail is append-only and hash-chained, which is correct for integrity and sits in direct tension
          with erasure rights under GDPR Art. 17, the UK DPA and CCPA. A risk owner&apos;s name is personal data, and
          it used to be written into those immutable records.
        </p>
        <p>
          The resolution is not to weaken the trail. Names are held in one owner directory and referenced everywhere
          else by ID. Erasing a person tombstones that single row, which blanks the name across every risk and every
          historical record at once &mdash; without rewriting a single audit event, so the chain still verifies. The
          erasure is itself recorded as an <Term>ERASURE</Term> event naming who did it and how many risks were
          affected, and deliberately <em>not</em> naming the person, because writing the name into the permanent
          record as part of erasing it would defeat the purpose.
        </p>
        <div className="overflow-x-auto -mx-1">
          <table className="w-full text-[13px] border-collapse">
            <caption className="sr-only">Retention schedule by data type</caption>
            <thead>
              <tr className="text-left text-slate-400 border-b border-border">
                <th scope="col" className="py-2 pr-3 font-medium">Data</th>
                <th scope="col" className="py-2 pr-3 font-medium">Retention</th>
                <th scope="col" className="py-2 font-medium">Basis</th>
              </tr>
            </thead>
            <tbody>
              {RETENTION_SCHEDULE.map((rule) => (
                <tr key={rule.data} className="border-b border-white/5 align-top">
                  <th scope="row" className="py-2 pr-3 font-medium text-slate-200 text-left">
                    {rule.data}
                  </th>
                  <td className="py-2 pr-3 text-slate-300 whitespace-nowrap">{rule.period}</td>
                  <td className="py-2 text-slate-400">{rule.basis}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section id="ai" title="AI assistance">
        <p>
          One feature in this product uses a language model: it reads an uploaded evidence file and reports where it
          contradicts the coverage claimed for that control. It exists because reconciling two hundred rows of an
          access review against a percentage is tedious, and tedium is where real findings get missed.
        </p>
        <p className="font-medium text-slate-200">The constraint the design rests on</p>
        <p>
          <strong>The model never produces a number that enters the risk model.</strong> Everything else here is
          seeded, reproducible and parameter-hashed. A language model is none of those — ask it twice and you may get
          two answers, and no seed recovers the first. So it is confined to reading language and proposing findings.
          Coverage changes only when a control owner changes it, and every figure in the simulation is still derived
          deterministically.
        </p>
        <p className="font-medium text-slate-200">What this is not</p>
        <p>
          It is not an agent. It has no tools, no write access, no autonomy and no loop. It reads text and returns a
          fixed structure that a person reviews. The distinction matters because the risks people mean when they say
          &ldquo;agentic AI security&rdquo; largely do not apply to a model that cannot act.
        </p>
        <p className="font-medium text-slate-200">Controls, in the order they matter</p>
        <ul className="list-disc pl-5 space-y-1.5">
          <li>
            <strong>Capability restriction</strong> (<Term>ai-human-oversight</Term>). No code path exists from model
            output to a coverage change or any other state. A prompt injection that fully succeeds produces a wrong
            suggestion on screen that an analyst discards. This holds even when the prompt-level defences fail, which
            is what makes it a control rather than a hope.
          </li>
          <li>
            <strong>Output grounding</strong> (<Term>ai-output-grounding</Term>). Every finding must quote the evidence
            verbatim, and the quote is checked against the stored file before display. A model can assert anything; it
            cannot fabricate a string already present in a file we hold. Findings that fail are discarded, and the
            count is shown to the analyst — so &ldquo;3 findings, 2 discarded&rdquo; tells you how much to trust the 3.
          </li>
          <li>
            <strong>Injection containment</strong> (<Term>ai-prompt-injection-containment</Term>). Evidence is
            delimited, the file cannot close its own block, and the response is parsed into a fixed schema with
            unknown keys rejected — the same validator that guards every HTTP boundary, because model output reading
            user-uploaded text is attacker-influenced input.
          </li>
          <li>
            <strong>Traceability</strong> (<Term>ai-traceability</Term>). Every run writes a hash-chained{" "}
            <Term>AI_REVIEW</Term> event naming the requester, the pinned model, the prompt version and the
            kept/discarded counts. Reviews are stored, never recomputed, so a finding an analyst acted on last quarter
            still exists in the form they saw it.
          </li>
        </ul>
        <p className="font-medium text-slate-200">Accepted residual risk</p>
        <p>
          Prompt injection is present and not fully mitigable at the prompt layer; no delimiter survives a determined
          attacker. It is mitigated by capability restriction and output grounding rather than by clever instructions.
          The residual risk is an analyst spending time on a fabricated finding — made unlikely by the quote check,
          and made visible by the discard count and the audit trail. That risk is accepted, not eliminated, and saying
          otherwise would be the kind of claim this page exists to avoid.
        </p>
      </Section>

      <Section id="limits" title="Assumptions and limitations">
        <p>The honest list. Each of these is a real constraint on how far these numbers should be pushed:</p>
        <ul className="list-disc pl-5 space-y-1.5">
          <li>
            <strong>Loss ranges are estimates.</strong> Scenario defaults are anchored to published breach-cost
            research, not to your incident history. They are a starting point to be replaced.
          </li>
          <li>
            <strong>Threat communities are independent.</strong> Real incidents correlate — one intrusion triggers
            several loss categories at once. Independence understates the worst years.
          </li>
          <li>
            <strong>Controls are modelled as one blended coverage figure</strong>, not individually. A control that
            matters more than the others does not get more weight.
          </li>
          <li>
            <strong>Scope is measured by reference count, not by requirement weight.</strong> Mapping one NIST
            subcategory out of 106 counts as 1/106 of scope regardless of how central that subcategory is. A weighted
            model would be more accurate and much harder to defend, so the simple count is used and stated.
          </li>
          <li>
            <strong>The {Math.round(MAX_CONTROL_RISK_REDUCTION * 100)}% reduction cap is a judgement</strong>, chosen
            for defensibility rather than derived from data.
          </li>
          <li>
            <strong>The cost curve is a shape, not a budget.</strong> Real remediation costs are lumpy — licences,
            headcount, migrations — not a smooth quadratic.
          </li>
          <li>
            <strong>Monte Carlo output varies between runs</strong>, and the interface now shows that variation rather
            than hiding it. Points on the ROI sweep share one seed (common random numbers), so the noise largely
            cancels in the differences between coverage levels — the only quantity that curve is read for. What
            survives is reported as a <em>plateau</em>: a band of coverage levels statistically indistinguishable from
            the peak, rather than a single optimum implying a precision the sweep does not have.
          </li>
          <li>
            <strong>Separation tests are deliberately conservative.</strong> Where the tool compares two simulated
            figures, it treats them as independent when estimating the error on their difference. Under common random
            numbers they are positively correlated, so the true error is smaller and the tool will occasionally say
            &ldquo;not measurable&rdquo; about a real effect. For a risk tool, over-stating uncertainty is the safe
            direction to err.
          </li>
          <li>
            <strong>Nothing here is actuarial.</strong> The premium loading is illustrative. Use it to frame a
            conversation with a broker, not to replace one.
          </li>
        </ul>
        <p className="text-slate-300">
          The value of a quantitative model is not that it is right. It is that every assumption is written down and
          can be argued with specifically — which a colour-coded heat map cannot offer.
        </p>
      </Section>

      <Section id="howto" title="How to use it">
        <ol className="list-decimal pl-5 space-y-2">
          <li>
            <strong>Control Posture</strong> — set where you actually stand. Click any coverage percentage to override
            it, or drag a framework slider to shift everything mapped to that framework at once.
          </li>
          <li>
            <strong>Risk Simulator</strong> — pick a scenario and the threats in scope, set your risk tolerance, and
            run. Read the percentiles and the exceedance curve, then open the what-if panel to test what would change
            the verdict.
          </li>
          <li>
            <strong>Risk Register</strong> — record the risks formally, with inherent versus residual ratings and an
            owner. This is the artefact an auditor asks for.
          </li>
          <li>
            <strong>ROI Analysis</strong> — enter what full remediation would cost. The tool finds the coverage level
            where net benefit peaks and tells you the minimum coverage needed to get inside your appetite.
          </li>
          <li>
            <strong>Risk Transfer</strong> — where controls alone cannot get you green, price a layer and see whether
            transferring the tail closes the gap, and at what premium.
          </li>
          <li>
            <strong>Export</strong> — from the Control Posture page only. The CSV carries the control catalogue with
            its framework mappings and coverage provenance, plus the latest assessment&apos;s headline figures and its
            full model provenance (engine version, parameter-set hash, seed, trial count, sign-off status). The PDF
            carries the same, leading with a plain-language verdict and keeping the detail in an appendix.
            <span className="block text-slate-500 mt-1">
              What it does <em>not</em> yet include, stated because this page previously implied otherwise: the risk
              register, the loss exceedance curve, and per-run working. Export is also not available from the
              Dashboard, ROI or Risk Transfer pages.
            </span>
          </li>
        </ol>
      </Section>

      <Section id="sources" title="Sources and standards">
        <ul className="list-disc pl-5 space-y-1.5">
          <li>
            <strong>FAIR</strong> — The Open Group Risk Analysis (O-RA) standard, the taxonomy this engine implements.
          </li>
          <li>
            <strong>IBM Cost of a Data Breach Report</strong> — anchor for scenario loss magnitudes by sector.
          </li>
          <li>
            <strong>NIST CSF 2.0, ISO/IEC 27001:2022, SOC 2, PCI DSS v4.0, EU AI Act, OWASP LLM Top 10</strong> — the
            control cross-mapping targets.
          </li>
        </ul>
        <p className="text-xs text-slate-500">
          Scenario parameters are documented modelling assumptions anchored to published research, not measurements
          from any specific organisation.
        </p>
      </Section>
    </AppShell>
  );
}

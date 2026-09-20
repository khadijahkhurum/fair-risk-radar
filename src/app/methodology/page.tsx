// Methodology — what the model does, what it assumes, and how to drive it.
//
// A quantitative risk tool that will not show its working is just a dashboard
// with bigger numbers. This page states the model, the constants, and the
// limits plainly enough that someone can disagree with it specifically.
//
// The constants are IMPORTED, not retyped, so the documentation cannot drift
// away from the engine it describes.
import { AppShell } from "@/components/AppShell";
import { DEFAULT_TRIALS, LEC_POINTS, MAX_CONTROL_RISK_REDUCTION } from "@/lib/fair";
import { DEFAULT_PREMIUM_LOADING } from "@/lib/insurance";
import { frameworks } from "@/lib/frameworks";

export const metadata = {
  title: "Methodology · FAIR Risk Radar",
  description: "The FAIR model, Monte Carlo engine, assumptions and limitations behind FAIR Risk Radar.",
};

const TARGET_EXCEED_PROBABILITY = 0.1;
const WHATIF_TRIALS = 4000;

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
            ["lec", "Reading the curve"],
            ["tolerance", "Tolerance and the bar"],
            ["roi", "Cost-benefit"],
            ["transfer", "Risk transfer"],
            ["provenance", "Data provenance"],
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
          same controls therefore always show the same coverage — that is the data model, not a bug. Frameworks differ
          by <em>which</em> controls they demand, not by how well you run them. The catalogue cross-maps to{" "}
          {frameworks.length} frameworks: {frameworks.map((f) => f.label).join(", ")}.
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
          Values between the {LEC_POINTS} sampled points are linearly interpolated, and the inverse lookup (&ldquo;what
          tolerance would be green?&rdquo;) uses the same interpolation in reverse, so the two can never contradict
          each other at a boundary.
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
            <strong>The {Math.round(MAX_CONTROL_RISK_REDUCTION * 100)}% reduction cap is a judgement</strong>, chosen
            for defensibility rather than derived from data.
          </li>
          <li>
            <strong>The cost curve is a shape, not a budget.</strong> Real remediation costs are lumpy — licences,
            headcount, migrations — not a smooth quadratic.
          </li>
          <li>
            <strong>Monte Carlo output varies between runs.</strong> Each coverage point on the ROI sweep is an
            independent simulation, so adjacent points carry sampling noise. Read the trend, not a single point.
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
            <strong>Export</strong> — CSV for the working, PDF for the board pack. The PDF leads with a plain-language
            verdict and keeps the technical detail in an appendix.
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

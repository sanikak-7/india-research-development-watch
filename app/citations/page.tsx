import { ArrowLeft, ArrowUpRight, Database, Info, Sparkles } from "lucide-react";
import Link from "next/link";
import citationData from "../../public/data/india-citation-summary.json";
import styles from "./citations.module.css";

const annual = citationData.annual;
const fields = citationData.fields;
const totalPublications = citationData.validation.annual_publication_total;
const totalCitations = citationData.validation.annual_citation_total;
const peakTop10 = annual.reduce((best, row) =>
  row.top_10_percent_share > best.top_10_percent_share ? row : best
);
const maxAnnualCitations = Math.max(...annual.map(row => row.total_citations));
const maxFieldCitations = Math.max(...fields.map(field => field.total_citations));

const chartWidth = 920;
const chartHeight = 350;
const chartPadding = { top: 24, right: 24, bottom: 44, left: 70 };
const plotWidth = chartWidth - chartPadding.left - chartPadding.right;
const plotHeight = chartHeight - chartPadding.top - chartPadding.bottom;
const chartMaximum = Math.ceil(maxAnnualCitations / 1_000_000) * 1_000_000;
const xPosition = (index: number) => chartPadding.left + (index * plotWidth) / (annual.length - 1);
const yPosition = (value: number) => chartPadding.top + plotHeight - (value / chartMaximum) * plotHeight;
const linePath = annual.map((row, index) =>
  `${index === 0 ? "M" : "L"}${xPosition(index)},${yPosition(row.total_citations)}`
).join(" ");
const areaPath = `${linePath} L${xPosition(annual.length - 1)},${chartPadding.top + plotHeight} L${xPosition(0)},${chartPadding.top + plotHeight} Z`;
const yTicks = Array.from({ length: chartMaximum / 1_000_000 + 1 }, (_, index) => index * 1_000_000);

function formatNumber(value: number) {
  return value.toLocaleString("en-IN");
}

function compact(value: number) {
  return new Intl.NumberFormat("en-IN", {
    notation: "compact",
    maximumFractionDigits: 2
  }).format(value);
}

function percent(value: number, digits = 1) {
  return `${(value * 100).toFixed(digits)}%`;
}

function FieldRows({ start = 0, end = fields.length }: { start?: number; end?: number }) {
  return fields.slice(start, end).map((field, index) => (
    <li className={styles.fieldRow} key={field.field_id}>
      <span className={styles.rank}>{String(start + index + 1).padStart(2, "0")}</span>
      <div className={styles.fieldIdentity}>
        <div className={styles.fieldNameLine}>
          <strong>{field.field_name}</strong>
          <span>{percent(field.citation_share)}</span>
        </div>
        <div className={styles.track} aria-hidden="true">
          <i style={{ width: `${(field.total_citations / maxFieldCitations) * 100}%` }} />
        </div>
      </div>
      <div className={styles.fieldValue}>
        <strong>{compact(field.total_citations)}</strong>
        <span>{compact(field.publication_count)} works</span>
      </div>
    </li>
  ));
}

export default function CitationsPage() {
  return (
    <main className={styles.page}>
      <nav className={styles.nav} aria-label="Citations navigation">
        <Link href="/" className={styles.brand}>
          <span className={styles.brandMark}>IRW</span>
          <span>India Research Watch</span>
        </Link>
        <div className={styles.navMeta}>
          <span>OpenAlex snapshot</span>
          <Link href="/" className={styles.overviewLink}>
            Overview <ArrowUpRight size={14} />
          </Link>
        </div>
      </nav>

      <header className={styles.hero}>
        <div className={styles.heroCopy}>
          <div className={styles.eyebrow}><span /> Research impact · 2018–2025</div>
          <h1>How far does Indian research <em>travel?</em></h1>
          <p>
            A citation is one signal that an idea has entered another researcher&apos;s work.
            This view follows {compact(totalPublications)} India-affiliated publications and
            the {compact(totalCitations)} citations they have accumulated so far.
          </p>
        </div>
        <div className={styles.heroMetric}>
          <span>Recorded citations</span>
          <strong>{compact(totalCitations)}</strong>
          <p>Across eight publication cohorts</p>
          <div className={styles.metricRule}><i /></div>
          <small>Snapshot generated 21 October 2026</small>
        </div>
      </header>

      <section className={styles.statStrip} aria-label="Citation summary">
        <article>
          <span>Research outputs</span>
          <strong>{compact(totalPublications)}</strong>
          <small>articles, reviews and conference papers</small>
        </article>
        <article>
          <span>Mean citations</span>
          <strong>{(totalCitations / totalPublications).toFixed(1)}</strong>
          <small>per publication across the period</small>
        </article>
        <article>
          <span>Strongest top-10% share</span>
          <strong>{percent(peakTop10.top_10_percent_share)}</strong>
          <small>for the {peakTop10.year} publication cohort</small>
        </article>
        <article>
          <span>Leading field</span>
          <strong>{fields[0].field_name}</strong>
          <small>{compact(fields[0].total_citations)} citations</small>
        </article>
      </section>

      <section className={styles.cohortSection}>
        <div className={styles.sectionHeading}>
          <div>
            <span className={styles.kicker}>Citation maturity</span>
            <h2>Impact by publication year</h2>
          </div>
          <p>
            These are citations received by papers published in each year—not citations made
            during that year. Newer papers have had less time to accumulate references.
          </p>
        </div>

        <div className={styles.chartPanel}>
          <div className={styles.chartLegend}>
            <span><i /> Total citations</span>
            <b>Peak cohort: 2020 · {compact(annual[2].total_citations)}</b>
          </div>
          <div className={styles.chartScroller}>
            <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} role="img" aria-labelledby="citation-chart-title citation-chart-desc">
              <title id="citation-chart-title">Citations received by India-affiliated publications, grouped by publication year</title>
              <desc id="citation-chart-desc">Citation totals rise from 2018 to a peak in 2020, then fall for newer cohorts because they have had less time to be cited.</desc>
              <defs>
                <linearGradient id="citationArea" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#d6ee70" stopOpacity="0.44" />
                  <stop offset="100%" stopColor="#d6ee70" stopOpacity="0.02" />
                </linearGradient>
              </defs>
              {yTicks.map(tick => {
                const y = yPosition(tick);
                return (
                  <g key={tick}>
                    <line className={styles.gridLine} x1={chartPadding.left} x2={chartWidth - chartPadding.right} y1={y} y2={y} />
                    <text className={styles.axisLabel} x={chartPadding.left - 14} y={y + 4} textAnchor="end">
                      {tick === 0 ? "0" : `${tick / 1_000_000}m`}
                    </text>
                  </g>
                );
              })}
              <path d={areaPath} fill="url(#citationArea)" />
              <path d={linePath} className={styles.dataLine} />
              {annual.map((row, index) => (
                <g key={row.year}>
                  <circle className={styles.dataPoint} cx={xPosition(index)} cy={yPosition(row.total_citations)} r="5">
                    <title>{row.year}: {formatNumber(row.total_citations)} citations</title>
                  </circle>
                  <text className={styles.yearLabel} x={xPosition(index)} y={chartHeight - 12} textAnchor="middle">{row.year}</text>
                </g>
              ))}
            </svg>
          </div>
          <div className={styles.chartNote}>
            <Info size={16} />
            <p><strong>Read the slope carefully.</strong> The decline after 2020 reflects citation time as well as performance. It should not be read as a simple decline in research quality.</p>
          </div>
        </div>
      </section>

      <section className={styles.yearSection}>
        <div className={styles.sectionHeading}>
          <div>
            <span className={styles.kicker}>The underlying record</span>
            <h2>Every cohort, side by side</h2>
          </div>
          <p>OpenAlex&apos;s normalized top-10% indicator compares papers globally within its citation model.</p>
        </div>
        <div className={styles.tableWrap}>
          <table>
            <thead>
              <tr>
                <th>Publication year</th>
                <th>Research outputs</th>
                <th>Total citations</th>
                <th>Mean / paper</th>
                <th>Global top 10%</th>
              </tr>
            </thead>
            <tbody>
              {annual.map(row => (
                <tr key={row.year}>
                  <th>{row.year}</th>
                  <td>{formatNumber(row.publication_count)}</td>
                  <td>{formatNumber(row.total_citations)}</td>
                  <td>{row.mean_citations_per_paper.toFixed(1)}</td>
                  <td>
                    <div className={styles.percentCell}>
                      <span><i style={{ width: `${Math.min(100, row.top_10_percent_share * 500)}%` }} /></span>
                      <b>{percent(row.top_10_percent_share)}</b>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className={styles.fieldsSection}>
        <div className={styles.fieldIntro}>
          <span className={styles.kicker}>Where influence concentrates</span>
          <h2>Engineering leads India&apos;s citation footprint.</h2>
          <p>
            Each work is assigned once to the field of its OpenAlex primary topic. Together,
            Engineering and Medicine account for {percent(fields[0].citation_share + fields[1].citation_share)} of citations among classified works.
          </p>
          <div className={styles.fieldCallout}>
            <Sparkles size={18} />
            <span><strong>{compact(fields[0].total_citations)}</strong> Engineering citations</span>
          </div>
        </div>
        <div className={styles.fieldRanking}>
          <div className={styles.rankingHead}>
            <span>Field</span>
            <span>Citations / works</span>
          </div>
          <ol><FieldRows end={10} /></ol>
          <details>
            <summary>Show the remaining {fields.length - 10} fields <span>+</span></summary>
            <ol start={11}><FieldRows start={10} /></ol>
          </details>
        </div>
      </section>

      <section className={styles.methodology}>
        <div className={styles.methodIcon}><Database size={22} /></div>
        <div>
          <span className={styles.kicker}>Methodology</span>
          <h2>What is included?</h2>
        </div>
        <div className={styles.methodCopy}>
          <p>
            Articles, reviews and conference papers published from 2018–2025 are included when
            OpenAlex records at least one authorship institution in India. Retracted works are excluded.
          </p>
          <p>
            Citation counts are a point-in-time snapshot and will change. Field shares exclude
            1,461 works without a primary-field classification—0.06% of the full dataset.
          </p>
        </div>
        <a href="https://openalex.org/" target="_blank" rel="noreferrer" className={styles.sourceLink}>
          Visit OpenAlex <ArrowUpRight size={15} />
        </a>
      </section>

      <footer className={styles.footer}>
        <Link href="/"><ArrowLeft size={15} /> Back to India Research Watch</Link>
        <span>Source: OpenAlex Works API · Snapshot generated 21 October 2026</span>
      </footer>
    </main>
  );
}

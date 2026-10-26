import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const API_URL = "https://api.openalex.org/works";
const OUTPUT_PATH = resolve(ROOT, "public", "data", "india-citation-summary.json");
const API_KEY = process.env.OPENALEX_API_KEY;
const START_YEAR = Number(process.env.START_YEAR ?? 2018);
const END_YEAR = Number(process.env.END_YEAR ?? 2025);
const MAX_CONCURRENCY = Number(process.env.OPENALEX_CONCURRENCY ?? 4);
const WORK_TYPES = "article|review|conference-paper";

if (!API_KEY) throw new Error("OPENALEX_API_KEY is required.");
if (!Number.isInteger(START_YEAR) || !Number.isInteger(END_YEAR) || START_YEAR > END_YEAR) {
  throw new Error("START_YEAR and END_YEAR must be valid years.");
}

const sleep = milliseconds => new Promise(resolvePromise => setTimeout(resolvePromise, milliseconds));
const commonFilter = `authorships.institutions.country_code:IN,type:${WORK_TYPES},is_retracted:false`;
const yearFilter = year => `${commonFilter},publication_year:${year}`;
const periodFilter = `${commonFilter},publication_year:${START_YEAR}-${END_YEAR}`;

async function request(params, attempt = 1) {
  const query = new URLSearchParams({ ...params, api_key: API_KEY });
  const response = await fetch(`${API_URL}?${query}`);
  if ((response.status === 429 || response.status >= 500) && attempt <= 6) {
    await sleep(Math.min(20_000, 500 * (2 ** (attempt - 1))));
    return request(params, attempt + 1);
  }
  if (!response.ok) {
    const message = (await response.text()).slice(0, 500);
    throw new Error(`OpenAlex HTTP ${response.status}: ${message}`);
  }
  return response.json();
}

async function exactCitationAggregate(filter) {
  const histogram = await request({ filter, group_by: "cited_by_count", "per-page": "200" });
  const popularBuckets = (histogram.group_by ?? []).slice(0, 100);
  const excludedCounts = popularBuckets.map(bucket => bucket.key).join("|");
  let publicationCount = popularBuckets.reduce((sum, bucket) => sum + bucket.count, 0);
  let totalCitations = popularBuckets.reduce(
    (sum, bucket) => sum + Number(bucket.key) * bucket.count,
    0
  );

  let cursor = "*";
  do {
    const remainder = await request({
      filter: `${filter},cited_by_count:!${excludedCounts}`,
      select: "cited_by_count",
      "per-page": "200",
      cursor
    });
    for (const work of remainder.results ?? []) {
      publicationCount += 1;
      totalCitations += Number(work.cited_by_count ?? 0);
    }
    cursor = remainder.meta?.next_cursor ?? null;
  } while (cursor);

  if (publicationCount !== histogram.meta.count) {
    throw new Error(`Citation aggregation mismatch: expected ${histogram.meta.count}, received ${publicationCount}.`);
  }
  return { publicationCount, totalCitations };
}

async function annualSummary(year) {
  const filter = yearFilter(year);
  const [citations, top10] = await Promise.all([
    exactCitationAggregate(filter),
    request({
      filter: `${filter},citation_normalized_percentile.is_in_top_10_percent:true`,
      "per-page": "1",
      select: "id"
    })
  ]);
  const top10Count = top10.meta.count;
  console.log(`${year}: ${citations.publicationCount} works, ${citations.totalCitations} citations.`);
  return {
    year,
    publication_count: citations.publicationCount,
    total_citations: citations.totalCitations,
    mean_citations_per_paper: Number((citations.totalCitations / citations.publicationCount).toFixed(4)),
    top_10_percent_count: top10Count,
    top_10_percent_share: Number((top10Count / citations.publicationCount).toFixed(6))
  };
}

async function fieldSummary(field) {
  const fieldId = field.key.split("/").at(-1);
  const citations = await exactCitationAggregate(`${periodFilter},primary_topic.field.id:${fieldId}`);
  console.log(`${field.key_display_name}: ${citations.totalCitations} citations.`);
  return {
    field_id: field.key,
    field_name: field.key_display_name,
    publication_count: citations.publicationCount,
    total_citations: citations.totalCitations
  };
}

async function mapConcurrent(items, worker, concurrency) {
  const results = new Array(items.length);
  let nextIndex = 0;
  async function runWorker() {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await worker(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, runWorker));
  return results;
}

const years = Array.from({ length: END_YEAR - START_YEAR + 1 }, (_, index) => START_YEAR + index);
const annual = await mapConcurrent(years, annualSummary, MAX_CONCURRENCY);
const fieldGroups = await request({ filter: periodFilter, group_by: "primary_topic.field.id", "per-page": "100" });
const fields = await mapConcurrent(fieldGroups.group_by ?? [], fieldSummary, MAX_CONCURRENCY);
const classifiedCitationTotal = fields.reduce((sum, field) => sum + field.total_citations, 0);
for (const field of fields) {
  field.citation_share = Number((field.total_citations / classifiedCitationTotal).toFixed(6));
}
fields.sort((left, right) => right.total_citations - left.total_citations);

const dataset = {
  schema_version: 1,
  generated_at: new Date().toISOString(),
  source: "OpenAlex Works API",
  period: { start_year: START_YEAR, end_year: END_YEAR },
  filters: {
    country_definition: "At least one authorship institution has country_code IN",
    work_types: ["article", "review", "conference-paper"],
    excludes_retracted: true,
    field_assignment: "OpenAlex primary topic field; one field per classified work"
  },
  notes: [
    "Citation counts are a point-in-time snapshot and will change as OpenAlex updates.",
    "Top-10% counts use OpenAlex citation_normalized_percentile.is_in_top_10_percent.",
    "Field citation shares use classified works only; works without a primary field are excluded from that denominator."
  ],
  annual,
  fields,
  validation: {
    annual_publication_total: annual.reduce((sum, row) => sum + row.publication_count, 0),
    annual_citation_total: annual.reduce((sum, row) => sum + row.total_citations, 0),
    classified_field_publication_total: fields.reduce((sum, field) => sum + field.publication_count, 0),
    classified_field_citation_total: classifiedCitationTotal
  }
};

await mkdir(dirname(OUTPUT_PATH), { recursive: true });
await writeFile(OUTPUT_PATH, `${JSON.stringify(dataset, null, 2)}\n`, "utf8");
console.log(`Wrote ${OUTPUT_PATH}.`);

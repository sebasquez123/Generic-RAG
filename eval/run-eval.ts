/**
 * Retrieval evaluation harness: ingests a deterministic corpus, runs a fixed
 * query set in `vector` (baseline) and `hybrid` mode and reports hit@k, MRR,
 * found/verdict accuracy and latency.
 *
 *   npm run eval                       # offline: PGlite + hashing embedder
 *   RAG_EVAL_PROVIDER=gemini npm run eval   # offline DB, real Gemini embeddings
 *   npm run eval -- --url http://localhost:8080 --namespace eval-corpus
 *        (with RAG_EVAL_API_KEY set: ingests the corpus through the API of a
 *         running deployment and evaluates it there)
 *
 * Results: printed as markdown and written to eval/results/latest.{json,md}.
 */
// Must run first: placeholder env for the offline application (no secrets).
import '../test/setup-env';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createTestApp, TEST_KEYS } from '../test/support/test-app';
import { buildCorpus } from './corpus';

interface Expected {
  document: string;
  contains?: string;
}
interface EvalQuery {
  id: string;
  category: string;
  query: string;
  expect_found?: boolean;
  expected?: Expected[];
  /** Text that must never appear in any result (e.g. hidden-sheet data). */
  forbidden?: string;
}
interface SearchResult {
  content: string;
  metadata: { document_name: string };
}
interface SearchResponse {
  found: boolean;
  verdict: { status: string; reasons: string[] };
  results: SearchResult[];
  retrieval: { took_ms: number };
}
interface Outcome {
  id: string;
  category: string;
  mode: string;
  minScore: number;
  found: boolean;
  verdict: string;
  rank: number | null; // 1-based rank of the first expected hit
  pass: boolean;
  tookMs: number;
}

const MODES = ['vector', 'hybrid'] as const;
const PRIMARY_MIN_SCORE = Number(process.env.RAG_EVAL_MIN_SCORE ?? 0.2);
const SENSITIVITY = [0.15, PRIMARY_MIN_SCORE, 0.3];
const TOP_K = 5;

const arg = (name: string) => {
  const index = process.argv.indexOf(`--${name}`);
  return index > 0 ? process.argv[index + 1] : undefined;
};

async function startTarget(): Promise<{
  url: string;
  apiKey: string;
  namespace: string;
  stop: () => Promise<void>;
}> {
  const url = arg('url');
  if (url) {
    const apiKey = process.env.RAG_EVAL_API_KEY;
    if (!apiKey)
      throw new Error('Set RAG_EVAL_API_KEY to evaluate a live deployment');
    return {
      url,
      apiKey,
      namespace: arg('namespace') ?? 'eval-corpus',
      stop: async () => undefined,
    };
  }
  // Offline: the real application on PGlite.
  const t = await createTestApp({
    rag: {
      embedding: { provider: process.env.RAG_EVAL_PROVIDER ?? 'hashing' },
    },
  });
  const address = t.app.getHttpServer().address() as { port: number };
  return {
    url: `http://127.0.0.1:${address.port}`,
    apiKey: TEST_KEYS.tenantA,
    namespace: 'eval',
    stop: () => t.close(),
  };
}

async function ingestCorpus(url: string, apiKey: string, namespace: string) {
  const ids: string[] = [];
  for (const document of await buildCorpus()) {
    const form = new FormData();
    form.append('namespace', namespace);
    form.append('ingest', 'true');
    form.append(
      'file',
      new Blob([new Uint8Array(document.buffer)]),
      document.name,
    );
    const response = await fetch(`${url}/api/v1/documents`, {
      method: 'POST',
      headers: { 'x-api-key': apiKey },
      body: form,
    });
    const body = (await response.json()) as { document: { id: string } };
    if (!response.ok)
      throw new Error(`upload ${document.name}: ${JSON.stringify(body)}`);
    ids.push(body.document.id);
  }
  for (const id of ids) {
    for (;;) {
      const response = await fetch(`${url}/api/v1/documents/${id}`, {
        headers: { 'x-api-key': apiKey },
      });
      const body = (await response.json()) as {
        status: string;
        name: string;
        error: unknown;
      };
      if (body.status === 'COMPLETED') break;
      if (body.status === 'FAILED')
        throw new Error(`ingestion failed: ${JSON.stringify(body)}`);
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
}

function isHit(result: SearchResult, expected: Expected[]) {
  return expected.some(
    (e) =>
      result.metadata.document_name === e.document &&
      (!e.contains || result.content.includes(e.contains)),
  );
}

function score(
  query: EvalQuery,
  response: SearchResponse,
  mode: string,
  minScore: number,
): Outcome {
  const index = query.expected
    ? response.results.findIndex((result) => isHit(result, query.expected!))
    : -1;
  const rank = index >= 0 ? index + 1 : null;
  const verdict = response.verdict.status;
  let pass: boolean;
  if (query.forbidden)
    pass = !response.results.some((r) => r.content.includes(query.forbidden!));
  else if (query.expect_found)
    pass = rank !== null && (verdict === 'sufficient' || verdict === 'partial');
  else pass = verdict === 'none' || verdict === 'weak';
  return {
    id: query.id,
    category: query.category,
    mode,
    minScore,
    found: response.found,
    verdict,
    rank,
    pass,
    tookMs: response.retrieval.took_ms,
  };
}

const pct = (value: number) => `${(value * 100).toFixed(1)}%`;
const mean = (values: number[]) =>
  values.reduce((a, b) => a + b, 0) / Math.max(values.length, 1);
const p95 = (values: number[]) =>
  [...values].sort((a, b) => a - b)[Math.floor(values.length * 0.95)] ?? 0;

function summarize(outcomes: Outcome[]) {
  const positives = outcomes.filter(
    (o) => o.category !== 'negative' && o.category !== 'leak',
  );
  const negatives = outcomes.filter((o) => o.category === 'negative');
  const leaks = outcomes.filter((o) => o.category === 'leak');
  return {
    queries: outcomes.length,
    hitAt1: mean(positives.map((o) => (o.rank === 1 ? 1 : 0))),
    hitAt5: mean(positives.map((o) => (o.rank !== null ? 1 : 0))),
    mrr: mean(positives.map((o) => (o.rank ? 1 / o.rank : 0))),
    positivesFound: mean(positives.map((o) => (o.found ? 1 : 0))),
    negativesNotFound: mean(negatives.map((o) => (o.found ? 0 : 1))),
    negativesAbstained: mean(negatives.map((o) => (o.pass ? 1 : 0))),
    noLeaks: leaks.every((o) => o.pass),
    trustAccuracy: mean(outcomes.map((o) => (o.pass ? 1 : 0))),
    meanMs: mean(outcomes.map((o) => o.tookMs)),
    p95Ms: p95(outcomes.map((o) => o.tookMs)),
  };
}

async function main() {
  const queries = JSON.parse(
    readFileSync(join(__dirname, 'queries.json'), 'utf8'),
  ) as EvalQuery[];
  const target = await startTarget();
  const outcomes: Outcome[] = [];
  try {
    await ingestCorpus(target.url, target.apiKey, target.namespace);
    for (const minScore of SENSITIVITY)
      for (const mode of MODES)
        for (const query of queries) {
          const response = await fetch(`${target.url}/api/v1/search`, {
            method: 'POST',
            headers: {
              'x-api-key': target.apiKey,
              'content-type': 'application/json',
            },
            body: JSON.stringify({
              query: query.query,
              namespace: target.namespace,
              top_k: TOP_K,
              min_score: minScore,
              mode,
            }),
          });
          if (!response.ok)
            throw new Error(`search ${query.id}: HTTP ${response.status}`);
          outcomes.push(
            score(
              query,
              (await response.json()) as SearchResponse,
              mode,
              minScore,
            ),
          );
        }
  } finally {
    await target.stop();
  }

  const primary = (mode: string) =>
    outcomes.filter((o) => o.mode === mode && o.minScore === PRIMARY_MIN_SCORE);
  const summary = Object.fromEntries(
    MODES.map((mode) => [mode, summarize(primary(mode))]),
  );
  const categories = [...new Set(queries.map((q) => q.category))];

  const lines: string[] = [];
  lines.push(`# GenRag retrieval evaluation`, '');
  lines.push(
    `Embedder: \`${process.env.RAG_EVAL_PROVIDER ?? (arg('url') ? 'deployment' : 'hashing')}\` · ` +
      `min_score ${PRIMARY_MIN_SCORE} · top_k ${TOP_K} · ${queries.length} queries`,
    '',
  );
  lines.push(
    '| Metric | vector (baseline) | hybrid |',
    '| --- | ---: | ---: |',
  );
  const row = (
    label: string,
    key: keyof ReturnType<typeof summarize>,
    format = pct,
  ) =>
    lines.push(
      `| ${label} | ${format(summary.vector[key] as number)} | ${format(summary.hybrid[key] as number)} |`,
    );
  row('Hit@1 (answerable queries)', 'hitAt1');
  row('Hit@5 (answerable queries)', 'hitAt5');
  row('MRR', 'mrr', (v) => v.toFixed(3));
  row('found=true on answerable queries', 'positivesFound');
  row('found=false on negative queries', 'negativesNotFound');
  row('Negatives with verdict none/weak', 'negativesAbstained');
  row('Trust accuracy (all checks)', 'trustAccuracy');
  row('Mean latency (ms)', 'meanMs', (v) => v.toFixed(1));
  row('p95 latency (ms)', 'p95Ms', (v) => v.toFixed(1));
  lines.push(
    `| Hidden-sheet data never returned | ${summary.vector.noLeaks ? 'yes' : 'NO'} | ${summary.hybrid.noLeaks ? 'yes' : 'NO'} |`,
    '',
  );

  lines.push(
    '## Hit@5 by category',
    '',
    '| Category | n | vector | hybrid |',
    '| --- | ---: | ---: | ---: |',
  );
  for (const category of categories) {
    const pick = (mode: string) =>
      primary(mode).filter((o) => o.category === category);
    const metric = (items: Outcome[]) =>
      category === 'negative' || category === 'leak'
        ? `${pct(mean(items.map((o) => (o.pass ? 1 : 0))))} pass`
        : pct(mean(items.map((o) => (o.rank !== null ? 1 : 0))));
    lines.push(
      `| ${category} | ${pick('vector').length} | ${metric(pick('vector'))} | ${metric(pick('hybrid'))} |`,
    );
  }

  lines.push(
    '',
    '## Sensitivity to min_score (trust accuracy)',
    '',
    '| min_score | vector | hybrid |',
    '| ---: | ---: | ---: |',
  );
  for (const minScore of SENSITIVITY) {
    const acc = (mode: string) =>
      pct(
        mean(
          outcomes
            .filter((o) => o.mode === mode && o.minScore === minScore)
            .map((o) => (o.pass ? 1 : 0)),
        ),
      );
    lines.push(`| ${minScore} | ${acc('vector')} | ${acc('hybrid')} |`);
  }

  lines.push(
    '',
    '## Failures (primary min_score)',
    '',
    '| mode | query | category | found | verdict | rank |',
    '| --- | --- | --- | --- | --- | ---: |',
  );
  for (const outcome of [...primary('vector'), ...primary('hybrid')].filter(
    (o) => !o.pass,
  ))
    lines.push(
      `| ${outcome.mode} | ${outcome.id} | ${outcome.category} | ${outcome.found} | ${outcome.verdict} | ${outcome.rank ?? '-'} |`,
    );

  const markdown = lines.join('\n');
  const dir = join(__dirname, 'results');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'latest.md'), `${markdown}\n`);
  writeFileSync(
    join(dir, 'latest.json'),
    JSON.stringify({ summary, outcomes }, null, 2),
  );
  process.stdout.write(`${markdown}\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`${String((error as Error)?.stack ?? error)}\n`);
  process.exit(1);
});

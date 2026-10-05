# Retrieval evaluation

`npm run eval` ingests a fixed corpus and runs a fixed query set twice: in `vector` mode (the retrieval GenRag had before hybrid search: vector candidates, similarity threshold, de-duplication) and in `hybrid` mode (vector + PostgreSQL full-text search, identifier-aware evidence rules). Both modes run against the same ingested data, so the difference comes only from retrieval.

## Corpus and queries

[eval/corpus.ts](../eval/corpus.ts) builds the same bytes on every run:

| Document | Content |
| --- | --- |
| `facturas-2025.xlsx` | 120 invoices: `FV-2025-xxxxx`, dates, client names, NITs, currency amounts, status |
| `empleados.xlsx` | 20 employees: names, ID numbers (cédula), roles, start dates, plus a **hidden** `Salarios` sheet |
| `politicas-internas.pdf` | 3-page policy manual (vacations, travel allowances, purchasing, security, phishing) |
| `manual-soporte.md` | Support handbook with error codes (`ERR-4031`…) |
| `contratos.json` | 25 contracts `CT-2024-1xx` with providers and amounts |

[eval/queries.json](../eval/queries.json) holds 40 queries: semantic (8), ids (6), codes and spelling variants (5), numbers (4), dates (4), names (6), negatives that must not be answered (6), and one leak check (the hidden salary must never be returned). Each query lists the expected document and a text the result must contain, so the set stays valid across runs (ids are random UUIDs).

## Metrics

- **Hit@1 / Hit@5 / MRR**: on answerable queries, rank of the first result from the expected document containing the expected text.
- **found=true / found=false**: the v1 boolean.
- **Negatives with verdict none/weak**: the new contract abstains correctly.
- **Trust accuracy**: share of queries where the service told the truth. Answerable means the right evidence is in the top 5 *and* the verdict is `sufficient` or `partial`. Negative means the verdict is `none` or `weak`. Leak means the hidden data never appears.

## Results (offline run, 2026-10-05)

Embedder: `hashing` (deterministic, offline) · `min_score` 0.2 · `top_k` 5 · 40 queries.

| Metric | vector (baseline) | hybrid |
| --- | ---: | ---: |
| Hit@1 (answerable queries) | 60.6% | 90.9% |
| Hit@5 (answerable queries) | 69.7% | 90.9% |
| MRR | 0.633 | 0.909 |
| found=true on answerable queries | 72.7% | 90.9% |
| found=false on negative queries | 66.7% | 66.7% |
| Negatives with verdict none/weak | 100.0% | 100.0% |
| Trust accuracy (all checks) | 75.0% | 92.5% |
| Mean / p95 latency (ms, PGlite in-process) | 8.8 / 12 | 10.1 / 17 |
| Hidden-sheet data never returned | yes | yes |

Hit@5 by category:

| Category | n | vector | hybrid |
| --- | ---: | ---: | ---: |
| semantic | 8 | 75.0% | 75.0% |
| id | 6 | 100.0% | 100.0% |
| code | 5 | 60.0% | 100.0% |
| number | 4 | 75.0% | 100.0% |
| date | 4 | 100.0% | 100.0% |
| name | 6 | 16.7% | 83.3% |

Trust accuracy across thresholds (hybrid depends much less on calibrating `min_score`):

| min_score | vector | hybrid |
| ---: | ---: | ---: |
| 0.15 | 77.5% | 95.0% |
| 0.2 | 75.0% | 92.5% |
| 0.3 | 45.0% | 85.0% |

### Reading the results

- **The gain comes where the audit predicted:** codes written differently from the source (`FV202500030`, `NIT 900.123.456`), amounts, and names. Exact ids were already found by the offline embedder, which is itself lexical. With a semantic embedder (Gemini), vector search is expected to be *weaker* on ids than shown here, so the hybrid gain on ids is probably understated.
- **`found` alone is not trustworthy:** in both modes a third of the negatives return look-alike results (for example, other invoices for `FV-2099-99999`). The verdict flags all of them as `weak` or `none`. That is the "evidence vs. just a result" distinction the contract is meant to expose.
- **Remaining failures:** `sem-03` and `sem-06` need synonyms ("aprueba" vs "aprobación"), and `name-05` needs a word that is not in the document ("trabaja"). These depend on a semantic embedder; they were deliberately not "fixed" with looser lexical rules, which would hurt the negatives.
- **Latency:** hybrid adds one indexed full-text query in the same transaction (+1.3 ms mean here). Figures come from in-process PGlite and are not a production benchmark.

## Limits of this evaluation

- **Not measured with Gemini.** The offline embedder is lexical (feature hashing), not semantic. Semantic-query numbers in particular do not represent production quality. To measure with real embeddings, run `RAG_EVAL_PROVIDER=gemini npm run eval` (requires `GEMINI_API_KEY`), or point the harness at a deployment: `RAG_EVAL_API_KEY=… npm run eval -- --url https://genrag.internal --namespace eval-corpus`.
- **Small, synthetic corpus** (5 documents, 40 queries). It catches regressions and shows mechanisms; it is not a benchmark. Add your own documents and queries to `eval/` to calibrate `min_score` for your corpus.
- **One rule was adjusted after the first run:** a chunk containing every meaningful query word (≥ 2 words) now counts as *strong* evidence. The first run returned the right chunk at rank 1 for name lookups but labelled it `weak`. Trust accuracy before that adjustment was 85.0%; retrieval metrics (hit@k, MRR) did not change.

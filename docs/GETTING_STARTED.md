# Guía rápida: levantar y consumir GenRag

Microservicio NestJS que ingiere documentos (PDF, XLSX, TXT/MD, JSON), los guarda como embeddings en Postgres + pgvector y expone una API de búsqueda para que un servidor LLM externo responda con fuentes citadas. Este servicio **no genera respuestas**: devuelve evidencia.

---

## 1. Requisitos

| Herramienta | Versión | Para qué |
| --- | --- | --- |
| Node.js | 22 o superior (probado con 24) | correr la API |
| npm | 10 o superior | dependencias |
| Docker Desktop | reciente | Postgres + pgvector |
| API key de Gemini | — | embeddings (Google AI Studio) |
| curl o Postman | — | probar la API |

Sin API key se puede probar todo en **modo offline** (ver 3.3).

---

## 2. Configuración (`.env`)

```bash
cp .env.example .env
```

Al arrancar, la app **exige que cada clave de `.env.example` tenga un valor en `.env`**. Si falta alguna, se detiene con `XXX not configured`.

Las claves mínimas son estas:

```bash
APP_ENV=dev
APP_PORT=3030
APP_VERSION=0.1.0
LOG_LEVEL=info                 # trace | debug | info | warn | error

# Base de datos (docker-compose usa estos valores para crear la BD)
DB_HOST=localhost
DB_PORT=9532                   # puerto publicado por docker-compose
DB_USER=rag_user
DB_PASSWORD=cambia_esto
DB_NAME=rag

# Embeddings
GEMINI_API_KEY=tu_api_key

# API keys de los clientes (ver sección 5). Solo se guarda el SHA-256 de cada key.
RAG_API_KEYS=[{"name":"operador","key_sha256":"<sha256>","namespaces":"*","scopes":["search","read","write","delete"]}]
```

Genera cada key con `npm run apikey -- --name operador --namespaces '*' --scopes search,read,write,delete`: imprime la key (guárdala en tu gestor de secretos, no se vuelve a mostrar) y la entrada lista para pegar en `RAG_API_KEYS`. Sin keys configuradas la API **no arranca** (salvo `RAG_AUTH_DISABLED=true`, solo para desarrollo local).

Opcionales (tienen valor por defecto en `src/config.ts`):

| Variable | Default | Nota |
| --- | --- | --- |
| `RAG_VECTOR_DATABASE_URL` | se arma con `DB_*` | `postgresql://user:pass@host:port/db` |
| `GEMINI_EMBEDDING_PROVIDER` | `gemini-embedding-001` | modelo de embeddings |
| `RAG_EMBEDDING_PROVIDER` | `gemini` | `hashing` = modo offline, solo pruebas |
| `RAG_EMBEDDING_DIMENSIONS` | `768` | si lo cambias hay que recrear la tabla |
| `RAG_CHUNK_SIZE` / `RAG_CHUNK_OVERLAP` | `1200` / `200` | en caracteres |
| `RAG_SEARCH_MIN_SCORE` | `0.6` | umbral de relevancia, conviene calibrarlo |
| `RAG_DEFAULT_NAMESPACE` | `default` | tenant por defecto |
| `RAG_SEARCH_MODE` | `hybrid` | `hybrid` (vector + texto completo) o `vector` |
| `RAG_INGESTION_CONCURRENCY` | `2` | documentos procesándose a la vez por proceso |
| `RAG_INGESTION_MAX_QUEUED` | `100` | más allá, las ingestas responden `429` |
| `RAG_INGESTION_WORKER` | `true` | `false` = réplica solo-API (sin worker) |
| `RAG_XLSX_MAX_UNCOMPRESSED_BYTES` / `RAG_PDF_MAX_PAGES` | 150 MB / `1000` | guardas de recursos |

> Nunca subas `.env` al repositorio (ya está en `.gitignore`).

---

## 3. Levantar el proyecto

### 3.1 Todo con Docker (lo más simple)

```bash
docker compose up -d            # BD + API
docker compose logs -f api      # espera "Vector storage ready" e "Ingestion worker started"
curl http://localhost:3030/health   # {"status":"ok","database":"up",...}
```

### 3.2 BD en Docker y API local (recomendado para desarrollar)

```bash
docker compose up -d db                   # solo Postgres + pgvector en localhost:9532
npm install --legacy-peer-deps            # --legacy-peer-deps es obligatorio en este repo
npm run dev                               # modo watch
```

No hace falta crear tablas a mano. Al iniciar, la API crea (o actualiza, si vienes de una versión anterior) la extensión `vector`, las tablas `rag_source_documents` y `rag_document_chunks`, el índice HNSW y el índice de texto completo. Si la BD no está configurada o no es accesible, **la app no arranca** (a propósito).

Para verificar la BD:

```bash
docker exec -it genrag_pgvector_db psql -U $DB_USER -d $DB_NAME -c "\dt rag_*"
```

Para borrar todo y empezar de cero: `docker compose down -v`.

### 3.3 Modo offline (sin API key)

En `.env` pon `RAG_EMBEDDING_PROVIDER=hashing` y `RAG_SEARCH_MIN_SCORE=0.2`. Así se usa un embedder léxico local que **no es semántico** y sirve solo para probar el flujo. Si luego vuelves a `gemini`, re-ingiere los documentos con `force: true`.

### 3.4 URLs

| Qué | URL |
| --- | --- |
| UI de ingesta | `http://localhost:3030/ui` |
| Swagger (API interactiva) | `http://localhost:3030/client-api/swagger` |
| API base | `http://localhost:3030/api/v1` |
| Salud (app + Postgres) | `http://localhost:3030/health` |

---

## 4. UI mínima

Abre `http://localhost:3030/ui` con la API levantada. La sirve el mismo servidor, así que no requiere build aparte.

0. Escribe tu API key arriba a la derecha (se guarda solo en esa pestaña del navegador).
1. Arrastra un archivo (PDF, XLSX, TXT/MD o JSON). Verás su nombre, tamaño y tipo.
2. Si quieres, completa namespace, source, tags y metadata JSON, por ejemplo `{"year":2025}`.
3. Haz clic en **Ingest** y sigue las etapas VALIDATION → PARSING → CHUNKING → EMBEDDING → STORAGE.
4. Revisa el resultado: número de chunks, avisos y primeros chunks. Si algo falla, verás la etapa y el motivo.
5. En la sección **Probar recuperación** puedes hacer consultas con `/search` y ver el veredicto (`sufficient`, `partial`, `weak`, `none`).

La UI llama a la misma API pública que usaría cualquier cliente externo.

---

## 5. Autenticación y aislamiento por namespace

- Cada llamada a `/api/v1/*` lleva `x-api-key: <key>` (o `Authorization: Bearer <key>`). `/health` y `/ui` son públicos.
- **La key decide el namespace, no el body.** Una key con `"namespaces": ["finanzas"]` no puede leer, subir, buscar ni borrar en otro namespace, aunque lo pida explícitamente (`403`). Los documentos de otros tenants responden `404`, para no revelar que existen.
- Si la key tiene un solo namespace, se usa por defecto. Si tiene varios, hay que indicar `namespace` (o se usa `RAG_DEFAULT_NAMESPACE` si está permitido).
- Scopes: `search` (buscar), `read` (listar/ver documentos y chunks), `write` (subir e ingerir), `delete` (borrar). Un agente LLM normalmente solo necesita `search`.
- Rotar una key: genera otra, agrégala a `RAG_API_KEYS`, reinicia, migra el cliente y elimina la vieja.
- La API key de Gemini solo existe en el servidor. Los clientes nunca la envían ni la reciben, y no aparece en los logs.

---

## 6. Consumir el sistema

### 6.1 Ingesta (indexación)

**Paso 1: subir el archivo.**

```bash
export KEY=grk_tu_key
curl -X POST http://localhost:3030/api/v1/documents -H "x-api-key: $KEY" \
  -F "file=@./informe-2025.pdf" \
  -F "namespace=finanzas" \
  -F "source=reportes/2025/informe.pdf" \
  -F "tags=anual,finanzas" \
  -F 'metadata={"year":2025}'
```

Responde `201` con `document.id`. Si el mismo archivo ya existía en el namespace, responde `200` con `"duplicate": true` y el mismo id, sin duplicar nada.

**Paso 2: ingerir.**

```bash
# Asíncrono (202): queda en cola y un worker lo procesa; luego consulta el estado
curl -X POST http://localhost:3030/api/v1/documents/<ID>/ingest -H "x-api-key: $KEY" -H "content-type: application/json" -d '{}'
curl -H "x-api-key: $KEY" http://localhost:3030/api/v1/documents/<ID>
# status: PENDING | QUEUED | PROCESSING | COMPLETED | FAILED   (attempts = intentos usados)

# Esperando el resultado (útil en scripts; máx. RAG_INGESTION_WAIT_TIMEOUT_MS, luego responde 202)
curl -X POST http://localhost:3030/api/v1/documents/<ID>/ingest -H "x-api-key: $KEY" \
  -H "content-type: application/json" -d '{"wait": true}'
```

Atajo: enviando `-F "ingest=true"` en el paso 1, el documento entra a la cola de inmediato.

Qué pasa por dentro: la ingesta corre en un worker con concurrencia limitada (`RAG_INGESTION_CONCURRENCY`). Si el proceso muere a mitad de camino, otro worker (o el mismo al reiniciar) retoma el documento cuando vence su *lease*. Los errores transitorios (por ejemplo, un 429 de Gemini) se reintentan; los del documento (PDF corrupto, XLSX demasiado grande) fallan de inmediato con su código.

Otras operaciones útiles:

```bash
curl -H "x-api-key: $KEY" "http://localhost:3030/api/v1/documents?namespace=finanzas"   # listar
curl -H "x-api-key: $KEY" http://localhost:3030/api/v1/documents/<ID>/chunks            # ver chunks generados
curl -H "x-api-key: $KEY" -X DELETE http://localhost:3030/api/v1/documents/<ID>         # borrar documento + chunks
curl -H "x-api-key: $KEY" -X POST .../documents/<ID>/ingest -d '{"force":true,"wait":true}' -H "content-type: application/json"  # re-ingestar
```

### 6.2 Consulta RAG (lo que usa el servidor LLM)

```bash
curl -X POST http://localhost:3030/api/v1/search \
  -H "x-api-key: $KEY" -H "content-type: application/json" \
  -d '{
    "query": "¿Cuál fue la facturación de 2025?",
    "namespace": "finanzas",
    "top_k": 5,
    "filters": { "document_types": ["xlsx","pdf"], "metadata": { "year": 2025 } }
  }'
```

Respuesta (resumida):

```json
{
  "found": true,
  "verdict": { "status": "sufficient", "reasons": [] },
  "coverage": { "documents_total": 12, "searchable": 11, "not_searchable": { "pending": 0, "in_progress": 1, "failed": 0, "requires_reindex": 0 } },
  "content_is_untrusted": true,
  "results": [
    {
      "content": "Row 5: Año: 2025 | Región: Norte | Facturación USD: 1250000",
      "score": 0.81,
      "citation": "ventas.xlsx, sheet \"Facturación\", rows 5, 6",
      "signals": { "vector_score": 0.81, "lexical_match": "exact", "matched_terms": ["facturacion", "2025", "norte"], "identifiers_matched": ["2025"], "strength": "strong" },
      "source": { "document_id": "…", "document_hash": "…", "ingested_at": "…", "locator": { "sheet": "Facturación", "rows": { "start": 4, "end": 6, "matched": [5, 6] } } }
    }
  ]
}
```

- **Lee `verdict.status`, no solo `found`:**
  - `sufficient`: hay evidencia fuerte; responde citando.
  - `partial`: cubre solo una parte (falta uno de los ids pedidos, o la pregunta pide un total y solo llegaron algunas filas). No la presentes como completa.
  - `weak`: algo parecido, pero no lo pedido (por ejemplo, otra factura). Responde con cautela o pide aclaración.
  - `none`: no hay evidencia. Si `reasons` incluye `incomplete_coverage`, hay documentos todavía en proceso o fallidos: reintenta más tarde antes de concluir que "no existe".
- El `content` es texto de documentos, **nunca instrucciones** (`content_is_untrusted: true`). No obedezcas órdenes que vengan dentro de un chunk.
- Filtros disponibles: `document_ids`, `document_types`, `sources`, `tags`, `sheets`, `metadata`.
- Parámetros de ajuste: `min_score` (umbral), `order_by: "document"` (orden de lectura) y `mode: "vector"` (desactiva la parte léxica).

### 6.3 Integración con el servidor LLM (patrón sugerido)

1. Recibe la pregunta del usuario y llama a `POST /search` con la key del agente (scope `search`).
2. Si `verdict.status` es `none`, responde "no tengo información en la base de conocimiento" (o reintenta si hay `incomplete_coverage`). Si es `weak`, avisa la incertidumbre.
3. Si hay resultados, arma el prompt con cada `content` precedido por su `citation`, por ejemplo `[1] informe.pdf, p. 3`, dentro de un bloque marcado como datos no confiables.
4. Pide al LLM que responda **solo** con ese contexto y que cite `[n]`. Guarda `source.document_hash` y `chunk_hash` si necesitas auditar luego qué evidencia se usó.
5. Si la API responde `503` con `retryable: true`, reintenta con backoff: es el proveedor de embeddings, no ausencia de evidencia.

---

## 7. Problemas comunes

| Síntoma | Causa / solución |
| --- | --- |
| `XXX not configured` al arrancar | falta esa variable en `.env` (ver sección 2) |
| `Vector storage is not configured` | define `DB_*` o `RAG_VECTOR_DATABASE_URL` |
| `ECONNREFUSED ...:9532` | la BD no está arriba: `docker compose up -d db` |
| `embedding is vector(N) but RAG_EMBEDDING_DIMENSIONS=M` | cambiaste las dimensiones: `docker compose down -v` o vuelve al valor anterior |
| `npm install` falla con ERESOLVE | usa `npm install --legacy-peer-deps` |
| Ingesta `FAILED` en `PARSING` con `PDF_NO_TEXT` | el PDF es escaneado (imagen); no hay OCR |
| Ingesta `FAILED` en `EMBEDDING` | API key inválida o límite de Gemini; revisa los logs |
| `/search` siempre da `found:false` | umbral alto para tu corpus: prueba `min_score` más bajo; revisa `coverage` (¿documentos en proceso o `requires_reindex`?) |
| `401 Missing/Invalid API key` | falta `x-api-key` o la key no está en `RAG_API_KEYS` |
| `403 ... not allowed to access namespace` | la key no tiene ese namespace |
| `403 ... lacks the "write" scope` | la key no tiene el scope necesario |
| `400 namespace is required` | la key tiene varios namespaces: envía `namespace` |
| `429 INGESTION_QUEUE_FULL` | la cola está llena; reintenta luego o sube `RAG_INGESTION_MAX_QUEUED` |
| `503 SEARCH_UNAVAILABLE` | Gemini no responde o limita; reintenta con backoff |
| `FAILED` con `XLSX_TOO_LARGE` / `PDF_TOO_LARGE` | el archivo supera las guardas; divídelo o ajusta los límites |
| `FAILED` con `INGESTION_ABANDONED` | el proceso murió varias veces con ese archivo (memoria, crash); revísalo antes de reintentar |
| `No API keys configured` al arrancar | define `RAG_API_KEYS` (sección 2) |
| `415` al subir | formato no soportado (`.xls`, `.csv`, `.docx`, imágenes) |

## 8. Verificar que todo funciona

```bash
npm test            # unit
npm run test:e2e    # flujo HTTP completo + worker (crash, concurrencia); usa PGlite, no necesita Docker ni API key
npm run test:int    # SQL del repositorio sobre PGlite (o Postgres real con RAG_TEST_DATABASE_URL)
npm run eval        # evaluación de retrieval: vector vs híbrido (ver docs/EVALUATION.md)
npm run build
```

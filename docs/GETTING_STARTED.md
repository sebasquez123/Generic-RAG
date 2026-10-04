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
```

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

> Nunca subas `.env` al repositorio (ya está en `.gitignore`).

---

## 3. Levantar el proyecto

### 3.1 Todo con Docker (lo más simple)

```bash
docker compose up -d            # BD + API
docker compose logs -f api      # espera "Vector storage ready"
```

### 3.2 BD en Docker y API local (recomendado para desarrollar)

```bash
docker compose up -d db                   # solo Postgres + pgvector en localhost:9532
npm install --legacy-peer-deps            # --legacy-peer-deps es obligatorio en este repo
npm run dev                               # modo watch
```

No hace falta crear tablas a mano. Al iniciar, la API crea la extensión `vector`, las tablas `rag_source_documents` y `rag_document_chunks` y el índice HNSW. Si la BD no está configurada o no es accesible, **la app no arranca** (a propósito).

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

---

## 4. UI mínima

Abre `http://localhost:3030/ui` con la API levantada. La sirve el mismo servidor, así que no requiere build aparte.

1. Arrastra un archivo (PDF, XLSX, TXT/MD o JSON). Verás su nombre, tamaño y tipo.
2. Si quieres, completa namespace, source, tags y metadata JSON, por ejemplo `{"year":2025}`.
3. Haz clic en **Ingest** y sigue las etapas VALIDATION → PARSING → CHUNKING → EMBEDDING → STORAGE.
4. Revisa el resultado: número de chunks, avisos y primeros chunks. Si algo falla, verás la etapa y el motivo.
5. En la sección **Probar recuperación** puedes hacer consultas con `/search`.

La UI llama a la misma API pública que usaría cualquier cliente externo.

---

## 5. Autenticación (estado actual)

- **La API no tiene autenticación activa.** Hay un middleware JWT en `src/shared/middleware/orchestrator.middleware.ts` que usa la variable `ARTIFACT`, pero **no está conectado**.
- Mientras tanto, expón el servicio solo en la red interna o detrás de un gateway, y no lo publiques en internet.
- La API key de Gemini solo existe en el servidor. Los clientes nunca la envían ni la reciben.
- El siguiente paso recomendado es conectar un guard con `x-api-key` o activar el middleware JWT antes de exponer el servicio.

---

## 6. Consumir el sistema

### 6.1 Ingesta (indexación)

**Paso 1: subir el archivo.**

```bash
curl -X POST http://localhost:3030/api/v1/documents \
  -F "file=@./informe-2025.pdf" \
  -F "namespace=finanzas" \
  -F "source=reportes/2025/informe.pdf" \
  -F "tags=anual,finanzas" \
  -F 'metadata={"year":2025}'
```

Responde `201` con `document.id`. Si el mismo archivo ya existía en el namespace, responde `200` con `"duplicate": true` y el mismo id, sin duplicar nada.

**Paso 2: ingerir.**

```bash
# Síncrono (útil en scripts/pruebas)
curl -X POST http://localhost:3030/api/v1/documents/<ID>/ingest \
  -H "content-type: application/json" -d '{"wait": true}'

# Asíncrono (202) y luego consultar el estado
curl -X POST http://localhost:3030/api/v1/documents/<ID>/ingest -H "content-type: application/json" -d '{}'
curl http://localhost:3030/api/v1/documents/<ID>     # status: PENDING | PROCESSING | COMPLETED | FAILED
```

Atajo: enviando `-F "ingest=true"` en el paso 1, la ingesta arranca de inmediato.

Otras operaciones útiles:

```bash
curl "http://localhost:3030/api/v1/documents?namespace=finanzas"      # listar
curl http://localhost:3030/api/v1/documents/<ID>/chunks               # ver chunks generados
curl -X DELETE http://localhost:3030/api/v1/documents/<ID>            # borrar documento + chunks
curl -X POST .../documents/<ID>/ingest -d '{"force":true,"wait":true}' -H "content-type: application/json"  # re-ingestar
```

### 6.2 Consulta RAG (lo que usa el servidor LLM)

```bash
curl -X POST http://localhost:3030/api/v1/search \
  -H "content-type: application/json" \
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
  "results": [
    {
      "content": "Row 5: Año: 2025 | Región: Norte | Facturación USD: 1250000",
      "score": 0.81,
      "citation": "ventas.xlsx, sheet \"Facturación\", rows 4-6",
      "document_id": "…",
      "metadata": { "document_name": "ventas.xlsx", "page_start": null, "sheet": "Facturación", "section": "…" }
    }
  ]
}
```

- `found: false` indica que no hay evidencia suficiente. El LLM debe decir que no sabe en vez de inventar.
- Filtros disponibles: `document_ids`, `document_types`, `sources`, `tags`, `sheets`, `metadata`.
- Parámetros de ajuste: `min_score` (umbral) y `order_by: "document"` (resultados en orden de lectura).

### 6.3 Integración con el servidor LLM (patrón sugerido)

1. Recibe la pregunta del usuario y llama a `POST /search`.
2. Si `found` es `false`, responde "no tengo información en la base de conocimiento".
3. Si hay resultados, arma el prompt con cada `content` precedido por su `citation`, por ejemplo `[1] informe.pdf, p. 3`.
4. Pide al LLM que responda **solo** con ese contexto y que cite `[n]`.

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
| `/search` siempre da `found:false` | umbral alto para tu corpus: prueba `min_score` más bajo |
| `415` al subir | formato no soportado (`.xls`, `.csv`, `.docx`, imágenes) |

## 8. Verificar que todo funciona

```bash
npm test            # unit
npm run test:e2e    # flujo HTTP completo (no necesita BD ni API key)
npm run build
```

import os
from typing import Optional, List
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from dotenv import load_dotenv
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine
from openai import OpenAI

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/rouh")
# SQLAlchemy async URL
ASYNC_DB_URL = DATABASE_URL.replace("postgresql://", "postgresql+psycopg://")

engine = create_async_engine(ASYNC_DB_URL, echo=False, future=True)
app = FastAPI(title="Rouh AI Service")

openai_key = os.getenv("OPENAI_API_KEY")
client = OpenAI(api_key=openai_key) if openai_key else None


class EmbedInput(BaseModel):
  space_id: str
  text: str
  item_id: Optional[str] = None


class RAGQuery(BaseModel):
  space_id: str
  query: str
  k: int = 3


async def set_space(conn, space_id: str):
  await conn.execute(text("select set_config('app.space_id', :sid, true)").bindparams(sid=space_id))


@app.post("/embed")
async def embed(inp: EmbedInput):
  if client is None:
    raise HTTPException(status_code=500, detail="OPENAI_API_KEY not set")
  # Create embedding
  emb = client.embeddings.create(model="text-embedding-3-small", input=inp.text)
  vec = emb.data[0].embedding
  values = ",".join(str(x) for x in vec)
  async with engine.begin() as conn:
    await set_space(conn, inp.space_id)
    # Insert text and embedding
    await conn.execute(text(
      f"""
      INSERT INTO "AiEmbedding" (id, space_id, item_id, text, embedding)
      VALUES (gen_random_uuid()::text, :space_id, :item_id, :text, '[{values}]'::vector)
      """
    ).bindparams(space_id=inp.space_id, item_id=inp.item_id, text=inp.text))
  return {"ok": True}


@app.post("/rag/query")
async def rag(q: RAGQuery):
  if client is None:
    raise HTTPException(status_code=500, detail="OPENAI_API_KEY not set")
  emb = client.embeddings.create(model="text-embedding-3-small", input=q.query)
  qvec = emb.data[0].embedding
  qvalues = ",".join(str(x) for x in qvec)
  async with engine.begin() as conn:
    await set_space(conn, q.space_id)
    result = await conn.execute(text(
      f"""
      WITH q AS (SELECT '[{qvalues}]'::vector AS v)
      SELECT e.id, e.text, i.id AS item_id, i.canonical_json
      FROM "AiEmbedding" e
      LEFT JOIN "Item" i ON i.id = e.item_id
      ORDER BY e.embedding <-> (SELECT v FROM q)
      LIMIT :k
      """
    ).bindparams(k=q.k))
    rows = result.fetchall()
  citations: List[dict] = []
  context = []
  for r in rows:
    citations.append({"embedding_id": r.id, "item_id": r.item_id})
    context.append(r.text)
  prompt = f"Context: {' \n '.join(context)}\n\nQuestion: {q.query}\nAnswer briefly using the context."
  completion = client.chat.completions.create(
    model="gpt-4o-mini",
    messages=[{"role": "user", "content": prompt}],
    temperature=0.2,
    max_tokens=128,
  )
  answer = completion.choices[0].message.content
  return {"answer": answer, "citations": citations}


@app.post("/normalize")
async def normalize(payload: dict):
  # Placeholder normalizer
  return {"normalized": payload}

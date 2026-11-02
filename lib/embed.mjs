// Sentence embeddings with all-MiniLM-L6-v2 (384-d), run locally via ONNX Runtime.
// No external API key: the model is downloaded once from Hugging Face (or read
// from EMBEDDING_MODEL_DIR for offline use) and cached.
import { pipeline, env } from '@huggingface/transformers';

const MODEL_ID = process.env.EMBEDDING_MODEL || 'Xenova/all-MiniLM-L6-v2';
if (process.env.EMBEDDING_MODEL_DIR) {
  env.localModelPath = process.env.EMBEDDING_MODEL_DIR;
  env.allowRemoteModels = false;
}

let extractorPromise = globalThis.__embedder;
function getExtractor() {
  if (!extractorPromise) {
    extractorPromise = pipeline('feature-extraction', MODEL_ID, { dtype: 'fp32' });
    globalThis.__embedder = extractorPromise;
  }
  return extractorPromise;
}

/** Embed one or more strings -> array of 384-d L2-normalised vectors. */
export async function embed(texts) {
  const list = Array.isArray(texts) ? texts : [texts];
  const extractor = await getExtractor();
  const out = await extractor(list, { pooling: 'mean', normalize: true });
  return out.tolist();
}

/** pgvector text literal, e.g. '[0.1,0.2,...]' */
export const toPgVector = (v) => `[${v.map((x) => Number(x).toFixed(6)).join(',')}]`;

/** Text that represents a doctor in vector space. */
export const doctorDocument = (specName, specDesc, notes) =>
  `${specName}. ${specDesc} ${notes}`;

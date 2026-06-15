/**
 * Parse JSON from a model response (plain JSON or fenced code block).
 */
export function extractJson(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed) throw new Error('Respuesta vacía del modelo');

  try {
    return JSON.parse(trimmed);
  } catch (_) {
    /* try fenced block */
  }

  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) {
    return JSON.parse(fence[1].trim());
  }

  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start >= 0 && end > start) {
    return JSON.parse(trimmed.slice(start, end + 1));
  }

  throw new Error('No se encontró JSON válido en la respuesta');
}

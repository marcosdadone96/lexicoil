# Archivo conservador — no borrar hasta confirmar que nada falta

Movido aquí el 2026-06-26 (ruido histórico, no parte del flujo plantillas):

- `data-exams-_snapshots/` — backups viejos de exámenes (~9 MB)
- `data-exams-snapshots/` — snapshots alternativos
- `batches-logs/` — logs de generación API (328 archivos)
- `*.log`, `out-validate-*.txt` en batches/
- `_probe-*.json` — pruebas comparativas IA (Gemini/ChatGPT/Claude)

**No movido a propósito** (sigue en uso):

- `staging/` — cola de ingest → assemble → promote
- `batches/merged/` — pipeline legacy process-all-batches
- `batches/generated/` — batches válidos del flujo plantillas
- `batches/rejected/` — referencia de rechazos

Si tras unas semanas todo funciona, puedes borrar esta carpeta.

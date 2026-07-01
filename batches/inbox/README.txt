Bloc de notas — flujo B1 (Lesen + Hören + Schreiben + Sprechen)
===============================================================

ARCHIVOS INBOX (pega respuestas Gemini/ChatGPT aquí)
----------------------------------------------------
  LESEN:     todo-teil1.txt … todo-teil5.txt
  HÖREN:     todo-horen-teil1.txt … todo-horen-teil4.txt
  SCHREIBEN: todo-schreiben.txt          (1 JSON = Teile 1–3)
  SPRECHEN:  todo-sprechen.txt           (1 JSON = Teile 1–3)

PROMPT CON 10 PALABRAS ALEATORIAS
---------------------------------
  npm run lesen:prompt:t1 … t5
  npm run horen:prompt:t1 … t4
  npm run schreiben:prompt
  npm run sprechen:prompt

  Abre el prompt-*.txt correspondiente, copia TODO, pega en Gemini.

PEGAR RESPUESTA → validar + guardar + banco
-------------------------------------------
  LESEN:     npm run lesen:upload:t1 … t5
  HÖREN:     npm run horen:upload:t1 … t4
  SCHREIBEN: npm run schreiben:upload
  SPRECHEN:  npm run sprechen:upload

Con pool Netlify:
  npm run lesen:upload:pool:t1
  npm run horen:upload:pool:t1 … t4
  npm run schreiben:upload:pool
  npm run sprechen:upload:pool

PUBLICAR batches ya en batches/generated/
-----------------------------------------
  npm run lesen:publish:t1 … t5
  npm run horen:publish:t1 … t4
  npm run schreiben:publish
  npm run sprechen:publish

Los batches que FALLAN validación NO se guardan ni publican.
Lesen: 3 puertas (técnica + calidad + CEFR). Resto: validate-batch.mjs (esquema + blueprint).

Plantillas: plantillas-lesen-b1/ · plantillas-horen-b1/ · plantillas-schreiben-b1/ · plantillas-sprechen-b1/

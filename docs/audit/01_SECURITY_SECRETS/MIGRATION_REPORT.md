# MIGRATION REPORT — 01_SECURITY_SECRETS

> Completado en rama `feat/security-secrets`. Sin cambios de comportamiento de producto.

## Qué cambió

| Archivo | Acción |
|---------|--------|
| `.gitignore` | Ampliado: `dist/`, `*.zip`, `**/*.dist.zip`, `.env.local`, `landing/.next/`, `landing/out/` |
| `.env.example` | Reescrito con todas las claves documentadas y placeholders vacíos/fake |
| `SECURITY.md` | **Nuevo** — política, incidente, checklist de rotación humana, guard precommit |
| `scripts/precommit-secrets.mjs` | **Nuevo** — bloquea `.env`/`*.zip` staged + grep de patrones en tracked files |
| `package.json` | Script `precommit:secrets` |
| `docs/audit/01_SECURITY_SECRETS/SECRETS_INVENTORY.md` | Copia de inventario (valores redactados) |
| `lexicoil-trust-refactor-dist.zip` | Eliminado del **tracking** de Git (`git rm --cached`); archivo local conservado |

## Decisiones tomadas

- **`AUTH_JWT_SECRET` canónico** — `LEXICOIL_JWT_SECRET` sigue como fallback en código existente; documentado como deprecated en `.env.example` y `SECURITY.md`. No se tocó lógica auth.
- **Placeholders en `.env.example`** — valores vacíos o genéricos (`your-…`) en lugar de prefijos que parezcan claves reales (`sk_live_…`), para no disparar el scanner.
- **Scanner ligero** — sin herramientas externas; excluye `.env.example`, `SECURITY.md` e inventario del grep.
- **ZIP** — solo untrack; no borrar el archivo del disco (puede ser útil localmente sin `.env`).

## Riesgos / deuda introducida

- Rotación humana de credenciales **pendiente** — hasta entonces, secretos del incidente siguen válidos si fueron expuestos.
- El guard `precommit:secrets` no está instalado como git hook automático; hay que ejecutarlo manualmente (`npm run precommit:secrets`) o configurar hook local.

## Resultados de tests

- Comando: `npm run precommit:secrets`
- Resultado: **OK** — sin secretos staged ni patrones en ficheros tracked

## Verificación manual

- [x] Grep `sk_live`, `whsec_`, `sk-ant-api` en tracked JS/MJS/JSON — limpio
- [x] `.env` en `.gitignore`
- [x] `git ls-files lexicoil-trust-refactor-dist.zip` — vacío tras `git rm --cached`
- [ ] **(HUMANO)** Rotar Anthropic, Stripe live+webhook, Supabase, JWT 48+ bytes
- [ ] **(HUMANO)** Actualizar env vars en Netlify producción

## Próximos pasos / pendientes

1. Ejecutar checklist de rotación en `SECURITY.md` (hoy).
2. Fase **02_VALIDATOR_HARDENING** (auditoría PLAN-AUDIT).
3. Opcional: `npx husky` o hook local que llame a `precommit:secrets` en pre-commit.

## Feature flags tocados

- Ninguno.

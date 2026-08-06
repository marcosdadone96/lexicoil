# Inventario de secretos (valores REDACTADOS) y plan de rotación

Detectado en `./.env` (presente en el paquete compartido). NO contiene placeholders: son
valores reales. Acción humana inmediata: ROTAR.

| Variable | Tipo | Riesgo si se filtra | Rotación |
|----------|------|---------------------|----------|
| ANTHROPIC_API_KEY | Clave IA viva | Coste/abuso de API | Consola Anthropic → revocar + crear nueva |
| STRIPE_SECRET_KEY | Stripe LIVE secret | Cobros/reembolsos reales | Dashboard Stripe → roll key |
| STRIPE_WEBHOOK_SECRET | Webhook secret | Falsificar eventos de pago | Stripe → regenerar endpoint secret |
| AUTH_JWT_SECRET | Firma de sesión (39 chars, débil) | **Falsificar tokens, suplantar cuentas** | Generar 32+ bytes aleatorios |
| SUPABASE_URL / SUPABASE_ANON_KEY | Backend auth | Acceso según RLS | Rotar anon key; revisar RLS |
| STRIPE_PUBLISHABLE_KEY | Público | Bajo | Opcional |
| LEXICOIL_SITE_URL / ALLOWED_ORIGINS / CLAUDE_MODEL | Config | Bajo | No es secreto |

## Generar JWT fuerte

```
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

## Nota de incidente (incluir en SECURITY.md)

El paquete compartido del proyecto contenía `.env` con secretos LIVE en claro. Aunque `.env`
está en `.gitignore`, viajó dentro del ZIP. Tratar como comprometido: rotar TODO y asumir que
los tokens de sesión emitidos con el JWT viejo pueden ser falsificables hasta rotar el secreto.

> Esto no es asesoramiento legal ni financiero; rotar credenciales es buena práctica de
> seguridad, no una garantía. Confirmar alcance con Stripe, Anthropic y Supabase.

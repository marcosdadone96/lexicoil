# CLEANUP_SPEC — homogeneización de tokens + accesibilidad

## Marca BLOQUEADA (no cambiar valores)
- Primary Blue #2563EB · Teal #06B6D4 · Dark Navy #0F172A · Light Gray #E2E8F0
- Tipografía: Poppins SemiBold / Bold
- Logo y variaciones: intocables.

## Alias legacy -> token canónico (rename, no recolor)
- --accent      -> --brand
- --accent2     -> --brand-dark
- --accent-dim  -> --brand-light
- --text2       -> --text-secondary
- --text3       -> --text-muted
- --r           -> --radius-md
- --r-lg        -> --radius-lg

Structural aliases (--bg, --surface, --border2) deferred to a later pass.

## Estilos inline
- ~186 en JS + ~52 en index.html -> mover a clases basadas en tokens.
- Prohibido hex crudo nuevo; si hace falta one-off, usar var(--token).

## Accesibilidad (WCAG AA)
- onclick inline -> listeners delegados donde sea viable.
- ARIA roles/labels en componentes generados por string.
- Gestión de foco al cambiar de screen (anunciar/enfocar el nuevo contenido).
- Contraste AA contra la paleta bloqueada.
- Navegación por teclado en flujo de examen y flashcards.

## Coherencia
Respetar UX Principles del proyecto (claridad, una acción primaria por pantalla, mostrar
progreso). No rediseñar; consolidar.

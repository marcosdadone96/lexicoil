# Safari / iOS audio — testing status

## Restricciones conocidas (sin dispositivo)

Safari en iOS aplica políticas estrictas de autoplay:

- `HTMLAudioElement.play()` y `AudioContext` requieren un **gesto explícito del usuario** (tap/click) antes del primer audio.
- Sin gesto previo, `play()` rechaza con `NotAllowedError`.
- `AudioContext` inicia en estado `suspended` hasta `resume()` tras gesto.
- iOS ignora autoplay aunque el audio esté silenciado; `playsinline` evita fullscreen en vídeo pero también se aplica a audio inline.

## Workarounds aplicados (2026-07-14)

| Área | Cambio |
|------|--------|
| `js/bootstrap/audio.js` | `unlockWebAudio()` en primer gesto; `playsinline` + `webkit-playsinline` en elementos `<audio>` |
| `js/ui/exam/examRunner.js` | `unlockWebAudio()` antes de Hören TTS |
| `js/ui/exam/speakingLiveClient.js` | unlock antes de `AudioContext` (mic + playback) |
| `js/library/HorenGame.js` | `playsinline` en audio del mini-juego |

## Qué se puede validar sin iPhone/iPad

- Código presente y rutas de fallback (`speechSynthesis` si TTS falla).
- `unlockWebAudio` no lanza en desktop Chrome/Firefox.
- Simulación de rechazo: `audio.play().catch()` ya existía — no rompe el flujo.

## Pendiente — prueba real en dispositivo iOS

**No confirmado en hardware iOS** (falta iPhone/iPad físico o BrowserStack hoy):

1. Hören: botón Play tras un tap en la página reproduce TTS/MP3.
2. Speaking live: PTT + respuesta de voz del modelo.
3. HorenGame: reproducción por palabra.
4. Flashcard 🔊 (`speakBtn`) tras tap.

### Checklist manual (cuando haya dispositivo)

- [ ] Safari iOS 17+: examen Hören → Play → audio audible
- [ ] Safari iOS: Speaking live → iniciar sesión → PTT → respuesta audio
- [ ] Safari iOS: vocab listening game → play word
- [ ] Modo silencioso del dispositivo (switch físico) — comportamiento esperado documentado para usuario

## Referencias

- [WebKit — Autoplay policy](https://webkit.org/blog/7734/auto-play-policy-changes-for-macos/)
- Apple Developer: `playsinline` attribute for inline media playback on iOS

# Fire TV tweaks & best practices

Consolidado de pesquisa em docs Amazon/LightningJS/Capacitor + casos de produção
da comunidade. Use como **checklist** quando atacar performance ou bugs específicos
de Fire TV. Itens marcados `[x]` já estão aplicados no código; `[ ]` aguardam
decisão / oportunidade de aplicar.

## 1. Manifesto Android & Capacitor

- [x] `<uses-feature android:glEsVersion="0x00020000" required>` — declara WebGL como requisito (filtra devices incompatíveis na Appstore)
- [x] `android:hardwareAccelerated="true"` — usa GPU pra rendering
- [x] `android:largeHeap="true"` — heap maior pro WebView do LightningJS
- [x] `<uses-feature android:software.leanback required="false">` — flag pra TV launcher reconhecer
- [x] `<uses-feature android:hardware.touchscreen required="false">` — declara que não precisa toque
- [x] `<intent-filter>` com `LEANBACK_LAUNCHER` — banner aparece na home Fire TV
- [x] `<application android:banner="@drawable/tv_banner">` — banner 320×180 da grid
- [x] Permissões: `INTERNET` + `ACCESS_NETWORK_STATE`
- [x] `server.allowNavigation: ["streamix.mahina.cloud", ...]` no `capacitor.config.ts`
- [x] `CapacitorHttp.enabled: true` (bypass CORS pro fetch externo)
- [ ] **WebView cache flush** no `MainActivity.java` em cada boot (evita assets stale após update). [Caso real](https://www.vchalyi.com/blog/2026/capacitor-webview-cache-stale-assets/) — assets do APK não são re-cacheáveis
- [ ] `splashScreen.launchShowDuration: 0` no `capacitor.config.ts` (já temos splash HTML custom, evita splash nativo duplicado)

## 2. LightningJS renderer (devices/common/index.ts)

- [x] `appWidth: 1920, appHeight: 1080` — coords lógicas fixas
- [x] `deviceLogicalPixelRatio: window.innerHeight / 1080` — escala dinâmica (720p/1080p/4K)
- [x] `devicePhysicalPixelRatio: window.devicePixelRatio || 1` — DPR físico do device
- [x] `numImageWorkers: 0` — Fire OS WebView antigo trava com web workers de imagem
- [x] `fontEngines: [SdfTextRenderer, CanvasTextRenderer]` — MSDF é mais nítido e leve
- [x] `clearColor: 0x00000000` — bg transparente pro `<video>` HLS aparecer atrás
- [x] `boundsMargin: 240/500` — preload offscreen razoável pra TV
- [x] `textureMemory.criticalThreshold: 100MB` — Fire TV Stick antigo só tem 1-2GB RAM
- [ ] **Reduzir `criticalThreshold` pra 80MB** em Fire TV Stick básico (sticks 1ª/2ª gen). Pode discriminar via `navigator.userAgent` ou env var
- [ ] **`renderEngine: WebGlCoreRenderer`** já é o default — em Sticks muito antigos, considerar `Canvas2dCoreRenderer` (sem WebGL, mais lento mas funciona em qualquer hw)
- [ ] **Texture compression KTX/ETC2** pros sprites estáticos do app (logos, ícones, splash) — reduz VRAM em 4-8x. Requer pre-processing build-time

## 3. Polyfills / shims (index.html)

- [x] `SpeechSynthesisErrorEvent` shim — WebView antigo Fire OS não tem essa classe global, e o announcer do `@lightningtv/solid` usa `instanceof` no catch (crasha com ReferenceError em loop)
- [x] Patch global `fetch` — same-origin → browser fetch (assets locais), cross-origin → CapacitorHttp (CORS bypass)
- [x] Restaura `XMLHttpRequest` original (Capacitor patcheia, mas Lightning loader de SDF font precisa do nativo)
- [ ] **Polyfill `IntersectionObserver`** — usado em algumas libs modernas, ausente em WebView pré-Chrome 51

## 4. Safe zone / overscan

- [x] Padding `4vh 4vw` no `#app` — TV física corta 2-5% das bordas (overscan), 4% é compromise visual razoável. Amazon spec: 90% inner safe zone
- [x] App Icon banner (1280×720) tem safe zone interna 882×448 documentada no `store-assets/README.md`
- [ ] **Verificar páginas individuais** — Home/Movies/Series com hero/banner edge-to-edge podem perder conteúdo importante na borda. Inspecionar com TV real

## 5. Remote control input

Conforme [Amazon Controller Behavior Guidelines](https://developer.amazon.com/docs/fire-tv/controller-behavior-guidelines.html):

| Botão                    | Keycode     | Comportamento esperado                         | No Streamix                     |
| ------------------------ | ----------- | ---------------------------------------------- | ------------------------------- |
| D-pad center             | 13          | Selecionar                                     | ✅                              |
| D-pad up/down/left/right | 38/40/37/39 | Navegar foco                                   | ✅ (LightningTV gerencia)       |
| Back                     | 4           | Voltar uma tela. **Top-level: dialog "Sair?"** | ⚠️ verificar se Home tem dialog |
| Menu                     | 82          | Sistema (não interceptar)                      | ✅ não captura                  |
| Home                     | —           | Sistema (não interceptável)                    | ✅                              |
| Voice Search/Mic         | 130         | Sistema (não interceptar)                      | ✅ não captura                  |
| Play/Pause               | **179**     | **Mandatório** pra apps de mídia               | ⚠️ confirmar PlayerPage         |
| Rewind                   | 227         | Skip backward                                  | ⚠️                              |
| FastForward              | 228         | Skip forward                                   | ⚠️                              |
| Channel up/down          | 166/167     | Trocar canal                                   | ⚠️ Live TV                      |

Regras importantes:

- **Back nunca toggle** — só backward navigation linear, eventualmente leva pra Home Fire TV
- **Play/Pause é toggle** — mesmo botão para play e pause
- **Voice Search invoca `pause`** custom event — pausar áudio quando user invoca voice (mic)

## 6. Performance budget (Amazon target)

| Métrica                        | Alvo                  | Como medir                                                  |
| ------------------------------ | --------------------- | ----------------------------------------------------------- |
| TTID (Time to Initial Display) | < 1s                  | Splash visível na primeira frame                            |
| TTFD (Time to Full Display)    | < 5s                  | Home com 1ª row de filmes pintada                           |
| Bundle JS crítico              | < 170 KB gzip         | `pnpm build:firetv && du -sh dist/firetv/assets/index-*.js` |
| Memória sustentada             | < 200 MB              | `adb shell dumpsys meminfo tv.streamix.app`                 |
| FPS scrolling                  | 60 (ideal) / 30 (mín) | LightningJS inspector + `Config.debug = true`               |

[FireOS Performance Testing Tool](https://developer.amazon.com/apps-and-games/blogs/2024/12/optimize-fire-tv-app-performance) — ferramenta open-source da Amazon que mede TTID/TTFD em device real via ADB.

## 7. Network / CDN

- [x] HLS.js light bundle (`hls.js/dist/hls.light.min.js`) — sem features extras que Fire TV não usa
- [x] `streamix.mahina.cloud` atrás de Cloudflare GRU (latência baixa BR)
- [x] Image proxy com resize server-side (`?w=480` pro grid) — não baixa full-res TMDB
- [x] Pre-warm DNS com `<link rel="dns-prefetch" href="https://streamix.mahina.cloud">` no `<head>` — economiza ~100-300ms no primeiro request

## 8. Crash reporting / observability

- [x] Always-on err overlay vermelho (`index.html`) — captura `error`/`unhandledrejection`/`console.error`
- [x] Splash watchdog 30s — detecta boot infinito
- [ ] **Sentry** ou similar — quando app for público, rastrear crashes em produção
- [ ] **Telemetria de FPS** — Lightning expõe via `Config.fpsUpdateInterval` + custom callback

## 9. Submissão Amazon Appstore

- ✅ Web app submission **descontinuado em 31/out/2024** — só APK Android aceito
- ✅ Assets 1280×720 + 1920×1080 prontos em `store-assets/`
- ⚠️ Falta capturar 3+ screenshots 1920×1080 da app real
- ⚠️ Conteúdo IPTV pode precisar review extra (compliance de licenças/DRM)

## 10. Fontes consultadas

- [Optimize Fire TV App Performance (Amazon, 2024)](https://developer.amazon.com/apps-and-games/blogs/2024/12/optimize-fire-tv-app-performance)
- [Fire TV Controller Behavior Guidelines](https://developer.amazon.com/docs/fire-tv/controller-behavior-guidelines.html)
- [Supporting Controllers in Web Apps (Fire TV)](https://developer.amazon.com/docs/fire-tv/supporting-controllers-in-web-apps.html)
- [Capacitor WebView Cache: Why New Builds Show Old Assets](https://www.vchalyi.com/blog/2026/capacitor-webview-cache-stale-assets/)
- [LightningJS Stage Options API](https://www.lightningjs.io/api/lightning-core/interfaces/Lightning.Stage.Options.html)
- [Blits Application Settings](https://www.lightningjs.io/v3-docs/blits/essentials/settings.html)
- [Improve Mobile App Performance in Capacitor Apps (NextNative, 2025)](https://nextnative.dev/blog/improve-mobile-app-performance)
- [Capacitor Issue #6602 — Fire HD WebView detection](https://github.com/ionic-team/capacitor/issues/6602) (corrigido em PR #6603)

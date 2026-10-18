# Desktop particle ring — version 2026-10-18.1

The desktop Jarvis overlay now uses the owner's approved local ring-lab preset:

| Setting | Value |
| --- | --- |
| Particles | 80,000 maximum, reduced automatically if rendering is slow |
| Particle size | 1.20 px |
| Diameter | 76% of the canvas's shorter dimension |
| Thickness | 0.045 |
| Speed | 0.90 |
| Noise | 2.45 |
| Glow | 1.05 |
| Audio sensitivity | 2.45 |

These values came from the owner's approved screenshot. They are fixed production defaults, independent of temporary lab/browser storage. The lab's controls, simulated data and sample audio are not part of this release.

`src/assistant/jarvis-ring.js` retains the original 2D membrane. At desktop widths (1100 CSS pixels or more), it loads `assets/graphics/jarvis-particle-ring.js` and the locally vendored Three.js 0.186.1 modules. The original remains visible while loading and is restored if loading, WebGL startup or rendering fails, or the graphics context is lost. Resizing to a narrow layout also restores the original. Closing Jarvis cancels pending startup and disposes the active renderer.

The particle ring circulates, breathes and occasionally twists. Mouse movement leaves a short, local wake on desktop with a fine pointer. Reduced motion disables that response and the travelling twists. The renderer consumes the existing phase and motion signals; it does not acquire audio, start voice sessions or change voice, WhatsApp, approval or server behavior. Measured output silence takes precedence over the estimated speech envelope.

The module and changed stylesheet/loader have new cache tags. The GPU canvas can shrink vertically in compact desktop layouts while retaining a circular projection, avoiding clipping above the controls. Vendor checksums and the MIT license are included beside the unmodified Three.js files.

Validation: all 342 local tests pass, including renderer selection, delayed imports after closing, responsive transitions, startup/runtime fallback, preset/vendor integrity, existing pointer behavior and audio level precedence. Browser checks cover the main overlay at 1280×720, 1920×1080 and a narrow 390×844 viewport, mouse response and clean console output. No microphone or paid voice session was used. A responsive browser viewport is not physical-phone performance validation; phones retain the original ring.

# 🚀 Nebula Strike 3D

Juego 3D de combate espacial para **Android** (y cualquier navegador) construido como
**aplicación web PWA** con **Three.js**, el framework 3D especializado para la web.
Explora sectores orbitales, cumple contratos de combate, fija cazas enemigos con la
mira, mejora el nivel de tu piloto, recoge power-ups y libera la frontera estelar.

## ▶️ Cómo jugar

| Acción | 📱 Android | 🖥️ PC |
|---|---|---|
| Girar y cambiar rumbo | Arrastra el dedo por la pantalla | Ratón o `WASD` / flechas |
| Apuntar/fijar | Fijación asistida al hostil cercano | Lleva la mira hacia el objetivo |
| Disparar | Botón **FUEGO** (abajo a la derecha) | `ESPACIO` o clic |
| Turbo | Botón **TURBO** (abajo a la izquierda) | `SHIFT` |
| Pausa | Botón `❚❚` | `P` o `ESC` |

### Contratos, progresión y puntos
- 🕹️ Vuelo libre 3D: la nave gira, cambia de rumbo y la cámara persigue su orientación.
- 📡 Oleadas tácticas desde todos los flancos con radar 360° (incluida la retaguardia).
- 🧭 Libera cuatro sectores con identidad propia y contratos de dificultad creciente.
- 🎯 La mira fija hostiles, muestra distancia/vida y guía suavemente los proyectiles.
- 🧑‍🚀 Gana XP y niveles: más escudo, cadencia, daño y cañón doble permanente.
- 💎 Asteroides: 25 / 50 / 100 pts (los grandes **se parten** en fragmentos).
- 👾 Cazas con resistencia creciente según el sector y recompensas de créditos/XP.
- 🧲 Power-ups: **+Escudo**, **Tiro rápido** y **Disparo doble**.
- 🔥 Combo: elimina objetivos rápidamente para multiplicar puntos hasta **×5**.

## 🧰 Tecnologías (descargadas y empaquetadas en el repo)

| Herramienta | Para qué |
|---|---|
| [Three.js r160](libs/three.module.js) | Framework 3D WebGL: escena, cámara, mallas, partículas, niebla |
| Web Audio API | **Audio 100 % sintetizado**: motor de la nave, láser, explosiones y música procedural (synthwave Am–F–G–C) — sin archivos de audio |
| Canvas 2D | Texturas procedurales: estrellas, nebulosas, planeta, rejilla, brillos |
| Service Worker + Manifest | **PWA instalable en Android**, funciona sin conexión |

Los **modelos 3D** (nave, cazas, asteroides, power-ups) se generan **proceduralmente
en código** (primitivas + geometría deformada con semilla determinista), sin necesidad
de Blender u otros tools de modelado.

## 📁 Estructura

```
index.html          Pantalla, HUD y overlays (menú, pausa, game over)
manifest.webmanifest Metadatos PWA (instalable en Android)
sw.js               Service Worker (cache offline)
css/style.css       Estilos sci-fi (HUD, botones táctiles, tipografía Orbitron)
js/main.js          Arranque, máquina de estados y HUD
js/game.js          Núcleo: entidades, colisiones, partículas, dificultad
js/world.js         Mundo 3D: estrellas, nebulosas, sol, planeta, rejilla
js/models.js        Modelos 3D procedurales + texturas de brillo
js/audio.js         Motor de audio (SFX + música procedural)
js/input.js         Entrada táctil + teclado/ratón
libs/three.module.js Three.js r160 (descargado)
assets/             Icono 1024px + fuente Orbitron (descargada)
server.js           Servidor local sin dependencias
```

## 🚀 Ejecutar

```bash
node server.js        # → http://localhost:8080
# o cualquier servidor estático:  python3 -m http.server 8080
```

## 📲 Instalarlo en Android (como app nativa)

1. Abre el juego en **Chrome** (debe estar servido por **HTTPS** — p. ej. GitHub Pages,
   Netlify, Vercel… o `adb reverse` para probarlo en el móvil).
2. Menú Chrome → **「Añadir a pantalla de inicio」/「Instalar app」**.
3. Listo: icono en el launcher, pantalla completa, sin barra de navegador y
   **funciona sin internet** (gracias al Service Worker).

Para una APK "de verdad" puedes envolver esta app con
[Capacitor](https://capacitorjs.com/):

```bash
npm init @capacitor/app
npx cap add android
# copia esta carpeta a www/ y npx cap sync
```

## 🎮 Características técnicas

- Cámara cinematográfica con seguimiento, **sacudida** y **FOV dinámico** (efecto turbo)
- Colisiones por **esferas barridas** (los láseres rápidos nunca atraviesan objetivos)
- Sistema de partículas (explosiones, estelas, muzzle flash) con un solo `THREE.Points`
- Dificultad progresiva: velocidad, frecuencia de spawns y oleadas de enemigos
- Récord guardado en `localStorage`
- Optimizado para móvil: `pixelRatio ≤ 2`, pools de entidades, sin shadows, ~60 fps

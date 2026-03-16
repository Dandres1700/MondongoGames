import * as constante from "./constante.js";
import { AppMenu } from "./menu.js";
import { Personaje } from "./personaje.js";
import { Arma } from "./arma.js";
import { Mundo } from "./mundo.js";
import { DamageText } from "./texto.js";

// Escala para UI.
function escalarImagen(image, scale) {
  return { image, w: Math.max(1, Math.round(image.width * scale)), h: Math.max(1, Math.round(image.height * scale)) };
}

// Dibuja imagen escalada.
function dibujarScaled(ctx, scaled, x, y) {
  ctx.drawImage(scaled.image, x, y, scaled.w, scaled.h);
}

// Carga imagen.
function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`No se pudo cargar: ${src}`));
    img.src = src;
  });
}

// Carga segura (puede ser null).
async function loadImageSafe(src) {
  try {
    return await loadImage(src);
  } catch {
    return null;
  }
}

// Carga fuente.
async function loadFont() {
  const font = new FontFace(constante.WALL_BLOOD_FONT, `url(${constante.ASSET_PATHS.font})`);
  const loaded = await font.load();
  document.fonts.add(loaded);
}

// Lee CSV del nivel.
async function loadCSV(url) {
  const res = await fetch(url);
  const txt = (await res.text()).replace(/^\uFEFF/, "");
  return txt
    .trim()
    .split(/\r?\n/)
    .map((line) =>
      line
        .split(";")
        .map((n) => Number.parseInt(String(n).trim(), 10))
        .map((n) => (Number.isFinite(n) ? n : 0))
    );
}

// Dibuja texto.
function drawText(ctx, text, x, y, size = 30, color = constante.BLANCO) {
  ctx.font = `${size}px ${constante.WALL_BLOOD_FONT}, Orbitron, sans-serif`;
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

// Dibuja vida.
function drawPlayerLife(ctx, hearts, energia) {
  let mitadDibujado = false;
  for (let i = 0; i < 5; i++) {
    const x = 5 + i * 50;
    const y = 5;
    const threshold = (i + 1) * 20;
    if (energia >= threshold) dibujarScaled(ctx, hearts.full, x, y);
    else if (energia % 20 > 0 && !mitadDibujado) {
      dibujarScaled(ctx, hearts.half, x, y);
      mitadDibujado = true;
    } else dibujarScaled(ctx, hearts.empty, x, y);
  }
}

// Assets del menu.
async function loadMenuAssets() {
  await loadFont();
  const tile1 = await loadImage(constante.ASSET_PATHS.tile(1));
  return { tile1 };
}

// Assets del juego.
async function loadGameAssets(baseTile) {
  const withFallback = (frames, fallback) => (frames.length > 0 ? frames : fallback);

  const tileRaw = await Promise.all(
    Array.from({ length: constante.TILE_TYPES }, (_, i) => loadImageSafe(constante.ASSET_PATHS.tile(i + 1)))
  );
  const tileList = tileRaw.map((img) => {
    // Cada tile se normaliza al mismo tamano para dibujar el mapa sin desfase.
    const c = document.createElement("canvas");
    c.width = constante.TILE_SIZE;
    c.height = constante.TILE_SIZE;
    const cctx = c.getContext("2d");
    cctx.drawImage(img || baseTile, 0, 0, constante.TILE_SIZE, constante.TILE_SIZE);
    return c;
  });

  const playerFramesRaw = await Promise.all(constante.ASSET_PATHS.playerFrames.map(loadImage));
  const enemyGoblinRaw = await Promise.all(constante.ASSET_PATHS.enemyFrames.gobling.map(loadImage));
  const enemyHongoRaw = await Promise.all(constante.ASSET_PATHS.enemyFrames.hongo.map(loadImage));
  const enemyEsqueletoRaw = await Promise.all(constante.ASSET_PATHS.enemyFrames.esqueleto.map(loadImage));
  const jefe1Raw = await Promise.all(constante.ASSET_PATHS.enemyFrames.jefe1.map(loadImageSafe));
  const jefe2Raw = await Promise.all(constante.ASSET_PATHS.enemyFrames.jefe2.map(loadImageSafe));
  const jefe3Raw = await Promise.all(constante.ASSET_PATHS.enemyFrames.jefe3.map(loadImageSafe));
  const armaRaw = await loadImage(constante.ASSET_PATHS.arma);
  const balaRaw = await loadImage(constante.ASSET_PATHS.bala);
  const heartsRaw = {
    empty: await loadImage(constante.ASSET_PATHS.hearts.empty),
    half: await loadImage(constante.ASSET_PATHS.hearts.half),
    full: await loadImage(constante.ASSET_PATHS.hearts.full),
  };
  const coinRaw = await Promise.all(constante.ASSET_PATHS.coinFrames.map(loadImage));
  const pocionRaw = await loadImage(constante.ASSET_PATHS.pocion);

  return {
    tileList,
    playerFrames: playerFramesRaw,
    enemyFrames: {
      gobling: enemyGoblinRaw,
      hongo: enemyHongoRaw,
      esqueleto: enemyEsqueletoRaw,
      jefe1: withFallback(jefe1Raw.filter(Boolean), enemyEsqueletoRaw),
      jefe2: withFallback(jefe2Raw.filter(Boolean), enemyEsqueletoRaw),
      jefe3: withFallback(jefe3Raw.filter(Boolean), enemyEsqueletoRaw),
    },
    arma: armaRaw,
    bala: balaRaw,
    hearts: {
      empty: escalarImagen(heartsRaw.empty, constante.SCALA_CORAZON),
      half: escalarImagen(heartsRaw.half, constante.SCALA_CORAZON),
      full: escalarImagen(heartsRaw.full, constante.SCALA_CORAZON),
    },
    itemImagenes: [
      coinRaw,
      [pocionRaw],
    ],
  };
}

export async function run(canvas) {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const menuAssets = await loadMenuAssets();
  const menu = new AppMenu(canvas, menuAssets.tile1);
  let assets = null;

  let estado = "menu";
  let nivel = 1;
  let worldData = null;
  let world = null;
  let jugador = null;
  let listaEnemigos = [];
  let arma = null;
  let grupoBalas = [];
  let grupoDamage = [];
  let menuPausa = false;
  let mouseDown = false;
  let mousePos = [0, 0];
  let running = true;
  let cargandoJuego = false;
  let cameraOffset = [0, 0];
  let cambiandoNivel = false;
  let partidaInicioMs = 0;
  let partidaReportada = false;
  // Test por URL: ?nivel=1..5
  const nivelQuery = Number.parseInt(new URLSearchParams(window.location.search).get("nivel") || "1", 10);
  const nivelInicial = Number.isFinite(nivelQuery)
    ? Math.max(1, Math.min(constante.NIVEL_MAXIMO, nivelQuery))
    : 1;

  // Reinicia estructuras.
  function resetearMundo() {
    grupoDamage = [];
    grupoBalas = [];
    return Array.from({ length: constante.FILAS }, () => Array.from({ length: constante.COLUMNAS }, () => 2));
  }

  // Carga y arma el nivel.
  async function cargarNivel(n) {
    worldData = resetearMundo();
    const csvData = await loadCSV(constante.ASSET_PATHS.niveles(n));
    for (let x = 0; x < csvData.length && x < constante.FILAS; x++) {
      for (let y = 0; y < csvData[x].length && y < constante.COLUMNAS; y++) {
        worldData[x][y] = csvData[x][y];
      }
    }
    world = new Mundo();
    world.processData(worldData, assets.tileList, assets.itemImagenes, assets.enemyFrames);
    listaEnemigos = [...world.listaEnemigos];
    cameraOffset = [0, 0];
  }

  // Inicia partida.
  async function iniciarJuego() {
    estado = "loading";
    cargandoJuego = true;
    cambiandoNivel = false;
    if (!assets) {
      assets = await loadGameAssets(menuAssets.tile1);
    }
    nivel = nivelInicial;
    await cargarNivel(nivel);
    const spawnInicial = world.nearestWalkableFrom(constante.COORDENADAS[nivel]);
    jugador = new Personaje(spawnInicial[0], spawnInicial[1], assets.playerFrames, 100, 1);
    arma = new Arma(assets.arma, assets.bala);
    menuPausa = false;
    partidaInicioMs = performance.now();
    partidaReportada = false;
    cargandoJuego = false;
    estado = "juego";
  }

  function reportarPartida() {
    if (partidaReportada || !jugador) return;
    partidaReportada = true;
    const elapsedSeconds = Math.max(0, Math.round((performance.now() - partidaInicioMs) / 1000));
    if (typeof window.registrarPartida === "function") {
      window.registrarPartida({
        score: Number(jugador.score || 0),
        tiempo_juego: elapsedSeconds,
      });
    }
  }

  menu.setOnPlay(() => {
    iniciarJuego().catch(console.error);
  });

  const pressedKeys = new Set();
  // Limpia teclas pegadas.
  const resetKeys = () => {
    pressedKeys.clear();
  };

  function keyDownHandler(event) {
    if (!running) return;
    if (
      event.key === "ArrowUp" ||
      event.key === "ArrowDown" ||
      event.key === "ArrowLeft" ||
      event.key === "ArrowRight" ||
      event.key === " " ||
      event.key === "Enter" ||
      event.key === "Escape"
    ) {
      event.preventDefault();
    }
    if (estado === "menu") {
      menu.handleKey(event);
      return;
    }
    if (event.code === "KeyW" || event.code === "KeyA" || event.code === "KeyS" || event.code === "KeyD") {
      pressedKeys.add(event.code);
    }
    const k = event.key.toLowerCase();
    if (k === "p") menuPausa = !menuPausa;
    // Abre puertas.
    if (k === "e" && world.cambiarPuerta(jugador, assets.tileList)) {
      // puerta abierta
    }
    if (event.key === "Escape") {
      if (estado === "juego") reportarPartida();
      estado = "menu";
      menu.setScreen("menu_principal");
    }
    if (event.key === "Enter" && !jugador.vivo) {
      reportarPartida();
      estado = "menu";
      menu.setScreen("menu_principal");
    }
  }

  function keyUpHandler(event) {
    if (event.code === "KeyW" || event.code === "KeyA" || event.code === "KeyS" || event.code === "KeyD") {
      pressedKeys.delete(event.code);
    }
  }

  function mouseMoveHandler(event) {
    const rect = canvas.getBoundingClientRect();
    mousePos = [
      (event.clientX - rect.left) * (canvas.width / rect.width),
      (event.clientY - rect.top) * (canvas.height / rect.height),
    ];
  }

  // Pausa input al perder foco.
  function blurHandler() {
    resetKeys();
    mouseDown = false;
  }

  function visibilityHandler() {
    if (document.hidden) blurHandler();
  }

  function drawPause() {
    ctx.fillStyle = "rgba(0,0,0,0.75)";
    ctx.fillRect(0, 0, constante.ANCHO_VENTANA, constante.ALTO_VENTANA);
    drawText(ctx, "PAUSA", constante.ANCHO_VENTANA / 2 - 90, constante.ALTO_VENTANA / 2 - 40, 80, constante.AMARILLO_DORADO);
    drawText(ctx, "P para volver", constante.ANCHO_VENTANA / 2 - 90, constante.ALTO_VENTANA / 2 + 20, 30);
    drawText(ctx, "ESC para menu", constante.ANCHO_VENTANA / 2 - 110, constante.ALTO_VENTANA / 2 + 60, 30);
  }

  // Pantalla game over.
  function drawGameOver() {
    ctx.fillStyle = constante.ROJO_OSCURO;
    ctx.fillRect(0, 0, constante.ANCHO_VENTANA, constante.ALTO_VENTANA);
    drawText(ctx, "Game Over", constante.ANCHO_VENTANA / 2 - 170, constante.ALTO_VENTANA / 2 - 80, 100, constante.AMARILLO_DORADO);
    drawText(ctx, "ENTER para menu", constante.ANCHO_VENTANA / 2 - 120, constante.ALTO_VENTANA / 2 + 10, 36);
  }

  let lastFrame = performance.now();
  function frame(now) {
    if (!running) return;
    const dt = Math.min(40, now - lastFrame);
    lastFrame = now;

    if (estado === "menu") {
      menu.draw();
      requestAnimationFrame(frame);
      return;
    }

    if (estado === "loading") {
      menu.draw();
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fillRect(0, 0, constante.ANCHO_VENTANA, constante.ALTO_VENTANA);
      drawText(ctx, "CARGANDO...", constante.ANCHO_VENTANA / 2 - 130, constante.ALTO_VENTANA / 2, 56, constante.AMARILLO_DORADO);
      requestAnimationFrame(frame);
      return;
    }

    ctx.fillStyle = constante.COLOR_FONDO;
    ctx.fillRect(0, 0, constante.ANCHO_VENTANA, constante.ALTO_VENTANA);

    if (jugador.vivo && !menuPausa) {
      const axisX = (pressedKeys.has("KeyD") ? 1 : 0) - (pressedKeys.has("KeyA") ? 1 : 0);
      const axisY = (pressedKeys.has("KeyS") ? 1 : 0) - (pressedKeys.has("KeyW") ? 1 : 0);
      const dx = axisX * constante.VELOCIDAD;
      const dy = axisY * constante.VELOCIDAD;

      const [posicionPantalla, nivelCompletado] = jugador.movimiento(dx, dy, world.obstaculosTiles, world.exitTile);
      // Limita scroll.
      const cameraStep = world.clampCameraDelta(posicionPantalla, cameraOffset);
      // Compensa al jugador.
      if (cameraStep.applied[0] !== posicionPantalla[0]) {
        jugador.forma.x += cameraStep.applied[0] - posicionPantalla[0];
      }
      if (cameraStep.applied[1] !== posicionPantalla[1]) {
        jugador.forma.y += cameraStep.applied[1] - posicionPantalla[1];
      }
      cameraOffset = cameraStep.nextOffset;
      world.update(cameraStep.applied);
      jugador.update();

      for (const ene of listaEnemigos) {
        if (ene.energia <= 0) continue;
        ene.enemigos(jugador, world.obstaculosTiles, cameraStep.applied, world.exitTile);
        ene.update();
      }
      listaEnemigos = listaEnemigos.filter((e) => e.energia > 0);

      arma.setMousePos(mousePos);
      const bala = arma.update(jugador, mouseDown);
      if (bala) grupoBalas.push(bala);

      for (const b of grupoBalas) {
        const [dano, posDano] = b.update(listaEnemigos, world.obstaculosTiles);
        if (dano !== 0 && posDano) grupoDamage.push(new DamageText(posDano.centerx, posDano.centery, String(dano)));
      }
      grupoBalas = grupoBalas.filter((b) => b.alive);

      for (const item of world.listaItem) item.update(cameraStep.applied, jugador);
      world.listaItem = world.listaItem.filter((i) => i.alive);

      for (const txt of grupoDamage) txt.update(cameraStep.applied);
      grupoDamage = grupoDamage.filter((t) => t.alive);

      if (nivelCompletado) {
        if (!cambiandoNivel && nivel < constante.NIVEL_MAXIMO) {
          // Evita doble salto.
          cambiandoNivel = true;
          resetKeys();
          mouseDown = false;
          nivel += 1;
          cargarNivel(nivel).then(() => {
            // Spawn original ajustado a piso cercano.
            const spawnSeguro = world.nearestWalkableFrom(constante.COORDENADAS[nivel]);
            jugador.actualizarCoordenadas(spawnSeguro);
            cambiandoNivel = false;
          });
        }
      }
    }

    if (!world || !jugador || !arma) {
      requestAnimationFrame(frame);
      return;
    }

    world.draw(ctx);
    jugador.dibujar(ctx);
    for (const ene of listaEnemigos) ene.dibujar(ctx);
    for (const b of grupoBalas) b.dibujar(ctx);
    arma.dibujar(ctx);
    for (const item of world.listaItem) item.dibujar(ctx);
    for (const txt of grupoDamage) txt.draw(ctx);

    drawPlayerLife(ctx, assets.hearts, jugador.energia);
    drawText(ctx, `Puntaje: ${jugador.score}`, 1180, 32, 28, "#ffff00");
    drawText(ctx, `Nivel: ${nivel}`, constante.ANCHO_VENTANA / 2 - 40, 32, 28);

    if (world.checkVictory(jugador)) {
      drawText(ctx, "¡Ganaste!", constante.ANCHO_VENTANA / 2 - 120, constante.ALTO_VENTANA / 2, 70, "#ffff00");
    }
    if (!jugador.vivo) drawGameOver();
    if (menuPausa && jugador.vivo) drawPause();

    requestAnimationFrame(frame);
  }

  document.addEventListener("keydown", keyDownHandler);
  document.addEventListener("keyup", keyUpHandler);
  window.addEventListener("blur", blurHandler);
  document.addEventListener("visibilitychange", visibilityHandler);
  canvas.addEventListener("mousemove", mouseMoveHandler);
  canvas.addEventListener("mousedown", () => { mouseDown = true; });
  canvas.addEventListener("mouseup", () => { mouseDown = false; });

  requestAnimationFrame(frame);

  return {
    stop: () => {
      // Limpia listeners.
      running = false;
      resetKeys();
      document.removeEventListener("keydown", keyDownHandler);
      document.removeEventListener("keyup", keyUpHandler);
      window.removeEventListener("blur", blurHandler);
      document.removeEventListener("visibilitychange", visibilityHandler);
      canvas.removeEventListener("mousemove", mouseMoveHandler);
    },
  };
}

const canvas = document.getElementById("wallBloodCanvas");
if (canvas) {
  run(canvas).catch((e) => {
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#090c1a";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#ffffff";
    ctx.font = "28px sans-serif";
    ctx.fillText("Error cargando Dungeon Spell", 40, 70);
    console.error(e);
  });
}

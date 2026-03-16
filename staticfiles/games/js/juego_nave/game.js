import {
  FPS,
  WIDTH,
  HEIGHT,
  MAX_ENEMIES,
  MIN_SPAWN_TIME,
  MAX_ENEMY_SPEED,
  ARCADE_FONT,
} from "./settings.js";
import { Player } from "./player.js";
import { Enemy } from "./enemy.js";
import { Star } from "./starfield.js";

// Particulas para efecto de explosion.
class Explosion {
  constructor(x, y) {
    this.particles = [];
    for (let i = 0; i < 25; i++) {
      this.particles.push({
        x,
        y,
        vx: Math.floor(Math.random() * 9) - 4,
        vy: Math.floor(Math.random() * 9) - 4,
        life: 25,
      });
    }
  }

  update() {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.life -= 1;
      if (p.life <= 0) this.particles.splice(i, 1);
    }
  }

  draw(ctx) {
    ctx.fillStyle = "#ff00ff";
    for (const p of this.particles) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

// Laser temporal entre nave y enemigo.
class Laser {
  constructor(start, end) {
    this.start = start;
    this.end = end;
    this.timer = 10;
  }

  update() {
    this.timer -= 1;
    return this.timer <= 0;
  }

  draw(ctx) {
    ctx.strokeStyle = "#00ffff";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(this.start.x, this.start.y);
    ctx.lineTo(this.end.x, this.end.y);
    ctx.stroke();
  }
}

// Pantalla final al perder.
function drawGameOverScreen(ctx) {
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.fillStyle = "#ff3030";
  ctx.font = `56px ${ARCADE_FONT}, Orbitron, sans-serif`;
  const title = "GAME OVER";
  ctx.fillText(title, WIDTH / 2 - ctx.measureText(title).width / 2, HEIGHT / 2 - 20);

  ctx.fillStyle = "#fff36a";
  ctx.font = `20px ${ARCADE_FONT}, Orbitron, sans-serif`;
  const subtitle = "PRESS ENTER";
  ctx.fillText(subtitle, WIDTH / 2 - ctx.measureText(subtitle).width / 2, HEIGHT / 2 + 26);
}

// Loop principal del juego.
export function runGame(canvas, assets, options = {}) {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const { backgroundImage, playerImage, enemyImages } = assets;
  const onExit = typeof options.onExit === "function" ? options.onExit : () => {};
  const onMatchEnd = typeof options.onMatchEnd === "function" ? options.onMatchEnd : () => {};
  let active = true;
  const matchStartMs = performance.now();
  let matchReported = false;

  // Entidades vivas del juego.
  const player = new Player(playerImage);
  const enemies = [];
  const stars = Array.from({ length: 150 }, () => new Star());
  const explosions = [];
  const lasers = [];

  // Estado global de la partida.
  const state = {
    running: true,
    typedText: "",
    score: 0,
    combo: 0,
    spawnTimer: 0,
    difficultyTimer: 0,
    enemySpeed: 2,
    spawnTime: 1200,
    lastFrame: performance.now(),
  };

  function cleanup() {
    // Quita listeners al salir para evitar duplicados.
    document.removeEventListener("keydown", keydownHandler);
  }

  function exitToMenu() {
    if (!active) return;
    if (!matchReported) {
      matchReported = true;
      const elapsedSeconds = Math.max(0, Math.round((performance.now() - matchStartMs) / 1000));
      onMatchEnd({ score: state.score, tiempo_juego: elapsedSeconds });
    }
    active = false;
    cleanup();
    onExit();
  }

  function update(dt) {
    // Fondo animado siempre activo.
    for (const star of stars) star.update(dt);

    if (!state.running) {
      // En game over solo animamos efectos restantes.
      for (let i = lasers.length - 1; i >= 0; i--) {
        if (lasers[i].update()) lasers.splice(i, 1);
      }
      for (const exp of explosions) exp.update();
      return;
    }

    state.spawnTimer += dt;
    state.difficultyTimer += dt;

    // Dificultad progresiva cada 5 segundos.
    if (state.difficultyTimer > 5000) {
      state.difficultyTimer = 0;
      if (state.enemySpeed < MAX_ENEMY_SPEED) state.enemySpeed += 0.3;
      if (state.spawnTime > MIN_SPAWN_TIME) state.spawnTime -= 100;
    }

    if (state.spawnTimer > state.spawnTime && enemies.length < MAX_ENEMIES) {
      enemies.push(new Enemy(enemyImages));
      state.spawnTimer = 0;
    }

    // Avance de enemigos y colision con jugador.
    for (const enemy of enemies) {
      enemy.update(player, state.enemySpeed, dt);
      const dist = Math.hypot(player.x - enemy.x, player.y - enemy.y);
      if (dist < enemy.size + player.size * 0.7) state.running = false;
    }

    let targetEnemy = null;
    // Objetivo: enemigo cuya palabra coincide al 100%.
    for (const enemy of enemies) {
      if (state.typedText.toLowerCase() === enemy.word.toLowerCase()) {
        targetEnemy = enemy;
        break;
      }
    }

    if (targetEnemy) player.rotateTo(targetEnemy);

    if (targetEnemy && state.typedText.toLowerCase() === targetEnemy.word.toLowerCase()) {
      // Disparo, explosion y puntuacion.
      lasers.push(new Laser({ x: player.x, y: player.y }, { x: targetEnemy.x, y: targetEnemy.y }));
      explosions.push(new Explosion(targetEnemy.x, targetEnemy.y));
      enemies.splice(enemies.indexOf(targetEnemy), 1);
      state.typedText = "";
      state.score += 100 * (state.combo + 1);
      state.combo += 1;
    }

    for (let i = lasers.length - 1; i >= 0; i--) {
      if (lasers[i].update()) lasers.splice(i, 1);
    }

    for (const exp of explosions) exp.update();
  }

  function draw() {
    // Fondo del juego original.
    ctx.drawImage(backgroundImage, 0, 0, WIDTH, HEIGHT);

    for (const star of stars) star.draw(ctx);
    for (const laser of lasers) laser.draw(ctx);
    for (const exp of explosions) exp.draw(ctx);

    player.draw(ctx);
    for (const enemy of enemies) enemy.draw(ctx, state.typedText);

    // Texto tipeado y marcador.
    ctx.font = `30px ${ARCADE_FONT}, Orbitron, sans-serif`;
    ctx.fillStyle = "#ffffff";
    const typedWidth = ctx.measureText(state.typedText).width;
    ctx.fillText(state.typedText, WIDTH / 2 - typedWidth / 2, HEIGHT - 24);

    ctx.font = `22px ${ARCADE_FONT}, Orbitron, sans-serif`;
    ctx.fillStyle = "#ffe600";
    ctx.fillText(`SCORE: ${state.score}  COMBO: x${state.combo}`, 10, 30);

    ctx.strokeStyle = "rgba(0,0,0,0.18)";
    ctx.lineWidth = 1;
    for (let y = 0; y < HEIGHT; y += 4) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(WIDTH, y);
      ctx.stroke();
    }

    if (!state.running) drawGameOverScreen(ctx); // Enter vuelve al menu.
  }

  function frame(now) {
    if (!active) return;
    // Delta cap para evitar saltos grandes.
    const dt = Math.min((1000 / FPS) * 2, now - state.lastFrame);
    state.lastFrame = now;
    update(dt);
    draw();
    requestAnimationFrame(frame);
  }

  // Teclas de texto "normales".
  function isTypingKey(event) {
    return event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey;
  }

  // Entrada del jugador.
  function keydownHandler(event) {
    if (!active || !canvas.isConnected) return;

    if (event.key === "Escape") {
      // Escape sale al menu desde cualquier momento de partida.
      exitToMenu();
      return;
    }

    if (!canvas.isConnected) return;

    if (!state.running) {
      if (event.key === "Enter") exitToMenu();
      return;
    }

    if (event.key === "Backspace") {
      state.typedText = state.typedText.slice(0, -1);
      state.combo = 0;
      event.preventDefault();
      return;
    }

    if (isTypingKey(event)) state.typedText += event.key;
  }

  document.addEventListener("keydown", keydownHandler);

  requestAnimationFrame(frame);
  return {
    stop: exitToMenu, // API minima para detener desde main.js
  };
}

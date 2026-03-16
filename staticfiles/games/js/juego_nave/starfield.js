import { WIDTH, HEIGHT } from "./settings.js";

// Utilidad para enteros aleatorios.
function randint(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Utilidad para decimales aleatorios.
function random(min, max) {
  return Math.random() * (max - min) + min;
}

// Estrella individual del fondo animado.
export class Star {
  constructor() {
    this.reset();
  }

  reset() {
    this.x = randint(0, WIDTH);
    this.y = randint(0, HEIGHT);
    this.speed = random(0.5, 3);
    this.size = randint(1, 3);
  }

  update(dt) {
    // dt mantiene la velocidad estable entre equipos.
    this.y += this.speed * (dt / 16.67);
    if (this.y > HEIGHT) {
      this.reset();
      this.y = 0;
    }
  }

  draw(ctx) {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(this.x, this.y, this.size, this.size);
  }
}

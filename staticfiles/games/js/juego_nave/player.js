import { WIDTH, HEIGHT } from "./settings.js";

// Nave del jugador en el centro.
export class Player {
  constructor(image) {
    this.original = image;
    this.width = 80;
    this.height = 80;
    this.x = WIDTH / 2;
    this.y = HEIGHT / 2;
    this.size = 40;
    this.angle = -Math.PI / 2;
  }

  rotateTo(target) {
    // Rota para mirar al enemigo objetivo.
    const dx = target.x - this.x;
    const dy = target.y - this.y;
    this.angle = Math.atan2(dy, dx);
  }

  draw(ctx) {
    // Dibujo del sprite original rotado.
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle + Math.PI / 2);
    ctx.drawImage(this.original, -this.width / 2, -this.height / 2, this.width, this.height);
    ctx.restore();
  }
}

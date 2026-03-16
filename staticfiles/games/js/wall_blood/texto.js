import { ROJO, WALL_BLOOD_FONT } from "./constante.js";

// Texto flotante de dano.
export class DamageText {
  constructor(x, y, text, color = ROJO) {
    this.x = x;
    this.y = y;
    this.text = text;
    this.color = color;
    this.life = 45;
    this.alive = true;
  }

  update(posicionPantalla) {
    // Se mueve con el mapa y sube lentamente.
    this.x += posicionPantalla[0];
    this.y += posicionPantalla[1] - 0.6;
    this.life -= 1;
    if (this.life <= 0) this.alive = false;
  }

  draw(ctx) {
    // Render del numero de dano.
    ctx.font = `24px ${WALL_BLOOD_FONT}, Orbitron, sans-serif`;
    ctx.fillStyle = this.color;
    ctx.fillText(this.text, this.x, this.y);
  }
}

import { WIDTH, HEIGHT } from "./settings.js";
import { words } from "./words.js";

// Utilidad para enteros aleatorios.
function randint(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Utilidad para decimales aleatorios.
function random(min, max) {
  return Math.random() * (max - min) + min;
}

// Enemigo con una palabra asociada.
export class Enemy {
  constructor(enemyImages) {
    this.original = enemyImages[randint(0, enemyImages.length - 1)];
    this.word = words[randint(0, words.length - 1)];
    this.size = 25;
    this.width = 50;
    this.height = 50;
    this.speed = random(0.5, 1.5);
    this.angle = 0;

    const side = ["top", "bottom", "left", "right"][randint(0, 3)];
    // Spawn desde los bordes para que avance al centro.
    if (side === "top") {
      this.x = randint(0, WIDTH);
      this.y = -50;
    } else if (side === "bottom") {
      this.x = randint(0, WIDTH);
      this.y = HEIGHT + 50;
    } else if (side === "left") {
      this.x = -50;
      this.y = randint(0, HEIGHT);
    } else {
      this.x = WIDTH + 50;
      this.y = randint(0, HEIGHT);
    }
  }

  update(player, enemySpeed, dt) {
    // Movimiento hacia el jugador.
    const dx = player.x - this.x;
    const dy = player.y - this.y;
    const dist = Math.hypot(dx, dy) || 1;
    const nx = dx / dist;
    const ny = dy / dist;

    const speed = this.speed + (enemySpeed - 2);
    this.x += nx * speed * (dt / 16.67);
    this.y += ny * speed * (dt / 16.67);
    this.angle = Math.atan2(ny, nx);
  }

  draw(ctx, typedText) {
    // Nave enemiga con sprite original.
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle + Math.PI / 2 - Math.PI / 2);
    ctx.drawImage(this.original, -this.width / 2, -this.height / 2, this.width, this.height);
    ctx.restore();

    // Palabra del enemigo arriba de la nave.
    const isTyped = typedText.length > 0 && this.word.toLowerCase().startsWith(typedText.toLowerCase());
    ctx.font = "18px Arcade, Orbitron, sans-serif";
    const textX = this.x - ctx.measureText(this.word).width / 2;
    const textY = this.y - this.size - 10;

    ctx.fillStyle = "#000000";
    ctx.fillText(this.word, textX + 2, textY + 2);
    ctx.fillStyle = isTyped ? "#00ff9d" : "#ff00cc";
    ctx.fillText(this.word, textX, textY);
  }
}

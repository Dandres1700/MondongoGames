import { crearRect, rectCollide } from "./constante.js";

// Item coleccionable (moneda o pocion).
export class Item {
  constructor(x, y, itemType, animacionList) {
    this.itemType = itemType; // 0 moneda, 1 pocion
    this.animacionList = animacionList;
    this.frameIndex = 0;
    this.updateTime = performance.now();
    this.image = this.animacionList[this.frameIndex];
    this.rect = crearRect(x - 14, y - 14, 28, 28);
    this.alive = true;
  }

  update(posicionPantalla, personaje) {
    // Se mueve junto con el scroll del mapa.
    this.rect.x += posicionPantalla[0];
    this.rect.y += posicionPantalla[1];

    // Efecto al recoger.
    if (rectCollide(this.rect, personaje.forma)) {
      if (this.itemType === 0) personaje.score += 1;
      if (this.itemType === 1) personaje.energia = Math.min(100, personaje.energia + 50);
      this.alive = false;
    }

    // Animacion simple por frames.
    const cooldownAnimacion = 150;
    this.image = this.animacionList[this.frameIndex];
    if (performance.now() - this.updateTime > cooldownAnimacion) {
      this.frameIndex += 1;
      this.updateTime = performance.now();
    }
    if (this.frameIndex >= this.animacionList.length) this.frameIndex = 0;
  }

  dibujar(ctx) {
    ctx.drawImage(this.image, this.rect.x, this.rect.y, this.rect.w, this.rect.h);
  }
}

import * as constante from "./constante.js";
import { crearRect, rectCollide } from "./constante.js";

// Jugador y enemigos comparten esta clase base.
export class Personaje {
  constructor(x, y, animaciones, energia, tipo) {
    this.score = 0;
    this.energia = energia;
    this.vivo = true;
    this.flip = false;
    this.animaciones = animaciones;
    this.frameIndex = 0;
    this.updateTime = performance.now();
    this.image = animaciones[this.frameIndex];
    const w = this.image.width * (tipo === 1 ? constante.ESCALA_PERSONAJE : constante.ESCALA_ENEMIGOS);
    const h = this.image.height * (tipo === 1 ? constante.ESCALA_PERSONAJE : constante.ESCALA_ENEMIGOS);
    this.forma = crearRect(x - w / 2, y - h / 2, w, h);
    this.tipo = tipo; // 1 jugador, >1 enemigo
    this.golpe = false;
    this.ultimoGolpe = performance.now();
  }

  actualizarCoordenadas([x, y]) {
    this.forma.center = [x, y];
  }

  dibujar(ctx) {
    // Dibujo con flip horizontal.
    ctx.save();
    if (this.flip) {
      ctx.translate(this.forma.x + this.forma.w, this.forma.y);
      ctx.scale(-1, 1);
      ctx.drawImage(this.image, 0, 0, this.forma.w, this.forma.h);
    } else {
      ctx.drawImage(this.image, this.forma.x, this.forma.y, this.forma.w, this.forma.h);
    }
    ctx.restore();
  }

  movimiento(deltaX, deltaY, obstaculosTiles, exitTile) {
    const posicionPantalla = [0, 0];
    let nivelCompletado = false;

    if (deltaX < 0) this.flip = true;
    if (deltaX > 0) this.flip = false;

    // Colision en eje X.
    this.forma.x += deltaX;
    for (const obstacle of obstaculosTiles) {
      if (rectCollide(obstacle[1], this.forma)) {
        if (deltaX > 0) this.forma.right = obstacle[1].left;
        if (deltaX < 0) this.forma.left = obstacle[1].right;
      }
    }

    // Colision en eje Y.
    this.forma.y += deltaY;
    for (const obstaculo of obstaculosTiles) {
      if (rectCollide(obstaculo[1], this.forma)) {
        if (deltaY > 0) this.forma.bottom = obstaculo[1].top;
        if (deltaY < 0) this.forma.top = obstaculo[1].bottom;
      }
    }

    if (this.tipo === 1) {
      // Jugador: revisa salida y aplica scroll de camara.
      if (exitTile && rectCollide(exitTile[1], this.forma)) nivelCompletado = true;

      if (this.forma.right > constante.ANCHO_VENTANA - constante.LIMITE_PANTALLA) {
        posicionPantalla[0] = (constante.ANCHO_VENTANA - constante.LIMITE_PANTALLA) - this.forma.right;
        this.forma.right = constante.ANCHO_VENTANA - constante.LIMITE_PANTALLA;
      }
      if (this.forma.left < constante.LIMITE_PANTALLA) {
        posicionPantalla[0] = constante.LIMITE_PANTALLA - this.forma.left;
        this.forma.left = constante.LIMITE_PANTALLA;
      }
      if (this.forma.bottom > constante.ALTO_VENTANA - constante.LIMITE_PANTALLA) {
        posicionPantalla[1] = (constante.ALTO_VENTANA - constante.LIMITE_PANTALLA) - this.forma.bottom;
        this.forma.bottom = constante.ALTO_VENTANA - constante.LIMITE_PANTALLA;
      }
      if (this.forma.top < constante.LIMITE_PANTALLA) {
        posicionPantalla[1] = constante.LIMITE_PANTALLA - this.forma.top;
        this.forma.top = constante.LIMITE_PANTALLA;
      }

    }

    return [posicionPantalla, nivelCompletado];
  }

  enemigos(jugador, obstaculosTiles, posicionPantalla, exitTile) {
    // IA simple: persigue al jugador en rango.
    let eneDx = 0;
    let eneDy = 0;
    this.forma.x += posicionPantalla[0];
    this.forma.y += posicionPantalla[1];

    const dx = this.forma.centerx - jugador.forma.centerx;
    const dy = this.forma.centery - jugador.forma.centery;
    const distancia = Math.hypot(dx, dy);

    if (distancia < constante.RANGO) {
      if (this.forma.centerx > jugador.forma.centerx) eneDx = -constante.VELOCIDAD_ENEMIGO;
      if (this.forma.centerx < jugador.forma.centerx) eneDx = constante.VELOCIDAD_ENEMIGO;
      if (this.forma.centery > jugador.forma.centery) eneDy = -constante.VELOCIDAD_ENEMIGO;
      if (this.forma.centery < jugador.forma.centery) eneDy = constante.VELOCIDAD_ENEMIGO;
    }

    this.movimiento(eneDx, eneDy, obstaculosTiles, exitTile);

    if (distancia < constante.RANGO_ATAQUE && !jugador.golpe) {
      jugador.energia -= 10;
      jugador.golpe = true;
      jugador.ultimoGolpe = performance.now();
    }
  }

  update() {
    // Estado de vida y animacion.
    if (this.energia <= 0) {
      this.energia = 0;
      this.vivo = false;
    }

    const golpeCooldown = 1000;
    if (this.tipo === 1 && this.golpe) {
      if (performance.now() - this.ultimoGolpe > golpeCooldown) this.golpe = false;
    }

    const cooldownAnimacion = 100;
    this.image = this.animaciones[this.frameIndex];
    if (performance.now() - this.updateTime >= cooldownAnimacion) {
      this.frameIndex += 1;
      this.updateTime = performance.now();
    }
    if (this.frameIndex >= this.animaciones.length) this.frameIndex = 0;
  }
}

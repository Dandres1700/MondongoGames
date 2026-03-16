import * as constante from "./constante.js";
import { crearRect, rectCollide } from "./constante.js";

// Bala disparada por el arma.
export class Bala {
  constructor(image, x, y, angle) {
    this.image = image;
    this.angulo = angle;
    this.rect = crearRect(x - 8, y - 8, 16, 16);
    this.deltaX = Math.cos((this.angulo * Math.PI) / 180) * constante.VELOCIDAD_BALA;
    this.deltaY = -Math.sin((this.angulo * Math.PI) / 180) * constante.VELOCIDAD_BALA;
    this.alive = true;
  }

  update(listaEnemigos, obstaculosTiles) {
    let dano = 0;
    let posicionDano = null;
    this.rect.x += this.deltaX;
    this.rect.y += this.deltaY;

    // Si sale de pantalla, se elimina.
    if (
      this.rect.right < 0 ||
      this.rect.left > constante.ANCHO_VENTANA ||
      this.rect.bottom < 0 ||
      this.rect.top > constante.ALTO_VENTANA
    ) {
      this.alive = false;
      return [dano, posicionDano];
    }

    for (const enemigo of listaEnemigos) {
      // Dano aleatorio al impactar enemigo.
      if (rectCollide(enemigo.forma, this.rect)) {
        dano = 15 + Math.floor(Math.random() * 15) - 7;
        posicionDano = enemigo.forma;
        enemigo.energia -= dano;
        this.alive = false;
        break;
      }
    }

    for (const obs of obstaculosTiles) {
      // La bala se destruye al tocar pared.
      if (rectCollide(obs[1], this.rect)) {
        this.alive = false;
        break;
      }
    }
    return [dano, posicionDano];
  }

  dibujar(ctx) {
    ctx.drawImage(this.image, this.rect.centerx - 8, this.rect.centery - 8, 16, 16);
  }
}

// Arma del jugador (apunta al mouse y crea balas).
export class Arma {
  constructor(image, imagenBala) {
    this.imagenOriginal = image;
    this.imagenBala = imagenBala;
    this.angulo = 0;
    this.forma = crearRect(0, 0, 42, 20);
    this.disparada = false;
    this.ultimoDisparo = performance.now();
    this.mousePos = [0, 0];
  }

  setMousePos(pos) {
    this.mousePos = pos;
  }

  update(personaje, mouseDown) {
    const balaCooldown = constante.COOLDOWN_BALA;
    let bala = null;
    // Posicion del arma respecto al jugador.
    this.forma.center = personaje.forma.center;

    if (!personaje.flip) {
      this.forma.x += personaje.forma.w / 2;
    } else {
      this.forma.x -= personaje.forma.w / 2;
    }

    // Angulo hacia el puntero.
    const distanciaX = this.mousePos[0] - this.forma.centerx;
    const distanciaY = -(this.mousePos[1] - this.forma.centery);
    this.angulo = (Math.atan2(distanciaY, distanciaX) * 180) / Math.PI;

    // Disparo con cooldown.
    if (mouseDown && !this.disparada && performance.now() - this.ultimoDisparo >= balaCooldown) {
      bala = new Bala(this.imagenBala, this.forma.centerx, this.forma.centery, this.angulo);
      this.disparada = true;
      this.ultimoDisparo = performance.now();
    }

    if (!mouseDown) this.disparada = false;
    return bala;
  }

  dibujar(ctx) {
    ctx.save();
    ctx.translate(this.forma.centerx, this.forma.centery);
    if (this.mousePos[0] < this.forma.centerx) {
      ctx.scale(-1, 1);
      ctx.rotate(((-this.angulo + 180) * Math.PI) / 180);
    } else {
      ctx.rotate((-this.angulo * Math.PI) / 180);
    }
    ctx.drawImage(this.imagenOriginal, -20, -8, 40, 16);
    ctx.restore();
  }
}

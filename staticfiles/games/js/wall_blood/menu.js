import * as constante from "./constante.js";

// Texto del menu.
function drawText(ctx, text, x, y, size, color = constante.BLANCO, centered = true) {
  ctx.font = `${size}px ${constante.WALL_BLOOD_FONT}, Orbitron, sans-serif`;
  const w = ctx.measureText(text).width;
  const drawX = centered ? x - w / 2 : x;
  ctx.fillStyle = color;
  ctx.fillText(text, drawX, y);
}

export class AppMenu {
  constructor(canvas, backgroundTile) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.backgroundTile = backgroundTile;
    this.estado = "menu_principal";
    this.seleccion = 0;
    this.opcionesMenu = ["JUGAR", "OPCIONES", "SALIR"];
    this.onPlay = () => {};
  }

  setOnPlay(handler) {
    this.onPlay = handler;
  }

  setScreen(screen) {
    this.estado = screen;
  }

  drawBackground() {
    // Fondo en mosaico.
    for (let x = 0; x < constante.ANCHO_VENTANA; x += this.backgroundTile.width) {
      for (let y = 0; y < constante.ALTO_VENTANA; y += this.backgroundTile.height) {
        this.ctx.drawImage(this.backgroundTile, x, y);
      }
    }
    // Overlay leve para mantener el patron de fondo visible.
    this.ctx.fillStyle = "rgba(0,0,0,0.14)";
    this.ctx.fillRect(0, 0, constante.ANCHO_VENTANA, constante.ALTO_VENTANA);
  }

  handleKey(event) {
    // Navegacion del menu principal.
    if (this.estado === "menu_principal") {
      if (event.key === "ArrowUp" || event.key.toLowerCase() === "w") {
        this.seleccion = (this.seleccion - 1 + this.opcionesMenu.length) % this.opcionesMenu.length;
      } else if (event.key === "ArrowDown" || event.key.toLowerCase() === "s") {
        this.seleccion = (this.seleccion + 1) % this.opcionesMenu.length;
      } else if (event.key === "Enter") {
        const op = this.opcionesMenu[this.seleccion];
        if (op === "JUGAR") this.onPlay();
        if (op === "OPCIONES") this.estado = "menu_opciones";
        if (op === "SALIR") window.location.href = "/dashboard/";
      }
      return;
    }

    if (this.estado === "menu_opciones" && event.key === "Escape") {
      this.estado = "menu_principal";
    }
  }

  draw() {
    // Pantalla principal.
    this.drawBackground();

    if (this.estado === "menu_principal") {
      drawText(this.ctx, "DUNGEON SPELL", constante.ANCHO_VENTANA / 2, 142, 96, constante.AMARILLO_DORADO);
      for (let i = 0; i < this.opcionesMenu.length; i++) {
        const color = i === this.seleccion ? constante.COLOR_SELEC : constante.COLOR_TEXTO;
        drawText(this.ctx, this.opcionesMenu[i], constante.ANCHO_VENTANA / 2, 325 + i * 78, 60, color);
      }
      return;
    }

    // Pantalla de controles.
    drawText(this.ctx, "OPCIONES - CONTROLES", constante.ANCHO_VENTANA / 2, 110, 64, constante.COLOR_SELEC);
    drawText(this.ctx, "WASD - Mover personaje", constante.ANCHO_VENTANA / 2, 250, 36);
    drawText(this.ctx, "Click izquierdo - Disparar", constante.ANCHO_VENTANA / 2, 315, 36);
    drawText(this.ctx, "P - Pausa", constante.ANCHO_VENTANA / 2, 380, 36);
    drawText(this.ctx, "E - Abrir puertas cercanas", constante.ANCHO_VENTANA / 2, 445, 36);
    drawText(this.ctx, "ESC - Volver", constante.ANCHO_VENTANA / 2, constante.ALTO_VENTANA - 35, 26, constante.COLOR_PLACEHOLDER);
  }
}

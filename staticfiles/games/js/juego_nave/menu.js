import { WIDTH, HEIGHT, ARCADE_FONT } from "./settings.js";

// Opciones del menu original.
const MENU_OPTIONS = ["JUGAR", "CONTROLES", "CONFIGURACION", "SALIR"];
const CONFIG_OPTIONS = ["VOLUMEN", "VOLVER"];

// Texto centrado con sombra simple.
function drawCenteredText(ctx, text, size, x, y, color = "#ffffff") {
  ctx.font = `${size}px ${ARCADE_FONT}, Orbitron, sans-serif`;
  ctx.fillStyle = "#000000";
  const w = ctx.measureText(text).width;
  ctx.fillText(text, x - w / 2 + 3, y + 3);
  ctx.fillStyle = color;
  ctx.fillText(text, x - w / 2, y);
}

// Efecto CRT de lineas horizontales.
function drawScanlines(ctx) {
  ctx.strokeStyle = "rgba(0,0,0,0.18)";
  ctx.lineWidth = 1;
  for (let y = 0; y < HEIGHT; y += 4) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(WIDTH, y);
    ctx.stroke();
  }
}

// Sistema de pantallas: menu, controles y configuracion.
export class MenuSystem {
  constructor(canvas, backgroundImage) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.backgroundImage = backgroundImage;
    this.screen = "menu";
    this.menuOption = 0;
    this.configOption = 0;
    this.volume = true;
    this.blink = 0;
    this.onSelect = () => {};
  }

  setOnSelect(handler) {
    this.onSelect = handler;
  }

  setScreen(screenName) {
    this.screen = screenName;
  }

  handleKey(event) {
    // Navegacion del menu principal.
    if (this.screen === "menu") {
      if (event.key === "ArrowUp") {
        this.menuOption = (this.menuOption - 1 + MENU_OPTIONS.length) % MENU_OPTIONS.length;
      } else if (event.key === "ArrowDown") {
        this.menuOption = (this.menuOption + 1) % MENU_OPTIONS.length;
      } else if (event.key === "Enter") {
        const selected = MENU_OPTIONS[this.menuOption];
        this.onSelect(selected);
      }
      return;
    }

    // Pantalla de controles.
    if (this.screen === "controls") {
      if (event.key === "Escape" || event.key === "Enter") {
        this.screen = "menu";
      }
      return;
    }

    // Pantalla de configuracion.
    if (this.screen === "config") {
      if (event.key === "ArrowUp") {
        this.configOption = (this.configOption - 1 + CONFIG_OPTIONS.length) % CONFIG_OPTIONS.length;
      } else if (event.key === "ArrowDown") {
        this.configOption = (this.configOption + 1) % CONFIG_OPTIONS.length;
      } else if (event.key === "Enter") {
        if (this.configOption === 0) {
          this.volume = !this.volume;
        } else {
          this.screen = "menu";
        }
      } else if (event.key === "Escape") {
        this.screen = "menu";
      }
    }
  }

  draw() {
    const ctx = this.ctx;
    ctx.drawImage(this.backgroundImage, 0, 0, WIDTH, HEIGHT);
    drawScanlines(ctx);

    if (this.screen === "menu") {
      this.blink += 1;
      drawCenteredText(ctx, "ONE HIT KILL", 44, WIDTH / 2, 120, "#00ffff");
      if (this.blink % 20 < 10) {
        drawCenteredText(ctx, "PRESS ENTER", 28, WIDTH / 2, 220, "#00ffff");
      }

      for (let i = 0; i < MENU_OPTIONS.length; i++) {
        const y = 300 + i * 55;
        const text = i === this.menuOption ? `> ${MENU_OPTIONS[i]} <` : MENU_OPTIONS[i];
        const color = i === this.menuOption ? "#00ffff" : "#ffffff";
        drawCenteredText(ctx, text, i === this.menuOption ? 42 : 36, WIDTH / 2, y, color);
      }
      return;
    }

    if (this.screen === "controls") {
      drawCenteredText(ctx, "CONTROLES", 56, WIDTH / 2, 120, "#00ffff");
      drawCenteredText(ctx, "ESCRIBE LA PALABRA", 34, WIDTH / 2, 220, "#ffffff");
      drawCenteredText(ctx, "BACKSPACE - BORRAR", 34, WIDTH / 2, 280, "#ffffff");
      drawCenteredText(ctx, "ESC / ENTER - VOLVER", 34, WIDTH / 2, 340, "#00ffff");
      return;
    }

    if (this.screen === "config") {
      drawCenteredText(ctx, "CONFIGURACION", 56, WIDTH / 2, 120, "#00ffff");
      const vol = this.volume ? "ON" : "OFF";
      drawCenteredText(
        ctx,
        `VOLUMEN: ${vol}`,
        38,
        WIDTH / 2,
        250,
        this.configOption === 0 ? "#00ffff" : "#ffffff"
      );
      drawCenteredText(
        ctx,
        "VOLVER",
        38,
        WIDTH / 2,
        320,
        this.configOption === 1 ? "#00ffff" : "#ffffff"
      );
    }
  }
}

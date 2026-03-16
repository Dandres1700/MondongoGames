import * as constante from "./constante.js";
import { crearRect } from "./constante.js";
import { Item } from "./items.js";
import { Personaje } from "./personaje.js";

const puertaCerrada = [106, 110, 113, 114];
// Mismo set de colision del proyecto original en pygame.
const obstaculos = new Set([1, 2, 4, 13, 14, 16, 26, 28, 39, 106, 110, 113, 114]);

// Gestiona tiles, enemigos, items y camara del mapa.
export class Mundo {
  constructor() {
    this.mapTiles = [];
    this.obstaculosTiles = [];
    this.exitTile = null;
    this.listaItem = [];
    this.listaEnemigos = [];
    this.puertasCerradasTiles = [];
    this.victoryTile = null;
    this.cameraLimits = null;
  }

  processData(data, tileList, itemImagenes, animacionesEnemigos) {
    // Recorre el CSV y arma el mapa.
    for (let y = 0; y < data.length; y++) {
      const row = data[y];
      for (let x = 0; x < row.length; x++) {
        const tile = row[x];
        const image = tile > 0 && tile <= tileList.length ? tileList[tile - 1] : tileList[0];
        const imageX = x * constante.TILE_SIZE;
        const imageY = y * constante.TILE_SIZE;
        // Igual que el original en pygame: center en vez de topleft.
        const rect = crearRect(
          imageX - constante.TILE_SIZE / 2,
          imageY - constante.TILE_SIZE / 2,
          constante.TILE_SIZE,
          constante.TILE_SIZE
        );
        const tileData = [image, rect, imageX, imageY, tile];

        // Guarda tiles con colision.
        if (obstaculos.has(tile)) this.obstaculosTiles.push(tileData);
        if (puertaCerrada.includes(tile)) this.puertasCerradasTiles.push(tileData);
        if (tile === 96) this.victoryTile = tileData;
        if (tile === 105) this.exitTile = tileData;

        // Spawns de items y enemigos.
        if (tile === 103) {
          this.listaItem.push(new Item(imageX, imageY, 0, itemImagenes[0]));
          tileData[0] = tileList[49];
        } else if (tile === 99) {
          this.listaItem.push(new Item(imageX, imageY, 1, itemImagenes[1]));
          tileData[0] = tileList[49];
        } else if (tile === 98) {
          this.listaEnemigos.push(new Personaje(imageX, imageY, animacionesEnemigos.hongo, 100, 2));
          tileData[0] = tileList[49];
        } else if (tile === 100) {
          this.listaEnemigos.push(new Personaje(imageX, imageY, animacionesEnemigos.gobling, 125, 2));
          tileData[0] = tileList[49];
        } else if (tile === 101) {
          this.listaEnemigos.push(new Personaje(imageX, imageY, animacionesEnemigos.esqueleto, 150, 3));
          tileData[0] = tileList[49];
        } else if (tile === 102) {
          this.listaEnemigos.push(new Personaje(imageX, imageY, animacionesEnemigos.jefe1, 350, 4));
          tileData[0] = tileList[49];
        } else if (tile === 104) {
          this.listaEnemigos.push(new Personaje(imageX, imageY, animacionesEnemigos.jefe2, 350, 5));
          tileData[0] = tileList[49];
        } else if (tile === 97) {
          this.listaEnemigos.push(new Personaje(imageX, imageY, animacionesEnemigos.jefe3, 350, 6));
          tileData[0] = tileList[49];
        }

        this.mapTiles.push(tileData);
      }
    }

    if (this.mapTiles.length) {
      let minLeft = Infinity;
      let maxRight = -Infinity;
      let minTop = Infinity;
      let maxBottom = -Infinity;
      for (const tile of this.mapTiles) {
        if (tile[1].left < minLeft) minLeft = tile[1].left;
        if (tile[1].right > maxRight) maxRight = tile[1].right;
        if (tile[1].top < minTop) minTop = tile[1].top;
        if (tile[1].bottom > maxBottom) maxBottom = tile[1].bottom;
      }
      // Limites del scroll para no salir del mapa.
      this.cameraLimits = {
        minOffsetX: Math.min(0, constante.ANCHO_VENTANA - maxRight),
        maxOffsetX: 0,
        minOffsetY: Math.min(0, constante.ALTO_VENTANA - maxBottom),
        maxOffsetY: 0,
      };
    }
  }

  clampCameraDelta(delta, cameraOffset) {
    // Ajusta el scroll pedido al rango permitido.
    if (!this.cameraLimits) {
      return { applied: [delta[0], delta[1]], nextOffset: [cameraOffset[0] + delta[0], cameraOffset[1] + delta[1]] };
    }

    const nextX = Math.max(
      this.cameraLimits.minOffsetX,
      Math.min(this.cameraLimits.maxOffsetX, cameraOffset[0] + delta[0])
    );
    const nextY = Math.max(
      this.cameraLimits.minOffsetY,
      Math.min(this.cameraLimits.maxOffsetY, cameraOffset[1] + delta[1])
    );

    return {
      applied: [nextX - cameraOffset[0], nextY - cameraOffset[1]],
      nextOffset: [nextX, nextY],
    };
  }

  cambiarPuerta(jugador, tileList) {
    // Abre puertas cercanas al jugador.
    const buffer = 50;
    const prox = crearRect(
      jugador.forma.x - buffer,
      jugador.forma.y - buffer,
      jugador.forma.w + 2 * buffer,
      jugador.forma.h + 2 * buffer
    );

    for (const tileData of this.mapTiles) {
      const tileRect = tileData[1];
      const tileType = tileData[4];
      const overlap =
        prox.x < tileRect.x + tileRect.w &&
        prox.x + prox.w > tileRect.x &&
        prox.y < tileRect.y + tileRect.h &&
        prox.y + prox.h > tileRect.y;
      if (!overlap) continue;

      if (puertaCerrada.includes(tileType)) {
        let nuevaTileType = null;
        if (tileType === 113) nuevaTileType = 111;
        if (tileType === 114) nuevaTileType = 112;
        if (!nuevaTileType) continue;
        tileData[4] = nuevaTileType;
        tileData[0] = tileList[nuevaTileType - 1];
        this.obstaculosTiles = this.obstaculosTiles.filter((t) => t !== tileData);
        return true;
      }
    }
    return false;
  }

  update(posicionPantalla) {
    for (const tile of this.mapTiles) {
      tile[2] += posicionPantalla[0];
      tile[3] += posicionPantalla[1];
      // Mantener la misma referencia de centro del proyecto original.
      tile[1].centerx = tile[2];
      tile[1].centery = tile[3];
    }
  }

  draw(ctx) {
    for (const tile of this.mapTiles) {
      ctx.drawImage(tile[0], tile[1].x, tile[1].y, tile[1].w, tile[1].h);
    }
  }

  nearestWalkableFrom(spawn) {
    // Busca un piso valido cercano al spawn.
    let bestFloor = null;
    let bestFloorDist = Infinity;
    let bestFallback = null;
    let bestFallbackDist = Infinity;
    for (const tile of this.mapTiles) {
      const tileType = tile[4];
      if (obstaculos.has(tileType)) continue;
      const cx = tile[1].centerx;
      const cy = tile[1].centery;
      const dx = cx - spawn[0];
      const dy = cy - spawn[1];
      const d2 = (dx * dx) + (dy * dy);
      // Priorizar piso real como en el mapa original.
      if (tileType === 49) {
        if (d2 < bestFloorDist) {
          bestFloorDist = d2;
          bestFloor = [cx, cy];
        }
      } else if (d2 < bestFallbackDist) {
        bestFallbackDist = d2;
        bestFallback = [cx, cy];
      }
    }
    return bestFloor || bestFallback || spawn;
  }

  checkVictory(jugador) {
    if (!this.victoryTile) return false;
    const rect = this.victoryTile[1];
    return (
      jugador.forma.x < rect.x + rect.w &&
      jugador.forma.x + jugador.forma.w > rect.x &&
      jugador.forma.y < rect.y + rect.h &&
      jugador.forma.y + jugador.forma.h > rect.y
    );
  }
}

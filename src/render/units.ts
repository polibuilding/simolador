// Conversão do modelo (módulos) para a cena (milímetros). Origem: canto da chapa, topo da chapa em y = 0.
import * as THREE from "three";
import { catalog } from "../core/catalog";
import type { Vec3 } from "../core/model";

const s = catalog.settings;
export const M = s.modulo_mm;
export const BASE_Y = s.gc_centro_esfera_mm; // centro da esfera da GC acima da chapa
export const PLATE_W = s.chapa_modulos_x * M;
export const PLATE_D = s.chapa_modulos_y * M;

export const toWorld = (p: Vec3) => new THREE.Vector3(p[0] * M, BASE_Y + p[1] * M, p[2] * M);
export const fromWorldOnPlate = (v: THREE.Vector3) => ({ x: v.x / M, z: v.z / M });

export const COLORS = {
  steel: "#c3c8cd",
  springSteel: "#9aa1a8",
  cap: "#6f777f",
  plastic: "#dcdfe2",
  plate: "#151719",
  grid: "#e9ecee",
  valid: "#19a974",
  invalid: "#e5484d",
  select: "#2563eb",
  hover: "#5b8def",
};

// Motor de medições do ImobiScan AI — funções puras e testáveis.
// Unidade interna: metros (m). Áreas em m², volumes em m³.

export type MeasurementSource = 'Manual' | 'Trena laser' | 'Câmera'

export type Measurement = {
  value: number
  unit: 'm'
  source: MeasurementSource
  measuredAt: string
}

export type OpeningKind = 'Porta' | 'Janela' | 'Vão livre'

export type Opening = {
  id: string
  kind: OpeningKind
  width: number
  height: number
}

export type RoomDimensions = {
  length: number
  width: number
  height: number
  diagonal?: number
  openings: Opening[]
}

export function isValidLength(value: number): boolean {
  return Number.isFinite(value) && value > 0 && value <= 1000
}

export function floorArea(r: Pick<RoomDimensions, 'length' | 'width'>): number {
  return round(r.length * r.width)
}

export function perimeter(r: Pick<RoomDimensions, 'length' | 'width'>): number {
  return round(2 * (r.length + r.width))
}

export function volume(r: Pick<RoomDimensions, 'length' | 'width' | 'height'>): number {
  return round(r.length * r.width * r.height)
}

export function openingsArea(openings: Opening[]): number {
  return round(openings.reduce((sum, o) => sum + o.width * o.height, 0))
}

export function grossWallArea(r: Pick<RoomDimensions, 'length' | 'width' | 'height'>): number {
  return round(perimeter(r) * r.height)
}

/** Área de paredes descontando aberturas (nunca negativa). */
export function netWallArea(r: RoomDimensions): number {
  return round(Math.max(0, grossWallArea(r) - openingsArea(r.openings)))
}

export function theoreticalDiagonal(r: Pick<RoomDimensions, 'length' | 'width'>): number {
  return round(Math.hypot(r.length, r.width))
}

export type SquarenessCheck = {
  expected: number
  measured: number
  differencePercent: number
  status: 'Esquadro OK' | 'Fora de esquadro'
}

/**
 * Compara a diagonal medida com a teórica de um retângulo perfeito.
 * Tolerância padrão de 1%: acima disso o ambiente é sinalizado.
 */
export function checkSquareness(r: RoomDimensions, tolerancePercent = 1): SquarenessCheck | null {
  if (!r.diagonal || !isValidLength(r.diagonal)) return null
  const expected = theoreticalDiagonal(r)
  const differencePercent = round((Math.abs(r.diagonal - expected) / expected) * 100)
  return {
    expected,
    measured: r.diagonal,
    differencePercent,
    status: differencePercent <= tolerancePercent ? 'Esquadro OK' : 'Fora de esquadro',
  }
}

/** Abertura não pode ser maior que a maior parede nem mais alta que o pé-direito. */
export function validateOpening(r: Pick<RoomDimensions, 'length' | 'width' | 'height'>, o: Pick<Opening, 'width' | 'height'>): string | null {
  if (!isValidLength(o.width) || !isValidLength(o.height)) return 'Informe largura e altura válidas.'
  if (o.width > Math.max(r.length, r.width)) return 'A abertura é mais larga que a maior parede.'
  if (o.height > r.height) return 'A abertura é mais alta que o pé-direito.'
  return null
}

export function round(value: number, decimals = 2): number {
  const f = 10 ** decimals
  return Math.round((value + Number.EPSILON) * f) / f
}

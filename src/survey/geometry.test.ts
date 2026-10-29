import { describe, expect, it } from 'vitest'
import { checkSquareness, floorArea, netWallArea, perimeter, validateOpening, volume } from './geometry'

const room = { length: 4, width: 3, height: 2.7, openings: [] }

describe('motor de medições', () => {
  it('calcula área do piso 4 x 3 = 12 m²', () => expect(floorArea(room)).toBe(12))
  it('calcula perímetro 4 x 3 = 14 m', () => expect(perimeter(room)).toBe(14))
  it('calcula volume 4 x 3 x 2,7 = 32,4 m³', () => expect(volume(room)).toBe(32.4))
  it('desconta porta 0,8 x 2,1 da área de paredes (37,8 - 1,68 = 36,12)', () => {
    expect(netWallArea({ ...room, openings: [{ id: 'p', kind: 'Porta', width: 0.8, height: 2.1 }] })).toBe(36.12)
  })
  it('diagonal 5,00 em 4 x 3 está no esquadro', () => {
    expect(checkSquareness({ ...room, diagonal: 5 })?.status).toBe('Esquadro OK')
  })
  it('diagonal 5,10 em 4 x 3 (2%) está fora de esquadro', () => {
    expect(checkSquareness({ ...room, diagonal: 5.1 })?.status).toBe('Fora de esquadro')
  })
  it('rejeita abertura mais alta que o pé-direito', () => {
    expect(validateOpening(room, { width: 0.8, height: 3 })).not.toBeNull()
  })
})

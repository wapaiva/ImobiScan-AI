import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import {
  checkSquareness, floorArea, isValidLength, netWallArea, openingsArea, perimeter, validateOpening, volume,
} from './geometry'
import type { MeasurementSource, Opening, OpeningKind } from './geometry'
import './survey.css'

export const ROOM_TYPES = ['Sala', 'Cozinha', 'Banheiro', 'Quarto', 'Corredor', 'Garagem', 'Varanda', 'Área de serviço', 'Escada', 'Área externa', 'Comercial', 'Industrial'] as const
export type RoomType = typeof ROOM_TYPES[number]

export type Room = {
  id: string
  propertyId: string
  name: string
  type: RoomType
  length: number
  width: number
  height: number
  wallThickness?: number
  diagonal?: number
  openings: Opening[]
  source: MeasurementSource
  measuredAt: string
  notes: string
}

const STORAGE_KEY = 'imobiscanai.rooms.v1'
const fmt = (v: number) => new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v)

type PropertyRef = { id: string; name: string }

const emptyForm = { name: '', type: 'Sala' as RoomType, length: '', width: '', height: '2.70', wallThickness: '', diagonal: '', source: 'Manual' as MeasurementSource, notes: '' }

export function SurveyPage({ properties, onNotice }: { properties: PropertyRef[]; onNotice: (msg: string) => void }) {
  const [rooms, setRooms] = useState<Room[]>(() => {
    try { const s = localStorage.getItem(STORAGE_KEY); return s ? JSON.parse(s) as Room[] : [] } catch { return [] }
  })
  const [propertyId, setPropertyId] = useState(properties[0]?.id ?? '')
  const [form, setForm] = useState(emptyForm)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [opening, setOpening] = useState({ kind: 'Porta' as OpeningKind, width: '0.80', height: '2.10' })

  useEffect(() => { localStorage.setItem(STORAGE_KEY, JSON.stringify(rooms)) }, [rooms])

  const propertyRooms = useMemo(() => rooms.filter((r) => r.propertyId === propertyId), [rooms, propertyId])
  const selected = propertyRooms.find((r) => r.id === selectedId) ?? null
  const totalArea = propertyRooms.reduce((s, r) => s + floorArea(r), 0)

  function addRoom(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const length = Number(form.length), width = Number(form.width), height = Number(form.height)
    const diagonal = form.diagonal ? Number(form.diagonal) : undefined
    const wallThickness = form.wallThickness ? Number(form.wallThickness) : undefined
    if (!propertyId) return onNotice('Cadastre um imóvel antes de registrar ambientes.')
    if (!form.name.trim() || ![length, width, height].every(isValidLength)) return onNotice('Informe nome, comprimento, largura e pé-direito válidos (em metros).')
    if (diagonal !== undefined && !isValidLength(diagonal)) return onNotice('Diagonal inválida.')
    if (wallThickness !== undefined && !(wallThickness > 0 && wallThickness < 2)) return onNotice('Espessura de parede inválida.')
    const room: Room = {
      id: `AMB-${Date.now().toString(36).toUpperCase()}`, propertyId, name: form.name.trim(), type: form.type,
      length, width, height, diagonal, wallThickness, openings: [], source: form.source,
      measuredAt: new Date().toISOString(), notes: form.notes.trim(),
    }
    setRooms((c) => [room, ...c])
    setSelectedId(room.id)
    setForm(emptyForm)
    onNotice('Ambiente registrado neste navegador.')
  }

  function addOpening() {
    if (!selected) return
    const o = { width: Number(opening.width), height: Number(opening.height) }
    const err = validateOpening(selected, o)
    if (err) return onNotice(err)
    const newOpening: Opening = { id: `AB-${Date.now().toString(36)}`, kind: opening.kind, ...o }
    setRooms((c) => c.map((r) => r.id === selected.id ? { ...r, openings: [...r.openings, newOpening] } : r))
  }

  function removeOpening(id: string) {
    if (!selected) return
    setRooms((c) => c.map((r) => r.id === selected.id ? { ...r, openings: r.openings.filter((o) => o.id !== id) } : r))
  }

  function deleteRoom(id: string) {
    if (!window.confirm('Excluir este ambiente e suas medições?')) return
    setRooms((c) => c.filter((r) => r.id !== id))
    if (selectedId === id) setSelectedId(null)
  }

  const sq = selected ? checkSquareness(selected) : null

  return (
    <section className="module-page">
      <div className="module-heading"><div><div className="eyebrow"><span className="eyebrow-line" /> LEVANTAMENTO DE CAMPO</div><h1>Ambientes e medições</h1><p className="page-subtitle">Registre os ambientes do imóvel. Áreas, perímetros e volumes são calculados a partir das medidas informadas.</p></div></div>

      <div className="survey-toolbar panel">
        <label className="form-field"><span>Imóvel</span>
          <select value={propertyId} onChange={(e) => { setPropertyId(e.target.value); setSelectedId(null) }}>
            {properties.length === 0 && <option value="">Nenhum imóvel cadastrado</option>}
            {properties.map((p) => <option key={p.id} value={p.id}>{p.id} — {p.name}</option>)}
          </select>
        </label>
        <div className="survey-stat"><small>AMBIENTES</small><strong>{propertyRooms.length}</strong></div>
        <div className="survey-stat"><small>ÁREA ÚTIL SOMADA</small><strong>{fmt(totalArea)} m²</strong></div>
      </div>

      <div className="survey-grid">
        <form className="panel survey-form" onSubmit={addRoom}>
          <div className="panel-heading"><div><h2>Novo ambiente</h2><p>Medidas em metros (m)</p></div></div>
          <div className="form-grid">
            <label className="form-field"><span>Nome *</span><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex.: Quarto 1" /></label>
            <label className="form-field"><span>Tipo *</span><select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as RoomType })}>{ROOM_TYPES.map((t) => <option key={t}>{t}</option>)}</select></label>
            <label className="form-field"><span>Comprimento (m) *</span><input type="number" step="0.01" min="0.01" value={form.length} onChange={(e) => setForm({ ...form, length: e.target.value })} /></label>
            <label className="form-field"><span>Largura (m) *</span><input type="number" step="0.01" min="0.01" value={form.width} onChange={(e) => setForm({ ...form, width: e.target.value })} /></label>
            <label className="form-field"><span>Pé-direito (m) *</span><input type="number" step="0.01" min="0.01" value={form.height} onChange={(e) => setForm({ ...form, height: e.target.value })} /></label>
            <label className="form-field"><span>Diagonal (m)</span><input type="number" step="0.01" min="0.01" value={form.diagonal} onChange={(e) => setForm({ ...form, diagonal: e.target.value })} placeholder="Opcional" /></label>
            <label className="form-field"><span>Espessura parede (m)</span><input type="number" step="0.01" min="0.01" value={form.wallThickness} onChange={(e) => setForm({ ...form, wallThickness: e.target.value })} placeholder="Opcional" /></label>
            <label className="form-field"><span>Origem da medida *</span><select value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value as MeasurementSource })}><option>Manual</option><option>Trena laser</option><option>Câmera</option></select></label>
            <label className="form-field span-two"><span>Observações técnicas</span><textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></label>
          </div>
          <div className="form-note">ⓘ A origem é registrada para rastreabilidade. A conexão automática com trenas laser e a trena por câmera serão etapas seguintes.</div>
          <button type="submit" className="button button-primary">Registrar ambiente <span>→</span></button>
        </form>

        <div className="panel table-panel">
          <div className="panel-heading"><div><h2>Ambientes do imóvel</h2><p>Clique em um ambiente para ver detalhes e aberturas</p></div></div>
          {propertyRooms.length === 0 ? <p className="survey-empty">Nenhum ambiente registrado para este imóvel.</p> : (
            <div className="table-scroll"><table className="property-table"><thead><tr><th>AMBIENTE</th><th>DIMENSÕES</th><th>ÁREA</th><th>PERÍMETRO</th><th>ORIGEM</th><th aria-label="Ações" /></tr></thead>
              <tbody>{propertyRooms.map((r) => (
                <tr key={r.id} className={`survey-row ${r.id === selectedId ? 'selected' : ''}`} onClick={() => setSelectedId(r.id)}>
                  <td><strong>{r.name}</strong><br /><small>{r.type}</small></td>
                  <td>{fmt(r.length)} × {fmt(r.width)} × {fmt(r.height)}</td>
                  <td>{fmt(floorArea(r))} m²</td>
                  <td>{fmt(perimeter(r))} m</td>
                  <td>{r.source}</td>
                  <td><button type="button" className="survey-delete" onClick={(e) => { e.stopPropagation(); deleteRoom(r.id) }} aria-label={`Excluir ${r.name}`}>×</button></td>
                </tr>))}
              </tbody></table></div>)}
        </div>
      </div>

      {selected && (
        <div className="panel feature-panel survey-detail">
          <div className="panel-heading"><div><h2>{selected.name}</h2><p>{selected.id} · medido em {new Date(selected.measuredAt).toLocaleString('pt-BR')} · origem: {selected.source}</p></div></div>
          <div className="survey-metrics">
            <div><small>Área do piso</small><strong>{fmt(floorArea(selected))} m²</strong></div>
            <div><small>Perímetro</small><strong>{fmt(perimeter(selected))} m</strong></div>
            <div><small>Volume</small><strong>{fmt(volume(selected))} m³</strong></div>
            <div><small>Aberturas</small><strong>{fmt(openingsArea(selected.openings))} m²</strong></div>
            <div><small>Paredes (líquida)</small><strong>{fmt(netWallArea(selected))} m²</strong></div>
            <div><small>Esquadro</small><strong className={sq?.status === 'Fora de esquadro' ? 'warn' : ''}>{sq ? `${sq.status} (${fmt(sq.differencePercent)}%)` : 'Sem diagonal'}</strong></div>
          </div>
          {sq && <p className="survey-hint">Diagonal teórica {fmt(sq.expected)} m · medida {fmt(sq.measured)} m · tolerância 1%.</p>}
          <h3 className="survey-sub">Aberturas</h3>
          <div className="survey-opening-form">
            <select value={opening.kind} onChange={(e) => setOpening({ ...opening, kind: e.target.value as OpeningKind })}><option>Porta</option><option>Janela</option><option>Vão livre</option></select>
            <input type="number" step="0.01" aria-label="Largura da abertura" value={opening.width} onChange={(e) => setOpening({ ...opening, width: e.target.value })} />
            <span>×</span>
            <input type="number" step="0.01" aria-label="Altura da abertura" value={opening.height} onChange={(e) => setOpening({ ...opening, height: e.target.value })} />
            <button type="button" className="button button-secondary" onClick={addOpening}>＋ Adicionar</button>
          </div>
          {selected.openings.length > 0 && <ul className="survey-openings">{selected.openings.map((o) => <li key={o.id}>{o.kind}: {fmt(o.width)} × {fmt(o.height)} m <button type="button" onClick={() => removeOpening(o.id)} aria-label="Remover abertura">×</button></li>)}</ul>}
          {selected.notes && <p className="survey-hint">Obs.: {selected.notes}</p>}
        </div>
      )}
    </section>
  )
}

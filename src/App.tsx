import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import './App.css'

type PropertyStatus = 'Em análise' | 'Documentação pendente' | 'Concluído'
type PropertyType = 'Residencial' | 'Comercial' | 'Rural' | 'Terreno'

type Property = {
  id: string
  name: string
  type: PropertyType
  city: string
  state: string
  area: number
  value: number
  status: PropertyStatus
  updatedAt: string
  notes: string
}

import { loadJsonRecords, saveJsonRecords, PROPERTY_STORAGE_KEY } from './core/property-storage'

const initialProperties: Property[] = [
  { id: 'IM-0001', name: 'Apartamento Jardim América', type: 'Residencial', city: 'São João del-Rei', state: 'MG', area: 86, value: 425000, status: 'Em análise', updatedAt: '29/10/2026', notes: 'Apartamento com 3 quartos e 1 vaga.' },
  { id: 'IM-0002', name: 'Sítio Boa Vista', type: 'Rural', city: 'Tiradentes', state: 'MG', area: 12.4, value: 780000, status: 'Documentação pendente', updatedAt: '28/10/2026', notes: 'Área informada em hectares. Confirmar matrícula e cadastro rural.' },
  { id: 'IM-0003', name: 'Sala Comercial Centro', type: 'Comercial', city: 'Barbacena', state: 'MG', area: 54, value: 310000, status: 'Concluído', updatedAt: '25/10/2026', notes: 'Sala comercial em edifício com elevador.' },
  { id: 'IM-0004', name: 'Lote Residencial Alameda', type: 'Terreno', city: 'São João del-Rei', state: 'MG', area: 360, value: 195000, status: 'Em análise', updatedAt: '24/10/2026', notes: 'Terreno urbano. Verificar zoneamento e infraestrutura.' },
]

const navGroups = [
  { label: 'VISÃO GERAL', items: [{ id: 'dashboard', icon: '▦', label: 'Dashboard' }] },
  { label: 'GESTÃO IMOBILIÁRIA', items: [
    { id: 'properties', icon: '⌂', label: 'Imóveis' },
    { id: 'valuation', icon: '◈', label: 'Avaliações' },
    { id: 'documents', icon: '▤', label: 'Documentos' },
    { id: 'territory', icon: '⌖', label: 'Inteligência territorial' },
  ] },
  { label: 'SISTEMA', items: [
    { id: 'reports', icon: '▥', label: 'Relatórios' },
    { id: 'settings', icon: '⚙', label: 'Configurações' },
  ] },
]

function currency(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(value)
}

function number(value: number) {
  return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(value)
}

function today() {
  return new Date().toLocaleDateString('pt-BR')
}

function App() {
  const [properties, setProperties] = useState<Property[]>(() =>
    loadJsonRecords<Property>(window.localStorage, PROPERTY_STORAGE_KEY, initialProperties)
  )
  const [activePage, setActivePage] = useState('dashboard')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('Todos')
  const [showForm, setShowForm] = useState(false)
  const [notice, setNotice] = useState('')
  const [form, setForm] = useState({
    name: '', type: 'Residencial' as PropertyType, city: '', state: 'MG',
    area: '', value: '', status: 'Em análise' as PropertyStatus, notes: '',
  })

  useEffect(() => {
    saveJsonRecords(window.localStorage, PROPERTY_STORAGE_KEY, properties)
  }, [properties])

  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(''), 3500)
    return () => window.clearTimeout(timer)
  }, [notice])

  const filteredProperties = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('pt-BR')
    return properties.filter((property) => {
      const matchesTerm = !term || [property.name, property.id, property.city, property.state, property.type]
        .some((field) => field.toLocaleLowerCase('pt-BR').includes(term))
      const matchesStatus = statusFilter === 'Todos' || property.status === statusFilter
      return matchesTerm && matchesStatus
    })
  }, [properties, search, statusFilter])

  const totalValue = properties.reduce((sum, property) => sum + property.value, 0)
  const pending = properties.filter((property) => property.status === 'Documentação pendente').length
  const completed = properties.filter((property) => property.status === 'Concluído').length
  const pageLabel = navGroups.flatMap((group) => group.items).find((item) => item.id === activePage)?.label ?? 'Dashboard'

  function openNewProperty() {
    setForm({ name: '', type: 'Residencial', city: '', state: 'MG', area: '', value: '', status: 'Em análise', notes: '' })
    setShowForm(true)
  }

  function addProperty(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const area = Number(form.area)
    const value = Number(form.value)
    if (!form.name.trim() || !form.city.trim() || !form.state.trim() || !Number.isFinite(area) || area <= 0 || !Number.isFinite(value) || value < 0) {
      setNotice('Confira os campos obrigatórios e os valores informados.')
      return
    }
    const newProperty: Property = {
      id: `IM-${String(Date.now()).slice(-6)}`,
      name: form.name.trim(),
      type: form.type,
      city: form.city.trim(),
      state: form.state.trim().toUpperCase(),
      area,
      value,
      status: form.status,
      updatedAt: today(),
      notes: form.notes.trim(),
    }
    setProperties((current) => [newProperty, ...current])
    setShowForm(false)
    setActivePage('properties')
    setSearch('')
    setStatusFilter('Todos')
    setNotice('Imóvel cadastrado neste navegador.')
  }

  function deleteProperty(id: string) {
    if (!window.confirm(`Deseja excluir o registro ${id}? Esta ação não pode ser desfeita.`)) return
    setProperties((current) => current.filter((property) => property.id !== id))
    setNotice('Registro excluído.')
  }

  function exportCsv() {
    const rows = [
      ['Código', 'Imóvel', 'Tipo', 'Cidade', 'UF', 'Área', 'Valor informado', 'Status', 'Atualizado em', 'Observações'],
      ...properties.map((p) => [p.id, p.name, p.type, p.city, p.state, String(p.area), String(p.value), p.status, p.updatedAt, p.notes]),
    ]
    const csv = '\uFEFF' + rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(';')).join('\r\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'imobiscanai-imoveis.csv'
    link.click()
    URL.revokeObjectURL(url)
    setNotice('Exportação CSV iniciada.')
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <button className="brand" onClick={() => setActivePage('dashboard')} aria-label="Ir para o dashboard">
          <span className="brand-mark"><span>i</span></span>
          <span className="brand-copy"><strong>ImobiScan<span> AI</span></strong><small>INTELIGÊNCIA IMOBILIÁRIA</small></span>
        </button>
        <div className="workspace-label">WORKSPACE</div>
        <button className="workspace-switch">
          <span className="workspace-avatar">WP</span>
          <span className="workspace-copy"><strong>Meu escritório</strong><small>Plano de demonstração</small></span>
          <span className="chevron">⌄</span>
        </button>
        <nav className="main-nav" aria-label="Navegação principal">
          {navGroups.map((group) => (
            <div className="nav-group" key={group.label}>
              <div className="nav-label">{group.label}</div>
              {group.items.map((item) => (
                <button key={item.id} className={`nav-item ${activePage === item.id ? 'active' : ''}`} onClick={() => setActivePage(item.id)}>
                  <span className="nav-icon">{item.icon}</span><span>{item.label}</span>
                  {item.id === 'documents' && pending > 0 && <span className="nav-count">{pending}</span>}
                </button>
              ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="help-card"><div className="help-icon">✦</div><strong>Precisa de ajuda?</strong><p>Conheça os recursos do ImobiScan AI.</p><button onClick={() => setNotice('Central de ajuda será conectada em uma próxima etapa.')}>Acessar central <span>↗</span></button></div>
          <div className="user-profile"><div className="user-avatar">WP</div><div className="user-details"><strong>Administrador</strong><small>Ambiente local</small></div><button className="profile-more" onClick={() => setActivePage('settings')} aria-label="Configurações do perfil">•••</button></div>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="breadcrumbs"><span>Workspace</span><span className="crumb-separator">/</span><strong>{pageLabel}</strong></div>
          <div className="topbar-actions"><span className="environment-pill"><span className="status-dot" /> Ambiente de demonstração</span><button className="icon-button" title="Notificações" onClick={() => setNotice('Você está em dia com as notificações desta demonstração.')}>♧<i /></button><div className="top-avatar">WP</div></div>
        </header>

        <div className="page-content">
          {activePage === 'dashboard' && (
            <>
              <section className="welcome-row">
                <div><div className="eyebrow"><span className="eyebrow-line" /> QUINTA-FEIRA, 29 DE OUTUBRO</div><h1>Seu patrimônio, <span>em perspectiva.</span></h1><p className="page-subtitle">Acompanhe seus imóveis e transforme dados em decisões melhores.</p></div>
                <button className="button button-primary" onClick={openNewProperty}><span className="plus">＋</span> Novo imóvel</button>
              </section>
              <section className="metric-grid" aria-label="Indicadores do portfólio">
                <article className="metric-card"><div className="metric-top"><span className="metric-icon purple">⌂</span><span className="metric-tag">PORTFÓLIO</span></div><div className="metric-value">{properties.length}</div><div className="metric-label">Imóveis cadastrados</div><div className="metric-foot"><span className="metric-foot-icon">↗</span> Seus registros neste dispositivo</div></article>
                <article className="metric-card"><div className="metric-top"><span className="metric-icon green">R$</span><span className="metric-tag">VALOR INFORMADO</span></div><div className="metric-value value-small">{currency(totalValue)}</div><div className="metric-label">Valor total declarado</div><div className="metric-foot">Soma dos valores cadastrados</div></article>
                <article className="metric-card"><div className="metric-top"><span className="metric-icon amber">◷</span><span className="metric-tag">ATENÇÃO</span></div><div className="metric-value">{pending}</div><div className="metric-label">Com pendência documental</div><div className="metric-foot"><span className="attention-text">Requer acompanhamento</span></div></article>
                <article className="metric-card"><div className="metric-top"><span className="metric-icon blue">✓</span><span className="metric-tag">FINALIZADOS</span></div><div className="metric-value">{completed}</div><div className="metric-label">Registros concluídos</div><div className="metric-foot">Status informado no cadastro</div></article>
              </section>

              <section className="insight-banner"><div className="insight-symbol">✦</div><div className="insight-copy"><span className="insight-kicker">IMOBISCAN INTELLIGENCE</span><h2>Uma visão mais inteligente começa com bons dados.</h2><p>Organize informações, acompanhe pendências e prepare seus imóveis para análises técnicas.</p></div><button className="button button-light" onClick={() => setActivePage('valuation')}>Explorar análises <span>→</span></button><div className="banner-orbit orbit-one" /><div className="banner-orbit orbit-two" /></section>

              <section className="content-grid">
                <div className="panel property-panel"><div className="panel-heading"><div><h2>Imóveis recentes</h2><p>Últimos registros do seu portfólio</p></div><button className="text-button" onClick={() => setActivePage('properties')}>Ver todos <span>→</span></button></div>
                  <PropertyTable properties={properties.slice(0, 4)} onDelete={deleteProperty} compact />
                  {properties.length === 0 && <EmptyState text="Seu portfólio está vazio. Cadastre o primeiro imóvel para começar." action="Cadastrar imóvel" onAction={openNewProperty} />}
                </div>
                <div className="panel status-panel"><div className="panel-heading"><div><h2>Visão de status</h2><p>Distribuição dos registros</p></div><span className="tiny-more">•••</span></div>
                  <div className="status-total"><strong>{properties.length}</strong><span>imóveis no portfólio</span></div>
                  <div className="status-bar">{properties.length > 0 && <><span className="bar-progress" style={{ width: `${properties.filter((p) => p.status === 'Em análise').length / properties.length * 100}%` }} /><span className="bar-pending" style={{ width: `${pending / properties.length * 100}%` }} /><span className="bar-done" style={{ width: `${completed / properties.length * 100}%` }} /></>}</div>
                  <div className="status-legend"><div><span className="legend-dot progress-dot" /><span>Em análise</span><strong>{properties.filter((p) => p.status === 'Em análise').length}</strong></div><div><span className="legend-dot pending-dot" /><span>Documentação pendente</span><strong>{pending}</strong></div><div><span className="legend-dot done-dot" /><span>Concluído</span><strong>{completed}</strong></div></div>
                  <button className="outline-full-button" onClick={() => { setActivePage('properties'); setStatusFilter('Documentação pendente') }}>Revisar pendências <span>→</span></button>
                </div>
              </section>
              <div className="demo-disclaimer"><span>ⓘ</span><p><strong>Ambiente de demonstração.</strong> Os dados exibidos são exemplos e ficam armazenados somente neste navegador. Ainda não representam avaliações técnicas ou dados oficiais.</p></div>
            </>
          )}

          {activePage === 'properties' && (
            <section className="module-page"><div className="module-heading"><div><div className="eyebrow"><span className="eyebrow-line" /> GESTÃO DO PORTFÓLIO</div><h1>Seus imóveis</h1><p className="page-subtitle">Cadastre, pesquise e acompanhe as informações dos seus imóveis.</p></div><button className="button button-primary" onClick={openNewProperty}><span className="plus">＋</span> Novo imóvel</button></div>
              <div className="filter-toolbar"><label className="search-box"><span>⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por nome, código ou cidade..." /></label><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="Filtrar por status"><option>Todos</option><option>Em análise</option><option>Documentação pendente</option><option>Concluído</option></select><button className="button button-secondary" onClick={exportCsv}>↓ Exportar CSV</button></div>
              <div className="panel table-panel"><div className="panel-heading"><div><h2>Portfólio imobiliário</h2><p>{filteredProperties.length} registro(s) encontrado(s)</p></div><span className="table-count">{properties.length} no total</span></div><PropertyTable properties={filteredProperties} onDelete={deleteProperty} /></div>
              <div className="demo-disclaimer"><span>ⓘ</span><p>Os valores são informações declaradas no cadastro, não avaliações profissionais. Os registros ficam apenas neste navegador até a integração com um banco de dados.</p></div>
            </section>
          )}

          {activePage === 'valuation' && <ModulePlaceholder icon="◈" eyebrow="ANÁLISE TÉCNICA" title="Avaliações imobiliárias" description="Prepare a base de informações para apoiar estudos de valor de imóveis urbanos e rurais." features={['Ficha técnica padronizada por imóvel','Organização de características e áreas','Estrutura futura para comparação de mercado','Relatórios com premissas e rastreabilidade']} note="Estimativas automatizadas e laudos técnicos ainda não estão habilitados. Qualquer avaliação deverá observar os dados disponíveis, a metodologia aplicável e a responsabilidade profissional." actionLabel="Ver imóveis cadastrados" onAction={() => setActivePage('properties')} />}
          {activePage === 'documents' && <ModulePlaceholder icon="▤" eyebrow="ORGANIZAÇÃO DOCUMENTAL" title="Central de documentos" description="Planeje e acompanhe os documentos associados a cada imóvel." features={['Matrículas e certidões','IPTU, cadastro e documentos fiscais','Documentação rural e geoespacial','Lista de pendências por imóvel']} note="O upload e o armazenamento seguro de arquivos serão ativados após a configuração do backend. Não envie documentos pessoais ou sigilosos nesta versão de demonstração." actionLabel="Revisar imóveis pendentes" onAction={() => { setActivePage('properties'); setStatusFilter('Documentação pendente') }} />}
          {activePage === 'territory' && <ModulePlaceholder icon="⌖" eyebrow="DADOS GEOESPACIAIS" title="Inteligência territorial" description="Uma base preparada para integrar informações territoriais e localização dos imóveis." features={['Endereço e coordenadas geográficas','Camadas de mapas e consulta espacial','Suporte planejado a GeoJSON e KML/KMZ','Organização de imóveis urbanos e rurais']} note="Mapas, validação de geometrias e integrações com bases oficiais ainda precisam ser implementados e testados." actionLabel="Abrir portfólio" onAction={() => setActivePage('properties')} />}
          {activePage === 'reports' && <section className="module-page"><div className="module-heading"><div><div className="eyebrow"><span className="eyebrow-line" /> DADOS E EXPORTAÇÃO</div><h1>Relatórios</h1><p className="page-subtitle">Exporte a lista de imóveis para continuar sua análise em uma planilha.</p></div></div><div className="report-card"><div className="report-icon">▤</div><div className="report-copy"><h2>Inventário de imóveis</h2><p>Gera um arquivo CSV com os dados cadastrados, compatível com Excel e outros editores de planilha.</p><span>{properties.length} registros disponíveis</span></div><button className="button button-primary" onClick={exportCsv}>↓ Exportar CSV</button></div><div className="demo-disclaimer"><span>ⓘ</span><p>Relatórios técnicos em PDF, modelos de avaliação e assinatura digital serão implementados em etapas posteriores.</p></div></section>}
          {activePage === 'settings' && <ModulePlaceholder icon="⚙" eyebrow="PREFERÊNCIAS" title="Configurações" description="Configurações do ambiente de demonstração do ImobiScan AI." features={['Aplicação em modo local','Persistência no navegador atual','Sem autenticação de usuários nesta versão','Sem conexão com banco de dados remoto']} note="Para uso comercial, será necessário configurar autenticação, banco de dados, controle de acesso, backups, política de privacidade e proteção de dados." actionLabel="Voltar ao dashboard" onAction={() => setActivePage('dashboard')} />}
        </div>
        <footer className="app-footer"><span>© 2026 ImobiScan AI</span><span>Inteligência imobiliária <b>•</b> Versão de demonstração 0.1.0</span></footer>
      </main>

      {showForm && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowForm(false) }}><section className="property-modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div className="modal-heading"><div><span className="modal-kicker">NOVO REGISTRO</span><h2 id="modal-title">Cadastrar imóvel</h2><p>Preencha os dados disponíveis. Você poderá atualizar o registro depois.</p></div><button className="modal-close" onClick={() => setShowForm(false)} aria-label="Fechar">×</button></div><form onSubmit={addProperty}><div className="form-grid"><label className="form-field span-two"><span>Nome ou identificação do imóvel *</span><input autoFocus required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex.: Apartamento Centro" /></label><label className="form-field"><span>Tipo de imóvel *</span><select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as PropertyType })}><option>Residencial</option><option>Comercial</option><option>Rural</option><option>Terreno</option></select></label><label className="form-field"><span>Status *</span><select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as PropertyStatus })}><option>Em análise</option><option>Documentação pendente</option><option>Concluído</option></select></label><label className="form-field"><span>Cidade *</span><input required value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} placeholder="Cidade" /></label><label className="form-field"><span>UF *</span><input required maxLength={2} value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} placeholder="MG" /></label><label className="form-field"><span>Área (m² ou ha) *</span><input required type="number" min="0.01" step="any" value={form.area} onChange={(e) => setForm({ ...form, area: e.target.value })} placeholder="Ex.: 250" /></label><label className="form-field"><span>Valor informado (R$) *</span><input required type="number" min="0" step="0.01" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} placeholder="Ex.: 350000" /></label><label className="form-field span-two"><span>Observações</span><textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Características, referências ou pendências conhecidas..." /></label></div><div className="form-note">ⓘ O valor informado não constitui avaliação imobiliária. Indique a unidade correta da área nas observações, especialmente para imóveis rurais.</div><div className="modal-actions"><button type="button" className="button button-secondary" onClick={() => setShowForm(false)}>Cancelar</button><button type="submit" className="button button-primary">Salvar imóvel <span>→</span></button></div></form></section></div>}
      {notice && <div className="toast" role="status"><span>✓</span>{notice}<button onClick={() => setNotice('')} aria-label="Fechar aviso">×</button></div>}
    </div>
  )
}

function PropertyTable({ properties, onDelete, compact = false }: { properties: Property[]; onDelete: (id: string) => void; compact?: boolean }) {
  if (properties.length === 0) return <EmptyState text="Nenhum imóvel corresponde à pesquisa." />
  return <div className="table-scroll"><table className={`property-table ${compact ? 'compact-table' : ''}`}><thead><tr><th>IMÓVEL</th><th>TIPO</th><th>LOCALIZAÇÃO</th><th>ÁREA</th><th>VALOR INFORMADO</th><th>STATUS</th><th aria-label="Ações" /></tr></thead><tbody>{properties.map((property) => <tr key={property.id}><td><div className="property-name-cell"><span className={`property-type-icon type-${property.type.toLowerCase()}`}>{property.type === 'Rural' ? '♧' : property.type === 'Terreno' ? '▧' : property.type === 'Comercial' ? '▥' : '⌂'}</span><span className="property-name-copy"><strong>{property.name}</strong><small>{property.id} · Atualizado em {property.updatedAt}</small></span></div></td><td>{property.type}</td><td><span className="location-main">{property.city}</span><small className="location-state">{property.state}</small></td><td>{number(property.area)}</td><td className="money-cell">{currency(property.value)}</td><td><StatusBadge status={property.status} /></td><td><button className="row-action" title={`Excluir ${property.name}`} onClick={() => onDelete(property.id)}>×</button></td></tr>)}</tbody></table></div>
}

function StatusBadge({ status }: { status: PropertyStatus }) {
  const className = status === 'Concluído' ? 'badge-done' : status === 'Documentação pendente' ? 'badge-pending' : 'badge-progress'
  return <span className={`status-badge ${className}`}><span />{status}</span>
}

function EmptyState({ text, action, onAction }: { text: string; action?: string; onAction?: () => void }) {
  return <div className="empty-state"><span>⌂</span><p>{text}</p>{action && onAction && <button className="text-button" onClick={onAction}>{action} →</button>}</div>
}

function ModulePlaceholder({ icon, eyebrow, title, description, features, note, actionLabel, onAction }: { icon: string; eyebrow: string; title: string; description: string; features: string[]; note: string; actionLabel: string; onAction: () => void }) {
  return <section className="module-page"><div className="module-heading"><div><div className="eyebrow"><span className="eyebrow-line" /> {eyebrow}</div><h1>{title}</h1><p className="page-subtitle">{description}</p></div></div><div className="module-hero"><div className="module-hero-icon">{icon}</div><div><span className="module-coming">MÓDULO EM IMPLEMENTAÇÃO</span><h2>Construído para evoluir com o seu trabalho.</h2><p>Esta área já faz parte da navegação do produto. As integrações e operações específicas serão desenvolvidas nas próximas etapas.</p></div></div><div className="panel feature-panel"><div className="panel-heading"><div><h2>Escopo planejado</h2><p>Funcionalidades previstas para este módulo</p></div></div><div className="feature-list">{features.map((feature) => <div key={feature}><span>✓</span>{feature}</div>)}</div><div className="module-note"><span>ⓘ</span><p>{note}</p></div><button className="button button-primary" onClick={onAction}>{actionLabel} <span>→</span></button></div></section>
}

export default App

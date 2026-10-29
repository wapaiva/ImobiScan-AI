# ImobiScan AI

Aplicação de gestão imobiliária em evolução. A branch `feat/etapa-1-sqlite` reúne a fundação inicial para persistência local, validação de unidades, importação legada e operações seguras de backup.

## Estado atual

- Frontend React + TypeScript + Vite; a aplicação web ainda persiste os registros da interface em `localStorage`.
- Chave legada preservada: `imobiscanai.properties.v1`.
- Esquema SQLite versionado em `database/migrations/0001_initial.sql`.
- Runner de migração e testes de integridade usam `node:sqlite`.
- Prévia/importação legada exige confirmação explícita; registros sem unidade de área conhecida são separados para revisão.
- Backup SQLite pode ser criado e validado; a cópia validada não sobrescreve arquivos existentes.
- Nenhum banco SQLite está conectado à interface web nesta etapa.

## Desenvolvimento no Windows

Requer Node.js recente com suporte a `node:sqlite`, Git e npm. Na pasta do projeto:

```powershell
npm.cmd install
npm.cmd test
npm.cmd run build
npm.cmd run lint
```

## Documentação

Consulte [docs/arquitetura-etapa-1.md](docs/arquitetura-etapa-1.md) para arquitetura, limites, backup/importação e próximas etapas, e [docs/windows-validation.md](docs/windows-validation.md) para validação local.

## Fora do escopo desta etapa

Sem publicação na branch `main`, sem implantação, sem nuvem, sem conexão física a laser, sem câmera/IA/AR, sem editor 2D/3D e sem integração com Revit. Tauri 2 versus Electron ainda depende de prova de conceito no Windows.

**Status:** desenvolvimento técnico; não declarar pronto para uso comercial antes de concluir integração desktop, restauração operacional, importação estruturada de medições e validação de ponta a ponta.

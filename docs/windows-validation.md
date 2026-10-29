# Validação no Windows 11

Na pasta local do repositório, em PowerShell:

```powershell
node --version
npm.cmd --version
npm.cmd install
npm.cmd test
npm.cmd run build
npm.cmd run lint
```

Os testes atuais usam o test runner nativo do Node e não exigem uma dependência adicional. A validação de SQLite real, runner de migração, backup/restauração e shell desktop ainda precisa ser adicionada e executada antes de aprovar a Etapa 1 completa.

## Prova de conceito de desktop (ainda não instalada)

- Tauri 2: requer Rust, ferramentas de compilação C++ da Microsoft (MSVC/Visual Studio Build Tools) e WebView2 no Windows; confirmar a documentação oficial e os pré-requisitos da versão antes de instalar.
- Electron: requer avaliar tamanho do instalador e estratégia de SQLite nativo/recompilação de módulos. Não é uma opção móvel Android nativa por si só.
- Não instalar nem alterar o shell nesta etapa sem uma decisão baseada em teste local.

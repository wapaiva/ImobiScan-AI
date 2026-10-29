# ImobiScan AI — arquitetura da Etapa 1

## Estado e limites

Esta branch adiciona uma primeira fundação de domínio e um esquema SQL versionável. Ela **não** conecta ainda a interface React ao SQLite, não altera a chave legada `imobiscanai.properties.v1` e não declara a aplicação pronta para uso comercial. A versão GitHub Pages continua sendo uma aplicação web com armazenamento no navegador.

## Direção arquitetural

- Núcleo de unidades e validação independente de interface: `src/core/`.
- Esquema SQL versionado: `database/migrations/`.
- Acesso ao banco deve ser isolado por uma interface de repositório/driver; o SQLite nativo será executado no shell desktop, não diretamente pelo navegador.
- Tauri 2 e Electron permanecem candidatos; a escolha deve ocorrer após prova de conceito no Windows 11.
- Medidas registram quantidade, valor/unidade de origem e normalizados, método, fonte, horário, estado de validação e revisões.
- Não declarar suporte a dispositivo laser sem documentação e teste do modelo específico.

## Integridade

O esquema usa chaves estrangeiras, restrições CHECK, índices e relações compostas para evitar que ambientes, elementos e medições sejam associados a levantamentos diferentes. Cada conexão SQLite deve executar `PRAGMA foreign_keys = ON`. As operações multi-tabela deverão ser transacionais numa única conexão.

## Importação legada

A chave `imobiscanai.properties.v1` deve ser tratada como fonte original. A futura importação deverá apresentar prévia, validação, confirmação explícita e relatório de importados/rejeitados/pendentes. Não inferir a unidade de área a partir do valor ou das observações; usar estado desconhecido até revisão. Não apagar a chave original automaticamente.

## Backup e restauração

Antes de implementar a restauração no aplicativo, validar o arquivo candidato em cópia isolada: integridade SQLite, versão do esquema e presença das tabelas esperadas. Só depois da validação e confirmação explícita poderá ser preparado o intercâmbio pelo arquivo validado. Preservar uma cópia do banco atual antes de substituí-lo; nunca sobrescrever o banco ativo com um arquivo não validado. Registrar resultado e falhas.

## Verificação local

Requer Node.js compatível com `node:sqlite` para testes de SQLite reais, além das dependências atuais do projeto. Esta branch usa testes do Node nativo para unidades. Ainda é necessário implementar e testar runner de migração, backup/restauração e integração desktop antes de afirmar que esses recursos estão concluídos.


## Implementado nesta continuação

- `database/legacy-import.mjs`: prévia de JSON legado, validação de campos, rejeição de códigos duplicados, separação de registros com área sem unidade conhecida e importação transacional de registros elegíveis. A função exige `{ confirm: true }`; não acessa nem remove a chave de localStorage.
- `database/backup.mjs`: criação de cópia consistente com `VACUUM INTO`, validação somente leitura com `PRAGMA integrity_check`, `foreign_key_check`, tabelas obrigatórias, versão do esquema e SHA-256. A cópia validada só é escrita em destino novo; destinos existentes não são sobrescritos.
- Testes para importação legada e operações de backup em `database/*.test.mjs`.

## Limitações importantes ainda abertas

1. A interface React permanece conectada ao `localStorage`; ainda não existe adaptador desktop nem sincronização com SQLite.
2. O importador grava os campos principais do imóvel no banco. Área e valor legados são preservados em observações textuais; eles ainda não são migrados para medições estruturadas do domínio. Registros cuja unidade de área não está explícita ficam pendentes de revisão e não são importados.
3. `copyValidatedBackup` é uma primitiva de cópia segura, não substitui o banco ativo. A restauração operacional requer shell desktop, fechamento de todas as conexões, cópia de recuperação e substituição atômica testada no Windows.
4. O runner e a camada de banco usam `node:sqlite`, disponível em versões recentes do Node. Isso é apropriado para testes/ferramentas Node, mas não torna SQLite disponível diretamente no navegador.
5. Tauri 2 versus Electron permanece em aberto. Nenhuma integração de hardware, câmera, IA, AR, nuvem, editor 2D/3D ou Revit faz parte desta etapa.

## Validação local

Na raiz do repositório, usando PowerShell:

```powershell
npm.cmd install
npm.cmd test
npm.cmd run build
npm.cmd run lint
```

Todos os testes devem passar no Windows antes de aceitar a etapa. Não considerar build/lint como prova de compatibilidade de hardware nem de prontidão comercial.

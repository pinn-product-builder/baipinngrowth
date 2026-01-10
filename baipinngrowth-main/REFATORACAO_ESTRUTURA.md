# Estrutura de Refatoração - Código Modular

## 📋 Objetivo

Quebrar arquivos grandes em módulos menores, organizados e fáceis de manter.

## 🏗️ Nova Estrutura

### 1. DashboardAutoBuilder (2662+ linhas)

**Estrutura criada:**

```
src/components/dashboards/wizard/
├── utils/
│   ├── crmDetection.ts          # Detecção de funis CRM
│   ├── columnMatching.ts        # Matching de colunas
│   ├── specGenerator.ts         # Geração de specs
│   └── index.ts                 # Barrel export
├── hooks/
│   ├── useWizardState.ts        # Estado do wizard
│   ├── useDatasetAnalysis.ts    # Análise de dataset
│   ├── useDashboardGeneration.ts # Geração de dashboard
│   └── index.ts                 # Barrel export
├── components/
│   ├── ProgressIndicator.tsx   # Indicador de progresso
│   └── AggregationPreview.tsx   # Preview de agregação
├── constants.ts                 # Constantes compartilhadas
└── DashboardAutoBuilder.tsx     # Componente principal (simplificado)
```

**Benefícios:**
- ✅ Código mais testável
- ✅ Reutilização de lógica
- ✅ Manutenção mais fácil
- ✅ Separação de responsabilidades

### 2. Próximos Arquivos a Refatorar

#### DataSources.tsx (1942+ linhas)
**Estrutura proposta:**
```
src/pages/admin/data-sources/
├── components/
│   ├── DataSourceList.tsx
│   ├── DataSourceForm.tsx
│   ├── OAuthFlow.tsx
│   └── TestConnection.tsx
├── hooks/
│   ├── useDataSources.ts
│   ├── useOAuth.ts
│   └── useDataSourceForm.ts
└── DataSources.tsx (página principal)
```

#### ModernDashboardViewer.tsx
**Estrutura proposta:**
```
src/components/dashboards/viewer/
├── hooks/
│   ├── useDashboardData.ts
│   ├── useDashboardFilters.ts
│   └── useDashboardTabs.ts
├── components/
│   ├── DashboardHeader.tsx
│   ├── DashboardContent.tsx
│   └── DashboardSidebar.tsx
└── ModernDashboardViewer.tsx (orquestrador)
```

## 📐 Princípios de Refatoração

1. **Single Responsibility**: Cada módulo tem uma responsabilidade única
2. **Separation of Concerns**: Lógica de negócio separada de UI
3. **DRY (Don't Repeat Yourself)**: Código reutilizável em hooks/utils
4. **Composição**: Componentes pequenos que se combinam
5. **Testabilidade**: Módulos fáceis de testar isoladamente

## 🔄 Processo de Refatoração

1. ✅ Identificar arquivos grandes (>1000 linhas)
2. ✅ Extrair funções utilitárias para `utils/`
3. ✅ Extrair lógica de estado para `hooks/`
4. ✅ Quebrar componentes grandes em menores
5. ✅ Criar barrel exports (`index.ts`)
6. ⏳ Atualizar imports no código existente
7. ⏳ Testar funcionalidade
8. ⏳ Documentar mudanças

## 📊 Status

- ✅ DashboardAutoBuilder - Estrutura criada e implementada
- ✅ DashboardAutoBuilder - Componente principal atualizado
- ✅ DataSources.tsx - Estrutura modular criada (tipos, constants, utils, hooks)
- ⏳ DataSources.tsx - Componentes extraídos (em progresso)
- ⏳ ModernDashboardViewer.tsx - Planejado
- ⏳ Outros arquivos grandes - A identificar

## 🎯 Próximos Passos

1. ✅ Atualizar `DashboardAutoBuilder.tsx` para usar os novos módulos
2. ⏳ Finalizar refatoração de `DataSources.tsx` (extrair componentes)
3. ⏳ Refatorar `ModernDashboardViewer.tsx`
4. ⏳ Criar testes para os novos módulos
5. ⏳ Documentar APIs dos hooks e utils

## 📚 Documentação

Veja `ESTRUTURA_FINAL.md` para a documentação completa da estrutura organizacional do código.



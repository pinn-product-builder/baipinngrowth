# Estrutura Final do Código - Organização Modular

## 📋 Visão Geral

Este documento descreve a estrutura final e organizada do código, com separação clara de responsabilidades para facilitar manutenção e escalabilidade.

## 🏗️ Estrutura de Diretórios

```
src/
├── components/                    # Componentes React reutilizáveis
│   ├── dashboards/
│   │   ├── wizard/               # Wizard de criação de dashboards
│   │   │   ├── components/       # Componentes do wizard
│   │   │   ├── hooks/            # Hooks customizados
│   │   │   ├── utils/            # Funções utilitárias
│   │   │   ├── steps/            # Passos do wizard
│   │   │   ├── constants.ts      # Constantes
│   │   │   ├── types.ts          # Tipos TypeScript
│   │   │   └── DashboardAutoBuilder.tsx
│   │   └── viewer/               # Visualizador de dashboards
│   │       ├── components/       # Componentes do viewer
│   │       ├── hooks/            # Hooks do viewer
│   │       ├── utils/            # Utilitários do viewer
│   │       └── types/            # Tipos do viewer
│   ├── ui/                       # Componentes UI base (shadcn/ui)
│   └── layouts/                  # Layouts da aplicação
│
├── pages/                        # Páginas da aplicação
│   ├── admin/
│   │   └── data-sources/         # Gerenciamento de data sources
│   │       ├── components/       # Componentes específicos
│   │       ├── hooks/            # Hooks de data sources
│   │       ├── utils/            # Utilitários
│   │       ├── types.ts          # Tipos
│   │       ├── constants.ts      # Constantes
│   │       └── DataSources.tsx   # Página principal
│   └── ...
│
├── hooks/                        # Hooks globais reutilizáveis
├── contexts/                     # Contextos React
├── lib/                          # Bibliotecas e utilitários globais
│   ├── dashboard/                # Utilitários de dashboard
│   └── ...
└── integrations/                 # Integrações externas
    └── supabase/
```

## 📦 Módulos Principais

### 1. Dashboard Auto Builder (Wizard)

**Localização:** `src/components/dashboards/wizard/`

**Estrutura:**
```
wizard/
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
│   ├── ProgressIndicator.tsx    # Indicador de progresso
│   └── AggregationPreview.tsx   # Preview de agregação
├── steps/
│   └── PromptStep.tsx           # Step de prompt
├── constants.ts                 # Constantes compartilhadas
├── types.ts                     # Tipos TypeScript
└── DashboardAutoBuilder.tsx     # Componente principal
```

**Responsabilidades:**
- ✅ Criação guiada de dashboards
- ✅ Análise de datasets
- ✅ Detecção automática de funis CRM
- ✅ Geração de specs de dashboard

### 2. Data Sources Management

**Localização:** `src/pages/admin/data-sources/`

**Estrutura:**
```
data-sources/
├── utils/
│   ├── connectionTest.ts        # Testes de conexão
│   ├── oauth.ts                 # Utilitários OAuth
│   └── index.ts                 # Barrel export
├── hooks/
│   ├── useDataSources.ts        # Gerenciamento de data sources
│   ├── useDataSourceFilters.ts  # Filtros e busca
│   └── index.ts                 # Barrel export
├── components/                  # Componentes (a criar)
│   ├── DataSourceList.tsx
│   ├── DataSourceForm.tsx
│   ├── OAuthFlow.tsx
│   └── TestConnection.tsx
├── types.ts                     # Tipos compartilhados
├── constants.ts                 # Constantes
└── DataSources.tsx              # Página principal
```

**Responsabilidades:**
- ✅ Gerenciamento de conexões (Proxy, Supabase, Google Sheets)
- ✅ Teste de conexões
- ✅ Fluxo OAuth para Google Sheets
- ✅ Configuração de credenciais

### 3. Dashboard Viewer

**Localização:** `src/components/dashboards/viewer/`

**Estrutura:**
```
viewer/
├── components/                  # Componentes do viewer
│   ├── DashboardHeader.tsx
│   ├── DashboardContent.tsx
│   ├── DashboardSidebar.tsx
│   └── ...
├── hooks/                       # Hooks (a criar)
│   ├── useDashboardData.ts
│   ├── useDashboardFilters.ts
│   └── useDashboardTabs.ts
├── utils/                       # Utilitários
│   ├── datasetNormalizer.ts
│   ├── templateEngine.ts
│   └── ...
├── types/
│   └── dashboardSpec.ts
└── ModernDashboardViewer.tsx    # Componente principal
```

**Responsabilidades:**
- ✅ Visualização de dashboards
- ✅ Filtros e navegação
- ✅ Normalização de dados
- ✅ Templates de visualização

## 📐 Princípios de Organização

### 1. Separação de Responsabilidades
- **UI Components**: Apenas apresentação
- **Hooks**: Lógica de estado e efeitos
- **Utils**: Funções puras e utilitários
- **Types**: Definições TypeScript
- **Constants**: Valores constantes

### 2. Estrutura Modular
Cada módulo grande segue o padrão:
```
module/
├── components/    # Componentes React
├── hooks/         # Custom hooks
├── utils/         # Funções utilitárias
├── types.ts       # Tipos TypeScript
├── constants.ts   # Constantes
└── index.ts       # Componente principal
```

### 3. Barrel Exports
Cada pasta de módulos tem um `index.ts` para facilitar imports:
```typescript
// Em vez de:
import { useDataSources } from './hooks/useDataSources';
import { useFilters } from './hooks/useDataSourceFilters';

// Use:
import { useDataSources, useDataSourceFilters } from './hooks';
```

### 4. Tipos Compartilhados
Tipos relacionados a um módulo ficam em `types.ts` na raiz do módulo:
```typescript
// data-sources/types.ts
export interface DataSource { ... }
export type DataSourceType = 'supabase' | 'proxy_webhook' | 'google_sheets';
```

### 5. Constantes Centralizadas
Constantes relacionadas ficam em `constants.ts`:
```typescript
// data-sources/constants.ts
export const DATA_SOURCE_TYPES = { ... };
export const AUTH_MODES = { ... };
```

## 🔄 Fluxo de Dados

### Componente → Hook → Utils → API

```
Component (UI)
    ↓
Hook (Estado + Lógica)
    ↓
Utils (Funções puras)
    ↓
API/Integrações
```

**Exemplo:**
```typescript
// Component
const { dataSources, refetch } = useDataSources();

// Hook
export function useDataSources() {
  const [data, setData] = useState();
  useEffect(() => { fetchData(); }, []);
  return { dataSources: data, refetch };
}

// Utils (se necessário)
export function formatDataSource(ds: DataSource) { ... }
```

## 📊 Status da Refatoração

### ✅ Concluído
- [x] DashboardAutoBuilder - Estrutura modular completa
- [x] DataSources - Tipos, constantes e utils criados
- [x] DataSources - Hooks básicos criados
- [x] Estrutura de documentação

### ⏳ Em Progresso
- [ ] DataSources - Componentes extraídos
- [ ] DataSources - Página principal refatorada
- [ ] ModernDashboardViewer - Hooks extraídos
- [ ] ModernDashboardViewer - Componentes extraídos

### 📋 Planejado
- [ ] Testes unitários para hooks e utils
- [ ] Documentação de APIs
- [ ] Storybook para componentes
- [ ] Otimizações de performance

## 🎯 Benefícios Alcançados

1. **Manutenibilidade**: Código organizado e fácil de encontrar
2. **Testabilidade**: Módulos isolados e testáveis
3. **Reutilização**: Hooks e utils compartilháveis
4. **Escalabilidade**: Estrutura preparada para crescimento
5. **Colaboração**: Estrutura clara facilita trabalho em equipe

## 📝 Convenções de Código

### Nomenclatura
- **Componentes**: PascalCase (`DataSourceList.tsx`)
- **Hooks**: camelCase com prefixo `use` (`useDataSources.ts`)
- **Utils**: camelCase (`connectionTest.ts`)
- **Types**: PascalCase para interfaces, camelCase para tipos (`DataSource`, `DataSourceType`)
- **Constants**: UPPER_SNAKE_CASE (`DATA_SOURCE_TYPES`)

### Estrutura de Arquivos
- Um componente por arquivo
- Um hook por arquivo
- Agrupar utils relacionados em um arquivo
- Usar barrel exports (`index.ts`) para facilitar imports

### Imports
```typescript
// 1. Bibliotecas externas
import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

// 2. Componentes UI
import { Button } from '@/components/ui/button';

// 3. Hooks e utils locais
import { useDataSources } from './hooks';
import { testConnection } from './utils';

// 4. Tipos
import type { DataSource } from './types';
```

## 🚀 Próximos Passos

1. Finalizar extração de componentes do DataSources
2. Refatorar ModernDashboardViewer
3. Adicionar testes unitários
4. Documentar APIs dos hooks
5. Criar guias de contribuição

---

**Última atualização:** 2024
**Versão:** 1.0.0


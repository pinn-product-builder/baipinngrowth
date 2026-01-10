# Dashboard Auto Builder - Estrutura Modular

## 📁 Estrutura de Arquivos

```
wizard/
├── utils/                    # Funções utilitárias
│   ├── crmDetection.ts       # Detecção de funis CRM/Kommo
│   ├── columnMatching.ts    # Matching fuzzy de colunas
│   ├── specGenerator.ts      # Geração de specs de dashboard
│   └── index.ts              # Barrel export
├── hooks/                    # Custom hooks
│   ├── useWizardState.ts     # Gerenciamento de estado do wizard
│   ├── useDatasetAnalysis.ts # Análise de datasets
│   ├── useDashboardGeneration.ts # Geração de dashboards
│   └── index.ts              # Barrel export
├── components/               # Componentes reutilizáveis
│   ├── ProgressIndicator.tsx # Indicador de progresso do wizard
│   └── AggregationPreview.tsx # Preview de agregações
├── constants.ts              # Constantes compartilhadas
├── DashboardAutoBuilder.tsx  # Componente principal
└── README.md                 # Este arquivo
```

## 🔧 Utils

### `crmDetection.ts`
Detecta se um dataset é um funil CRM/Kommo.

**Funções:**
- `detectCrmFunnelDataset()` - Analisa colunas e nome do dataset

**Exemplo:**
```typescript
import { detectCrmFunnelDataset } from './utils';

const result = detectCrmFunnelDataset(columns, datasetName);
if (result.isCrm) {
  // Usar lógica específica para CRM
}
```

### `columnMatching.ts`
Faz matching fuzzy de nomes de colunas.

**Funções:**
- `normalizeColumnName()` - Normaliza nome para comparação
- `findColumnMatch()` - Encontra coluna correspondente

**Exemplo:**
```typescript
import { findColumnMatch } from './utils';

const column = findColumnMatch('lead_id', availableColumns);
// Retorna 'lead_id', 'Lead_ID', 'st_lead_id', etc.
```

### `specGenerator.ts`
Gera specs de dashboard a partir de modelos semânticos e planos.

**Funções:**
- `generateFallbackSpec()` - Gera spec padrão
- `convertPlanToSpec()` - Converte plano LLM para spec

## 🎣 Hooks

### `useWizardState`
Gerencia o estado e navegação do wizard.

```typescript
const {
  currentStep,
  selectedDatasetId,
  setSelectedDatasetId,
  goNext,
  goBack,
  goToStep,
  canGoNext,
  canGoBack
} = useWizardState('select');
```

### `useDatasetAnalysis`
Gerencia análise de dataset (semantic model, diagnostics).

```typescript
const {
  analysis,
  analyzeDataset,
  resetAnalysis
} = useDatasetAnalysis();

await analyzeDataset(datasetId);
```

### `useDashboardGeneration`
Gerencia geração de planos e specs de dashboard.

```typescript
const {
  state,
  generatePlan,
  generateSpec,
  setMode,
  reset
} = useDashboardGeneration();

const plan = await generatePlan(datasetId, semanticModel, prompt);
const spec = await generateSpec(datasetId, plan, semanticModel);
```

## 🧩 Componentes

### `ProgressIndicator`
Mostra o progresso do wizard com status de cada etapa.

```typescript
<ProgressIndicator 
  steps={progressSteps} 
  currentStep={currentStep} 
/>
```

### `AggregationPreview`
Mostra preview de KPIs e funil agregados.

```typescript
<AggregationPreview 
  data={aggregationData} 
  isLoading={isLoading} 
/>
```

## 📝 Como Usar

### Importar utils
```typescript
import { detectCrmFunnelDataset, findColumnMatch } from './utils';
```

### Importar hooks
```typescript
import { useWizardState, useDatasetAnalysis } from './hooks';
```

### Importar componentes
```typescript
import ProgressIndicator from './components/ProgressIndicator';
import AggregationPreview from './components/AggregationPreview';
```

## 🔄 Migração

Para migrar o `DashboardAutoBuilder.tsx` existente:

1. Substituir funções inline por imports dos utils
2. Substituir useState/useEffect por hooks customizados
3. Extrair componentes grandes para `components/`
4. Usar barrel exports para imports limpos

## ✅ Benefícios

- ✅ Código mais testável
- ✅ Reutilização entre componentes
- ✅ Manutenção mais fácil
- ✅ Separação clara de responsabilidades
- ✅ Melhor organização



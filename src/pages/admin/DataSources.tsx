import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingPage, LoadingSpinner } from '@/components/ui/loading-spinner';
import { StatusBadge } from '@/components/ui/status-badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { useAuditLog } from '@/hooks/useAuditLog';
import { Database, Plus, Search, MoreHorizontal, Pencil, Power, CheckCircle, XCircle, Loader2, Trash2, Key, RefreshCw, Lock, Unlock, Globe, Webhook, AlertCircle, FileSpreadsheet, ExternalLink, Mail, Table as TableIcon } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

interface Tenant {
  id: string;
  name: string;
}

interface DataSource {
  id: string;
  tenant_id: string;
  type: string;
  name: string;
  project_ref: string;
  project_url: string;
  base_url: string | null;
  auth_mode: string | null;
  bearer_token: string | null;
  anon_key_present: boolean;
  service_role_key_present: boolean;
  allowed_views: string[];
  is_active: boolean;
  created_at: string;
  tenants?: { name: string } | null;
}

interface ViewInfo {
  name: string;
  schema: string;
  type: 'view' | 'table';
}

type TestStatus = 'idle' | 'testing' | 'success' | 'error';
type DataSourceType = 'supabase' | 'proxy_webhook' | 'google_sheets';

interface GoogleSpreadsheet {
  id: string;
  name: string;
  modifiedTime?: string;
}

interface GoogleSheet {
  sheetId: number;
  title: string;
  index: number;
  rowCount?: number;
  columnCount?: number;
}

export default function DataSources() {
  const [dataSources, setDataSources] = useState<DataSource[]>([]);
  const [filteredDataSources, setFilteredDataSources] = useState<DataSource[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterTenant, setFilterTenant] = useState<string>('all');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isKeysDialogOpen, setIsKeysDialogOpen] = useState(false);
  const [editingDataSource, setEditingDataSource] = useState<DataSource | null>(null);
  const [selectedDataSource, setSelectedDataSource] = useState<DataSource | null>(null);
  
  // Form data for proxy_webhook
  const [proxyFormData, setProxyFormData] = useState({
    name: '',
    tenantId: '',
    baseUrl: '',
    authMode: 'none' as 'none' | 'bearer_token',
    bearerToken: '',
    allowedViews: [] as string[]
  });
  
  // Form data for supabase (legacy)
  const [formData, setFormData] = useState({
    name: '',
    tenantId: '',
    projectRef: '',
    projectUrl: '',
    allowedViews: [] as string[]
  });
  
  const [keyFormData, setKeyFormData] = useState({
    anonKey: '',
    serviceRoleKey: ''
  });
  
  // Form data for Google Sheets
  const [sheetsFormData, setSheetsFormData] = useState({
    name: '',
    tenantId: '',
    spreadsheetId: '',
    spreadsheetName: '',
    selectedSheets: [] as string[],
    syncMode: 'direct_query' as 'direct_query' | 'etl_to_supabase',
    googleClientId: '',
    googleClientSecret: ''
  });
  
  // Google OAuth state
  const [googleOAuthStep, setGoogleOAuthStep] = useState<'connect' | 'select_spreadsheet' | 'select_sheets' | 'done'>('connect');
  const [googleAccessTokenEncrypted, setGoogleAccessTokenEncrypted] = useState<string>('');
  const [googleRefreshTokenEncrypted, setGoogleRefreshTokenEncrypted] = useState<string>('');
  const [googleEmail, setGoogleEmail] = useState<string>('');
  const [googleTokenExpires, setGoogleTokenExpires] = useState<Date | null>(null);
  const [spreadsheets, setSpreadsheets] = useState<GoogleSpreadsheet[]>([]);
  const [sheets, setSheets] = useState<GoogleSheet[]>([]);
  const [isLoadingSpreadsheets, setIsLoadingSpreadsheets] = useState(false);
  const [isLoadingSheets, setIsLoadingSheets] = useState(false);
  const [spreadsheetSearch, setSpreadsheetSearch] = useState('');
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSavingKeys, setIsSavingKeys] = useState(false);
  const [testStatus, setTestStatus] = useState<Record<string, TestStatus>>({});
  const [testResults, setTestResults] = useState<Record<string, string>>({});
  
  // Introspection state
  const [isIntrospecting, setIsIntrospecting] = useState(false);
  const [availableViews, setAvailableViews] = useState<ViewInfo[]>([]);
  const [availableTables, setAvailableTables] = useState<ViewInfo[]>([]);
  
  // Data source type selection
  const [selectedType, setSelectedType] = useState<DataSourceType>('proxy_webhook');
  
  const { toast } = useToast();
  const { logCreate, logUpdate, logDelete } = useAuditLog();

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    let filtered = dataSources;
    
    if (searchQuery) {
      filtered = filtered.filter(ds => 
        ds.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        ds.project_ref?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        ds.base_url?.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }
    
    if (filterTenant !== 'all') {
      filtered = filtered.filter(ds => ds.tenant_id === filterTenant);
    }
    
    setFilteredDataSources(filtered);
  }, [dataSources, searchQuery, filterTenant]);

  const fetchData = async () => {
    try {
      const { data: tenantsData } = await supabase
        .from('tenants')
        .select('id, name')
        .eq('is_active', true)
        .order('name');
      
      setTenants(tenantsData || []);

      const { data: dsData, error } = await supabase
        .from('tenant_data_sources')
        .select(`
          *,
          tenants (name)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setDataSources((dsData as any) || []);
    } catch (error) {
      console.error('Erro ao carregar data sources:', error);
      toast({ title: 'Erro', description: 'Falha ao carregar data sources.', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmitProxy = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!proxyFormData.name.trim() || !proxyFormData.tenantId || !proxyFormData.baseUrl.trim()) return;

    setIsSubmitting(true);
    try {
      const payload: any = {
        tenant_id: proxyFormData.tenantId,
        name: proxyFormData.name,
        type: 'proxy_webhook',
        base_url: proxyFormData.baseUrl,
        auth_mode: proxyFormData.authMode,
        bearer_token: proxyFormData.authMode === 'bearer_token' ? proxyFormData.bearerToken : null,
        allowed_views: proxyFormData.allowedViews,
        // Set dummy values for required fields
        project_ref: 'proxy',
        project_url: proxyFormData.baseUrl
      };

      if (editingDataSource) {
        const beforeData = { name: editingDataSource.name, base_url: editingDataSource.base_url };
        const { error } = await supabase
          .from('tenant_data_sources')
          .update(payload)
          .eq('id', editingDataSource.id);

        if (error) throw error;
        await logUpdate('data_source', editingDataSource.id, proxyFormData.name, beforeData, payload);
        toast({ title: 'Data Source atualizado', description: 'Alterações salvas com sucesso.' });
      } else {
        const { data, error } = await supabase
          .from('tenant_data_sources')
          .insert(payload)
          .select()
          .single();

        if (error) throw error;
        await logCreate('data_source', data.id, proxyFormData.name, { type: 'proxy_webhook', base_url: proxyFormData.baseUrl });
        toast({ title: 'Proxy criado', description: 'Novo proxy/webhook data source adicionado.' });
      }
      
      setIsDialogOpen(false);
      resetForm();
      fetchData();
    } catch (error: any) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmitSupabase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.tenantId || !formData.projectRef.trim() || !formData.projectUrl.trim()) return;

    setIsSubmitting(true);
    try {
      const payload = {
        tenant_id: formData.tenantId,
        name: formData.name,
        type: 'supabase',
        project_ref: formData.projectRef,
        project_url: formData.projectUrl,
        allowed_views: formData.allowedViews
      };

      if (editingDataSource) {
        const beforeData = { name: editingDataSource.name, project_url: editingDataSource.project_url };
        const { error } = await supabase
          .from('tenant_data_sources')
          .update(payload)
          .eq('id', editingDataSource.id);

        if (error) throw error;
        await logUpdate('data_source', editingDataSource.id, formData.name, beforeData, payload);
        toast({ title: 'Data Source atualizado', description: 'Alterações salvas com sucesso.' });
      } else {
        const { data, error } = await supabase
          .from('tenant_data_sources')
          .insert(payload)
          .select()
          .single();

        if (error) throw error;
        await logCreate('data_source', data.id, formData.name, { type: 'supabase', project_url: formData.projectUrl });
        toast({ title: 'Data Source criado', description: 'Novo data source adicionado. Configure as credenciais.' });
      }
      
      setIsDialogOpen(false);
      resetForm();
      fetchData();
    } catch (error: any) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      tenantId: '',
      projectRef: '',
      projectUrl: '',
      allowedViews: []
    });
    setProxyFormData({
      name: '',
      tenantId: '',
      baseUrl: '',
      authMode: 'none',
      bearerToken: '',
      allowedViews: []
    });
    setSheetsFormData({
      name: '',
      tenantId: '',
      spreadsheetId: '',
      spreadsheetName: '',
      selectedSheets: [],
      syncMode: 'direct_query',
      googleClientId: '',
      googleClientSecret: ''
    });
    setEditingDataSource(null);
    setAvailableViews([]);
    setAvailableTables([]);
    setSelectedType('proxy_webhook');
    // Reset Google OAuth state
    setGoogleOAuthStep('connect');
    setGoogleAccessTokenEncrypted('');
    setGoogleRefreshTokenEncrypted('');
    setGoogleEmail('');
    setGoogleTokenExpires(null);
    setSpreadsheets([]);
    setSheets([]);
    setSpreadsheetSearch('');
  };

  const openEditDialog = (ds: DataSource) => {
    setEditingDataSource(ds);
    
    if (ds.type === 'proxy_webhook') {
      setSelectedType('proxy_webhook');
      setProxyFormData({
        name: ds.name,
        tenantId: ds.tenant_id,
        baseUrl: ds.base_url || '',
        authMode: (ds.auth_mode as 'none' | 'bearer_token') || 'none',
        bearerToken: ds.bearer_token || '',
        allowedViews: ds.allowed_views
      });
    } else {
      setSelectedType('supabase');
      setFormData({
        name: ds.name,
        tenantId: ds.tenant_id,
        projectRef: ds.project_ref,
        projectUrl: ds.project_url,
        allowedViews: ds.allowed_views
      });
    }
    
    setIsDialogOpen(true);
  };

  const openCreateDialog = () => {
    resetForm();
    setIsDialogOpen(true);
  };

  const openKeysDialog = (ds: DataSource) => {
    setSelectedDataSource(ds);
    setKeyFormData({ anonKey: '', serviceRoleKey: '' });
    setIsKeysDialogOpen(true);
  };

  const toggleStatus = async (ds: DataSource) => {
    try {
      const newStatus = !ds.is_active;
      const { error } = await supabase
        .from('tenant_data_sources')
        .update({ is_active: newStatus })
        .eq('id', ds.id);

      if (error) throw error;
      await logUpdate('data_source', ds.id, ds.name, { is_active: ds.is_active }, { is_active: newStatus });
      toast({ 
        title: ds.is_active ? 'Data Source desativado' : 'Data Source ativado',
        description: `${ds.name} está agora ${ds.is_active ? 'inativo' : 'ativo'}.`
      });
      fetchData();
    } catch (error: any) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    }
  };

  // Test proxy connection via /health endpoint
  const testProxyConnection = async (ds: DataSource) => {
    setTestStatus(prev => ({ ...prev, [ds.id]: 'testing' }));
    setTestResults(prev => ({ ...prev, [ds.id]: '' }));

    try {
      const healthUrl = `${ds.base_url}/health`;
      
      const headers: Record<string, string> = {
        'Accept': 'application/json',
      };
      
      if (ds.auth_mode === 'bearer_token' && ds.bearer_token) {
        headers['Authorization'] = `Bearer ${ds.bearer_token}`;
      }

      const response = await fetch(healthUrl, {
        method: 'GET',
        headers
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      
      if (result.ok) {
        setTestStatus(prev => ({ ...prev, [ds.id]: 'success' }));
        setTestResults(prev => ({ ...prev, [ds.id]: result.message || 'Proxy online' }));
        toast({ title: 'Conexão OK', description: result.message || 'Proxy online e funcionando.' });
      } else {
        throw new Error(result.message || 'Proxy retornou erro');
      }
    } catch (error: any) {
      setTestStatus(prev => ({ ...prev, [ds.id]: 'error' }));
      setTestResults(prev => ({ ...prev, [ds.id]: error.message }));
      toast({ 
        title: 'Falha na conexão', 
        description: error.message, 
        variant: 'destructive' 
      });
    }

    setTimeout(() => {
      setTestStatus(prev => ({ ...prev, [ds.id]: 'idle' }));
    }, 5000);
  };

  // Test Supabase connection via edge function
  const testSupabaseConnection = async (ds: DataSource) => {
    setTestStatus(prev => ({ ...prev, [ds.id]: 'testing' }));
    setTestResults(prev => ({ ...prev, [ds.id]: '' }));

    try {
      const response = await supabase.functions.invoke('test-data-source', {
        body: { data_source_id: ds.id }
      });

      if (response.error) {
        throw new Error(response.error.message || 'Erro ao chamar função');
      }

      const result = response.data;
      
      if (result.ok) {
        setTestStatus(prev => ({ ...prev, [ds.id]: 'success' }));
        setTestResults(prev => ({ ...prev, [ds.id]: result.message }));
        toast({ title: 'Conexão OK', description: result.message });
      } else {
        const errorMsg = result.error?.message || 'Erro desconhecido';
        setTestStatus(prev => ({ ...prev, [ds.id]: 'error' }));
        setTestResults(prev => ({ ...prev, [ds.id]: errorMsg }));
        toast({ 
          title: `Falha: ${result.error?.code || 'ERRO'}`, 
          description: errorMsg, 
          variant: 'destructive' 
        });
      }
    } catch (error: any) {
      setTestStatus(prev => ({ ...prev, [ds.id]: 'error' }));
      setTestResults(prev => ({ ...prev, [ds.id]: error.message }));
      toast({ title: 'Erro de conexão', description: error.message, variant: 'destructive' });
    }

    setTimeout(() => {
      setTestStatus(prev => ({ ...prev, [ds.id]: 'idle' }));
    }, 5000);
  };

  const testConnection = (ds: DataSource) => {
    if (ds.type === 'proxy_webhook') {
      testProxyConnection(ds);
    } else if (ds.type === 'google_sheets') {
      testGoogleSheetsConnection(ds);
    } else {
      testSupabaseConnection(ds);
    }
  };

  // Test Google Sheets connection
  const testGoogleSheetsConnection = async (ds: DataSource) => {
    setTestStatus(prev => ({ ...prev, [ds.id]: 'testing' }));
    setTestResults(prev => ({ ...prev, [ds.id]: '' }));

    try {
      const response = await supabase.functions.invoke('google-sheets-connect', {
        body: { action: 'test_connection', data_source_id: ds.id }
      });

      if (response.error) {
        throw new Error(response.error.message || 'Erro ao chamar função');
      }

      const result = response.data;
      
      if (result.ok) {
        setTestStatus(prev => ({ ...prev, [ds.id]: 'success' }));
        setTestResults(prev => ({ ...prev, [ds.id]: result.message }));
        toast({ title: 'Conexão OK', description: result.message });
      } else {
        const errorMsg = result.error?.message || 'Erro desconhecido';
        setTestStatus(prev => ({ ...prev, [ds.id]: 'error' }));
        setTestResults(prev => ({ ...prev, [ds.id]: errorMsg }));
        toast({ 
          title: `Falha: ${result.error?.code || 'ERRO'}`, 
          description: errorMsg, 
          variant: 'destructive' 
        });
      }
    } catch (error: any) {
      setTestStatus(prev => ({ ...prev, [ds.id]: 'error' }));
      setTestResults(prev => ({ ...prev, [ds.id]: error.message }));
      toast({ title: 'Erro de conexão', description: error.message, variant: 'destructive' });
    }

    setTimeout(() => {
      setTestStatus(prev => ({ ...prev, [ds.id]: 'idle' }));
    }, 5000);
  };

  // Fixed OAuth callback URL - MUST match Google Cloud Console configuration
  const getGoogleOAuthRedirectUri = () => {
    // Use production domain for OAuth callback
    const origin = window.location.origin;
    // Always use the current origin + fixed callback path
    return `${origin}/admin/data-sources`;
  };

  const googleOAuthRedirectUri = getGoogleOAuthRedirectUri();

  const copyRedirectUri = async () => {
    try {
      await navigator.clipboard.writeText(googleOAuthRedirectUri);
      toast({ title: 'Copiado!', description: 'Redirect URI copiado para a área de transferência.' });
    } catch {
      toast({ title: 'Erro', description: 'Não foi possível copiar.', variant: 'destructive' });
    }
  };

  // Google OAuth flow
  const startGoogleOAuth = async () => {
    if (!sheetsFormData.googleClientId.trim() || !sheetsFormData.googleClientSecret.trim()) {
      toast({ 
        title: 'Credenciais obrigatórias', 
        description: 'Preencha o Client ID e Client Secret do Google antes de conectar.', 
        variant: 'destructive' 
      });
      return;
    }
    
    try {
      const redirectUri = googleOAuthRedirectUri;
      const state = btoa(JSON.stringify({ 
        tenantId: sheetsFormData.tenantId, 
        name: sheetsFormData.name,
        redirect_uri: redirectUri // Store for verification
      }));
      
      console.log('[OAuth Debug] redirect_uri:', redirectUri);
      console.log('[OAuth Debug] client_id:', sheetsFormData.googleClientId.substring(0, 20) + '...');
      
      const response = await supabase.functions.invoke('google-sheets-connect', {
        body: { 
          action: 'get_oauth_url', 
          redirect_uri: redirectUri,
          state,
          google_client_id: sheetsFormData.googleClientId.trim(),
          google_client_secret: sheetsFormData.googleClientSecret.trim()
        }
      });

      if (response.error || !response.data?.ok) {
        const errMsg = response.data?.error?.message || response.error?.message || 'Erro ao obter URL OAuth';
        console.error('[OAuth Debug] Error:', errMsg, response.data?.error);
        toast({ title: 'Erro', description: errMsg, variant: 'destructive' });
        return;
      }

      console.log('[OAuth Debug] OAuth URL generated successfully');

      // Open OAuth in popup
      const popup = window.open(response.data.oauth_url, 'google_oauth', 'width=600,height=700');
      
      // Listen for the callback
      const checkPopup = setInterval(() => {
        try {
          if (popup?.closed) {
            clearInterval(checkPopup);
            return;
          }
          
          const popupUrl = popup?.location?.href;
          if (popupUrl && popupUrl.includes('code=')) {
            clearInterval(checkPopup);
            popup?.close();
            
            const url = new URL(popupUrl);
            const code = url.searchParams.get('code');
            if (code) {
              handleGoogleOAuthCallback(code, redirectUri);
            }
          }
        } catch {
          // Cross-origin error expected until redirect happens
        }
      }, 500);
    } catch (error: any) {
      console.error('[OAuth Debug] Exception:', error);
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    }
  };

  const handleGoogleOAuthCallback = async (code: string, redirectUri: string) => {
    try {
      const response = await supabase.functions.invoke('google-sheets-connect', {
        body: { 
          action: 'exchange_code', 
          code, 
          redirect_uri: redirectUri,
          google_client_id: sheetsFormData.googleClientId.trim(),
          google_client_secret: sheetsFormData.googleClientSecret.trim()
        }
      });

      if (response.error || !response.data?.ok) {
        const errMsg = response.data?.error?.message || response.error?.message || 'Erro ao trocar código OAuth';
        toast({ title: 'Erro OAuth', description: errMsg, variant: 'destructive' });
        return;
      }

      const { access_token_encrypted, refresh_token_encrypted, email, expires_in } = response.data;
      
      setGoogleAccessTokenEncrypted(access_token_encrypted);
      setGoogleRefreshTokenEncrypted(refresh_token_encrypted || '');
      setGoogleEmail(email || '');
      setGoogleTokenExpires(expires_in ? new Date(Date.now() + expires_in * 1000) : null);
      setGoogleOAuthStep('select_spreadsheet');
      
      toast({ title: 'Conectado!', description: `Conta Google conectada: ${email}` });
      
      // Load spreadsheets
      loadSpreadsheets(access_token_encrypted);
    } catch (error: any) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    }
  };

  const loadSpreadsheets = async (accessTokenEncrypted?: string) => {
    setIsLoadingSpreadsheets(true);
    try {
      const response = await supabase.functions.invoke('google-sheets-connect', {
        body: { 
          action: 'list_spreadsheets', 
          access_token_encrypted: accessTokenEncrypted || googleAccessTokenEncrypted 
        }
      });

      if (response.error || !response.data?.ok) {
        throw new Error(response.data?.error?.message || 'Erro ao listar planilhas');
      }

      setSpreadsheets(response.data.spreadsheets || []);
    } catch (error: any) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    } finally {
      setIsLoadingSpreadsheets(false);
    }
  };

  const selectSpreadsheet = async (spreadsheet: GoogleSpreadsheet) => {
    setSheetsFormData(prev => ({
      ...prev,
      spreadsheetId: spreadsheet.id,
      spreadsheetName: spreadsheet.name,
      name: prev.name || spreadsheet.name
    }));
    
    // Load sheets for this spreadsheet
    setIsLoadingSheets(true);
    try {
      const response = await supabase.functions.invoke('google-sheets-connect', {
        body: { 
          action: 'list_sheets', 
          spreadsheet_id: spreadsheet.id,
          access_token_encrypted: googleAccessTokenEncrypted 
        }
      });

      if (response.error || !response.data?.ok) {
        throw new Error(response.data?.error?.message || 'Erro ao listar abas');
      }

      setSheets(response.data.sheets || []);
      setGoogleOAuthStep('select_sheets');
    } catch (error: any) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    } finally {
      setIsLoadingSheets(false);
    }
  };

  const toggleSheetSelection = (sheetTitle: string) => {
    setSheetsFormData(prev => ({
      ...prev,
      selectedSheets: prev.selectedSheets.includes(sheetTitle)
        ? prev.selectedSheets.filter(s => s !== sheetTitle)
        : [...prev.selectedSheets, sheetTitle]
    }));
  };

  const handleSubmitGoogleSheets = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sheetsFormData.name.trim() || !sheetsFormData.tenantId || !sheetsFormData.spreadsheetId) return;
    if (sheetsFormData.selectedSheets.length === 0) {
      toast({ title: 'Erro', description: 'Selecione pelo menos uma aba.', variant: 'destructive' });
      return;
    }

    setIsSubmitting(true);
    try {
      // First, encrypt the Google OAuth credentials via edge function
      let clientIdEncrypted = null;
      let clientSecretEncrypted = null;
      
      if (sheetsFormData.googleClientId.trim() && sheetsFormData.googleClientSecret.trim()) {
        const encryptResponse = await supabase.functions.invoke('google-sheets-connect', {
          body: { 
            action: 'encrypt_credentials',
            google_client_id: sheetsFormData.googleClientId.trim(),
            google_client_secret: sheetsFormData.googleClientSecret.trim()
          }
        });
        
        if (encryptResponse.error || !encryptResponse.data?.ok) {
          throw new Error(encryptResponse.data?.error?.message || 'Erro ao criptografar credenciais');
        }
        
        clientIdEncrypted = encryptResponse.data.client_id_encrypted;
        clientSecretEncrypted = encryptResponse.data.client_secret_encrypted;
      }
      
      // Create one data source for the spreadsheet
      const payload = {
        tenant_id: sheetsFormData.tenantId,
        name: sheetsFormData.name,
        type: 'google_sheets',
        project_ref: sheetsFormData.spreadsheetId,
        project_url: `https://docs.google.com/spreadsheets/d/${sheetsFormData.spreadsheetId}`,
        allowed_views: sheetsFormData.selectedSheets,
        google_spreadsheet_id: sheetsFormData.spreadsheetId,
        google_access_token_encrypted: googleAccessTokenEncrypted,
        google_refresh_token_encrypted: googleRefreshTokenEncrypted || null,
        google_token_expires_at: googleTokenExpires?.toISOString() || null,
        google_email: googleEmail,
        sync_mode: sheetsFormData.syncMode,
        google_client_id_encrypted: clientIdEncrypted,
        google_client_secret_encrypted: clientSecretEncrypted
      };

      const { data, error } = await supabase
        .from('tenant_data_sources')
        .insert(payload)
        .select()
        .single();

      if (error) throw error;
      
      await logCreate('data_source', data.id, sheetsFormData.name, { 
        type: 'google_sheets', 
        spreadsheet_id: sheetsFormData.spreadsheetId,
        sheets: sheetsFormData.selectedSheets 
      });
      
      // Create datasets for each selected sheet
      for (const sheetName of sheetsFormData.selectedSheets) {
        await supabase.from('datasets').insert({
          tenant_id: sheetsFormData.tenantId,
          datasource_id: data.id,
          name: `${sheetsFormData.name} - ${sheetName}`,
          kind: 'sheet',
          object_name: `${sheetsFormData.spreadsheetId}:${sheetName}`,
          schema_name: 'google_sheets',
          is_active: true
        });
      }
      
      toast({ 
        title: 'Google Sheets conectado!', 
        description: `${sheetsFormData.selectedSheets.length} aba(s) adicionadas como datasets.` 
      });
      
      setIsDialogOpen(false);
      resetForm();
      fetchData();
    } catch (error: any) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const introspectDataSource = async (dsId?: string) => {
    const targetId = dsId || editingDataSource?.id;
    if (!targetId) return;

    setIsIntrospecting(true);
    try {
      const response = await supabase.functions.invoke('introspect-datasource', {
        body: { data_source_id: targetId, schema: 'public' }
      });

      if (response.error) {
        throw new Error(response.error.message || 'Erro ao chamar função');
      }

      const result = response.data;
      
      if (result.ok) {
        setAvailableViews(result.views || []);
        setAvailableTables(result.tables || []);
        toast({ 
          title: 'Introspecção concluída', 
          description: `Encontradas ${result.views?.length || 0} views e ${result.tables?.length || 0} tabelas.` 
        });
      } else {
        const errorMsg = result.error?.message || 'Erro desconhecido';
        toast({ 
          title: `Erro: ${result.error?.code || 'FALHA'}`, 
          description: errorMsg, 
          variant: 'destructive' 
        });
      }
    } catch (error: any) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    } finally {
      setIsIntrospecting(false);
    }
  };

  const saveKeys = async () => {
    if (!selectedDataSource) return;

    setIsSavingKeys(true);
    try {
      const body: any = {
        data_source_id: selectedDataSource.id,
        action: 'set_keys'
      };

      if (keyFormData.anonKey.trim()) {
        body.anon_key = keyFormData.anonKey.trim();
      }
      if (keyFormData.serviceRoleKey.trim()) {
        body.service_role_key = keyFormData.serviceRoleKey.trim();
      }

      if (!body.anon_key && !body.service_role_key) {
        toast({ title: 'Erro', description: 'Informe pelo menos uma chave.', variant: 'destructive' });
        setIsSavingKeys(false);
        return;
      }

      const response = await supabase.functions.invoke('manage-datasource-keys', { body });

      if (response.error) {
        throw new Error(response.error.message || 'Erro ao chamar função');
      }

      const result = response.data;

      if (result.ok) {
        toast({ title: 'Credenciais salvas', description: result.message || 'As chaves foram criptografadas e salvas.' });
        setIsKeysDialogOpen(false);
        setKeyFormData({ anonKey: '', serviceRoleKey: '' });
        fetchData();
      } else {
        const errorMsg = result.error?.message || 'Erro desconhecido';
        toast({ 
          title: `Erro: ${result.error?.code || 'FALHA'}`, 
          description: errorMsg, 
          variant: 'destructive' 
        });
      }
    } catch (error: any) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    } finally {
      setIsSavingKeys(false);
    }
  };

  const deleteDataSource = async (ds: DataSource) => {
    if (!confirm(`Tem certeza que deseja excluir "${ds.name}"? Esta ação não pode ser desfeita.`)) return;

    try {
      const { error } = await supabase
        .from('tenant_data_sources')
        .delete()
        .eq('id', ds.id);

      if (error) throw error;
      await logDelete('data_source', ds.id, ds.name, { type: ds.type, name: ds.name });
      toast({ title: 'Data Source excluído', description: `${ds.name} foi removido.` });
      fetchData();
    } catch (error: any) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    }
  };

  const toggleViewSelection = (viewName: string, isProxy: boolean = false) => {
    if (isProxy) {
      setProxyFormData(prev => ({
        ...prev,
        allowedViews: prev.allowedViews.includes(viewName)
          ? prev.allowedViews.filter(v => v !== viewName)
          : [...prev.allowedViews, viewName]
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        allowedViews: prev.allowedViews.includes(viewName)
          ? prev.allowedViews.filter(v => v !== viewName)
          : [...prev.allowedViews, viewName]
      }));
    }
  };

  const addViewManually = (viewName: string, isProxy: boolean = false) => {
    if (!viewName.trim()) return;
    if (isProxy) {
      if (!proxyFormData.allowedViews.includes(viewName)) {
        setProxyFormData(prev => ({
          ...prev,
          allowedViews: [...prev.allowedViews, viewName]
        }));
      }
    } else {
      if (!formData.allowedViews.includes(viewName)) {
        setFormData(prev => ({
          ...prev,
          allowedViews: [...prev.allowedViews, viewName]
        }));
      }
    }
  };

  const [manualViewName, setManualViewName] = useState('');

  if (isLoading) {
    return <LoadingPage message="Carregando data sources..." />;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader 
        title="Data Sources" 
        description="Gerencie conexões com fontes de dados externas (Proxy/n8n ou Supabase)"
        actions={
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={openCreateDialog}>
                <Plus className="mr-2 h-4 w-4" />
                Adicionar Data Source
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>{editingDataSource ? 'Editar Data Source' : 'Novo Data Source'}</DialogTitle>
                <DialogDescription>
                  {editingDataSource ? 'Atualize a configuração.' : 'Escolha o tipo e configure a conexão.'}
                </DialogDescription>
              </DialogHeader>
              
              <Tabs value={selectedType} onValueChange={(v) => setSelectedType(v as DataSourceType)} className="w-full">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="proxy_webhook" className="flex items-center gap-2">
                    <Webhook className="h-4 w-4" />
                    Proxy / Webhook
                  </TabsTrigger>
                  <TabsTrigger value="google_sheets" className="flex items-center gap-2">
                    <FileSpreadsheet className="h-4 w-4" />
                    Google Sheets
                  </TabsTrigger>
                  <TabsTrigger value="supabase" className="flex items-center gap-2">
                    <Database className="h-4 w-4" />
                    Supabase
                  </TabsTrigger>
                </TabsList>
                
                {/* Google Sheets Tab */}
                <TabsContent value="google_sheets">
                  <form onSubmit={handleSubmitGoogleSheets}>
                    <div className="grid gap-4 py-4 max-h-[60vh] overflow-y-auto">
                      <Alert>
                        <FileSpreadsheet className="h-4 w-4" />
                        <AlertTitle>Google Sheets</AlertTitle>
                        <AlertDescription>
                          Conecte uma planilha do Google e crie datasets a partir das abas.
                        </AlertDescription>
                      </Alert>
                      
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Tenant</Label>
                          <Select 
                            value={sheetsFormData.tenantId} 
                            onValueChange={(v) => setSheetsFormData({ ...sheetsFormData, tenantId: v })}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Selecione o tenant" />
                            </SelectTrigger>
                            <SelectContent>
                              {tenants.map((t) => (
                                <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>Nome do Data Source</Label>
                          <Input
                            value={sheetsFormData.name}
                            onChange={(e) => setSheetsFormData({ ...sheetsFormData, name: e.target.value })}
                            placeholder="Ex: Planilha CRM"
                          />
                        </div>
                      </div>

                      {googleOAuthStep === 'connect' && (
                        <div className="space-y-4">
                          {/* Google API Credentials */}
                          <div className="p-4 border rounded-lg bg-muted/30 space-y-4">
                            <div className="flex items-center justify-between">
                              <Label className="text-base font-medium">Credenciais Google OAuth</Label>
                              <a 
                                href="https://console.cloud.google.com/apis/credentials" 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="text-sm text-primary hover:underline flex items-center gap-1"
                              >
                                <ExternalLink className="h-3 w-3" />
                                Criar no Google Cloud Console
                              </a>
                            </div>
                            
                            {/* Fixed Redirect URI - user must copy exactly */}
                            <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg space-y-2">
                              <Label className="text-sm font-medium text-amber-800 dark:text-amber-200">
                                ⚠️ Redirect URI (copie exatamente este valor)
                              </Label>
                              <div className="flex items-center gap-2">
                                <code className="flex-1 bg-background px-3 py-2 rounded border text-sm font-mono break-all">
                                  {googleOAuthRedirectUri}
                                </code>
                                <Button 
                                  type="button" 
                                  size="sm" 
                                  variant="outline"
                                  onClick={copyRedirectUri}
                                >
                                  Copiar
                                </Button>
                              </div>
                              <p className="text-xs text-amber-700 dark:text-amber-300">
                                No Google Cloud Console → APIs & Services → Credentials → seu OAuth Client ID → 
                                <strong> Authorized redirect URIs</strong> → adicione exatamente esta URL acima.
                              </p>
                            </div>
                            
                            <div className="grid grid-cols-1 gap-4">
                              <div className="space-y-2">
                                <Label htmlFor="googleClientId">Client ID</Label>
                                <Input
                                  id="googleClientId"
                                  value={sheetsFormData.googleClientId}
                                  onChange={(e) => setSheetsFormData({ ...sheetsFormData, googleClientId: e.target.value })}
                                  placeholder="xxxxx.apps.googleusercontent.com"
                                />
                              </div>
                              <div className="space-y-2">
                                <Label htmlFor="googleClientSecret">Client Secret</Label>
                                <Input
                                  id="googleClientSecret"
                                  type="password"
                                  value={sheetsFormData.googleClientSecret}
                                  onChange={(e) => setSheetsFormData({ ...sheetsFormData, googleClientSecret: e.target.value })}
                                  placeholder="GOCSPX-..."
                                />
                              </div>
                            </div>
                          </div>
                          
                          <div className="flex flex-col items-center gap-4 py-6 border rounded-lg bg-muted/30">
                            <FileSpreadsheet className="h-12 w-12 text-muted-foreground" />
                            <p className="text-sm text-muted-foreground">Conecte sua conta Google para acessar planilhas</p>
                            <Button 
                              type="button" 
                              onClick={startGoogleOAuth}
                              disabled={!sheetsFormData.tenantId || !sheetsFormData.googleClientId.trim() || !sheetsFormData.googleClientSecret.trim()}
                            >
                              <ExternalLink className="mr-2 h-4 w-4" />
                              Conectar Conta Google
                            </Button>
                            {!sheetsFormData.tenantId && (
                              <p className="text-xs text-destructive">Selecione um tenant primeiro</p>
                            )}
                            {sheetsFormData.tenantId && (!sheetsFormData.googleClientId.trim() || !sheetsFormData.googleClientSecret.trim()) && (
                              <p className="text-xs text-destructive">Preencha as credenciais OAuth antes de conectar</p>
                            )}
                          </div>
                        </div>
                      )}

                      {googleOAuthStep === 'select_spreadsheet' && (
                        <div className="space-y-3">
                          <div className="flex items-center gap-2 text-sm text-green-600">
                            <Mail className="h-4 w-4" />
                            Conectado como: {googleEmail}
                          </div>
                          <Label>Selecione uma planilha</Label>
                          <Input
                            placeholder="Buscar planilha..."
                            value={spreadsheetSearch}
                            onChange={(e) => setSpreadsheetSearch(e.target.value)}
                          />
                          <ScrollArea className="h-48 border rounded-lg">
                            {isLoadingSpreadsheets ? (
                              <div className="flex items-center justify-center py-8">
                                <Loader2 className="h-6 w-6 animate-spin" />
                              </div>
                            ) : (
                              <div className="p-2 space-y-1">
                                {spreadsheets
                                  .filter(s => s.name.toLowerCase().includes(spreadsheetSearch.toLowerCase()))
                                  .map(s => (
                                    <button
                                      key={s.id}
                                      type="button"
                                      onClick={() => selectSpreadsheet(s)}
                                      className="w-full flex items-center gap-2 p-2 rounded hover:bg-accent text-left"
                                    >
                                      <FileSpreadsheet className="h-4 w-4 text-green-600" />
                                      <span className="truncate">{s.name}</span>
                                    </button>
                                  ))}
                              </div>
                            )}
                          </ScrollArea>
                        </div>
                      )}

                      {googleOAuthStep === 'select_sheets' && (
                        <div className="space-y-3">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline">{sheetsFormData.spreadsheetName}</Badge>
                            <Button type="button" variant="ghost" size="sm" onClick={() => setGoogleOAuthStep('select_spreadsheet')}>
                              Trocar
                            </Button>
                          </div>
                          <Label>Selecione as abas para criar datasets</Label>
                          <ScrollArea className="h-40 border rounded-lg p-2">
                            {isLoadingSheets ? (
                              <div className="flex items-center justify-center py-8">
                                <Loader2 className="h-6 w-6 animate-spin" />
                              </div>
                            ) : (
                              <div className="space-y-1">
                                {sheets.map(sheet => (
                                  <div key={sheet.sheetId} className="flex items-center gap-2">
                                    <Checkbox
                                      id={`sheet-${sheet.sheetId}`}
                                      checked={sheetsFormData.selectedSheets.includes(sheet.title)}
                                      onCheckedChange={() => toggleSheetSelection(sheet.title)}
                                    />
                                    <label htmlFor={`sheet-${sheet.sheetId}`} className="flex items-center gap-2 cursor-pointer">
                                      <TableIcon className="h-4 w-4 text-muted-foreground" />
                                      {sheet.title}
                                      <span className="text-xs text-muted-foreground">
                                        ({sheet.rowCount} linhas)
                                      </span>
                                    </label>
                                  </div>
                                ))}
                              </div>
                            )}
                          </ScrollArea>
                          {sheetsFormData.selectedSheets.length > 0 && (
                            <p className="text-sm text-muted-foreground">
                              {sheetsFormData.selectedSheets.length} aba(s) selecionada(s)
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                    <DialogFooter>
                      <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                        Cancelar
                      </Button>
                      <Button 
                        type="submit" 
                        disabled={isSubmitting || googleOAuthStep !== 'select_sheets' || sheetsFormData.selectedSheets.length === 0}
                      >
                        {isSubmitting ? 'Salvando...' : 'Criar Data Source'}
                      </Button>
                    </DialogFooter>
                  </form>
                </TabsContent>
                
                {/* Proxy/Webhook Tab */}
                <TabsContent value="proxy_webhook">
                  <form onSubmit={handleSubmitProxy}>
                    <div className="grid gap-4 py-4 max-h-[60vh] overflow-y-auto">
                      <Alert>
                        <Globe className="h-4 w-4" />
                        <AlertTitle>Modo Proxy/Webhook</AlertTitle>
                        <AlertDescription>
                          Conecte a um n8n ou outro webhook que faz a query para o Supabase. 
                          As credenciais ficam no servidor do proxy, não no Lovable.
                        </AlertDescription>
                      </Alert>
                      
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="proxy-tenant">Tenant</Label>
                          <Select 
                            value={proxyFormData.tenantId} 
                            onValueChange={(v) => setProxyFormData({ ...proxyFormData, tenantId: v })}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Selecione o tenant" />
                            </SelectTrigger>
                            <SelectContent>
                              {tenants.map((t) => (
                                <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="proxy-name">Nome</Label>
                          <Input
                            id="proxy-name"
                            value={proxyFormData.name}
                            onChange={(e) => setProxyFormData({ ...proxyFormData, name: e.target.value })}
                            placeholder="Ex: Afonsina n8n Proxy"
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="proxy-baseUrl">Base URL do Proxy</Label>
                        <Input
                          id="proxy-baseUrl"
                          value={proxyFormData.baseUrl}
                          onChange={(e) => setProxyFormData({ ...proxyFormData, baseUrl: e.target.value })}
                          placeholder="https://seu-n8n.app.n8n.cloud/webhook/xxx"
                        />
                        <p className="text-xs text-muted-foreground">
                          URL base do webhook. O sistema chamará /health e /query automaticamente.
                        </p>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="proxy-authMode">Autenticação</Label>
                          <Select 
                            value={proxyFormData.authMode} 
                            onValueChange={(v) => setProxyFormData({ ...proxyFormData, authMode: v as 'none' | 'bearer_token' })}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">Nenhuma</SelectItem>
                              <SelectItem value="bearer_token">Bearer Token</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        {proxyFormData.authMode === 'bearer_token' && (
                          <div className="space-y-2">
                            <Label htmlFor="proxy-bearerToken">Bearer Token</Label>
                            <Input
                              id="proxy-bearerToken"
                              type="password"
                              value={proxyFormData.bearerToken}
                              onChange={(e) => setProxyFormData({ ...proxyFormData, bearerToken: e.target.value })}
                              placeholder="Token de autenticação"
                            />
                          </div>
                        )}
                      </div>

                      <div className="space-y-2">
                        <Label>Views Permitidas (nome da view no Supabase do cliente)</Label>
                        <div className="flex gap-2">
                          <Input
                            placeholder="Ex: vw_afonsina_custos_funil_dia"
                            value={manualViewName}
                            onChange={(e) => setManualViewName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                addViewManually(manualViewName, true);
                                setManualViewName('');
                              }
                            }}
                          />
                          <Button 
                            type="button" 
                            variant="outline"
                            onClick={() => {
                              addViewManually(manualViewName, true);
                              setManualViewName('');
                            }}
                          >
                            Adicionar
                          </Button>
                        </div>
                        {proxyFormData.allowedViews.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {proxyFormData.allowedViews.map(v => (
                              <Badge key={v} variant="secondary" className="text-xs">
                                {v}
                                <button 
                                  type="button"
                                  onClick={() => toggleViewSelection(v, true)}
                                  className="ml-1 hover:text-destructive"
                                >
                                  ×
                                </button>
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    <DialogFooter>
                      <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                        Cancelar
                      </Button>
                      <Button type="submit" disabled={isSubmitting}>
                        {isSubmitting ? 'Salvando...' : (editingDataSource ? 'Salvar Alterações' : 'Criar Proxy')}
                      </Button>
                    </DialogFooter>
                  </form>
                </TabsContent>

                {/* Supabase Tab */}
                <TabsContent value="supabase">
                  <form onSubmit={handleSubmitSupabase}>
                    <div className="grid gap-4 py-4 max-h-[60vh] overflow-y-auto">
                      <Alert variant="destructive">
                        <AlertCircle className="h-4 w-4" />
                        <AlertTitle>Modo Supabase Direto (com problemas)</AlertTitle>
                        <AlertDescription>
                          Este modo requer salvar credenciais criptografadas, que pode apresentar erros. 
                          Prefira usar o modo Proxy/Webhook.
                        </AlertDescription>
                      </Alert>
                      
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="tenant">Tenant</Label>
                          <Select 
                            value={formData.tenantId} 
                            onValueChange={(v) => setFormData({ ...formData, tenantId: v })}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Selecione o tenant" />
                            </SelectTrigger>
                            <SelectContent>
                              {tenants.map((t) => (
                                <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="name">Nome</Label>
                          <Input
                            id="name"
                            value={formData.name}
                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                            placeholder="Ex: Afonsina Supabase"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="projectRef">Project Ref</Label>
                          <Input
                            id="projectRef"
                            value={formData.projectRef}
                            onChange={(e) => setFormData({ ...formData, projectRef: e.target.value })}
                            placeholder="mpbrjezmxmrdhgtvldvi"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="projectUrl">Project URL</Label>
                          <Input
                            id="projectUrl"
                            value={formData.projectUrl}
                            onChange={(e) => setFormData({ ...formData, projectUrl: e.target.value })}
                            placeholder="https://xxx.supabase.co"
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label>Views Permitidas</Label>
                          {editingDataSource && (
                            <Button 
                              type="button" 
                              variant="outline" 
                              size="sm"
                              onClick={() => introspectDataSource()}
                              disabled={isIntrospecting}
                            >
                              {isIntrospecting ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              ) : (
                                <RefreshCw className="mr-2 h-4 w-4" />
                              )}
                              Buscar Views
                            </Button>
                          )}
                        </div>
                        
                        {availableViews.length > 0 || availableTables.length > 0 ? (
                          <ScrollArea className="h-40 border rounded-lg p-3">
                            <div className="space-y-1">
                              {availableViews.length > 0 && (
                                <>
                                  <p className="text-xs font-medium text-muted-foreground mb-2">Views ({availableViews.length})</p>
                                  {availableViews.map(v => (
                                    <div key={v.name} className="flex items-center gap-2">
                                      <Checkbox 
                                        id={v.name}
                                        checked={formData.allowedViews.includes(v.name)}
                                        onCheckedChange={() => toggleViewSelection(v.name)}
                                      />
                                      <label htmlFor={v.name} className="text-sm cursor-pointer">{v.name}</label>
                                    </div>
                                  ))}
                                </>
                              )}
                              {availableTables.length > 0 && (
                                <>
                                  <p className="text-xs font-medium text-muted-foreground mt-3 mb-2">Tabelas ({availableTables.length})</p>
                                  {availableTables.map(t => (
                                    <div key={t.name} className="flex items-center gap-2">
                                      <Checkbox 
                                        id={t.name}
                                        checked={formData.allowedViews.includes(t.name)}
                                        onCheckedChange={() => toggleViewSelection(t.name)}
                                      />
                                      <label htmlFor={t.name} className="text-sm cursor-pointer">{t.name}</label>
                                    </div>
                                  ))}
                                </>
                              )}
                            </div>
                          </ScrollArea>
                        ) : (
                          <div className="border rounded-lg p-4 text-center text-sm text-muted-foreground">
                            {editingDataSource ? (
                              <>Clique em "Buscar Views" para carregar a lista de views/tabelas.</>
                            ) : (
                              <>Salve o data source e configure as credenciais para buscar views.</>
                            )}
                          </div>
                        )}

                        {formData.allowedViews.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {formData.allowedViews.map(v => (
                              <Badge key={v} variant="secondary" className="text-xs">
                                {v}
                                <button 
                                  type="button"
                                  onClick={() => toggleViewSelection(v)}
                                  className="ml-1 hover:text-destructive"
                                >
                                  ×
                                </button>
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="p-3 bg-muted rounded-lg text-sm">
                        <p className="font-medium mb-1 flex items-center gap-2">
                          <Key className="h-4 w-4" /> Chaves de API
                        </p>
                        <p className="text-muted-foreground">
                          As chaves são configuradas separadamente após criar o data source.
                          Elas são criptografadas e nunca são exibidas.
                        </p>
                      </div>
                    </div>
                    <DialogFooter>
                      <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                        Cancelar
                      </Button>
                      <Button type="submit" disabled={isSubmitting}>
                        {isSubmitting ? 'Salvando...' : (editingDataSource ? 'Salvar Alterações' : 'Criar Data Source')}
                      </Button>
                    </DialogFooter>
                  </form>
                </TabsContent>
              </Tabs>
            </DialogContent>
          </Dialog>
        }
      />

      {/* Keys Dialog */}
      <Dialog open={isKeysDialogOpen} onOpenChange={setIsKeysDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Key className="h-5 w-5" />
              Configurar Credenciais
            </DialogTitle>
            <DialogDescription>
              {selectedDataSource?.name} - As chaves serão criptografadas e nunca serão exibidas novamente.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="anonKey" className="flex items-center gap-2">
                <Unlock className="h-4 w-4" />
                Anon Key (recomendado para leitura)
              </Label>
              <Input
                id="anonKey"
                type="password"
                value={keyFormData.anonKey}
                onChange={(e) => setKeyFormData({ ...keyFormData, anonKey: e.target.value })}
                placeholder="eyJhbGciOiJIUzI1NiIs..."
              />
              {selectedDataSource?.anon_key_present && (
                <p className="text-xs text-green-600 flex items-center gap-1">
                  <CheckCircle className="h-3 w-3" /> Já configurada
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="serviceRoleKey" className="flex items-center gap-2">
                <Lock className="h-4 w-4" />
                Service Role Key (avançado)
              </Label>
              <Input
                id="serviceRoleKey"
                type="password"
                value={keyFormData.serviceRoleKey}
                onChange={(e) => setKeyFormData({ ...keyFormData, serviceRoleKey: e.target.value })}
                placeholder="eyJhbGciOiJIUzI1NiIs..."
              />
              {selectedDataSource?.service_role_key_present && (
                <p className="text-xs text-green-600 flex items-center gap-1">
                  <CheckCircle className="h-3 w-3" /> Já configurada
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                Use apenas se precisar de acesso administrativo. A anon_key é preferível.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsKeysDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={saveKeys} disabled={isSavingKeys}>
              {isSavingKeys ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Salvando...
                </>
              ) : (
                'Salvar Credenciais'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar data sources..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={filterTenant} onValueChange={setFilterTenant}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Filtrar por tenant" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os Tenants</SelectItem>
            {tenants.map((t) => (
              <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {filteredDataSources.length === 0 ? (
        <EmptyState
          icon={<Database className="h-6 w-6 text-muted-foreground" />}
          title={searchQuery || filterTenant !== 'all' ? 'Nenhum data source encontrado' : 'Nenhum data source'}
          description={searchQuery || filterTenant !== 'all' ? 'Tente ajustar os filtros.' : 'Crie seu primeiro data source para começar.'}
          action={!searchQuery && filterTenant === 'all' && (
            <Button onClick={openCreateDialog}>
              <Plus className="mr-2 h-4 w-4" />
              Adicionar Data Source
            </Button>
          )}
        />
      ) : (
        <div className="rounded-lg border bg-card overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Tenant</TableHead>
                <TableHead>Endpoint</TableHead>
                <TableHead>Views</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Teste</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredDataSources.map((ds) => (
                <TableRow key={ds.id}>
                  <TableCell>
                    <p className="font-medium">{ds.name}</p>
                  </TableCell>
                  <TableCell>
                    <Badge variant={ds.type === 'proxy_webhook' ? 'default' : ds.type === 'google_sheets' ? 'outline' : 'secondary'} className="text-xs">
                      {ds.type === 'proxy_webhook' ? (
                        <><Webhook className="mr-1 h-3 w-3" /> Proxy</>
                      ) : ds.type === 'google_sheets' ? (
                        <><FileSpreadsheet className="mr-1 h-3 w-3" /> Sheets</>
                      ) : (
                        <><Database className="mr-1 h-3 w-3" /> Supabase</>
                      )}
                    </Badge>
                  </TableCell>
                  <TableCell>{ds.tenants?.name || '-'}</TableCell>
                  <TableCell>
                    <code className="text-xs bg-muted px-1 py-0.5 rounded max-w-[200px] truncate block">
                      {ds.type === 'proxy_webhook' ? ds.base_url : ds.project_ref}
                    </code>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {ds.allowed_views.slice(0, 2).map((view, i) => (
                        <Badge key={i} variant="outline" className="text-xs">{view}</Badge>
                      ))}
                      {ds.allowed_views.length > 2 && (
                        <Badge variant="outline" className="text-xs">+{ds.allowed_views.length - 2}</Badge>
                      )}
                      {ds.allowed_views.length === 0 && (
                        <span className="text-xs text-muted-foreground">Nenhuma</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <StatusBadge variant={ds.is_active ? 'active' : 'inactive'}>
                      {ds.is_active ? 'Ativo' : 'Inativo'}
                    </StatusBadge>
                  </TableCell>
                  <TableCell>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => testConnection(ds)}
                      disabled={testStatus[ds.id] === 'testing'}
                    >
                      {testStatus[ds.id] === 'testing' ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : testStatus[ds.id] === 'success' ? (
                        <CheckCircle className="h-4 w-4 text-green-500" />
                      ) : testStatus[ds.id] === 'error' ? (
                        <XCircle className="h-4 w-4 text-destructive" />
                      ) : (
                        'Testar'
                      )}
                    </Button>
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {ds.type === 'supabase' && (
                          <DropdownMenuItem onClick={() => openKeysDialog(ds)}>
                            <Key className="mr-2 h-4 w-4" />
                            Configurar Credenciais
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem onClick={() => openEditDialog(ds)}>
                          <Pencil className="mr-2 h-4 w-4" />
                          Editar
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => toggleStatus(ds)}>
                          <Power className="mr-2 h-4 w-4" />
                          {ds.is_active ? 'Desativar' : 'Ativar'}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => deleteDataSource(ds)} className="text-destructive">
                          <Trash2 className="mr-2 h-4 w-4" />
                          Excluir
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

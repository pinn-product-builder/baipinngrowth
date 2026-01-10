/**
 * Hook para filtrar data sources
 */

import { useState, useEffect, useMemo } from 'react';
import type { DataSource } from '../types';

export function useDataSourceFilters(dataSources: DataSource[]) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterTenant, setFilterTenant] = useState<string>('all');

  const filteredDataSources = useMemo(() => {
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
    
    return filtered;
  }, [dataSources, searchQuery, filterTenant]);

  return {
    searchQuery,
    setSearchQuery,
    filterTenant,
    setFilterTenant,
    filteredDataSources,
  };
}


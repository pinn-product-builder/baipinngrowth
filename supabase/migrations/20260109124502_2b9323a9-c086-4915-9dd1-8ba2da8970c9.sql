-- Create table for dataset column mappings (human-in-the-loop)
CREATE TABLE public.dataset_column_mappings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  dataset_id UUID NOT NULL REFERENCES public.datasets(id) ON DELETE CASCADE,
  mapping_json JSONB NOT NULL DEFAULT '{}',
  version INTEGER NOT NULL DEFAULT 1,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create unique index for dataset + version
CREATE UNIQUE INDEX idx_dataset_column_mappings_dataset_version 
ON public.dataset_column_mappings(dataset_id, version);

-- Enable RLS
ALTER TABLE public.dataset_column_mappings ENABLE ROW LEVEL SECURITY;

-- Create policies for tenant-based access
CREATE POLICY "Users can view mappings for their tenant" 
ON public.dataset_column_mappings 
FOR SELECT 
USING (
  tenant_id IN (
    SELECT tenant_id FROM public.profiles WHERE id = auth.uid()
  )
);

CREATE POLICY "Managers and admins can create mappings" 
ON public.dataset_column_mappings 
FOR INSERT 
WITH CHECK (
  tenant_id IN (
    SELECT tenant_id FROM public.profiles WHERE id = auth.uid()
  )
  AND (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'manager'))
  )
);

CREATE POLICY "Managers and admins can update mappings" 
ON public.dataset_column_mappings 
FOR UPDATE 
USING (
  tenant_id IN (
    SELECT tenant_id FROM public.profiles WHERE id = auth.uid()
  )
  AND (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'manager'))
  )
);

CREATE POLICY "Managers and admins can delete mappings" 
ON public.dataset_column_mappings 
FOR DELETE 
USING (
  tenant_id IN (
    SELECT tenant_id FROM public.profiles WHERE id = auth.uid()
  )
  AND (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'manager'))
  )
);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_dataset_column_mappings_updated_at
BEFORE UPDATE ON public.dataset_column_mappings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
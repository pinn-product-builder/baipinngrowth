import { useCallback, useState } from 'react';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useToast } from './use-toast';

interface ExportPDFOptions {
  dashboardName: string;
  tenantName?: string;
  dateRange: { start: Date; end: Date };
  kpis?: Record<string, number>;
  elementId?: string;
}

export function useExportPDF() {
  const { toast } = useToast();
  const [isExporting, setIsExporting] = useState(false);

  const exportToPDF = useCallback(async (options: ExportPDFOptions) => {
    const { dashboardName, tenantName, dateRange, kpis, elementId } = options;
    
    setIsExporting(true);
    
    try {
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageWidth = pdf.internal.pageSize.getWidth();
      let yPosition = 20;
      
      // Header
      pdf.setFontSize(18);
      pdf.setTextColor(33, 33, 33);
      pdf.text(dashboardName, 14, yPosition);
      yPosition += 10;
      
      // Tenant name
      if (tenantName) {
        pdf.setFontSize(12);
        pdf.setTextColor(100, 100, 100);
        pdf.text(tenantName, 14, yPosition);
        yPosition += 8;
      }
      
      // Period
      pdf.setFontSize(10);
      pdf.setTextColor(100, 100, 100);
      const periodText = `Período: ${format(dateRange.start, 'dd/MM/yyyy', { locale: ptBR })} — ${format(dateRange.end, 'dd/MM/yyyy', { locale: ptBR })}`;
      pdf.text(periodText, 14, yPosition);
      yPosition += 6;
      
      // Generated date
      pdf.text(`Gerado em: ${format(new Date(), 'dd/MM/yyyy HH:mm', { locale: ptBR })}`, 14, yPosition);
      yPosition += 15;
      
      // Separator line
      pdf.setDrawColor(200, 200, 200);
      pdf.line(14, yPosition, pageWidth - 14, yPosition);
      yPosition += 10;
      
      // KPIs section
      if (kpis && Object.keys(kpis).length > 0) {
        pdf.setFontSize(14);
        pdf.setTextColor(33, 33, 33);
        pdf.text('Indicadores Principais', 14, yPosition);
        yPosition += 8;
        
        pdf.setFontSize(10);
        const kpiEntries = Object.entries(kpis).slice(0, 10);
        
        kpiEntries.forEach(([key, value]) => {
          if (value !== undefined && value !== null && isFinite(value)) {
            const label = formatKPILabel(key);
            const formattedValue = formatKPIValue(key, value);
            pdf.setTextColor(100, 100, 100);
            pdf.text(`${label}: `, 14, yPosition);
            pdf.setTextColor(33, 33, 33);
            pdf.text(formattedValue, 60, yPosition);
            yPosition += 6;
          }
        });
        
        yPosition += 10;
      }
      
      // Capture chart/table element if provided
      if (elementId) {
        const element = document.getElementById(elementId);
        if (element) {
          try {
            const canvas = await html2canvas(element, {
              scale: 2,
              useCORS: true,
              allowTaint: true,
              backgroundColor: '#ffffff',
            });
            
            const imgData = canvas.toDataURL('image/png');
            const imgWidth = pageWidth - 28;
            const imgHeight = (canvas.height * imgWidth) / canvas.width;
            
            // Check if we need a new page
            if (yPosition + imgHeight > pdf.internal.pageSize.getHeight() - 20) {
              pdf.addPage();
              yPosition = 20;
            }
            
            pdf.addImage(imgData, 'PNG', 14, yPosition, imgWidth, imgHeight);
            yPosition += imgHeight + 10;
          } catch (err) {
            console.error('Error capturing element:', err);
          }
        }
      }
      
      // Footer
      const pageCount = pdf.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        pdf.setPage(i);
        pdf.setFontSize(8);
        pdf.setTextColor(150, 150, 150);
        pdf.text(
          `Página ${i} de ${pageCount} | BAI Analytics`,
          pageWidth / 2,
          pdf.internal.pageSize.getHeight() - 10,
          { align: 'center' }
        );
      }
      
      // Save
      const filename = `${dashboardName.replace(/\s+/g, '_')}_${format(new Date(), 'yyyy-MM-dd')}.pdf`;
      pdf.save(filename);
      
      toast({ title: 'PDF exportado com sucesso!' });
    } catch (err) {
      console.error('PDF export error:', err);
      toast({ title: 'Erro ao exportar PDF', variant: 'destructive' });
    } finally {
      setIsExporting(false);
    }
  }, [toast]);

  return { exportToPDF, isExporting };
}

function formatKPILabel(key: string): string {
  const labels: Record<string, string> = {
    custo_total: 'Custo Total',
    leads_total: 'Leads Total',
    entrada_total: 'Entradas Total',
    venda_total: 'Vendas Total',
    cpl: 'CPL',
    cac: 'CAC',
    taxa_entrada: 'Taxa de Entrada',
    taxa_venda_total: 'Taxa de Venda',
    taxa_comparecimento: 'Taxa Comparecimento',
  };
  return labels[key] || key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function formatKPIValue(key: string, value: number): string {
  if (key.includes('custo') || key === 'cpl' || key === 'cac') {
    return `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  if (key.includes('taxa_')) {
    return `${(value * 100).toFixed(1)}%`;
  }
  return value.toLocaleString('pt-BR');
}

export default useExportPDF;

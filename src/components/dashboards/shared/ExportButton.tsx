import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Download, FileText, FileSpreadsheet, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';

interface ExportButtonProps {
  data: any[];
  dashboardName: string;
  containerId?: string;
  columns?: string[];
  columnLabels?: Record<string, string>;
}

export default function ExportButton({ 
  data, 
  dashboardName, 
  containerId,
  columns,
  columnLabels = {}
}: ExportButtonProps) {
  const [isExporting, setIsExporting] = useState(false);
  const { toast } = useToast();

  const exportCSV = () => {
    if (data.length === 0) {
      toast({ title: 'Sem dados', description: 'Não há dados para exportar.', variant: 'destructive' });
      return;
    }

    const headers = columns || Object.keys(data[0]);
    const csvContent = [
      headers.map(h => columnLabels[h] || h).join(','),
      ...data.map(row => headers.map(h => {
        const val = row[h];
        if (val === null || val === undefined) return '';
        return typeof val === 'string' && val.includes(',') ? `"${val}"` : val;
      }).join(','))
    ].join('\n');

    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${dashboardName}_${format(new Date(), 'yyyy-MM-dd_HHmm')}.csv`;
    link.click();
    
    toast({ title: 'Exportado!', description: 'Arquivo CSV baixado com sucesso.' });
  };

  const exportPDF = async () => {
    if (!containerId) {
      toast({ title: 'Erro', description: 'Container não especificado para PDF.', variant: 'destructive' });
      return;
    }

    setIsExporting(true);
    toast({ title: 'Gerando PDF...', description: 'Aguarde enquanto o relatório é gerado.' });

    try {
      const html2canvas = (await import('html2canvas')).default;
      const { jsPDF } = await import('jspdf');
      
      const element = document.getElementById(containerId);
      if (!element) {
        throw new Error('Container não encontrado');
      }

      // Capture the element
      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
        windowWidth: element.scrollWidth,
        windowHeight: element.scrollHeight
      });

      // Create PDF
      const imgWidth = 210; // A4 width in mm
      const pageHeight = 297; // A4 height in mm
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      let heightLeft = imgHeight;
      let position = 10;

      const pdf = new jsPDF('p', 'mm', 'a4');
      
      // Add title
      pdf.setFontSize(16);
      pdf.setTextColor(33, 37, 41);
      pdf.text(dashboardName, 10, 15);
      pdf.setFontSize(10);
      pdf.setTextColor(108, 117, 125);
      pdf.text(`Gerado em ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, 10, 22);

      position = 30;
      heightLeft = imgHeight;

      const imgData = canvas.toDataURL('image/png');
      
      // Add image with pagination
      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
      heightLeft -= (pageHeight - position);

      while (heightLeft > 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }

      pdf.save(`${dashboardName}_${format(new Date(), 'yyyy-MM-dd_HHmm')}.pdf`);
      toast({ title: 'PDF gerado!', description: 'Relatório PDF baixado com sucesso.' });
    } catch (err: any) {
      console.error('Error generating PDF:', err);
      toast({ title: 'Erro', description: 'Falha ao gerar PDF. Tente novamente.', variant: 'destructive' });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" disabled={isExporting}>
          {isExporting ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Download className="mr-2 h-4 w-4" />
          )}
          Exportar
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={exportCSV}>
          <FileSpreadsheet className="mr-2 h-4 w-4" />
          Exportar CSV
        </DropdownMenuItem>
        {containerId && (
          <DropdownMenuItem onClick={exportPDF}>
            <FileText className="mr-2 h-4 w-4" />
            Exportar PDF
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

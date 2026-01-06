import { useState, useRef, useEffect } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Card, CardContent } from '@/components/ui/card';
import { 
  Sparkles, 
  Send, 
  Loader2, 
  AlertTriangle, 
  TrendingUp, 
  TrendingDown,
  Calendar,
  MessageSquare,
  RefreshCw,
  AlertCircle,
  Lightbulb,
  Target
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface AIAnalystDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dashboardId: string;
  dashboardName: string;
  dateRange: { start: Date; end: Date };
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  meta?: {
    alerts?: any[];
    forecast?: any;
    limitations?: string[];
    highlights?: Record<string, number | null>;
  };
}

interface QuickChip {
  id: string;
  label: string;
  action: string;
}

const QUICK_CHIPS: QuickChip[] = [
  { id: 'resumo', label: 'Resumo do período', action: 'resumo' },
  { id: 'alertas', label: 'Alertas', action: 'alertas' },
  { id: 'previsao', label: 'Previsão 7 dias', action: 'previsao' },
  { id: 'piorou', label: 'O que piorou?', action: 'piorou' },
  { id: 'melhorou', label: 'O que melhorou?', action: 'melhorou' },
  { id: 'melhores_piores', label: 'Melhores/piores dias', action: 'melhores_piores' },
];

export default function AIAnalystDrawer({
  open,
  onOpenChange,
  dashboardId,
  dashboardName,
  dateRange,
}: AIAnalystDrawerProps) {
  const { toast } = useToast();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  
  // Scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);
  
  // Focus input when drawer opens
  useEffect(() => {
    if (open && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);
  
  const sendMessage = async (question?: string, quickAction?: string) => {
    const messageText = question || input.trim();
    if (!messageText && !quickAction) return;
    
    setError(null);
    setIsLoading(true);
    
    // Add user message to UI
    if (messageText) {
      const userMessage: Message = {
        id: crypto.randomUUID(),
        role: 'user',
        content: messageText,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, userMessage]);
    }
    
    setInput('');
    
    try {
      const { data, error: fnError } = await supabase.functions.invoke('ai-analyst', {
        body: {
          dashboard_id: dashboardId,
          start: format(dateRange.start, 'yyyy-MM-dd'),
          end: format(dateRange.end, 'yyyy-MM-dd'),
          question: messageText,
          quick_action: quickAction,
          conversation_id: conversationId,
        },
      });
      
      if (fnError) {
        throw new Error(fnError.message || 'Erro ao chamar AI');
      }
      
      if (data?.error) {
        throw new Error(data.error);
      }
      
      // Update conversation ID
      if (data?.conversation_id) {
        setConversationId(data.conversation_id);
      }
      
      // Add assistant response
      const assistantMessage: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: data?.answer_text || 'Não foi possível gerar resposta.',
        timestamp: new Date(),
        meta: {
          alerts: data?.alerts,
          forecast: data?.forecast,
          limitations: data?.limitations,
          highlights: data?.highlights,
        },
      };
      setMessages(prev => [...prev, assistantMessage]);
      
    } catch (err) {
      console.error('AI Analyst error:', err);
      const errorMessage = err instanceof Error ? err.message : 'Erro desconhecido';
      setError(errorMessage);
      
      if (errorMessage.includes('não habilitada') || errorMessage.includes('Limite')) {
        toast({
          title: 'Acesso restrito',
          description: errorMessage,
          variant: 'destructive',
        });
      }
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleQuickChip = (chip: QuickChip) => {
    sendMessage(undefined, chip.action);
  };
  
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };
  
  const clearConversation = () => {
    setMessages([]);
    setConversationId(null);
    setError(null);
  };
  
  const formatContent = (content: string) => {
    // Split into sections
    const lines = content.split('\n');
    const sections: { type: 'heading' | 'bullet' | 'text'; content: string }[] = [];
    
    lines.forEach(line => {
      const trimmed = line.trim();
      if (!trimmed) return;
      
      if (/^\d+\)/.test(trimmed) || /^#+/.test(trimmed) || /^\*\*[^*]+\*\*$/.test(trimmed)) {
        sections.push({ type: 'heading', content: trimmed.replace(/^\d+\)\s*/, '').replace(/^#+\s*/, '').replace(/\*\*/g, '') });
      } else if (/^[-•*]/.test(trimmed)) {
        sections.push({ type: 'bullet', content: trimmed.replace(/^[-•*]\s*/, '') });
      } else {
        sections.push({ type: 'text', content: trimmed });
      }
    });
    
    return sections;
  };
  
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg flex flex-col h-full p-0">
        <SheetHeader className="p-4 border-b">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-primary/10">
                <Sparkles className="h-5 w-5 text-primary" />
              </div>
              <div>
                <SheetTitle className="text-left">BAI AI Analyst</SheetTitle>
                <SheetDescription className="text-left text-xs">
                  {dashboardName}
                </SheetDescription>
              </div>
            </div>
            <Button 
              variant="ghost" 
              size="sm"
              onClick={clearConversation}
              disabled={messages.length === 0}
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
          
          {/* Period indicator */}
          <div className="flex items-center gap-2 mt-2">
            <Calendar className="h-3 w-3 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">
              {format(dateRange.start, 'dd/MM/yyyy', { locale: ptBR })} — {format(dateRange.end, 'dd/MM/yyyy', { locale: ptBR })}
            </span>
          </div>
        </SheetHeader>
        
        {/* Messages area */}
        <ScrollArea ref={scrollRef} className="flex-1 p-4">
          <div className="space-y-4">
            {messages.length === 0 ? (
              <div className="text-center py-8">
                <div className="inline-flex p-4 rounded-full bg-muted mb-4">
                  <MessageSquare className="h-8 w-8 text-muted-foreground" />
                </div>
                <h3 className="font-medium mb-1">Pergunte ao Analista</h3>
                <p className="text-sm text-muted-foreground mb-6">
                  Faça perguntas sobre seus dados de marketing e vendas.
                </p>
                
                {/* Quick chips */}
                <div className="flex flex-wrap justify-center gap-2">
                  {QUICK_CHIPS.map(chip => (
                    <Button
                      key={chip.id}
                      variant="outline"
                      size="sm"
                      onClick={() => handleQuickChip(chip)}
                      disabled={isLoading}
                      className="text-xs"
                    >
                      {chip.label}
                    </Button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map(message => (
                <div
                  key={message.id}
                  className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[85%] rounded-lg p-3 ${
                      message.role === 'user'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted'
                    }`}
                  >
                    {message.role === 'assistant' ? (
                      <div className="space-y-2">
                        {formatContent(message.content).map((section, i) => (
                          <div key={i}>
                            {section.type === 'heading' && (
                              <p className="font-medium text-sm mt-2 first:mt-0">{section.content}</p>
                            )}
                            {section.type === 'bullet' && (
                              <p className="text-sm pl-3 relative before:content-['•'] before:absolute before:left-0">
                                {section.content}
                              </p>
                            )}
                            {section.type === 'text' && (
                              <p className="text-sm">{section.content}</p>
                            )}
                          </div>
                        ))}
                        
                        {/* Alerts section */}
                        {message.meta?.alerts && message.meta.alerts.length > 0 && (
                          <div className="mt-3 pt-3 border-t border-border/50">
                            <div className="flex items-center gap-1 mb-2">
                              <AlertTriangle className="h-3 w-3 text-warning" />
                              <span className="text-xs font-medium">Alertas detectados</span>
                            </div>
                            <div className="space-y-1">
                              {message.meta.alerts.slice(0, 3).map((alert: any, i: number) => (
                                <Badge 
                                  key={i} 
                                  variant={alert.severity === 'high' ? 'destructive' : 'secondary'}
                                  className="text-xs mr-1"
                                >
                                  {alert.type.replace(/_/g, ' ')}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}
                        
                        {/* Limitations */}
                        {message.meta?.limitations && message.meta.limitations.length > 0 && (
                          <div className="mt-2 p-2 rounded bg-muted/50 text-xs text-muted-foreground">
                            <span className="font-medium">Limitações:</span> {message.meta.limitations[0]}
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className="text-sm">{message.content}</p>
                    )}
                    
                    <span className="text-[10px] opacity-60 mt-1 block">
                      {format(message.timestamp, 'HH:mm')}
                    </span>
                  </div>
                </div>
              ))
            )}
            
            {/* Loading state */}
            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-muted rounded-lg p-3 flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm">Analisando dados...</span>
                </div>
              </div>
            )}
            
            {/* Error state */}
            {error && (
              <div className="flex justify-center">
                <Card className="border-destructive/50 bg-destructive/5">
                  <CardContent className="p-3 flex items-center gap-2 text-destructive text-sm">
                    <AlertCircle className="h-4 w-4 flex-shrink-0" />
                    {error}
                  </CardContent>
                </Card>
              </div>
            )}
          </div>
        </ScrollArea>
        
        {/* Quick chips (when conversation exists) */}
        {messages.length > 0 && (
          <div className="px-4 py-2 border-t">
            <ScrollArea className="w-full">
              <div className="flex gap-2">
                {QUICK_CHIPS.map(chip => (
                  <Button
                    key={chip.id}
                    variant="ghost"
                    size="sm"
                    onClick={() => handleQuickChip(chip)}
                    disabled={isLoading}
                    className="text-xs flex-shrink-0"
                  >
                    {chip.label}
                  </Button>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}
        
        {/* Input area */}
        <div className="p-4 border-t">
          <div className="flex gap-2">
            <Input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Faça uma pergunta sobre seus dados..."
              disabled={isLoading}
              className="flex-1"
            />
            <Button 
              onClick={() => sendMessage()} 
              disabled={isLoading || !input.trim()}
              size="icon"
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

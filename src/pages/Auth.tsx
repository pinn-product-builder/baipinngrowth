import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Eye, EyeOff, ArrowLeft, Loader2, Zap } from 'lucide-react';
import { z } from 'zod';

const loginSchema = z.object({
  email: z.string().email('Endereço de email inválido'),
  password: z.string().min(6, 'A senha deve ter pelo menos 6 caracteres'),
});

type AuthMode = 'login' | 'forgot';

export default function Auth() {
  const [searchParams] = useSearchParams();
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCheckingAdmin, setIsCheckingAdmin] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { user, signIn, resetPassword } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    checkAdminExists();
  }, []);

  useEffect(() => {
    const redirectAfterLogin = async () => {
      if (user) {
        const { data: profileData } = await supabase
          .from('profiles')
          .select('tenant_id')
          .eq('id', user.id)
          .maybeSingle();

        if (profileData?.tenant_id === '22222222-2222-2222-2222-222222222222') {
          navigate('/dashboards/16c74d98-22a5-4779-9bf0-f4711fe91528');
        } else {
          navigate('/dashboards');
        }
      }
    };
    
    redirectAfterLogin();
  }, [user, navigate]);

  useEffect(() => {
    const urlMode = searchParams.get('mode');
    if (urlMode === 'forgot' || urlMode === 'reset') setMode('forgot');
  }, [searchParams]);

  const checkAdminExists = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('check-admin-exists');
      if (error) throw error;
      if (!data?.hasAdmin) {
        navigate('/setup');
        return;
      }
    } catch (error) {
      console.error('Erro ao verificar admin:', error);
    } finally {
      setIsCheckingAdmin(false);
    }
  };

  const validateForm = () => {
    setErrors({});
    try {
      if (mode === 'login') {
        loginSchema.parse({ email, password });
      } else {
        z.string().email().parse(email);
      }
      return true;
    } catch (err) {
      if (err instanceof z.ZodError) {
        const fieldErrors: Record<string, string> = {};
        err.errors.forEach(e => {
          if (e.path[0]) fieldErrors[e.path[0] as string] = e.message;
        });
        setErrors(fieldErrors);
      }
      return false;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    setIsSubmitting(true);

    try {
      if (mode === 'login') {
        const { error } = await signIn(email, password);
        if (error) {
          if (error.message.includes('Invalid login credentials')) {
            toast({ title: 'Falha no login', description: 'Email ou senha inválidos.', variant: 'destructive' });
          } else {
            toast({ title: 'Falha no login', description: error.message, variant: 'destructive' });
          }
        }
      } else {
        const { error } = await resetPassword(email);
        if (error) {
          toast({ title: 'Falha na recuperação', description: error.message, variant: 'destructive' });
        } else {
          toast({ title: 'Verifique seu email', description: 'Instruções de recuperação de senha foram enviadas.' });
          setMode('login');
        }
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isCheckingAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <div className="h-12 w-12 rounded-xl bg-gradient-orange flex items-center justify-center glow-orange animate-pulse">
              <Zap className="h-6 w-6 text-white" />
            </div>
          </div>
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 relative overflow-hidden">
      {/* Background Effects */}
      <div className="absolute inset-0 bg-background" />
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl" />
      
      <div className="w-full max-w-md animate-fade-in relative z-10">
        {/* Logo Pinn */}
        <div className="mb-10 flex flex-col items-center">
          <div className="relative mb-4">
            <div className="h-16 w-16 rounded-2xl bg-gradient-orange flex items-center justify-center glow-orange">
              <Zap className="h-8 w-8 text-white" />
            </div>
            <div className="absolute -inset-1 bg-gradient-orange rounded-2xl blur-xl opacity-30" />
          </div>
          <h1 className="text-3xl font-bold text-gradient-orange">PINN</h1>
          <p className="text-sm text-muted-foreground uppercase tracking-widest mt-1">Analytics Platform</p>
        </div>

        {/* Card Login */}
        <div className="glass-strong rounded-2xl border border-border/50 p-8 shadow-glass">
          <div className="mb-6 text-center">
            <h2 className="text-2xl font-semibold text-foreground">
              {mode === 'login' ? 'Bem-vindo de volta' : 'Recuperar senha'}
            </h2>
            <p className="text-sm text-muted-foreground mt-2">
              {mode === 'login' 
                ? 'Entre com suas credenciais para acessar' 
                : 'Digite seu email para receber as instruções'}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-medium text-foreground">
                Email
              </Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seu@email.com"
                disabled={isSubmitting}
                className="h-12 bg-muted/50 border-border/50 focus:border-primary focus:ring-primary/20 rounded-xl"
              />
              {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
            </div>

            {mode === 'login' && (
              <div className="space-y-2">
                <Label htmlFor="password" className="text-sm font-medium text-foreground">
                  Senha
                </Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    disabled={isSubmitting}
                    className="h-12 bg-muted/50 border-border/50 focus:border-primary focus:ring-primary/20 rounded-xl pr-12"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
                {errors.password && <p className="text-xs text-destructive">{errors.password}</p>}
              </div>
            )}

            {mode === 'login' && (
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => setMode('forgot')}
                  className="text-sm text-primary hover:text-primary/80 transition-colors"
                >
                  Esqueceu a senha?
                </button>
              </div>
            )}

            <Button 
              type="submit" 
              className="w-full h-12 rounded-xl bg-gradient-orange hover:opacity-90 text-white font-semibold text-base transition-all glow-orange-subtle"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                mode === 'login' ? 'Entrar' : 'Enviar link de recuperação'
              )}
            </Button>
          </form>

          <div className="mt-6 text-center">
            {mode === 'login' ? (
              <p className="text-sm text-muted-foreground">
                Acesso por convite apenas. Contate seu administrador.
              </p>
            ) : (
              <button 
                onClick={() => setMode('login')} 
                className="inline-flex items-center gap-2 text-sm text-primary hover:text-primary/80 transition-colors"
              >
                <ArrowLeft className="h-4 w-4" /> Voltar ao login
              </button>
            )}
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-muted-foreground mt-8">
          Powered by <span className="text-primary font-medium">Pinn</span>
        </p>
      </div>
    </div>
  );
}

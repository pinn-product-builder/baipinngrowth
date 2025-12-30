import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { BarChart3, Eye, EyeOff, ArrowLeft, Loader2 } from 'lucide-react';
import { z } from 'zod';

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
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
    if (user) {
      navigate('/dashboards');
    }
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
        // No admin exists, redirect to setup
        navigate('/setup');
        return;
      }
    } catch (error) {
      console.error('Error checking admin:', error);
      // Continue to login on error
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
            toast({ title: 'Login failed', description: 'Invalid email or password.', variant: 'destructive' });
          } else {
            toast({ title: 'Login failed', description: error.message, variant: 'destructive' });
          }
        } else {
          navigate('/dashboards');
        }
      } else {
        const { error } = await resetPassword(email);
        if (error) {
          toast({ title: 'Reset failed', description: error.message, variant: 'destructive' });
        } else {
          toast({ title: 'Check your email', description: 'Password reset instructions have been sent.' });
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
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md animate-fade-in">
        {/* Logo */}
        <div className="mb-8 flex justify-center">
          <div className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary">
              <BarChart3 className="h-6 w-6 text-primary-foreground" />
            </div>
            <span className="text-xl font-semibold">BAI Analytics</span>
          </div>
        </div>

        <Card className="border-border/50 shadow-lg">
          <CardHeader className="space-y-1">
            <CardTitle className="text-2xl">
              {mode === 'login' && 'Sign in'}
              {mode === 'forgot' && 'Reset password'}
            </CardTitle>
            <CardDescription>
              {mode === 'login' && 'Enter your credentials to access your dashboards'}
              {mode === 'forgot' && 'Enter your email to receive reset instructions'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  disabled={isSubmitting}
                />
                {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
              </div>

              {mode === 'login' && (
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter your password"
                      disabled={isSubmitting}
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
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
                    className="text-sm text-primary hover:underline"
                  >
                    Forgot password?
                  </button>
                </div>
              )}

              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? 'Please wait...' : (
                  mode === 'login' ? 'Sign in' : 'Send reset link'
                )}
              </Button>
            </form>

            <div className="mt-6 text-center text-sm">
              {mode === 'login' && (
                <p className="text-muted-foreground">
                  Access is by invitation only. Contact your administrator.
                </p>
              )}
              {mode === 'forgot' && (
                <button 
                  onClick={() => setMode('login')} 
                  className="inline-flex items-center gap-1 text-primary hover:underline"
                >
                  <ArrowLeft className="h-3 w-3" /> Back to login
                </button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

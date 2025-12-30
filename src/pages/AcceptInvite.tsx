import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { LoadingPage } from '@/components/ui/loading-spinner';
import { BarChart3, Eye, EyeOff, AlertCircle, CheckCircle2 } from 'lucide-react';

interface InviteDetails {
  email: string;
  role: string;
  tenantName: string | null;
}

export default function AcceptInvite() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inviteDetails, setInviteDetails] = useState<InviteDetails | null>(null);
  
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const token = searchParams.get('token');

  useEffect(() => {
    if (!token) {
      setError('Invalid invitation link');
      setIsLoading(false);
      return;
    }
    verifyToken();
  }, [token]);

  const verifyToken = async () => {
    try {
      const { data, error: fnError } = await supabase.functions.invoke('verify-invite', {
        body: { token }
      });

      if (fnError) throw fnError;

      if (!data.valid) {
        setError(data.error || 'Invalid invitation');
        return;
      }

      setInviteDetails({
        email: data.email,
        role: data.role,
        tenantName: data.tenantName
      });
    } catch (err: any) {
      console.error('Verify error:', err);
      setError('Failed to verify invitation. It may be invalid or expired.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (password.length < 8) {
      toast({ title: 'Password too short', description: 'Password must be at least 8 characters.', variant: 'destructive' });
      return;
    }

    if (password !== confirmPassword) {
      toast({ title: 'Passwords do not match', description: 'Please make sure your passwords match.', variant: 'destructive' });
      return;
    }

    setIsSubmitting(true);

    try {
      const { data, error: fnError } = await supabase.functions.invoke('accept-invite', {
        body: { token, password, fullName: fullName.trim() || undefined }
      });

      if (fnError) throw fnError;

      if (data.error) {
        toast({ title: 'Error', description: data.error, variant: 'destructive' });
        return;
      }

      setIsSuccess(true);
      toast({ title: 'Account created!', description: 'You can now log in with your credentials.' });
      
      // Redirect to login after 2 seconds
      setTimeout(() => {
        navigate('/auth');
      }, 2000);
    } catch (err: any) {
      console.error('Accept error:', err);
      toast({ title: 'Error', description: err.message || 'Failed to create account.', variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return <LoadingPage message="Verifying invitation..." />;
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
              <AlertCircle className="h-6 w-6 text-destructive" />
            </div>
            <CardTitle>Invalid Invitation</CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button className="w-full" onClick={() => navigate('/auth')}>
              Go to Login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isSuccess) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <CheckCircle2 className="h-6 w-6 text-primary" />
            </div>
            <CardTitle>Account Created!</CardTitle>
            <CardDescription>Redirecting you to the login page...</CardDescription>
          </CardHeader>
        </Card>
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
            <CardTitle className="text-2xl">Accept Invitation</CardTitle>
            <CardDescription>
              {inviteDetails?.tenantName 
                ? `Join ${inviteDetails.tenantName} as ${inviteDetails.role}`
                : `Create your ${inviteDetails?.role} account`
              }
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={inviteDetails?.email || ''}
                  disabled
                  className="bg-muted"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="fullName">Full Name</Label>
                <Input
                  id="fullName"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Your full name"
                  disabled={isSubmitting}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Minimum 8 characters"
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
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm Password</Label>
                <Input
                  id="confirmPassword"
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repeat your password"
                  disabled={isSubmitting}
                />
              </div>

              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? 'Creating account...' : 'Create Account'}
              </Button>
            </form>

            <div className="mt-6 text-center text-sm text-muted-foreground">
              Already have an account?{' '}
              <button onClick={() => navigate('/auth')} className="text-primary hover:underline">
                Sign in
              </button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

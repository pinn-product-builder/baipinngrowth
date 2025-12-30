import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LoadingPage } from '@/components/ui/loading-spinner';
import { useToast } from '@/hooks/use-toast';
import { AlertCircle, CheckCircle, BarChart3 } from 'lucide-react';

interface Invite {
  id: string;
  email: string;
  tenant_id: string | null;
  role: string;
  expires_at: string;
  accepted: boolean;
}

export default function AcceptInvite() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [invite, setInvite] = useState<Invite | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isComplete, setIsComplete] = useState(false);

  useEffect(() => {
    validateInvite();
  }, [token]);

  const validateInvite = async () => {
    try {
      const { data, error } = await supabase
        .from('user_invites')
        .select('*')
        .eq('token', token)
        .maybeSingle();

      if (error) throw error;
      
      if (!data) {
        setError('Invalid invite link. The link may have been used or does not exist.');
        return;
      }

      if (data.accepted) {
        setError('This invite has already been used. Please sign in with your credentials.');
        return;
      }

      if (new Date(data.expires_at) < new Date()) {
        setError('This invite has expired. Please contact your administrator for a new invite.');
        return;
      }

      setInvite(data);
    } catch (err) {
      console.error('Error validating invite:', err);
      setError('Could not validate invite. Please try again later.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (password.length < 6) {
      toast({ title: 'Password too short', description: 'Password must be at least 6 characters.', variant: 'destructive' });
      return;
    }

    if (password !== confirmPassword) {
      toast({ title: 'Passwords do not match', description: 'Please make sure both passwords are the same.', variant: 'destructive' });
      return;
    }

    if (!invite) return;

    setIsSubmitting(true);
    try {
      // Create user account
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: invite.email,
        password,
        options: {
          data: { full_name: fullName }
        }
      });

      if (authError) throw authError;
      if (!authData.user) throw new Error('User creation failed');

      const userId = authData.user.id;

      // Update profile with tenant_id, name, and mark as active
      const { error: profileError } = await supabase
        .from('profiles')
        .update({ 
          tenant_id: invite.tenant_id, 
          full_name: fullName,
          password_changed: true,
          status: 'active'
        })
        .eq('id', userId);

      if (profileError) throw profileError;

      // Add role - cast to proper type for insert
      const { error: roleError } = await supabase
        .from('user_roles')
        .insert({ user_id: userId, role: invite.role as 'admin' | 'manager' | 'viewer' });

      if (roleError) throw roleError;

      // Mark invite as accepted
      await supabase
        .from('user_invites')
        .update({ accepted: true })
        .eq('id', invite.id);

      setIsComplete(true);
      
      // Auto sign-in after a short delay
      setTimeout(() => {
        navigate('/auth');
      }, 3000);

    } catch (error: any) {
      console.error('Error accepting invite:', error);
      if (error.message?.includes('already registered')) {
        toast({ title: 'Email exists', description: 'This email is already registered. Please sign in.', variant: 'destructive' });
      } else {
        toast({ title: 'Error', description: error.message || 'Could not complete registration.', variant: 'destructive' });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return <LoadingPage message="Validating invite..." />;
  }

  if (isComplete) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-success/10">
              <CheckCircle className="h-6 w-6 text-success" />
            </div>
            <CardTitle>Account Created!</CardTitle>
            <CardDescription>
              Your account has been set up successfully. Redirecting to sign in...
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
              <AlertCircle className="h-6 w-6 text-destructive" />
            </div>
            <CardTitle>Invalid Invite</CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button className="w-full" onClick={() => navigate('/auth')}>
              Go to Sign In
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-primary">
            <BarChart3 className="h-6 w-6 text-primary-foreground" />
          </div>
          <CardTitle>Accept Invite</CardTitle>
          <CardDescription>
            Set up your account for {invite?.email}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={invite?.email || ''}
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
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Minimum 6 characters"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm Password</Label>
              <Input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm your password"
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? 'Creating Account...' : 'Create Account'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

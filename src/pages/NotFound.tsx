import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Home } from 'lucide-react';

const NotFound = () => {
  const navigate = useNavigate();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
      <div className="text-center animate-fade-in">
        <h1 className="text-6xl font-bold text-primary">404</h1>
        <h2 className="mt-4 text-2xl font-semibold">Página Não Encontrada</h2>
        <p className="mt-2 text-muted-foreground">
          A página que você está procurando não existe.
        </p>
        <Button className="mt-6" onClick={() => navigate('/')}>
          <Home className="mr-2 h-4 w-4" />
          Ir para Início
        </Button>
      </div>
    </div>
  );
};

export default NotFound;
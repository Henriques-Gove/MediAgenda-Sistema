import 'express-session';

declare module 'express-session' {
  interface SessionData {
    utilizador?: {
      id: string;
      nome: string;
      email: string;
      perfil: string;
      passwordChangedAt?: string;
      twoFactorEnabled?: boolean;
    };
    pending2fa?: {
      id: string;
      nome: string;
      email: string;
      perfil: string;
      passwordChangedAt?: string;
      next?: string;
    };
    twoFactorSecretTemp?: string;
    csrfToken?: string;
    flash?: {
      tipo: 'success' | 'danger' | 'warning' | 'info';
      mensagem: string;
    };
    erros?: Record<string, string>;
    valores?: Record<string, string>;
  }
}

import type { UsuarioSesion } from '../services/auth.js';

declare global {
  namespace Express {
    interface Locals {
      /** Lo completa el middleware requireSession cuando la sesión es válida y el perfil está activo. */
      usuario?: UsuarioSesion;
    }
  }
}

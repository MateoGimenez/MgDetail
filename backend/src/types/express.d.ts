import type { AuthenticatedAdmin } from '../services/auth.js';

declare global {
  namespace Express {
    interface Locals {
      /** Lo completa el middleware requireAdmin cuando la sesión es válida. */
      admin?: AuthenticatedAdmin;
    }
  }
}

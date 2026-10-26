import js from '@eslint/js';
import globals from 'globals';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';
import { defineConfig, globalIgnores } from 'eslint/config';

// ESLint 9 a propósito: eslint-plugin-jsx-a11y (6.10) todavía no soporta ESLint 10.
// Cuando publique soporte, se puede subir eslint y @eslint/js a la 10.

export default defineConfig([
  globalIgnores(['dist', 'node_modules', '.capturas', '.impeccable']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommendedTypeChecked,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
      jsxA11y.flatConfigs.recommended,
    ],
    languageOptions: {
      ecmaVersion: 2023,
      globals: globals.browser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // role="list" es a propósito: Safari/VoiceOver quita la semántica de lista con list-style: none.
      'jsx-a11y/no-redundant-roles': ['error', { ul: ['list'], ol: ['list'] }],
    },
  },
  {
    // Toda salida a la red pasa por src/api/client.ts.
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/api/**'],
    rules: {
      'no-restricted-globals': [
        'error',
        { name: 'fetch', message: 'Usá request() de src/api/client.ts: es el único que habla con la red.' },
      ],
    },
  },
  {
    files: ['vite.config.ts'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['**/*.js'],
    extends: [js.configs.recommended],
    languageOptions: { globals: globals.node },
  },
  {
    // Service worker del panel: corre en el navegador, en un worker.
    files: ['public/admin/sw.js'],
    languageOptions: { globals: globals.serviceworker },
  },
]);

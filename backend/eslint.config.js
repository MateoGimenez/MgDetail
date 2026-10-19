// @ts-check
import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import tseslint from 'typescript-eslint';

// Selector común: por donde entra SQL a node-postgres y PGlite.
//  - `.prepare(...)` (en cualquier objeto),
//  - `.exec(...)` cuando el receptor se llama db / database / pg (db.exec, this.db.exec). Un `regex.exec()` no es SQL.
//  - `.query(...)` cuando el receptor se llama sql / client / pool / pg / db (this.sql.query, pool.query).
const SQL_CALL =
  'CallExpression:matches(' +
  '[callee.property.name="prepare"], ' +
  '[callee.property.name="exec"][callee.object.name=/^(db|database|pg)$/], ' +
  '[callee.property.name="exec"][callee.object.property.name=/^(db|database|pg)$/], ' +
  '[callee.property.name="query"][callee.object.name=/^(sql|client|pool|pg|db)$/], ' +
  '[callee.property.name="query"][callee.object.property.name=/^(sql|client|pool|pg|db)$/])';

export default defineConfig(
  globalIgnores(['dist/', 'coverage/', 'node_modules/', 'storage/']),

  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,

  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Regla de seguridad: el SQL es siempre un literal; los valores van como parámetros ($1, $2...).
      // Prohíbe interpolar (`${x}`), concatenar (+) o pasar variables a prepare()/exec().
      'no-restricted-syntax': [
        'error',
        {
          selector: `${SQL_CALL} > TemplateLiteral[expressions.length>0]`,
          message: 'No interpoles valores en SQL: usá parámetros ($1, $2...).',
        },
        {
          selector: `${SQL_CALL} > BinaryExpression`,
          message: 'No concatenes SQL: usá un literal y parámetros ($1, $2...).',
        },
        {
          selector: `${SQL_CALL}[arguments.0.type!=/^(Literal|TemplateLiteral)$/]`,
          message: 'El SQL de prepare()/exec()/query() tiene que ser un literal, nunca una variable.',
        },
      ],
      // Arquitectura: el driver de la base queda encapsulado. El resto del código (rutas, servicios, middlewares,
      // dominio) trabaja contra las interfaces async de domain/ (ver el override de más abajo para dónde sí se permite).
      // node:sqlite está prohibido en todo el proyecto: Postgres es el único motor.
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'node:sqlite',
              message: 'SQLite se retiró: Postgres (Supabase) es el único motor. En los tests se usa PGlite.',
            },
            {
              name: 'pg',
              message: 'node-postgres solo se usa en db/. El resto trabaja contra las interfaces de domain/.',
            },
            {
              name: '@electric-sql/pglite',
              message: 'PGlite es solo para los tests.',
            },
          ],
        },
      ],
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      // `import type { X }` cuando TODOS los nombres son tipos. Con verbatimModuleSyntax, `import { type X }`
      // se emite como `import {} from '...'` (un import con efectos secundarios que no hace falta).
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-import-type-side-effects': 'error',
    },
  },

  {
    // Las capas que SÍ pueden conocer el driver (los tests arman bases Postgres en memoria con PGlite).
    // node:sqlite sigue prohibido también acá.
    files: ['src/db/**/*.ts', 'src/repositories/**/*.ts', 'src/app.ts', 'src/index.ts', 'src/scripts/**/*.ts', 'test/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        { paths: [{ name: 'node:sqlite', message: 'SQLite se retiró: Postgres (Supabase) es el único motor.' }] },
      ],
    },
  },

  {
    // En los tests, `response.body` de supertest es `any` por diseño: las aserciones lo validan en runtime.
    // Las reglas no-unsafe-* siguen activas en todo src/.
    files: ['test/**/*.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
    },
  },

  {
    // Archivos de configuración en JS: sin reglas que necesiten información de tipos.
    files: ['**/*.{js,mjs,cjs}'],
    extends: [tseslint.configs.disableTypeChecked],
  },
);

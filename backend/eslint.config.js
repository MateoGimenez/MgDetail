// @ts-check
import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import tseslint from 'typescript-eslint';

// Selector común: por donde entra SQL a node:sqlite.
//  - `.prepare(...)` (en cualquier objeto), y
//  - `.exec(...)` cuando el receptor se llama db / database (db.exec, this.db.exec). Un `regex.exec()` no es SQL.
const SQL_CALL =
  'CallExpression:matches(' +
  '[callee.property.name="prepare"], ' +
  '[callee.property.name="exec"][callee.object.name=/^(db|database)$/], ' +
  '[callee.property.name="exec"][callee.object.property.name=/^(db|database)$/])';

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
      // Regla de seguridad: el SQL es siempre un literal; los valores van como parámetros (?).
      // Prohíbe interpolar (`${x}`), concatenar (+) o pasar variables a prepare()/exec().
      'no-restricted-syntax': [
        'error',
        {
          selector: `${SQL_CALL} > TemplateLiteral[expressions.length>0]`,
          message: 'No interpoles valores en SQL: usá parámetros (?) en la consulta.',
        },
        {
          selector: `${SQL_CALL} > BinaryExpression`,
          message: 'No concatenes SQL: usá un literal y parámetros (?).',
        },
        {
          selector: `${SQL_CALL}[arguments.0.type!=/^(Literal|TemplateLiteral)$/]`,
          message: 'El SQL de prepare()/exec() tiene que ser un literal, nunca una variable.',
        },
      ],
      // Arquitectura: SQLite queda encapsulado. El resto del código (rutas, servicios, middlewares, dominio)
      // trabaja contra las interfaces async de domain/ (ver el override de más abajo para dónde sí se permite).
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'node:sqlite',
              message:
                'SQLite solo se usa en db/, repositories/, app.ts, index.ts y scripts/. El resto trabaja contra las interfaces de domain/.',
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
    // Los puntos de entrada y las capas que SÍ pueden conocer SQLite (los tests prueban la capa de datos y
    // arman bases en memoria).
    files: ['src/db/**/*.ts', 'src/repositories/**/*.ts', 'src/app.ts', 'src/index.ts', 'src/scripts/**/*.ts', 'test/**/*.ts'],
    rules: { 'no-restricted-imports': 'off' },
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
    // Los repositorios SQLite implementan interfaces async (domain/) con node:sqlite, que es síncrono: sus métodos
    // son `async` sin `await` a propósito, para que un error síncrono salga como promesa rechazada. En el resto
    // del código la regla sigue activa.
    files: ['src/repositories/**/*.ts'],
    rules: { '@typescript-eslint/require-await': 'off' },
  },

  {
    // Archivos de configuración en JS: sin reglas que necesiten información de tipos.
    files: ['**/*.{js,mjs,cjs}'],
    extends: [tseslint.configs.disableTypeChecked],
  },
);

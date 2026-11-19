// Revisión del código con ESLint (npm run lint).
import js from '@eslint/js';
import globals from 'globals';

const compartidos = { ico: 'readonly', llenarIconos: 'readonly', UI: 'readonly', nube: 'readonly', Push: 'readonly', XLSX: 'readonly', Codigos: 'readonly', DEMO: 'readonly', DatosDemo: 'readonly' };
const reglas = {
  'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none', varsIgnorePattern: '^_' }],
  'no-empty': ['error', { allowEmptyCatch: true }],
  'no-control-regex': 'off',
  'no-misleading-character-class': 'off'
};

export default [
  { ignores: ['node_modules/**', 'lib/**', 'capturas/**', 'pruebas/firebase-*.js'] },
  js.configs.recommended,
  {
    files: ['*.js'],
    ignores: ['eslint.config.js'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'script', globals: { ...globals.browser, ...compartidos } },
    rules: reglas
  },
  {
    files: ['sw.js'],
    languageOptions: { globals: { ...globals.serviceworker } }
  },
  {
    files: ['avisos/**/*.js'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'module', globals: { ...globals.serviceworker } },
    rules: reglas
  },
  {
    files: ['pruebas/**/*.mjs', 'eslint.config.js'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'module', globals: { ...globals.node, ...globals.browser, axe: 'readonly' } },
    rules: { ...reglas, 'no-unused-vars': 'off' }
  }
];

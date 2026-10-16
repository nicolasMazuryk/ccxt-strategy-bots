import js from '@eslint/js'
import globals from 'globals'

export default [
    js.configs.recommended,
    {
        languageOptions: {
            ecmaVersion: 2023,
            sourceType: 'module',
            globals: { ...globals.node },
        },
        rules: {
            'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
        },
    },
    {
        // Experimental emulator/scratch code with known leftovers; surfaced as warnings, not errors.
        files: ['src/exchanges/emulator-*.js', 'src/volume-traded/**/*.js'],
        rules: {
            'no-undef': 'warn',
            'no-unreachable': 'warn',
            'no-constant-binary-expression': 'warn',
        },
    },
]

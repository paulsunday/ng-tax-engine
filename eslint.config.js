const tsParser = require("@typescript-eslint/parser");
const tsPlugin = require("@typescript-eslint/eslint-plugin");

// Deliberately lean: this codebase has no lint history, so the CI gate starts with rules
// that catch real bugs (no-unused-vars via TS's own noUnusedLocals is already off project-
// wide by convention — see tsconfig.json) without relitigating every existing style choice.
module.exports = [
  {
    ignores: ["dist/**", "node_modules/**", "coverage/**"],
  },
  {
    files: ["**/*.ts"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2021,
        sourceType: "module",
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
    },
    rules: {
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "no-undef": "off", // TS's own checker already covers this, more accurately
      "no-var": "error",
      "prefer-const": "error",
      eqeqeq: ["error", "smart"],
      "no-fallthrough": "error",
      "no-dupe-keys": "error",
      "no-unreachable": "error",
    },
  },
];

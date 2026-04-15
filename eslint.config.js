import globals from "globals";
import pluginJs from "@eslint/js";
import tseslint from "typescript-eslint";

export default [
  {
    files: ["**/*.{js,mjs,cjs,ts,jsx,tsx}"],
  },
  {
    languageOptions: { globals: globals.browser },
  },
  pluginJs.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.commonjs,
      },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { vars: "local", args: "after-used", varsIgnorePattern: "(^_|Ref$)", argsIgnorePattern: "^_" },
      ],
      "comma-dangle": ["error", "always-multiline"],
      "no-process-env": "off",
      quotes: ["error", "double", { avoidEscape: true }],
      semi: ["error", "always"],
      "no-unused-vars": "off", // handled by @typescript-eslint/no-unused-vars
      // Lightning TV refs: `let x: ElementNode | undefined;` are assigned via JSX ref={x},
      // ESLint static analysis doesn't see that. Disable rule.
      "no-unassigned-vars": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "func-call-spacing": ["error", "never"],
    },
  },
];

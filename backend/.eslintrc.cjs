module.exports = {
  root: true,
  env: { node: true, es2022: true },
  parser: "@typescript-eslint/parser",
  parserOptions: { ecmaVersion: 2022, sourceType: "module" },
  plugins: ["@typescript-eslint"],
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
  ],
  ignorePatterns: ["dist/", "node_modules/", "coverage/", "*.cjs"],
  rules: {
    // Route handlers legitimately shape loose JSON; surfaced as a warning
    // rather than an error so `any` creep stays visible without blocking CI.
    "@typescript-eslint/no-explicit-any": "warn",
    "@typescript-eslint/no-unused-vars": [
      "error",
      { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
    ],
    // console is being replaced by pino in a later PR; warn meanwhile.
    "no-console": "warn",
    eqeqeq: ["error", "smart"],
  },
  overrides: [
    {
      // Seed and other CLI scripts print progress for a human operator;
      // console is the right output there, not the application logger.
      files: ["prisma/**/*.ts"],
      rules: { "no-console": "off" },
    },
    {
      files: ["src/__tests__/**/*.ts"],
      env: { node: true },
      rules: { "@typescript-eslint/no-explicit-any": "off" },
    },
  ],
};

import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";

const config = [
  {
    ignores: [".next/**", "data/**", "node_modules/**", "scripts/**"],
  },
  ...nextCoreWebVitals,
  ...nextTypeScript,
];

export default config;

import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          blue: "#0B62A4",
          success: "#28A745",
          attention: "#FF7A00",
          danger: "#D64545",
          ink: "#172033",
          muted: "#9AA3B2",
          surface: "#F5F7FA"
        }
      },
      boxShadow: {
        panel: "0 24px 60px rgba(11, 36, 61, 0.08)"
      },
      borderRadius: {
        xl2: "1.5rem"
      }
    }
  },
  plugins: []
};

export default config;

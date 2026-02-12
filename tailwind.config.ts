import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}",
  ],
  theme: {
    extend: {
      colors: {
        // TechPulse 브랜드 컬러 시스템
        brand: {
          primary: "#2563EB", // 메인 블루
          secondary: "#7C3AED", // 세컨더리 퍼플
          accent: "#10B981", // 액센트 그린
          text: "#0F172A",
          "text-secondary": "#475569",
          bg: "#FFFFFF",
          "bg-secondary": "#F8FAFC",
          border: "#E2E8F0",
        },
        // 점수 색상 시스템
        score: {
          excellent: "#10B981", // 90+ 초록
          great: "#3B82F6",     // 80-89 파랑
          good: "#F59E0B",      // 70-79 오렌지
          fair: "#EF4444",      // 60-69 빨강
          poor: "#DC2626",      // 60- 진한 빨강
        },
      },
      fontFamily: {
        sans: [
          "Pretendard Variable",
          "Pretendard",
          "-apple-system",
          "BlinkMacSystemFont",
          "system-ui",
          "Roboto",
          "Noto Sans KR",
          "sans-serif",
        ],
      },
      fontSize: {
        // TechPulse 타이포그래피
        "display": ["32px", { lineHeight: "1.2", fontWeight: "800" }],
        "title": ["24px", { lineHeight: "1.3", fontWeight: "700" }],
        "subtitle": ["18px", { lineHeight: "1.4", fontWeight: "600" }],
        "body": ["16px", { lineHeight: "1.6", fontWeight: "400" }],
        "caption": ["14px", { lineHeight: "1.5", fontWeight: "500" }],
        "small": ["12px", { lineHeight: "1.4", fontWeight: "500" }],
      },
      borderRadius: {
        card: "12px",
        button: "8px",
        badge: "4px",
      },
      maxWidth: {
        container: "1200px",
        content: "800px",
      },
      typography: {
        DEFAULT: {
          css: {
            maxWidth: "none",
            color: "#0F172A",
            a: {
              color: "#2563EB",
              textDecoration: "underline",
              fontWeight: "500",
              "&:hover": {
                color: "#1D4ED8",
              },
            },
            h1: {
              color: "#0F172A",
              fontWeight: "800",
              fontSize: "32px",
            },
            h2: {
              color: "#0F172A",
              fontWeight: "700",
              fontSize: "24px",
              marginTop: "2.5rem",
              marginBottom: "1rem",
            },
            h3: {
              color: "#0F172A",
              fontWeight: "600",
              fontSize: "20px",
            },
            strong: {
              color: "#0F172A",
              fontWeight: "600",
            },
            code: {
              color: "#0F172A",
              backgroundColor: "#F1F5F9",
              padding: "0.2em 0.4em",
              borderRadius: "0.25rem",
              fontWeight: "500",
            },
            table: {
              fontSize: "14px",
            },
            th: {
              backgroundColor: "#F8FAFC",
              fontWeight: "700",
              padding: "12px",
              borderBottom: "2px solid #E2E8F0",
            },
            td: {
              padding: "12px",
              borderBottom: "1px solid #E2E8F0",
            },
          },
        },
      },
    },
  },
  plugins: [require("@tailwindcss/typography")],
};

export default config;

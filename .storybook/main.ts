import type { StorybookConfig } from "storybook-solidjs-vite";
import { mergeConfig } from "vite";

const config = {
  framework: "storybook-solidjs-vite",
  addons: [
    "@storybook/addon-onboarding",
    "@storybook/addon-docs",
    "@storybook/addon-a11y",
    "@storybook/addon-links",
    {
      name: "@storybook/addon-vitest",
      options: {
        cli: false,
      },
    },
  ],
  stories: ["../src/**/*.stories.@(js|jsx|mjs|ts|tsx)"],
  async viteFinal(config) {
    return mergeConfig(config, {
      define: {
        "process.env": {},
      },
    });
  },
  docs: {
    autodocs: true,
  },
} satisfies StorybookConfig;

export default config;

import type { Meta, StoryObj } from "storybook-solidjs-vite";
import Card from "./Card";

const meta = {
  title: "Components/Card",
  component: Card,
  args: {
    title: "The Last Horizon",
    subtitle: "2026 · 8.4 IMDb",
  },
} satisfies Meta<typeof Card>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Poster: Story = {};

export const Compact: Story = {
  args: {
    title: "Canal ao vivo",
    subtitle: "Agora",
    width: 180,
    height: 270,
  },
};

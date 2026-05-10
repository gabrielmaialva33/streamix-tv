import type { IntrinsicNodeStyleProps, IntrinsicTextNodeStyleProps } from "@lightningtv/solid";

// Augment existing intrinsic style prop interfaces to include focus and active states
declare module "@lightningtv/solid" {
  interface IntrinsicNodeStyleProps {
    $focus?: IntrinsicNodeStyleProps;
    $active?: IntrinsicNodeStyleProps;
    $hover?: IntrinsicNodeStyleProps;
    $pressed?: IntrinsicNodeStyleProps;
  }

  interface IntrinsicTextNodeStyleProps {
    $focus?: IntrinsicTextNodeStyleProps;
    $active?: IntrinsicTextNodeStyleProps;
    $hover?: IntrinsicTextNodeStyleProps;
    $pressed?: IntrinsicTextNodeStyleProps;
  }
}

// Theme colors - refined palette
export const theme = {
  // Primary brand
  primary: 0xe50914ff, // Netflix Red
  primaryDark: 0xb5070fff, // Darker red for depth
  primaryLight: 0xff3d3dff, // Lighter for hover/active

  // Backgrounds
  background: 0x090a10ff, // Deep neutral dark
  backgroundLight: 0x12131bff,
  backgroundElevated: 0x0f1017ff,

  // Surfaces
  surface: 0x181922ff, // Card backgrounds
  surfaceLight: 0x252631ff, // Elevated surfaces
  surfaceHover: 0x31323eff, // Hover state
  surfaceMuted: 0x14151dff,
  surfaceActive: 0x2b1015ff,

  // Text hierarchy
  textPrimary: 0xffffffff,
  textSecondary: 0xc4c4ceff, // Slightly warmer gray
  textMuted: 0x878794ff, // For less important info
  textDisabled: 0x5d5d6aff,

  // Accent colors
  accent: 0x4dabf7ff, // Blue for info
  success: 0x51cf66ff, // Green
  warning: 0xfcc419ff, // Yellow

  // Borders
  border: 0x252632ff,
  borderLight: 0x3f4050ff,
  borderSubtle: 0xffffff12,
  panel: 0x111219f2,
  panelBorder: 0x2a2b38ff,
};

// Card/Thumbnail style with smooth focus
export const CardStyle = {
  width: 240,
  height: 360,
  borderRadius: 12,
  color: theme.surface,
  border: { color: 0x00000000, width: 3 },
  $focus: {
    border: { color: theme.primary, width: 3 },
  },
} satisfies IntrinsicNodeStyleProps;

// Card title text style
export const CardTitleStyle = {
  fontSize: 20,
  color: theme.textSecondary,
  contain: "both",
  textOverflow: "ellipsis",
  maxLines: 1,
  $focus: {
    color: theme.textPrimary,
  },
} satisfies IntrinsicTextNodeStyleProps;

// Sidebar item style - cleaner look
export const SidebarItemStyle = {
  width: 200,
  height: 56,
  borderRadius: 10,
  color: 0x00000000,
  $focus: {
    color: theme.primary,
  },
} satisfies IntrinsicNodeStyleProps;

// Sidebar item text style
export const SidebarItemTextStyle = {
  fontSize: 20,
  color: theme.textMuted,
  $focus: {
    color: theme.textPrimary,
  },
} satisfies IntrinsicTextNodeStyleProps;

// Button style - more polished
export const ButtonStyle = {
  height: 48,
  borderRadius: 10,
  color: theme.primary,
  $focus: {
    color: theme.primaryLight,
  },
} satisfies IntrinsicNodeStyleProps;

// Button text style
export const ButtonTextStyle = {
  fontSize: 18,
  fontWeight: 700,
  color: theme.textPrimary,
} satisfies IntrinsicTextNodeStyleProps;

// Secondary button style
export const SecondaryButtonStyle = {
  height: 48,
  borderRadius: 10,
  color: theme.surfaceLight,
  border: { color: theme.border, width: 2 },
  $focus: {
    color: theme.surfaceHover,
    border: { color: theme.primary, width: 2 },
  },
} satisfies IntrinsicNodeStyleProps;

// Channel card style
export const ChannelCardStyle = {
  width: 200,
  height: 140,
  color: theme.surface,
  borderRadius: 12,
  border: { color: theme.border, width: 2 },
  $focus: {
    color: theme.surfaceLight,
    border: { color: theme.primary, width: 2 },
  },
} satisfies IntrinsicNodeStyleProps;

// Category button style (pills)
export const CategoryButtonStyle = {
  height: 40,
  borderRadius: 20,
  color: theme.surface,
  border: { color: theme.border, width: 1 },
  $focus: {
    color: theme.primary,
    border: { color: theme.primary, width: 1 },
  },
} satisfies IntrinsicNodeStyleProps;

// Selected category style
export const CategorySelectedStyle = {
  height: 40,
  borderRadius: 20,
  color: theme.surfaceLight,
  border: { color: theme.borderLight, width: 1 },
} satisfies IntrinsicNodeStyleProps;

// Keyboard key style
export const KeyboardKeyStyle = {
  height: 48,
  borderRadius: 8,
  color: theme.surface,
  border: { color: theme.border, width: 1 },
  $focus: {
    color: theme.surfaceHover,
    border: { color: theme.primary, width: 2 },
  },
} satisfies IntrinsicNodeStyleProps;

// Progress bar styles
export const ProgressBarStyle = {
  height: 4,
  borderRadius: 2,
  color: theme.surfaceLight,
} satisfies IntrinsicNodeStyleProps;

export const ProgressFillStyle = {
  height: 4,
  borderRadius: 2,
  color: theme.primary,
} satisfies IntrinsicNodeStyleProps;

// Badge style
export const BadgeStyle = {
  height: 24,
  borderRadius: 4,
  color: theme.primary,
} satisfies IntrinsicNodeStyleProps;

// Page styles
export default {
  Page: {
    width: 1920,
    height: 1080,
  },
  Card: CardStyle,
  CardTitle: CardTitleStyle,
  SidebarItem: SidebarItemStyle,
  SidebarItemText: SidebarItemTextStyle,
  Button: ButtonStyle,
  ButtonText: ButtonTextStyle,
  SecondaryButton: SecondaryButtonStyle,
  ChannelCard: ChannelCardStyle,
  CategoryButton: CategoryButtonStyle,
  CategorySelected: CategorySelectedStyle,
  KeyboardKey: KeyboardKeyStyle,
  ProgressBar: ProgressBarStyle,
  ProgressFill: ProgressFillStyle,
  Badge: BadgeStyle,
  theme,
};

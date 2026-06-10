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
  gold: 0xffd166ff, // Taglines / episode numbers
  success: 0x51cf66ff, // Green
  warning: 0xfcc419ff, // Yellow

  // Borders
  border: 0x252632ff,
  borderLight: 0x3f4050ff,
  borderSubtle: 0xffffff12,
  panel: 0x111219f2,
  panelBorder: 0x2a2b38ff,
};

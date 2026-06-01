import { TouchableOpacity, Text, ActivityIndicator, StyleSheet } from "react-native";
import { colors, space, radius, typography } from "../../lib/theme";

// Primary CTA button — pill-shaped, orange-accent, used for the headline action
// on a screen. Variants: "primary" (default), "secondary" (outlined),
// "ghost" (no bg).
export default function Button({
  label, onPress, busy, disabled, variant = "primary", style, leftIcon,
}) {
  const styleMap = {
    primary: { bg: colors.accent, text: "#fff", border: "transparent" },
    secondary: { bg: "transparent", text: colors.accent, border: colors.accent },
    ghost: { bg: "transparent", text: colors.text, border: "transparent" },
  };
  const v = styleMap[variant];
  const dim = disabled || busy ? 0.5 : 1;
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || busy}
      activeOpacity={0.85}
      style={[
        styles.base,
        { backgroundColor: v.bg, borderColor: v.border, opacity: dim },
        style,
      ]}
    >
      {busy
        ? <ActivityIndicator color={v.text} />
        : (
          <>
            {leftIcon}
            <Text style={[styles.label, { color: v.text }]}>{label}</Text>
          </>
        )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.sm,
    paddingVertical: 14,
    paddingHorizontal: space.lg,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  label: { ...typography.body, fontWeight: "700", letterSpacing: 0.2 },
});

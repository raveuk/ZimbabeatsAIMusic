import { useState } from "react";
import { View, Text, TextInput, StyleSheet } from "react-native";
import { colors, space, radius, typography } from "../../lib/theme";

// Single-line text input with floating label affordance: label sits above the
// field rather than as a placeholder, which reads cleaner on a long form.
export default function Input({ label, value, onChangeText, hint, error, multiline, style, ...rest }) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={[styles.wrap, style]}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <TextInput
        value={value}
        onChangeText={onChangeText}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        multiline={multiline}
        placeholderTextColor={colors.textFade}
        style={[
          styles.input,
          multiline && styles.multiline,
          focused && styles.focused,
          error && styles.errored,
        ]}
        {...rest}
      />
      {error
        ? <Text style={styles.err}>{error}</Text>
        : hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: space.md },
  label: { ...typography.meta, color: colors.textMute, marginBottom: space.xs, marginLeft: space.xxs },
  input: {
    backgroundColor: colors.surface2,
    color: colors.text,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: 13,
    fontSize: 15,
    borderWidth: 1,
    borderColor: "transparent",
  },
  multiline: { minHeight: 84, paddingTop: 12, textAlignVertical: "top" },
  focused: { borderColor: colors.accent },
  errored: { borderColor: colors.danger },
  hint: { ...typography.caption, color: colors.textFade, marginTop: space.xs, marginLeft: space.xxs },
  err: { ...typography.caption, color: colors.danger, marginTop: space.xs, marginLeft: space.xxs },
});

import { useState } from 'react';
import { StyleSheet, TextInput, type TextInputProps } from 'react-native';

import { colors, face, hitTarget, radius, space, typeScale } from '@/theme';

type TextFieldProps = {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  secureTextEntry?: boolean;
  keyboardType?: TextInputProps['keyboardType'];
  autoCapitalize?: TextInputProps['autoCapitalize'];
  autoComplete?: TextInputProps['autoComplete'];
  onSubmitEditing?: TextInputProps['onSubmitEditing'];
};

/** Website text field: surface fill, 3px corners, accent border while focused, 44pt tall. */
export function TextField({
  label,
  value,
  onChangeText,
  placeholder,
  secureTextEntry,
  keyboardType,
  autoCapitalize,
  autoComplete,
  onSubmitEditing,
}: TextFieldProps) {
  const [focused, setFocused] = useState(false);
  return (
    <TextInput
      accessibilityLabel={label}
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder ?? label}
      placeholderTextColor={colors.muted}
      secureTextEntry={secureTextEntry}
      keyboardType={keyboardType}
      autoCapitalize={autoCapitalize}
      autoComplete={autoComplete}
      onSubmitEditing={onSubmitEditing}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={[styles.input, focused && styles.focused]}
    />
  );
}

const styles = StyleSheet.create({
  input: {
    minHeight: hitTarget,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.base,
    backgroundColor: colors.surface,
    color: colors.text,
    fontFamily: face.body[400],
    fontSize: typeScale.base.size,
    lineHeight: typeScale.base.line,
    paddingHorizontal: space[3],
    paddingVertical: space[2],
  },
  focused: { borderColor: colors.accent },
});

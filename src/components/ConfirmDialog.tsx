import React from 'react';
import { Modal, View, Text, Pressable, StyleSheet } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';

interface ConfirmDialogProps {
  visible: boolean;
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Tints the confirm button red for irreversible actions. */
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

const DESTRUCTIVE = '#E5604D';

/**
 * Small centered confirmation dialog used to guard destructive actions
 * (clearing history, etc.). Tapping the scrim or Cancel dismisses it.
 */
export function ConfirmDialog({
  visible,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const theme = useTheme();
  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onCancel}>
      <Pressable style={styles.backdrop} onPress={onCancel}>
        {/* Absorb taps on the card so they don't dismiss the dialog. */}
        <Pressable
          style={[styles.card, { backgroundColor: theme.colors.elevated, borderColor: theme.colors.border }]}
          onPress={() => {}}
        >
          <Text style={[theme.typography.heading, { color: theme.colors.text }]}>{title}</Text>
          {message ? (
            <Text style={[styles.message, { color: theme.colors.textMuted }]}>{message}</Text>
          ) : null}

          <View style={styles.actions}>
            <Pressable
              onPress={onCancel}
              style={({ pressed }) => [
                styles.btn,
                {
                  backgroundColor: theme.colors.surface,
                  borderColor: theme.colors.border,
                  borderWidth: StyleSheet.hairlineWidth,
                  opacity: pressed ? 0.85 : 1,
                },
              ]}
            >
              <Text style={{ color: theme.colors.text, fontWeight: '700', fontSize: 14 }}>{cancelLabel}</Text>
            </Pressable>
            <Pressable
              onPress={onConfirm}
              style={({ pressed }) => [
                styles.btn,
                {
                  backgroundColor: destructive ? DESTRUCTIVE : theme.colors.accent,
                  opacity: pressed ? 0.85 : 1,
                },
              ]}
            >
              <Text
                style={{
                  color: destructive ? '#FFFFFF' : theme.colors.onAccent,
                  fontWeight: '700',
                  fontSize: 14,
                }}
              >
                {confirmLabel}
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 22,
  },
  message: {
    fontSize: 14,
    lineHeight: 20,
    marginTop: 8,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 22,
  },
  btn: {
    flex: 1,
    height: 46,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

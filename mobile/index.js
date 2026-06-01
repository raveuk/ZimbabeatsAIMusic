import { registerRootComponent } from 'expo';
import { Alert, Platform } from 'react-native';

import App from './App';

// React Native Web's Alert.alert silently no-ops, which makes every "Check your
// email" / "Generating…" / error popup invisible on the web build. Replace it
// with a real browser dialog before anything renders. Native is untouched.
if (Platform.OS === 'web' && typeof window !== 'undefined') {
  Alert.alert = (title, message, buttons) => {
    const text = [title, message].filter(Boolean).join('\n\n');
    // If the call has a "Cancel"/"OK" pair, use confirm; otherwise just alert.
    if (Array.isArray(buttons) && buttons.length > 1) {
      const ok = window.confirm(text);
      const action = ok ? buttons.find((b) => b.style !== 'cancel') : buttons.find((b) => b.style === 'cancel');
      action?.onPress?.();
    } else {
      window.alert(text);
      buttons?.[0]?.onPress?.();
    }
  };
}

registerRootComponent(App);

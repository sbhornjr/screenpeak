import 'react-native/Libraries/Components/View/ViewAccessibility';
import 'react-native/Libraries/Components/Pressable/Pressable';

// React Native Web reads these. The 0.86 native types omit them.
declare module 'react-native/Libraries/Components/View/ViewAccessibility' {
  interface AccessibilityProps {
    accessibilityLevel?: number | undefined;
  }
}

declare module 'react-native/Libraries/Components/Pressable/Pressable' {
  interface PressableStateCallbackType {
    readonly focused?: boolean;
  }
}

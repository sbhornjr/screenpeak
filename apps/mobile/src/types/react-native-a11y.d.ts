import 'lucide-react-native';
import 'react-native';

// React Native Web reads these. The strict React Native types omit them.
declare module 'react-native' {
  interface AccessibilityProps {
    accessibilityLevel?: number | undefined;
  }

  interface PressableStateCallbackType {
    readonly focused?: boolean;
  }
}

// react-native-svg 15.16's SvgProps drops `color` under the strict React Native
// types, and it does not put `fill` or `strokeWidth` on the component props.
// Lucide still paints them. The list heart passes both.
declare module 'lucide-react-native' {
  interface LucideProps {
    color?: string;
    fill?: string;
    strokeWidth?: number;
  }
}

import { Image, type ImageStyle, type StyleProp } from 'react-native';

const wordmark = require('../../assets/images/hestia-wordmark-transparent.png');

export function BrandWordmark({ width, style }: { width: number; style?: StyleProp<ImageStyle> }) {
  return <Image
    accessibilityLabel="Hestia"
    source={wordmark}
    resizeMode="contain"
    style={[{ width, height: width * 296 / 628 }, style]}
  />;
}

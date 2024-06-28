import { StyleSheet, Text, TextProps } from 'react-native';

export const Strong = ({ children, style, ...props }: TextProps) => (
  <Text {...props} style={[$strong, style]}>
    {children}
  </Text>
);

const { $strong } = StyleSheet.create({
  $strong: {
    fontWeight: 'bold',
    color: 'rgb(0, 0, 238)',
  },
});

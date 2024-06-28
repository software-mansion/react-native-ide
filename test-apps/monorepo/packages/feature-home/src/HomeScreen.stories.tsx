import type { Meta, StoryObj } from '@storybook/react';
import { View } from 'react-native';

import { HomeScreen } from './HomeScreen';

const meta = {
  title: 'HomeScreen',
  component: HomeScreen,
  decorators: [
    (Story) => (
      <View style={{ padding: 16 }}>
        <Story />
      </View>
    ),
  ],
} satisfies Meta<typeof HomeScreen>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Basic: Story = {};

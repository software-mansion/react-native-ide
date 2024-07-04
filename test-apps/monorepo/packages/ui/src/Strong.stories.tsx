import type { Meta, StoryObj } from '@storybook/react';
import { View } from 'react-native';

import { Strong } from './Strong';

const meta = {
  title: 'Strong',
  component: Strong,
  args: {
    children: 'Hello world',
  },
  decorators: [
    (Story) => (
      <View style={{ padding: 16 }}>
        <Story />
      </View>
    ),
  ],
} satisfies Meta<typeof Strong>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Basic: Story = {};

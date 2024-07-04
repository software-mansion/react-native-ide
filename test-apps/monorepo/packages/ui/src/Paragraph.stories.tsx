import type { Meta, StoryObj } from '@storybook/react';
import { View } from 'react-native';

import { Paragraph } from './Paragraph';

const meta = {
  title: 'Paragraph',
  component: Paragraph,
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
} satisfies Meta<typeof Paragraph>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Basic: Story = {};

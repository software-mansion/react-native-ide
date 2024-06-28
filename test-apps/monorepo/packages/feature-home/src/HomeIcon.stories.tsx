import type { Meta, StoryObj } from '@storybook/react';
import { View } from 'react-native';

import { HomeIcon } from './HomeIcon';

const meta = {
  title: 'HomeIcon',
  component: HomeIcon,
  decorators: [
    (Story) => (
      <View style={{ padding: 16 }}>
        <Story />
      </View>
    ),
  ],
} satisfies Meta<typeof HomeIcon>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Basic: Story = {};

import { registerRootComponent } from 'expo';

import { default as StoryBookUI } from './.ondevice';
export * from './src/index';

registerRootComponent(StoryBookUI);

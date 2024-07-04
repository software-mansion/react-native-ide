import { cleanup, render, screen } from '@testing-library/react-native';

import { HomeScreen } from '../HomeScreen';

afterEach(cleanup);

it('says Expo monorepo', () => {
  render(<HomeScreen />);
  expect(screen.getByText('Expo monorepo')).toBeDefined();
});

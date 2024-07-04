import { cleanup, render, screen } from '@testing-library/react-native';

import { Strong } from '../Strong';

afterEach(cleanup);

it('renders textual children', () => {
  render(<Strong>Textual content</Strong>);
  expect(screen.getByText('Textual content')).toBeDefined();
});

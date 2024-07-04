import { cleanup, render, screen } from '@testing-library/react-native';

import { Paragraph } from '../Paragraph';

afterEach(cleanup);

it('renders textual children', () => {
  render(<Paragraph>Textual content</Paragraph>);
  expect(screen.getByText('Textual content')).toBeDefined();
});

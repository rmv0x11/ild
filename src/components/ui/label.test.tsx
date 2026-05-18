import { render, screen } from '@testing-library/react';
import { Label } from './label';

describe('Label', () => {
  it('renders a <label>', () => {
    render(<Label data-testid="label">Hello</Label>);
    const el = screen.getByTestId('label');
    expect(el.tagName).toBe('LABEL');
  });

  it('applies htmlFor attribute', () => {
    render(
      <Label data-testid="label" htmlFor="my-input">
        Name
      </Label>,
    );
    expect(screen.getByTestId('label')).toHaveAttribute('for', 'my-input');
  });

  it('renders children', () => {
    render(<Label>Username</Label>);
    expect(screen.getByText('Username')).toBeInTheDocument();
  });

  it('merges className prop', () => {
    render(
      <Label data-testid="label" className="custom-label">
        x
      </Label>,
    );
    expect(screen.getByTestId('label')).toHaveClass('custom-label');
  });
});

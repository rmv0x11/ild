import { render, screen } from '@testing-library/react';
import { Badge, badgeVariants } from './badge';

describe('Badge', () => {
  it('renders with default variant', () => {
    render(<Badge data-testid="badge">Default</Badge>);
    const el = screen.getByTestId('badge');
    expect(el).toHaveTextContent('Default');
    expect(el.className).toMatch(/bg-primary/);
  });

  it('applies secondary variant class', () => {
    render(
      <Badge data-testid="badge" variant="secondary">
        x
      </Badge>,
    );
    expect(screen.getByTestId('badge').className).toMatch(/secondary/);
  });

  it('applies destructive variant class', () => {
    render(
      <Badge data-testid="badge" variant="destructive">
        x
      </Badge>,
    );
    expect(screen.getByTestId('badge').className).toMatch(/destructive/);
  });

  it('applies outline variant class', () => {
    render(
      <Badge data-testid="badge" variant="outline">
        x
      </Badge>,
    );
    expect(screen.getByTestId('badge').className).toMatch(/text-foreground/);
  });

  it('merges custom className', () => {
    render(
      <Badge data-testid="badge" className="my-badge">
        x
      </Badge>,
    );
    expect(screen.getByTestId('badge')).toHaveClass('my-badge');
  });

  it('badgeVariants({ variant }) returns a class string', () => {
    const cls = badgeVariants({ variant: 'secondary' });
    expect(typeof cls).toBe('string');
    expect(cls).toMatch(/secondary/);
  });
});

import { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button, buttonVariants } from './button';

describe('Button', () => {
  it('renders text content as a <button>', () => {
    render(<Button>Click me</Button>);
    const btn = screen.getByRole('button', { name: 'Click me' });
    expect(btn).toBeInTheDocument();
    expect(btn.tagName).toBe('BUTTON');
  });

  it('forwards ref to the underlying button element', () => {
    const ref = createRef<HTMLButtonElement>();
    render(<Button ref={ref}>Ref</Button>);
    expect(ref.current).toBeInstanceOf(HTMLButtonElement);
    expect(ref.current?.textContent).toBe('Ref');
  });

  it('fires onClick when clicked', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Press</Button>);
    await user.click(screen.getByRole('button', { name: 'Press' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('does not fire onClick when disabled', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Disabled
      </Button>,
    );
    const btn = screen.getByRole('button', { name: 'Disabled' });
    expect(btn).toBeDisabled();
    await user.click(btn);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('applies destructive variant class', () => {
    render(<Button variant="destructive">x</Button>);
    expect(screen.getByRole('button')).toHaveClass(/destructive/);
  });

  it('applies outline variant class', () => {
    render(<Button variant="outline">x</Button>);
    const btn = screen.getByRole('button');
    expect(btn.className).toMatch(/border/);
    expect(btn.className).toMatch(/bg-background/);
  });

  it('applies ghost variant class', () => {
    render(<Button variant="ghost">x</Button>);
    expect(screen.getByRole('button').className).toMatch(/hover:bg-accent/);
  });

  it('applies link variant class', () => {
    render(<Button variant="link">x</Button>);
    expect(screen.getByRole('button').className).toMatch(/underline/);
  });

  it('applies secondary variant class', () => {
    render(<Button variant="secondary">x</Button>);
    expect(screen.getByRole('button')).toHaveClass(/secondary/);
  });

  it('applies size="sm" class', () => {
    render(<Button size="sm">x</Button>);
    expect(screen.getByRole('button')).toHaveClass('h-8');
  });

  it('applies size="lg" class', () => {
    render(<Button size="lg">x</Button>);
    expect(screen.getByRole('button')).toHaveClass('h-10');
  });

  it('applies size="icon" class', () => {
    render(<Button size="icon">x</Button>);
    expect(screen.getByRole('button')).toHaveClass('size-9');
  });

  it('merges className prop', () => {
    render(<Button className="custom-extra">x</Button>);
    expect(screen.getByRole('button')).toHaveClass('custom-extra');
  });

  it('buttonVariants({ variant: "destructive" }) returns a class string', () => {
    const cls = buttonVariants({ variant: 'destructive' });
    expect(typeof cls).toBe('string');
    expect(cls.length).toBeGreaterThan(0);
    expect(cls).toMatch(/destructive/);
  });
});

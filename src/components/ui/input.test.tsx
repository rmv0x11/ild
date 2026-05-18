import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Input } from './input';

describe('Input', () => {
  it('renders an <input>', () => {
    render(<Input data-testid="input" />);
    const el = screen.getByTestId('input');
    expect(el.tagName).toBe('INPUT');
  });

  it('forwards type prop', () => {
    render(<Input data-testid="input" type="password" />);
    expect(screen.getByTestId('input')).toHaveAttribute('type', 'password');
  });

  it('handles value and onChange via userEvent.type', async () => {
    const user = userEvent.setup();

    function Controlled() {
      const [v, setV] = useState('');
      return (
        <Input
          data-testid="input"
          value={v}
          onChange={(e) => setV(e.target.value)}
        />
      );
    }

    render(<Controlled />);
    const el = screen.getByTestId('input') as HTMLInputElement;
    await user.type(el, 'hello');
    expect(el.value).toBe('hello');
  });

  it('forwards disabled prop', () => {
    render(<Input data-testid="input" disabled />);
    expect(screen.getByTestId('input')).toBeDisabled();
  });

  it('merges className prop', () => {
    render(<Input data-testid="input" className="custom-input" />);
    expect(screen.getByTestId('input')).toHaveClass('custom-input');
  });
});

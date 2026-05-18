import { render, screen } from '@testing-library/react';
import { Progress } from './progress';

function getBar() {
  const root = screen.getByRole('progressbar');
  const bar = root.firstElementChild as HTMLElement | null;
  expect(bar).not.toBeNull();
  return bar!;
}

describe('Progress', () => {
  it('renders as progressbar role', () => {
    render(<Progress value={0} />);
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('renders inner bar with 0% width when value=0', () => {
    render(<Progress value={0} />);
    expect(getBar().style.width).toBe('0%');
  });

  it('renders inner bar with 50% width when value=50', () => {
    render(<Progress value={50} />);
    expect(getBar().style.width).toBe('50%');
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '50');
  });

  it('renders inner bar with 100% width when value=100', () => {
    render(<Progress value={100} />);
    expect(getBar().style.width).toBe('100%');
  });

  it('clamps values above 100 to 100', () => {
    render(<Progress value={150} />);
    expect(getBar().style.width).toBe('100%');
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');
  });

  it('clamps values below 0 to 0', () => {
    render(<Progress value={-50} />);
    expect(getBar().style.width).toBe('0%');
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
  });

  it('defaults value to 0 when omitted', () => {
    render(<Progress />);
    expect(getBar().style.width).toBe('0%');
  });

  it('merges custom className', () => {
    render(<Progress value={10} className="my-progress" />);
    expect(screen.getByRole('progressbar')).toHaveClass('my-progress');
  });
});

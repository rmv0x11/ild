import { render } from '@testing-library/react';
import { renderBold } from './markdown';

describe('renderBold', () => {
  it('returns an empty array for an empty string', () => {
    const nodes = renderBold('');
    expect(nodes).toEqual([]);
    const { container } = render(<div>{nodes}</div>);
    expect(container.firstChild?.textContent).toBe('');
  });

  it('renders plain text without <strong> when no bold markers present', () => {
    const { container } = render(<div>{renderBold('plain text here')}</div>);
    expect(container.querySelector('strong')).toBeNull();
    expect(container.textContent).toBe('plain text here');
  });

  it('renders a single bold segment surrounded by plain text', () => {
    const { container } = render(<div>{renderBold('a **b** c')}</div>);
    const strong = container.querySelector('strong');
    expect(strong).not.toBeNull();
    expect(strong?.textContent).toBe('b');
    expect(container.textContent).toBe('a b c');
  });

  it('renders multiple bold segments in one string', () => {
    const { container } = render(<div>{renderBold('one **two** three **four** five')}</div>);
    const strongs = container.querySelectorAll('strong');
    expect(strongs).toHaveLength(2);
    expect(strongs[0].textContent).toBe('two');
    expect(strongs[1].textContent).toBe('four');
    expect(container.textContent).toBe('one two three four five');
  });

  it('handles bold at the start and end of the string', () => {
    const { container } = render(<div>{renderBold('**start** middle **end**')}</div>);
    const strongs = container.querySelectorAll('strong');
    expect(strongs).toHaveLength(2);
    expect(strongs[0].textContent).toBe('start');
    expect(strongs[1].textContent).toBe('end');
    expect(container.textContent).toBe('start middle end');
  });

  it('renders Russian and Chinese characters inside bold correctly', () => {
    const { container } = render(<div>{renderBold('前 **你好** 后')}</div>);
    const strong = container.querySelector('strong');
    expect(strong?.textContent).toBe('你好');
    expect(container.textContent).toBe('前 你好 后');

    const { container: container2 } = render(<div>{renderBold('начало **привет** конец')}</div>);
    const strong2 = container2.querySelector('strong');
    expect(strong2?.textContent).toBe('привет');
    expect(container2.textContent).toBe('начало привет конец');
  });

  it('is re-entrant: invocations on the same string yield equivalent output (regex lastIndex reset)', () => {
    const input = 'foo **bar** baz **qux** end';
    const first = render(<div>{renderBold(input)}</div>);
    const second = render(<div>{renderBold(input)}</div>);

    expect(first.container.textContent).toBe(second.container.textContent);
    expect(first.container.querySelectorAll('strong')).toHaveLength(2);
    expect(second.container.querySelectorAll('strong')).toHaveLength(2);
    expect(first.container.innerHTML).toBe(second.container.innerHTML);
  });
});

import { render, screen } from '@testing-library/react';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from './card';

describe('Card', () => {
  it('renders all subcomponents with their children', () => {
    render(
      <Card data-testid="card">
        <CardHeader data-testid="header">
          <CardTitle data-testid="title">Title</CardTitle>
          <CardDescription data-testid="description">Description</CardDescription>
        </CardHeader>
        <CardContent data-testid="content">Content</CardContent>
        <CardFooter data-testid="footer">Footer</CardFooter>
      </Card>,
    );

    expect(screen.getByTestId('card')).toBeInTheDocument();
    expect(screen.getByTestId('header')).toBeInTheDocument();
    expect(screen.getByTestId('title')).toHaveTextContent('Title');
    expect(screen.getByTestId('description')).toHaveTextContent('Description');
    expect(screen.getByTestId('content')).toHaveTextContent('Content');
    expect(screen.getByTestId('footer')).toHaveTextContent('Footer');
  });

  it('each subcomponent renders a <div>', () => {
    render(
      <Card data-testid="card">
        <CardHeader data-testid="header">
          <CardTitle data-testid="title">t</CardTitle>
          <CardDescription data-testid="description">d</CardDescription>
        </CardHeader>
        <CardContent data-testid="content">c</CardContent>
        <CardFooter data-testid="footer">f</CardFooter>
      </Card>,
    );

    for (const id of ['card', 'header', 'title', 'description', 'content', 'footer']) {
      expect(screen.getByTestId(id).tagName).toBe('DIV');
    }
  });

  it('Card has rounded-lg token class', () => {
    render(<Card data-testid="card">x</Card>);
    expect(screen.getByTestId('card')).toHaveClass('rounded-lg');
  });

  it('CardHeader has p-6 spacing class', () => {
    render(<CardHeader data-testid="header">x</CardHeader>);
    expect(screen.getByTestId('header')).toHaveClass('p-6');
  });

  it('CardTitle has semibold typography class', () => {
    render(<CardTitle data-testid="title">x</CardTitle>);
    expect(screen.getByTestId('title')).toHaveClass('font-semibold');
  });

  it('CardDescription has muted-foreground class', () => {
    render(<CardDescription data-testid="description">x</CardDescription>);
    expect(screen.getByTestId('description').className).toMatch(/muted-foreground/);
  });

  it('merges custom className on Card', () => {
    render(
      <Card data-testid="card" className="my-card">
        x
      </Card>,
    );
    expect(screen.getByTestId('card')).toHaveClass('my-card');
  });
});

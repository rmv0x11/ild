import { apiFetch } from '@/lib/api/client';
import type { CardWire, ReviewWire } from './types';

export interface PullCardsResponse {
  cards: CardWire[];
  nextSince: number;
}

export interface PullReviewsResponse {
  reviews: ReviewWire[];
  nextSince: number;
}

export interface PushResponse {
  applied: number;
}

export async function pullCards(since: number, limit = 500): Promise<PullCardsResponse> {
  const params = new URLSearchParams({ since: String(since), limit: String(limit) });
  return apiFetch<PullCardsResponse>(`/api/v1/sync/cards?${params.toString()}`);
}

export async function pushCards(cards: CardWire[]): Promise<PushResponse> {
  return apiFetch<PushResponse>('/api/v1/sync/cards', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cards }),
  });
}

export async function deleteCardOnServer(id: string): Promise<void> {
  await apiFetch<void>(`/api/v1/sync/cards/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

export async function pullReviews(since: number, limit = 500): Promise<PullReviewsResponse> {
  const params = new URLSearchParams({ since: String(since), limit: String(limit) });
  return apiFetch<PullReviewsResponse>(`/api/v1/sync/reviews?${params.toString()}`);
}

export async function pushReviews(reviews: ReviewWire[]): Promise<PushResponse> {
  return apiFetch<PushResponse>('/api/v1/sync/reviews', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reviews }),
  });
}

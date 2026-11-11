import { useState } from 'react';
import { Redirect } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DiscoveryResults, EXPERIENCES_KEY, FilterBar, FiltersProvider, isPriceUnknown, PRICE_UNKNOWN_LABEL } from '../discovery';
import type { Experience } from '../discovery';
import { Card, Label, Screen, Tag } from '../../ui';
import { type } from '../../ui/theme';

const row = (name: string, category: string, price_kind: Experience['price_kind'], price_min: number | null, price_max: number | null): Experience =>
  ({ id: name, name, category, description: '', lat: null, lng: null, area: null, image_url: null, timing_kind: 'flexible', price_kind, price_min, price_max });
// A few made-up rows so the filters can be tried on a phone with no sign-in or database.
const SAMPLE = [
  row('Sample mural walk', 'Art and walks', 'free', 0, 0), row('Sample pottery class', 'Make something', 'exact', 38, 38),
  row('Sample swim hole', 'Outdoors', 'estimated', 5, 9), row('Sample taco crawl', 'Food and drink', 'estimated', 12, 40),
  row('Sample trivia night', 'Games and trivia', 'unknown', null, null), row('Sample club', 'Active', 'exact', 20, 20),
];

function Demo() {
  return <Screen>
    <Label accessibilityRole="header" style={type.heading}>Filters demo (sample data)</Label>
    <FilterBar />
    <DiscoveryResults>{items => items.map(item => <Card key={item.id}>
      <Label>{item.name} · {item.category}</Label>
      {isPriceUnknown(item) && <Tag label={PRICE_UNKNOWN_LABEL} />}
    </Card>)}</DiscoveryResults>
  </Screen>;
}

export default function FiltersDemoScreen() {
  const [client] = useState(() => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(EXPERIENCES_KEY, SAMPLE);
    return queryClient;
  });
  return __DEV__ ? <QueryClientProvider client={client}><FiltersProvider><Demo /></FiltersProvider></QueryClientProvider> : <Redirect href="/" />;
}

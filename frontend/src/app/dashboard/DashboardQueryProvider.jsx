'use client';

import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DashboardApiError } from './api/dashboard-api';

// 이후 Dashboard query key는 ['dashboard', ...] namespace를 사용한다.
// (query key factory는 이후 단계에서 작성한다.)

function createDashboardQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        refetchOnWindowFocus: false,
        retry: (failureCount, error) => {
          if (error instanceof DashboardApiError && error.isClientError) {
            return false;
          }
          return failureCount < 1;
        },
      },
      mutations: {
        retry: false,
      },
    },
  });
}

export default function DashboardQueryProvider({ children }) {
  const [queryClient] = useState(createDashboardQueryClient);
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

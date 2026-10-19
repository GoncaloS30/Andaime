import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from 'react-router'
import { Toaster } from 'sonner'
import { TooltipProvider } from '@/ui/Menu'
import { isApiError } from './api/http'
import { router } from './router'
import { SessionWatcher } from './session'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // Erros de autorização, validação ou "não encontrado" não melhoram ao repetir.
      retry: (count, error) => !(isApiError(error) && error.status < 500) && count < 2,
      refetchOnWindowFocus: true,
    },
    mutations: { retry: false },
  },
})

export function SaasApp() {
  return (
    <QueryClientProvider client={queryClient}>
      <SessionWatcher>
        <TooltipProvider>
          <RouterProvider router={router} />
          <Toaster
            position="bottom-center"
            closeButton
            toastOptions={{
              classNames: {
                toast: '!rounded-md !border-line !bg-surface !text-ink !shadow-e1 !font-sans',
                title: '!font-semibold !text-sm',
                description: '!text-ink-3 !text-xs',
                actionButton: '!bg-pinho !text-white !rounded-sm !font-medium',
                success: '[&_[data-icon]]:!text-ok',
                error: '[&_[data-icon]]:!text-tijolo',
              },
            }}
          />
        </TooltipProvider>
      </SessionWatcher>
    </QueryClientProvider>
  )
}

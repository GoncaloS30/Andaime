import { RouterProvider } from 'react-router'
import { Toaster } from 'sonner'
import { TooltipProvider } from '@/ui/Menu'
import { router } from './router'

export function App() {
  return (
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
  )
}

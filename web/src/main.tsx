import '@fontsource-variable/inter'
import { MotionConfig } from 'motion/react'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import { Toaster } from 'sonner'
import App from './App.tsx'
import './index.css'
import { seguiSistema } from './tema'

seguiSistema()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MotionConfig reducedMotion="user">
      <BrowserRouter>
        <App />
        <Toaster
          position="bottom-right"
          closeButton
          toastOptions={{
            classNames: {
              toast: '!rounded-2xl !border-0 !bg-superficie !text-testo !font-sans !shadow-alta',
              description: '!text-testo-2',
              closeButton: '!bg-superficie !text-testo-2 !border-separatore',
            },
          }}
        />
      </BrowserRouter>
    </MotionConfig>
  </StrictMode>,
)

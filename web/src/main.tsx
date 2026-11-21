import '@fontsource-variable/archivo/wdth.css'
import { MotionConfig } from 'motion/react'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import { Toaster } from 'sonner'
import App from './App.tsx'
import './index.css'

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
              toast: '!rounded-md !border !border-inchiostro !bg-foglio !text-inchiostro !font-sans sopra',
              description: '!text-grafite',
            },
          }}
        />
      </BrowserRouter>
    </MotionConfig>
  </StrictMode>,
)

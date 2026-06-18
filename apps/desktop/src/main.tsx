import { render } from 'solid-js/web'
import '@fontsource-variable/inter/index.css'
import '@fontsource-variable/jetbrains-mono/index.css'
import './index.css'
import './shob-ported/styles/session-review.css'
import './shob-ported/styles/diff-changes.css'
import App from './App.tsx'
import { AppProviders } from './context/AppProviders'
import { ErrorBoundary } from 'solid-js'

const bootSplash = document.getElementById('boot-splash')
function hideBootSplash() {
  if (!bootSplash) return
  bootSplash.classList.add('boot-splash-hidden')
  bootSplash.addEventListener(
    'transitionend',
    () => {
      bootSplash.remove()
    },
    { once: true },
  )
  setTimeout(() => {
    if (bootSplash.isConnected) bootSplash.remove()
  }, 500)
}

window.addEventListener('error', (event) => {
  console.error('[shob] uncaught error', event.error ?? event.message)
})
window.addEventListener('unhandledrejection', (event) => {
  console.error('[shob] unhandled rejection', event.reason)
})

try {
  render(
    () => (
      <ErrorBoundary
        fallback={(err) => {
          const message = String(err)
          const stack = (err as Error)?.stack ?? ''
          console.error('[shob] error boundary caught:', message, stack)
          return (
            <div style={{ color: 'red', padding: '20px', background: 'black' }}>
              <h1>FATAL ERROR</h1>
              <pre>{message}</pre>
              <pre>{stack}</pre>
            </div>
          )
        }}
      >
        <AppProviders>
          <App />
        </AppProviders>
      </ErrorBoundary>
    ),
    document.getElementById('root')!,
  )
} catch (err) {
  console.error('[shob] render() threw', err)
  const root = document.getElementById('root')
  if (root) {
    root.innerHTML = `<div style="color:red;padding:20px;background:black;font-family:monospace"><h1>RENDER FAILED</h1><pre>${String(err)}</pre><pre>${(err as Error)?.stack ?? ''}</pre></div>`
  }
} finally {
  requestAnimationFrame(hideBootSplash)
}

setTimeout(() => {
  if (bootSplash?.isConnected) {
    console.warn('[shob] boot splash force-removed after timeout')
    bootSplash.remove()
  }
}, 10000)

import { AppRouter } from './app/router'
import { ApiConnectionStatus } from './components/common/ApiConnectionStatus'

export default function App() {
  return (
    <>
      <AppRouter />
      <ApiConnectionStatus />
    </>
  )
}

import { Route, Routes } from 'react-router-dom'
import { LoginPage } from '../pages/LoginPage'
import { MainPage } from '../pages/MainPage'
import { PlaceholderPage } from '../pages/PlaceholderPage'
import { CustomerPage } from '../pages/CustomerPage'

export function AppRouter() {
  return (
    <Routes>
      <Route path="/" element={<MainPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/customer" element={<CustomerPage />} />
      <Route path="/merchant" element={<PlaceholderPage role="merchant" />} />
      <Route path="/cs" element={<PlaceholderPage role="cs" />} />
      <Route path="/demo" element={<PlaceholderPage role="demo" />} />
      <Route path="*" element={<PlaceholderPage role="notFound" />} />
    </Routes>
  )
}

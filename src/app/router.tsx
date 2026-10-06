import { Navigate, Route, Routes } from 'react-router-dom'
import { LoginPage } from '../pages/LoginPage'
import { MainPage } from '../pages/MainPage'
import { PlaceholderPage } from '../pages/PlaceholderPage'
import { CustomerPage } from '../pages/CustomerPage'
import { MerchantPage } from '../pages/MerchantPage'
import { CsPage } from '../pages/CsPage'
import { PolicyPage } from '../pages/PolicyPage'

export function AppRouter() {
  return (
    <Routes>
      <Route path="/" element={<MainPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/customer" element={<CustomerPage />} />
      <Route path="/merchant" element={<MerchantPage />} />
      <Route path="/cs" element={<CsPage />} />
      <Route path="/cs/cases/:caseId/policy" element={<PolicyPage />} />
      <Route path="/demo" element={<Navigate replace to="/login" />} />
      <Route path="*" element={<PlaceholderPage role="notFound" />} />
    </Routes>
  )
}

import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import { Component, ReactNode, ErrorInfo, Suspense, lazy } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from './contexts/AuthContext'
import Layout from './components/Layout'
import AdminLayout from './components/AdminLayout'
import ProtectedRoute from './components/ProtectedRoute'
import Home from './pages/Home'
import About from './pages/About'
import Products from './pages/Products'
import ProductDetail from './pages/ProductDetail'
import CoffeeOrigins from './pages/CoffeeOrigins'
import ExportProcess from './pages/ExportProcess'
import Services from './pages/Services'
import Quality from './pages/Quality'
import Certificates from './pages/Certificates'
import Blog from './pages/Blog'
import BlogDetail from './pages/BlogDetail'
import FAQ from './pages/FAQ'
import Contact from './pages/Contact'
import RequestQuote from './pages/RequestQuote'
import RequestSample from './pages/RequestSample'
import Privacy from './pages/Privacy'
import Terms from './pages/Terms'
const AdminLogin = lazy(() => import('./pages/admin/AdminLogin'))
const AdminResetPassword = lazy(() => import('./pages/admin/AdminResetPassword'))
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard'))
const AdminProducts = lazy(() => import('./pages/admin/AdminProducts'))
const AdminContacts = lazy(() => import('./pages/admin/AdminContacts'))
const AdminQuoteRequests = lazy(() => import('./pages/admin/AdminQuoteRequests'))
const AdminSampleRequests = lazy(() => import('./pages/admin/AdminSampleRequests'))
import { ADMIN_ROLES, type AdminModule, type AppRole } from './lib/permissions'
const AdminSuppliers = lazy(() => import('./pages/admin/AdminSuppliers'))
const AdminFarmers = lazy(() => import('./pages/admin/AdminFarmers'))
const AdminLocations = lazy(() => import('./pages/admin/AdminLocations'))
const AdminCollactions = lazy(() => import('./pages/admin/AdminCollactions'))
const AdminCoffeeLots = lazy(() => import('./pages/admin/AdminCoffeeLots'))
const AdminQuality = lazy(() => import('./pages/admin/AdminQuality'))
const AdminWarehouses = lazy(() => import('./pages/admin/AdminWarehouses'))
const AdminInventory = lazy(() => import('./pages/admin/AdminInventory'))
const AdminCustomers = lazy(() => import('./pages/admin/AdminCustomers'))
const AdminOrders = lazy(() => import('./pages/admin/AdminOrders'))
const AdminExportBatches = lazy(() => import('./pages/admin/AdminExportBatches'))
const AdminShipments = lazy(() => import('./pages/admin/AdminShipments'))
const AdminTraceability = lazy(() => import('./pages/admin/AdminTraceability'))
const AdminReports = lazy(() => import('./pages/admin/AdminReports'))
const AdminUsers = lazy(() => import('./pages/admin/AdminUsers'))
const AdminDocuments = lazy(() => import('./pages/admin/AdminDocumenets'))
const AdminSettings = lazy(() => import('./pages/admin/AdminSettings'))
const AdminNotifications = lazy(() => import('./pages/admin/AdminNotifications'))

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
})

interface ErrorBoundaryState {
  hasError: boolean
  error?: Error
}

class AppErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Waka Coffee App Error Boundary caught an error:')
    console.error(error)
    console.error(info)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center p-8 bg-cream-50">
          <div className="max-w-lg text-center">
            <h1 className="text-2xl font-bold text-coffee-950 mb-3">Something went wrong</h1>
            <p className="text-coffee-600 mb-6">
              {this.state.error?.message || 'An unexpected error occurred.'}
            </p>
            <button
              type="button"
              className="px-5 py-2.5 bg-primary-600 text-white rounded-xl"
              onClick={() => window.location.reload()}
            >
              Reload
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

function RouteFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-stone-100">
      <div className="text-sm text-stone-600">Loading…</div>
    </div>
  )
}

function PublicShell({ children }: { children: ReactNode }) {
  return <Layout>{children}</Layout>
}

function AdminShell({
  children,
  allowedRoles = ADMIN_ROLES,
  module,
}: {
  children: ReactNode
  allowedRoles?: AppRole[]
  module?: AdminModule
}) {
  return (
    <ProtectedRoute allowedRoles={allowedRoles} module={module}>
      <AdminLayout>{children}</AdminLayout>
    </ProtectedRoute>
  )
}

function App() {
  return (
    <AppErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <Router>
            <Suspense fallback={<RouteFallback />}>
            <Routes>
              {/* Public Routes */}
              <Route
                path="/"
                element={
                  <PublicShell>
                    <Home />
                  </PublicShell>
                }
              />
              <Route
                path="/about"
                element={
                  <PublicShell>
                    <About />
                  </PublicShell>
                }
              />
              <Route
                path="/products"
                element={
                  <PublicShell>
                    <Products />
                  </PublicShell>
                }
              />
              <Route
                path="/products/:slug"
                element={
                  <PublicShell>
                    <ProductDetail />
                  </PublicShell>
                }
              />
              <Route
                path="/origins"
                element={
                  <PublicShell>
                    <CoffeeOrigins />
                  </PublicShell>
                }
              />
              <Route
                path="/export-process"
                element={
                  <PublicShell>
                    <ExportProcess />
                  </PublicShell>
                }
              />
              <Route
                path="/services"
                element={
                  <PublicShell>
                    <Services />
                  </PublicShell>
                }
              />
              <Route
                path="/quality"
                element={
                  <PublicShell>
                    <Quality />
                  </PublicShell>
                }
              />
              <Route
                path="/certificates"
                element={
                  <PublicShell>
                    <Certificates />
                  </PublicShell>
                }
              />
              <Route
                path="/blog"
                element={
                  <PublicShell>
                    <Blog />
                  </PublicShell>
                }
              />
              <Route
                path="/blog/:slug"
                element={
                  <PublicShell>
                    <BlogDetail />
                  </PublicShell>
                }
              />
              <Route
                path="/faq"
                element={
                  <PublicShell>
                    <FAQ />
                  </PublicShell>
                }
              />
              <Route
                path="/contact"
                element={
                  <PublicShell>
                    <Contact />
                  </PublicShell>
                }
              />
              <Route
                path="/request-quote"
                element={
                  <PublicShell>
                    <RequestQuote />
                  </PublicShell>
                }
              />
              <Route
                path="/request-sample"
                element={
                  <PublicShell>
                    <RequestSample />
                  </PublicShell>
                }
              />
              <Route
                path="/privacy"
                element={
                  <PublicShell>
                    <Privacy />
                  </PublicShell>
                }
              />
              <Route
                path="/terms"
                element={
                  <PublicShell>
                    <Terms />
                  </PublicShell>
                }
              />

              {/* Authentication */}
              <Route path="/admin/login" element={<AdminLogin />} />
              <Route path="/admin/reset-password" element={<AdminResetPassword />} />

              {/* Admin Routes - Strictly Gated by Module Permission */}
              <Route
                path="/admin"
                element={
                  <AdminShell module="dashboard">
                    <AdminDashboard />
                  </AdminShell>
                }
              />
              <Route
                path="/admin/notifications"
                element={
                  <AdminShell module="notifications">
                    <AdminNotifications />
                  </AdminShell>
                }
              />
              <Route
                path="/admin/products"
                element={
                  <AdminShell module="products">
                    <AdminProducts />
                  </AdminShell>
                }
              />
              <Route
                path="/admin/contact-messages"
                element={
                  <AdminShell module="contact_messages">
                    <AdminContacts />
                  </AdminShell>
                }
              />
              <Route
                path="/admin/quote-requests"
                element={
                  <AdminShell module="quote_requests">
                    <AdminQuoteRequests />
                  </AdminShell>
                }
              />
              <Route
                path="/admin/sample-requests"
                element={
                  <AdminShell module="sample_requests">
                    <AdminSampleRequests />
                  </AdminShell>
                }
              />
              <Route
                path="/admin/customers"
                element={
                  <AdminShell module="customers">
                    <AdminCustomers />
                  </AdminShell>
                }
              />
              <Route
                path="/admin/orders"
                element={
                  <AdminShell module="orders">
                    <AdminOrders />
                  </AdminShell>
                }
              />
              <Route
                path="/admin/export-batches"
                element={
                  <AdminShell module="export_batches">
                    <AdminExportBatches />
                  </AdminShell>
                }
              />
              <Route
                path="/admin/shipments"
                element={
                  <AdminShell module="shipments">
                    <AdminShipments />
                  </AdminShell>
                }
              />
              <Route
                path="/admin/documents"
                element={
                  <AdminShell module="documents">
                    <AdminDocuments />
                  </AdminShell>
                }
              />
              <Route
                path="/admin/farmers"
                element={
                  <AdminShell module="farmers">
                    <AdminFarmers />
                  </AdminShell>
                }
              />
              <Route
                path="/admin/suppliers"
                element={
                  <AdminShell module="suppliers">
                    <AdminSuppliers />
                  </AdminShell>
                }
              />
              <Route
                path="/admin/locations"
                element={
                  <AdminShell module="locations">
                    <AdminLocations />
                  </AdminShell>
                }
              />
              <Route
                path="/admin/collection"
                element={
                  <AdminShell module="collection">
                    <AdminCollactions />
                  </AdminShell>
                }
              />
              <Route
                path="/admin/lots"
                element={
                  <AdminShell module="lots">
                    <AdminCoffeeLots />
                  </AdminShell>
                }
              />
              <Route
                path="/admin/quality"
                element={
                  <AdminShell module="quality">
                    <AdminQuality />
                  </AdminShell>
                }
              />
              <Route
                path="/admin/warehouses"
                element={
                  <AdminShell module="warehouses">
                    <AdminWarehouses />
                  </AdminShell>
                }
              />
              <Route
                path="/admin/inventory"
                element={
                  <AdminShell module="inventory">
                    <AdminInventory />
                  </AdminShell>
                }
              />
              <Route
                path="/admin/traceability"
                element={
                  <AdminShell module="traceability">
                    <AdminTraceability />
                  </AdminShell>
                }
              />
              <Route
                path="/admin/reports"
                element={
                  <AdminShell module="reports">
                    <AdminReports />
                  </AdminShell>
                }
              />
              <Route
                path="/admin/users"
                element={
                  <AdminShell module="users">
                    <AdminUsers />
                  </AdminShell>
                }
              />
              <Route
                path="/admin/settings"
                element={
                  <AdminShell module="settings">
                    <AdminSettings />
                  </AdminShell>
                }
              />
            </Routes>
            </Suspense>
          </Router>
        </AuthProvider>
      </QueryClientProvider>
    </AppErrorBoundary>
  )
}

export default App

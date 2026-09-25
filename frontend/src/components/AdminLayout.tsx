import { ReactNode, useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { qk, useUnreadCount } from '../queries/admin'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { canAccessModule, roleLabel, type AdminModule } from '../lib/permissions'
import { supabase } from '../lib/supabase'
import {
  Archive,
  ArrowLeft,
  Bell,
  Boxes,
  ChartColumn,
  Coffee,
  Container,
  FileText,
  Files,
  FlaskConical,
  LayoutDashboard,
  LogOut,
  Mail,
  MapPin,
  Package,
  Route,
  Settings,
  ShieldCheck,
  Ship,
  ShoppingCart,
  Sprout,
  Truck,
  UserCog,
  Users,
  Warehouse,
  type LucideIcon,
} from 'lucide-react'
import LogoImg from '../../images/logo.png'

type NavLinkItem = {
  to: string
  label: string
  icon: LucideIcon
  module: AdminModule
  end?: boolean
}

type NavSection = {
  title: string
  items: NavLinkItem[]
}

const NAV_SECTIONS: NavSection[] = [
  {
    title: 'Overview',
    items: [
      { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, module: 'dashboard', end: true },
      { to: '/admin/notifications', label: 'Notifications', icon: Bell, module: 'notifications' },
    ],
  },
  {
    title: 'Catalog',
    items: [{ to: '/admin/products', label: 'Products', icon: Package, module: 'products' }],
  },
  {
    title: 'Sourcing',
    items: [
      { to: '/admin/suppliers', label: 'Suppliers', icon: Truck, module: 'suppliers' },
      { to: '/admin/farmers', label: 'Farmers', icon: Sprout, module: 'farmers' },
      { to: '/admin/locations', label: 'Farms & Locations', icon: MapPin, module: 'locations' },
      { to: '/admin/collection', label: 'Coffee Collection', icon: Coffee, module: 'collection' },
    ],
  },
  {
    title: 'Coffee Operations',
    items: [
      { to: '/admin/lots', label: 'Coffee Lots', icon: Boxes, module: 'lots' },
      { to: '/admin/quality', label: 'Quality Control', icon: ShieldCheck, module: 'quality' },
      { to: '/admin/warehouses', label: 'Warehouses', icon: Warehouse, module: 'warehouses' },
      { to: '/admin/inventory', label: 'Inventory', icon: Archive, module: 'inventory' },
    ],
  },
  {
    title: 'Sales',
    items: [
      { to: '/admin/customers', label: 'Customers', icon: Users, module: 'customers' },
      { to: '/admin/quote-requests', label: 'Quote Requests', icon: FileText, module: 'quote_requests' },
      { to: '/admin/sample-requests', label: 'Sample Requests', icon: FlaskConical, module: 'sample_requests' },
      { to: '/admin/contact-messages', label: 'Contact Messages', icon: Mail, module: 'contact_messages' },
      { to: '/admin/orders', label: 'Orders', icon: ShoppingCart, module: 'orders' },
    ],
  },
  {
    title: 'Export',
    items: [
      { to: '/admin/export-batches', label: 'Export Batches', icon: Container, module: 'export_batches' },
      { to: '/admin/shipments', label: 'Shipments', icon: Ship, module: 'shipments' },
      { to: '/admin/documents', label: 'Documents', icon: Files, module: 'documents' },
    ],
  },
  {
    title: 'Traceability',
    items: [{ to: '/admin/traceability', label: 'Traceability', icon: Route, module: 'traceability' }],
  },
  {
    title: 'Analytics',
    items: [{ to: '/admin/reports', label: 'Reports', icon: ChartColumn, module: 'reports' }],
  },
  {
    title: 'System',
    items: [
      { to: '/admin/users', label: 'Users', icon: UserCog, module: 'users' },
      { to: '/admin/settings', label: 'Settings', icon: Settings, module: 'settings' },
    ],
  },
]

type Props = {
  children: ReactNode
}

const AdminLayout = ({ children }: Props) => {
  const { user, profile, role, signOut } = useAuth()
  const navigate = useNavigate()
  const [mobileOpen, setMobileOpen] = useState(false)
  const queryClient = useQueryClient()
  const { data: unread } = useUnreadCount()
  const unreadCount = unread?.unread ?? 0

  // Live updates: a new or changed notification for this user refreshes the
  // badge and any open notification list (RLS limits events to own rows).
  useEffect(() => {
    if (!user?.id) return
    const channel = supabase
      .channel(`user-notifications-${user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` },
        () => {
          void queryClient.invalidateQueries({ queryKey: qk.notifications })
          void queryClient.invalidateQueries({ queryKey: qk.dashboard })
        }
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [user?.id, queryClient])

  const handleSignOut = async () => {
    await signOut()
    navigate('/admin/login', { replace: true })
  }

  const navContent = (
    <>
      <div className="px-5 py-5 border-b border-white/10">
        <Link to="/admin" className="flex items-center gap-3" onClick={() => setMobileOpen(false)}>
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/5 ring-1 ring-white/10">
            <img src={LogoImg} alt="Waka Coffee" className="h-8 w-8 object-contain" />
          </div>
          <div className="min-w-0">
            <p className="font-serif text-lg font-bold leading-tight text-white">Waka Coffee</p>
            <p className="font-sans text-[10px] font-semibold uppercase tracking-[0.25em] text-primary-400">
              Admin
            </p>
          </div>
        </Link>
      </div>

      <nav className="flex-1 px-3 py-5 space-y-6 overflow-y-auto font-sans">
        {NAV_SECTIONS.map((section) => {
          const allowedItems = section.items.filter((item) =>
            canAccessModule(role, item.module)
          )

          if (allowedItems.length === 0) return null

          return (
            <div key={section.title}>
              <p className="px-3 mb-2 font-sans text-[10px] font-semibold uppercase tracking-[0.18em] text-coffee-300/70">
                {section.title}
              </p>
              <div className="space-y-0.5">
                {allowedItems.map((item) => {
                  const Icon = item.icon
                  return (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end={item.end}
                      onClick={() => setMobileOpen(false)}
                      className={({ isActive }) =>
                        [
                          'group relative flex items-center gap-3 rounded-lg px-3 py-2 font-sans text-sm transition-colors',
                          isActive
                            ? 'bg-primary-600/20 text-white font-semibold ring-1 ring-primary-500/30'
                            : 'text-coffee-100/80 hover:bg-white/5 hover:text-white',
                        ].join(' ')
                      }
                    >
                      {({ isActive }) => (
                        <>
                          {isActive && (
                            <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-primary-400" />
                          )}
                          <Icon
                            className={[
                              'h-4 w-4 shrink-0 transition-colors',
                              isActive
                                ? 'text-primary-400'
                                : 'text-coffee-300/70 group-hover:text-primary-400',
                            ].join(' ')}
                          />
                          <span className="truncate">{item.label}</span>
                        </>
                      )}
                    </NavLink>
                  )
                })}
              </div>
            </div>
          )
        })}
      </nav>

      <div className="px-4 py-4 border-t border-white/10 space-y-3 font-sans">
        <div className="flex items-center gap-3 rounded-xl bg-white/5 px-3 py-2.5 ring-1 ring-white/10">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-600 font-sans text-sm font-bold uppercase text-white">
            {(profile?.full_name || profile?.email || 'S').charAt(0)}
          </div>
          <div className="min-w-0">
            <p className="font-sans text-sm font-semibold text-white truncate">
              {profile?.full_name || profile?.email || 'Staff user'}
            </p>
            <p className="font-sans text-[10px] font-semibold text-primary-400 mt-0.5 uppercase tracking-wider truncate">
              {roleLabel(role)}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleSignOut}
          className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left font-sans text-sm text-coffee-100/80 hover:bg-red-500/10 hover:text-red-300 transition-colors"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </button>
        <Link
          to="/"
          className="flex items-center gap-2 px-3 font-sans text-xs text-coffee-300/70 hover:text-white transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Public site
        </Link>
      </div>
    </>
  )

  return (
    <div className="min-h-screen flex bg-stone-100 text-stone-900">
      <aside className="hidden md:flex w-64 shrink-0 bg-[#2b1a0f] text-white flex-col md:sticky md:top-0 md:h-screen">
        {navContent}
      </aside>

      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-40">
          <button
            type="button"
            aria-label="Close menu"
            className="absolute inset-0 bg-black/40"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 w-72 bg-[#2b1a0f] text-white flex flex-col shadow-xl">
            {navContent}
          </aside>
        </div>
      )}

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="h-14 border-b border-stone-200 bg-white px-4 md:px-6 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="md:hidden px-2 py-1 border border-stone-300 text-sm"
              onClick={() => setMobileOpen(true)}
              aria-label="Open menu"
            >
              Menu
            </button>
            <p className="text-sm text-stone-500">Internal management</p>
          </div>

          <div className="flex items-center gap-3">
            <Link
              to="/admin/notifications"
              className="relative p-2 text-stone-600 hover:text-stone-900 transition-colors flex items-center gap-1.5 rounded-lg hover:bg-stone-100"
              title="Notifications"
            >
              <span className="text-lg" role="img" aria-label="Notifications">
                🔔
              </span>
              {unreadCount > 0 ? (
                <span className="inline-flex items-center justify-center px-2 py-0.5 text-xs font-bold leading-none text-white bg-red-600 rounded-full">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              ) : (
                <span className="text-xs text-stone-500 font-medium">0</span>
              )}
            </Link>
          </div>
        </header>
        <main className="flex-1 p-4 md:p-8 overflow-auto">{children}</main>
      </div>
    </div>
  )
}

export default AdminLayout

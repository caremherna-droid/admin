import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { 
  LayoutDashboard, 
  Users, 
  FileText, 
  Video, 
  LogOut,
  Menu,
  X,
  DollarSign,
  User
} from 'lucide-react'
import { useAuth } from '../store/auth'

const menuItems = [
  { icon: LayoutDashboard, label: 'Dashboard', href: '/' },
  { icon: Users, label: 'Users', href: '/users' },
  { icon: FileText, label: 'Reports', href: '/reports' },
  { icon: Video, label: 'Live Sessions', href: '/sessions' },
  { icon: DollarSign, label: 'Earnings Report', href: '/reports/earnings' },
  { icon: User, label: 'Profile', href: '/profile' },
]

export default function Sidebar() {
  const [isOpen, setIsOpen] = useState(true)
  const [isMobileOpen, setIsMobileOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const router = useRouter()
  const auth = useAuth()

  useEffect(() => {
    setMounted(true)
  }, [])

  const handleLogout = () => {
    auth.logout()
    router.push('/login')
  }

  if (!mounted) {
    return (
      <aside className="fixed top-0 left-0 h-full w-64 bg-white border-r border-gray-200 z-40">
        <div className="p-4 border-b border-gray-200">
          <div className="h-6 w-32 bg-gray-200 rounded animate-pulse"></div>
        </div>
      </aside>
    )
  }

  return (
    <>
      {/* Mobile menu button */}
      <button
        className="lg:hidden fixed top-4 left-4 z-50 p-2 bg-white rounded-md shadow-md"
        onClick={() => setIsMobileOpen(!isMobileOpen)}
      >
        {isMobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
      </button>

      {/* Sidebar */}
      <aside
        className={`
          fixed top-0 left-0 h-full bg-white border-r border-gray-200 z-40
          transition-all duration-300 ease-in-out
          ${isOpen ? 'w-64' : 'w-20'}
          ${isMobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}
      >
        <div className="flex flex-col h-full">
          {/* Logo/Header */}
          <div className="p-4 border-b border-gray-200 flex items-center justify-between">
            {isOpen && (
              <h1 className="text-xl font-bold text-blue-600">Admin Panel</h1>
            )}
            <button
              onClick={() => setIsOpen(!isOpen)}
              className="hidden lg:block p-2 hover:bg-gray-100 rounded-md transition-colors"
            >
              <Menu className="h-5 w-5" />
            </button>
          </div>

          {/* Menu Items */}
          <nav className="flex-1 p-4 space-y-2">
            {menuItems.map((item) => {
              const Icon = item.icon
              const isActive = router.pathname === item.href
              
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setIsMobileOpen(false)}
                  className={`
                    flex items-center gap-3 p-3 rounded-lg transition-all duration-200
                    ${isActive 
                      ? 'bg-blue-50 text-blue-600 font-semibold' 
                      : 'text-gray-700 hover:bg-gray-50'
                    }
                    group
                  `}
                >
                  <Icon className={`
                    h-5 w-5 flex-shrink-0
                    transition-transform duration-200
                    ${isActive ? 'scale-110' : 'group-hover:scale-110'}
                  `} />
                  {isOpen && (
                    <span className="animate-fade-in">{item.label}</span>
                  )}
                </Link>
              )
            })}
          </nav>

          {/* User Info & Logout */}
          <div className="p-4 border-t border-gray-200">
            {isOpen && (
              <div className="mb-3">
                <p className="text-sm font-semibold text-gray-700">{auth.user?.username}</p>
                <p className="text-xs text-gray-500">Administrator</p>
              </div>
            )}
            <button
              onClick={handleLogout}
              className={`
                flex items-center gap-3 p-3 rounded-lg w-full
                text-red-600 hover:bg-red-50 transition-colors
              `}
            >
              <LogOut className="h-5 w-5 flex-shrink-0" />
              {isOpen && <span>Logout</span>}
            </button>
          </div>
        </div>
      </aside>

      {/* Overlay for mobile */}
      {isMobileOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black bg-opacity-50 z-30"
          onClick={() => setIsMobileOpen(false)}
        />
      )}

      {/* Main content spacer */}
      <div className={`
        transition-all duration-300
        ${isOpen ? 'lg:ml-64' : 'lg:ml-20'}
      `} />
    </>
  )
}


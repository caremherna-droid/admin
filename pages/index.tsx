import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import Link from 'next/link'
import { useAuth } from '../store/auth'
import api from '../lib/api'
import { Card, CardContent, CardHeader } from '../components/ui/card'
import { Users, DollarSign, Video, AlertCircle, TrendingUp } from 'lucide-react'
import Sidebar from '../components/Sidebar'
import { getSocket, disconnectSocket } from '../lib/socket'

export default function Dashboard() {
  const auth = useAuth()
  const router = useRouter()
  const [stats, setStats] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!mounted) return
    
    if (!auth.token || auth.user?.role !== 'ADMIN') {
      router.push('/login')
      return
    }

    const loadStats = () => {
      api.get('/admin/dashboard/stats')
        .then(({ data }) => setStats(data))
        .catch(console.error)
        .finally(() => setLoading(false))
    }

    loadStats()

    // Set up socket for real-time updates
    const socket = getSocket(auth.token!)
    
    socket.on('admin:stats_update', (data) => {
      setStats((prev: any) => ({
        ...prev,
        ...data
      }))
    })

    socket.on('admin:new_report', () => {
      loadStats() // Reload to get updated report count
    })

    socket.on('admin:new_session', () => {
      loadStats() // Reload to get updated session count
    })

    socket.on('admin:session_ended', () => {
      loadStats() // Reload to get updated session count
    })

    return () => {
      socket.off('admin:stats_update')
      socket.off('admin:new_report')
      socket.off('admin:new_session')
      socket.off('admin:session_ended')
    }
  }, [mounted, auth.token, auth.user, router])

  if (!mounted || loading || !stats) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Sidebar />
        <main className="lg:ml-64 ml-0 px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex items-center justify-center min-h-[400px]">
            <div className="text-gray-500">Loading...</div>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Sidebar />
      <main className="lg:ml-64 ml-0 px-4 sm:px-6 lg:px-8 py-8">
        <h2 className="text-2xl font-bold mb-6">Dashboard</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Total Users</p>
                  <p className="text-2xl font-bold">{stats.users.total}</p>
                  <p className="text-xs text-gray-500 mt-1">+{stats.users.newLast24h} in last 24h</p>
                </div>
                <Users className="h-8 w-8 text-blue-600" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Creators</p>
                  <p className="text-2xl font-bold">{stats.users.creators}</p>
                  <p className="text-xs text-gray-500 mt-1">{stats.users.pendingApplications} pending</p>
                </div>
                <TrendingUp className="h-8 w-8 text-green-600" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Platform Earnings</p>
                  <p className="text-2xl font-bold">{stats.earnings.platform.toFixed(2)}</p>
                  <p className="text-xs text-gray-500 mt-1">tokens</p>
                </div>
                <DollarSign className="h-8 w-8 text-yellow-600" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Active Sessions</p>
                  <p className="text-2xl font-bold">{stats.sessions.active}</p>
                  <p className="text-xs text-gray-500 mt-1">{stats.sessions.newLast24h} new today</p>
                </div>
                <Video className="h-8 w-8 text-purple-600" />
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <Card>
            <CardHeader>
              <h3 className="font-semibold">Pending Reports</h3>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <span className="text-3xl font-bold">{stats.reports.pending}</span>
                <Link href="/reports">
                  <button className="text-blue-600 hover:text-blue-700 text-sm">View All →</button>
                </Link>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <h3 className="font-semibold">System Stats</h3>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Total Tokens in System</span>
                <span className="font-semibold">{stats.earnings.totalTokensInSystem}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Total Sessions</span>
                <span className="font-semibold">{stats.sessions.total}</span>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <h3 className="font-semibold">Stream Statistics</h3>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center">
                <p className="text-2xl font-bold text-blue-600">{stats.sessions?.daily || 0}</p>
                <p className="text-sm text-gray-600 mt-1">Daily</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-green-600">{stats.sessions?.weekly || 0}</p>
                <p className="text-sm text-gray-600 mt-1">Weekly</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-purple-600">{stats.sessions?.monthly || 0}</p>
                <p className="text-sm text-gray-600 mt-1">Monthly</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-orange-600">{stats.sessions?.yearly || 0}</p>
                <p className="text-sm text-gray-600 mt-1">Yearly</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}


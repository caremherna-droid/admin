import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { useAuth } from '../../store/auth'
import api from '../../lib/api'
import { Card, CardContent, CardHeader } from '../../components/ui/card'
import Sidebar from '../../components/Sidebar'
import { ArrowLeft, DollarSign, Users, Video, FileText } from 'lucide-react'
import Link from 'next/link'

export default function UserStatsPage() {
  const auth = useAuth()
  const router = useRouter()
  const { userId } = router.query
  const [userData, setUserData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!auth.token || auth.user?.role !== 'ADMIN') {
      router.push('/login')
      return
    }

    if (userId) {
      loadUserStats()
    }
  }, [auth.token, auth.user, router, userId])

  async function loadUserStats() {
    setLoading(true)
    try {
      const { data } = await api.get(`/admin/users/${userId}`)
      setUserData(data)
    } catch (error) {
      console.error('Failed to load user stats:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading || !userData) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-500">Loading...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Sidebar />
      <main className="lg:ml-64 ml-0 px-4 sm:px-6 lg:px-8 py-8">
        <Link href="/users" className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-700 mb-4">
          <ArrowLeft className="h-4 w-4" />
          Back to Users
        </Link>

        <h2 className="text-2xl font-bold mb-6">User Statistics: {userData.user.username}</h2>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Balance</p>
                  <p className="text-2xl font-bold">{userData.stats.walletBalance}</p>
                </div>
                <DollarSign className="h-8 w-8 text-green-600" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Total Earnings</p>
                  <p className="text-2xl font-bold">{userData.stats.totalEarnings || 0}</p>
                </div>
                <DollarSign className="h-8 w-8 text-yellow-600" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Sessions</p>
                  <p className="text-2xl font-bold">{userData.stats.sessions}</p>
                </div>
                <Video className="h-8 w-8 text-purple-600" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Posts</p>
                  <p className="text-2xl font-bold">{userData.stats.posts}</p>
                </div>
                <FileText className="h-8 w-8 text-blue-600" />
              </div>
            </CardContent>
          </Card>
        </div>

        {userData.stats.sessionsWithDetails && userData.stats.sessionsWithDetails.length > 0 && (
          <Card className="mb-8">
            <CardHeader>
              <h3 className="font-semibold">Session Details</h3>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-2">Date</th>
                      <th className="text-left p-2">Type</th>
                      <th className="text-left p-2">Viewers</th>
                      <th className="text-left p-2">Earnings</th>
                      <th className="text-left p-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {userData.stats.sessionsWithDetails.map((session: any) => (
                      <tr key={session.id} className="border-b">
                        <td className="p-2">{new Date(session.createdAt).toLocaleDateString()}</td>
                        <td className="p-2">{session.isPrivate ? 'Private' : 'Public'}</td>
                        <td className="p-2">{session.uniqueViewers || session.viewerCount}</td>
                        <td className="p-2">{session.earnings} tokens</td>
                        <td className="p-2">{session.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <h3 className="font-semibold">Recent Transactions</h3>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {userData.stats.recentTransactions.map((tx: any) => (
                <div key={tx.id} className="flex justify-between items-center p-2 border rounded">
                  <div>
                    <p className="text-sm font-medium">{tx.note || tx.type}</p>
                    <p className="text-xs text-gray-500">{new Date(tx.createdAt).toLocaleString()}</p>
                  </div>
                  <p className={`font-semibold ${tx.amount > 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {tx.amount > 0 ? '+' : ''}{tx.amount}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}


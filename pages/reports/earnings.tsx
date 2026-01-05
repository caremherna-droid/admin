import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { useAuth } from '../../store/auth'
import api from '../../lib/api'
import { Card, CardContent, CardHeader } from '../../components/ui/card'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import Sidebar from '../../components/Sidebar'
import { DollarSign, ArrowUp, ArrowDown } from 'lucide-react'

export default function EarningsReportPage() {
  const auth = useAuth()
  const router = useRouter()
  const [report, setReport] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [order, setOrder] = useState<'asc' | 'desc'>('desc')
  const [userId, setUserId] = useState('')
  const [limit, setLimit] = useState('100')

  useEffect(() => {
    if (!auth.token || auth.user?.role !== 'ADMIN') {
      router.push('/login')
      return
    }

    loadReport()
  }, [auth.token, auth.user, router, order, userId, limit])

  async function loadReport() {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        order,
        limit,
        ...(userId && { userId })
      })
      const { data } = await api.get(`/admin/reports/earnings?${params}`)
      setReport(data.report || [])
    } catch (error) {
      console.error('Failed to load earnings report:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading && report.length === 0) {
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
        <h2 className="text-2xl font-bold mb-6">Earnings Report</h2>

        <Card className="mb-6">
          <CardContent className="p-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Input
                placeholder="Filter by User ID (optional)"
                value={userId}
                onChange={(e) => {
                  setUserId(e.target.value)
                  setLimit('1000') // Increase limit when filtering
                }}
              />
              <select
                className="h-10 rounded-md border border-gray-200 px-3"
                value={order}
                onChange={(e) => setOrder(e.target.value as 'asc' | 'desc')}
              >
                <option value="desc">Highest First</option>
                <option value="asc">Lowest First</option>
              </select>
              <Input
                type="number"
                placeholder="Limit"
                value={limit}
                onChange={(e) => setLimit(e.target.value)}
                min="1"
                max="1000"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h3 className="font-semibold">Earnings Report ({report.length} users)</h3>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-2">Username</th>
                    <th className="text-left p-2">Email</th>
                    <th className="text-left p-2">Role</th>
                    <th className="text-left p-2">Total Earnings</th>
                    <th className="text-left p-2">Current Balance</th>
                    <th className="text-left p-2">Earnings Count</th>
                  </tr>
                </thead>
                <tbody>
                  {report.map((entry) => (
                    <tr key={entry.userId} className="border-b">
                      <td className="p-2">{entry.username}</td>
                      <td className="p-2">{entry.email || '-'}</td>
                      <td className="p-2">{entry.role}</td>
                      <td className="p-2 font-semibold text-green-600">{entry.totalEarnings}</td>
                      <td className="p-2">{entry.currentBalance}</td>
                      <td className="p-2">{entry.earningsCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}


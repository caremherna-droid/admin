import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { useAuth } from '../store/auth'
import api from '../lib/api'
import { Card, CardContent, CardHeader } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import Sidebar from '../components/Sidebar'
import { CheckCircle, XCircle } from 'lucide-react'

export default function ReportsPage() {
  const auth = useAuth()
  const router = useRouter()
  const [reports, setReports] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('')
  const [page, setPage] = useState(1)
  const [pagination, setPagination] = useState<any>(null)

  useEffect(() => {
    if (!auth.token || auth.user?.role !== 'ADMIN') {
      router.push('/login')
      return
    }

    loadReports()
  }, [auth.token, auth.user, router, page, statusFilter])

  async function loadReports() {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '20',
        ...(statusFilter && { status: statusFilter })
      })
      const { data } = await api.get(`/admin/reports?${params}`)
      setReports(data.reports)
      setPagination(data.pagination)
    } catch (error) {
      console.error('Failed to load reports:', error)
    } finally {
      setLoading(false)
    }
  }

  async function resolveReport(reportId: string, action: 'RESOLVED' | 'DISMISSED') {
    const notes = prompt(`Notes (optional):`)
    try {
      await api.post(`/admin/reports/${reportId}/resolve`, {
        action,
        notes: notes || ''
      })
      loadReports()
    } catch (error: any) {
      alert(error?.response?.data?.error || 'Failed to resolve report')
    }
  }

  if (loading && reports.length === 0) {
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
        <h2 className="text-2xl font-bold mb-6">Reports</h2>

        <Card className="mb-6">
          <CardContent className="p-4">
            <select
              className="h-10 rounded-md border border-gray-200 px-3"
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value)
                setPage(1)
              }}
            >
              <option value="">All Status</option>
              <option value="PENDING">Pending</option>
              <option value="RESOLVED">Resolved</option>
              <option value="DISMISSED">Dismissed</option>
            </select>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h3 className="font-semibold">Reports ({pagination?.total || 0})</h3>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {reports.map((report) => (
                <div key={report.id} className="border rounded-lg p-4">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <p className="font-semibold">
                        Reported: {report.reportedUser?.username || 'Unknown'}
                      </p>
                      <p className="text-sm text-gray-600">
                        By: {report.reporter?.username || 'Unknown'}
                      </p>
                    </div>
                    <span className={`px-2 py-1 rounded text-xs ${
                      report.status === 'PENDING' ? 'bg-yellow-100 text-yellow-800' :
                      report.status === 'RESOLVED' ? 'bg-green-100 text-green-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {report.status}
                    </span>
                  </div>
                  <p className="text-sm text-gray-700 mb-2">{report.reason}</p>
                  {report.category && (
                    <p className="text-xs text-gray-500 mb-2">Category: {report.category}</p>
                  )}
                  {report.status === 'PENDING' && (
                    <div className="flex gap-2 mt-2">
                      <Button
                        size="sm"
                        onClick={() => resolveReport(report.id, 'RESOLVED')}
                      >
                        <CheckCircle className="h-4 w-4 mr-1" />
                        Resolve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => resolveReport(report.id, 'DISMISSED')}
                      >
                        <XCircle className="h-4 w-4 mr-1" />
                        Dismiss
                      </Button>
                    </div>
                  )}
                  {report.resolutionNotes && (
                    <p className="text-xs text-gray-500 mt-2">
                      Notes: {report.resolutionNotes}
                    </p>
                  )}
                </div>
              ))}
            </div>

            {pagination && (
              <div className="mt-4 flex justify-between items-center">
                <div className="text-sm text-gray-600">
                  Page {pagination.page} of {pagination.pages}
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page === 1}
                    onClick={() => setPage(page - 1)}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page === pagination.pages}
                    onClick={() => setPage(page + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  )
}


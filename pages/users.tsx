import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { useAuth } from '../store/auth'
import api from '../lib/api'
import { Card, CardContent, CardHeader } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import Sidebar from '../components/Sidebar'
import { Check, X, Ban, Unlock, Clock } from 'lucide-react'

export default function UsersPage() {
  const auth = useAuth()
  const router = useRouter()
  const [users, setUsers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [bannedFilter, setBannedFilter] = useState('')
  const [page, setPage] = useState(1)
  const [pagination, setPagination] = useState<any>(null)

  useEffect(() => {
    if (!auth.token || auth.user?.role !== 'ADMIN') {
      router.push('/login')
      return
    }

    loadUsers()
  }, [auth.token, auth.user, router, page, search, roleFilter, statusFilter, bannedFilter])

  async function loadUsers() {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '20',
        ...(search && { search }),
        ...(roleFilter && { role: roleFilter }),
        ...(statusFilter && { status: statusFilter }),
        ...(bannedFilter && { banned: bannedFilter })
      })
      const { data } = await api.get(`/admin/users?${params}`)
      setUsers(data.users)
      setPagination(data.pagination)
    } catch (error) {
      console.error('Failed to load users:', error)
    } finally {
      setLoading(false)
    }
  }

  async function approveCreator(userId: string) {
    try {
      await api.post(`/admin/users/${userId}/approve-creator`)
      loadUsers()
    } catch (error: any) {
      alert(error?.response?.data?.error || 'Failed to approve creator')
    }
  }

  async function rejectCreator(userId: string) {
    const reason = prompt('Rejection reason (optional):')
    try {
      await api.post(`/admin/users/${userId}/reject-creator`, { reason: reason || '' })
      loadUsers()
    } catch (error: any) {
      alert(error?.response?.data?.error || 'Failed to reject creator')
    }
  }

  async function banUser(userId: string) {
    const reason = prompt('Ban reason:')
    if (!reason) return
    const duration = prompt('Duration in days (leave empty for permanent):')
    try {
      await api.post(`/admin/users/${userId}/ban`, {
        reason,
        duration: duration ? parseInt(duration) : undefined
      })
      loadUsers()
    } catch (error: any) {
      alert(error?.response?.data?.error || 'Failed to ban user')
    }
  }

  async function unbanUser(userId: string) {
    try {
      await api.post(`/admin/users/${userId}/unban`)
      loadUsers()
    } catch (error: any) {
      alert(error?.response?.data?.error || 'Failed to unban user')
    }
  }

  async function suspendUser(userId: string) {
    const reason = prompt('Suspension reason:')
    if (!reason) return
    const duration = prompt('Duration in days:')
    if (!duration) return
    try {
      await api.post(`/admin/users/${userId}/suspend`, {
        reason,
        duration: parseInt(duration)
      })
      loadUsers()
    } catch (error: any) {
      alert(error?.response?.data?.error || 'Failed to suspend user')
    }
  }

  async function unsuspendUser(userId: string) {
    try {
      await api.post(`/admin/users/${userId}/unsuspend`)
      loadUsers()
    } catch (error: any) {
      alert(error?.response?.data?.error || 'Failed to unsuspend user')
    }
  }

  if (loading && users.length === 0) {
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
        <h2 className="text-2xl font-bold mb-6">User Management</h2>

        <Card className="mb-6">
          <CardContent className="p-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Input
                placeholder="Search users..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value)
                  setPage(1)
                }}
              />
              <select
                className="h-10 rounded-md border border-gray-200 px-3"
                value={roleFilter}
                onChange={(e) => {
                  setRoleFilter(e.target.value)
                  setPage(1)
                }}
              >
                <option value="">All Roles</option>
                <option value="USER">User</option>
                <option value="BROADCASTER">Broadcaster</option>
                <option value="ADMIN">Admin</option>
              </select>
              <select
                className="h-10 rounded-md border border-gray-200 px-3"
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value)
                  setPage(1)
                }}
              >
                <option value="">All Account Status</option>
                <option value="ACTIVE">Active</option>
                <option value="SUSPENDED">Suspended</option>
                <option value="BANNED">Banned</option>
              </select>
              <select
                className="h-10 rounded-md border border-gray-200 px-3"
                value={bannedFilter}
                onChange={(e) => {
                  setBannedFilter(e.target.value)
                  setPage(1)
                }}
              >
                <option value="">All Creator Status</option>
                <option value="PENDING">Pending Approval</option>
                <option value="APPROVED">Approved</option>
                <option value="REJECTED">Rejected</option>
              </select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h3 className="font-semibold">Users ({pagination?.total || 0})</h3>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-2">Username</th>
                    <th className="text-left p-2">Email</th>
                    <th className="text-left p-2">Account Type</th>
                    <th className="text-left p-2">Account Status</th>
                    <th className="text-left p-2">Creator Status</th>
                    <th className="text-left p-2">Balance</th>
                    <th className="text-left p-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr key={user.id} className="border-b">
                      <td className="p-2">{user.username}</td>
                      <td className="p-2">{user.email || '-'}</td>
                      <td className="p-2">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${
                          user.role === 'ADMIN' ? 'bg-purple-100 text-purple-700' :
                          user.role === 'BROADCASTER' ? 'bg-pink-100 text-pink-700' :
                          'bg-gray-100 text-gray-700'
                        }`}>
                          {user.role === 'ADMIN' ? 'Admin' : user.role === 'BROADCASTER' ? 'Creator' : 'User'}
                        </span>
                      </td>
                      <td className="p-2">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${
                          user.accountStatus === 'BANNED' ? 'bg-red-100 text-red-700' :
                          user.accountStatus === 'SUSPENDED' ? 'bg-orange-100 text-orange-700' :
                          'bg-green-100 text-green-700'
                        }`}>
                          {user.accountStatus || 'ACTIVE'}
                        </span>
                      </td>
                      <td className="p-2">
                        {user.creatorStatus === 'PENDING' && <span className="text-yellow-600 text-xs">Pending</span>}
                        {user.creatorStatus === 'APPROVED' && <span className="text-green-600 text-xs">Approved</span>}
                        {user.creatorStatus === 'REJECTED' && <span className="text-red-600 text-xs">Rejected</span>}
                        {!user.creatorStatus && <span className="text-gray-400 text-xs">-</span>}
                      </td>
                      <td className="p-2">{user.walletBalance || 0}</td>
                      <td className="p-2">
                        <div className="flex gap-2">
                          <Button 
                            size="sm" 
                            variant="outline"
                            onClick={() => router.push(`/users/${user.id}`)}
                          >
                            View Stats
                          </Button>
                          {user.creatorStatus === 'PENDING' && (
                            <>
                              <Button size="sm" onClick={() => approveCreator(user.id)}>
                                <Check className="h-4 w-4" />
                              </Button>
                              <Button size="sm" variant="destructive" onClick={() => rejectCreator(user.id)}>
                                <X className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                          {user.accountStatus === 'BANNED' ? (
                            <Button size="sm" variant="outline" onClick={() => unbanUser(user.id)} title="Unban">
                              <Unlock className="h-4 w-4 mr-1" />
                              Unban
                            </Button>
                          ) : user.accountStatus === 'SUSPENDED' ? (
                            <Button size="sm" variant="outline" onClick={() => unsuspendUser(user.id)} title="Unsuspend">
                              <Clock className="h-4 w-4 mr-1" />
                              Unsuspend
                            </Button>
                          ) : (
                            <>
                              <Button size="sm" variant="destructive" onClick={() => banUser(user.id)} title="Ban">
                                <Ban className="h-4 w-4 mr-1" />
                                Ban
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => suspendUser(user.id)} title="Suspend">
                                <Clock className="h-4 w-4 mr-1" />
                                Suspend
                              </Button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
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


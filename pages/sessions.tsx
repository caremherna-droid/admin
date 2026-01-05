import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { useAuth } from '../store/auth'
import api from '../lib/api'
import { Card, CardContent, CardHeader } from '../components/ui/card'
import { Button } from '../components/ui/button'
import Sidebar from '../components/Sidebar'
import { Video, LogIn, X } from 'lucide-react'
import { getSocket } from '../lib/socket'

export default function SessionsPage() {
  const auth = useAuth()
  const router = useRouter()
  const [sessions, setSessions] = useState<any[]>([])
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

    loadSessions()

    // Set up socket for real-time updates
    const socket = getSocket(auth.token!)
    
    socket.on('admin:new_session', (session) => {
      setSessions((prev) => {
        // Check if session already exists
        if (prev.find(s => s.id === session.id)) return prev
        return [...prev, session]
      })
    })

    socket.on('admin:session_ended', ({ sessionId }) => {
      setSessions((prev) => prev.filter(s => s.id !== sessionId))
    })

    socket.on('admin:session_updated', (session) => {
      setSessions((prev) => 
        prev.map(s => s.id === session.id ? { ...s, ...session } : s)
      )
    })

    // Still poll every 10 seconds as backup
    const interval = setInterval(loadSessions, 10000)
    
    return () => {
      clearInterval(interval)
      socket.off('admin:new_session')
      socket.off('admin:session_ended')
      socket.off('admin:session_updated')
    }
  }, [mounted, auth.token, auth.user, router])

  async function loadSessions() {
    try {
      const { data } = await api.get('/admin/sessions/live')
      setSessions(data.sessions)
    } catch (error) {
      console.error('Failed to load sessions:', error)
    } finally {
      setLoading(false)
    }
  }

  async function joinSession(sessionId: string) {
    try {
      // First join via API to register as admin viewer
      await api.post(`/admin/sessions/${sessionId}/join`)
      // Then navigate to admin live page
      router.push(`/live?sessionId=${sessionId}`)
    } catch (error: any) {
      alert(error?.response?.data?.error || 'Failed to join session')
    }
  }

  async function endSession(sessionId: string) {
    if (!confirm('Are you sure you want to end this session?')) return
    try {
      await api.post(`/admin/sessions/${sessionId}/end`)
      loadSessions()
    } catch (error: any) {
      alert(error?.response?.data?.error || 'Failed to end session')
    }
  }

  if (!mounted || (loading && sessions.length === 0)) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Sidebar />
        <main className="lg:ml-64 ml-0 px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex items-center justify-center min-h-screen">
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
        <h2 className="text-2xl font-bold mb-6">Live Sessions</h2>

        <Card>
          <CardHeader>
            <h3 className="font-semibold">Active Sessions ({sessions.length})</h3>
          </CardHeader>
          <CardContent>
            {sessions.length === 0 ? (
              <p className="text-gray-500 text-center py-8">No active sessions</p>
            ) : (
              <div className="space-y-4">
                {sessions.map((session) => (
                  <div key={session.id} className="border rounded-lg p-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-semibold">
                          {session.broadcaster?.username || 'Unknown'}
                        </p>
                        <p className="text-sm text-gray-600">
                          Rate: {session.ratePerSecond * 60} tokens/min
                        </p>
                        <p className="text-sm text-gray-600">
                          Viewers: {session.viewerCount}
                        </p>
                        <p className="text-sm text-gray-600">
                          {session.isPrivate ? 'Private' : 'Public'} Session
                        </p>
                      </div>
                      <div className="flex items-center text-green-600">
                        <Video className="h-5 w-5 mr-2" />
                        <span className="text-sm font-semibold">LIVE</span>
                      </div>
                    </div>
                    <div className="flex gap-2 mt-4">
                      <Button
                        size="sm"
                        onClick={() => joinSession(session.id)}
                        className="flex items-center gap-2"
                      >
                        <LogIn className="h-4 w-4" />
                        Join as Moderator
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => endSession(session.id)}
                        className="flex items-center gap-2"
                      >
                        <X className="h-4 w-4" />
                        End Session
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  )
}


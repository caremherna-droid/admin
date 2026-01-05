import { useState } from 'react'
import { useRouter } from 'next/router'
import { useAuth } from '../store/auth'
import api from '../lib/api'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Card, CardContent, CardHeader } from '../components/ui/card'

export default function LoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const auth = useAuth()
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const { data } = await api.post('/auth/login', { identifier: username, password })
      
      if (data.user.role !== 'ADMIN') {
        setError('Access denied. Admin privileges required.')
        return
      }

      auth.setAuth(data.token, {
        id: data.user.id,
        username: data.user.username,
        role: data.user.role
      })
      
      router.push('/')
    } catch (e: any) {
      // Handle error - could be string or object
      let errorMessage = 'Login failed'
      if (e?.response?.data?.error) {
        if (typeof e.response.data.error === 'string') {
          errorMessage = e.response.data.error
        } else if (e.response.data.error?.formErrors) {
          errorMessage = e.response.data.error.formErrors.join(', ')
        } else if (e.response.data.error?.fieldErrors) {
          const fieldErrors = Object.values(e.response.data.error.fieldErrors).flat()
          errorMessage = fieldErrors.join(', ')
        }
      }
      setError(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <Card className="w-full max-w-md">
        <CardHeader>
          <h1 className="text-2xl font-bold text-center">Admin Login</h1>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-md text-sm">
                {error}
              </div>
            )}
            <div>
              <label className="block text-sm font-medium mb-1">Username</label>
              <Input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                autoFocus
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Password</label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Logging in...' : 'Login'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}


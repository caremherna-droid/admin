import type { AppProps } from 'next/app'
import '../styles/globals.css'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { useAuth } from '../store/auth'
import api from '../lib/api'

export default function App({ Component, pageProps }: AppProps) {
  const router = useRouter()
  const auth = useAuth()
  const [mounted, setMounted] = useState(false)
  const [loadingAuth, setLoadingAuth] = useState(true)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!mounted) return

    // Check if user is authenticated and is admin
    if (auth.token && !auth.user) {
      // Restore user from token
      setLoadingAuth(true)
      api.get('/auth/me')
        .then(({ data }) => {
          if (data.user.role === 'ADMIN') {
            auth.setAuth(auth.token!, {
              id: data.user.id,
              username: data.user.username,
              role: data.user.role
            })
          } else {
            auth.logout()
            if (router.pathname !== '/login') {
              router.push('/login')
            }
          }
        })
        .catch(() => {
          // Token is invalid or expired
          auth.logout()
          if (router.pathname !== '/login') {
            router.push('/login')
          }
        })
        .finally(() => {
          setLoadingAuth(false)
        })
    } else {
      setLoadingAuth(false)
      
      // Only redirect if we're not loading auth and conditions are met
      if (!auth.token && router.pathname !== '/login') {
        router.push('/login')
      } else if (auth.user && auth.user.role !== 'ADMIN' && router.pathname !== '/login') {
        router.push('/login')
      }
    }
  }, [mounted, auth.token, auth.user, router])

  // Show loading state during initial mount or auth restoration
  if (!mounted || loadingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-gray-500">Loading...</div>
      </div>
    )
  }

  // Don't render protected pages if not authenticated (only after mount and auth check)
  if (!auth.token && router.pathname !== '/login') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-gray-500">Redirecting...</div>
      </div>
    )
  }

  if (auth.user && auth.user.role !== 'ADMIN' && router.pathname !== '/login') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-gray-500">Redirecting...</div>
      </div>
    )
  }

  return <Component {...pageProps} />
}


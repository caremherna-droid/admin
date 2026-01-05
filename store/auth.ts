import { create } from 'zustand'

export type User = { id: string; username: string; email?: string; role: 'USER'|'ADMIN'|'BROADCASTER' }

type AuthState = {
  token: string | null
  user: User | null
  setAuth: (token: string, user: User) => void
  logout: () => void
}

export const useAuth = create<AuthState>((set) => ({
  token: typeof window !== 'undefined' ? localStorage.getItem('admin_token') : null,
  user: null,
  setAuth: (token, user) => {
    if (typeof window !== 'undefined') localStorage.setItem('admin_token', token)
    set({ token, user })
  },
  logout: () => {
    if (typeof window !== 'undefined') localStorage.removeItem('admin_token')
    set({ token: null, user: null })
  }
}))


import { create } from 'zustand'
import { User, LoginResponse } from '../types'

interface AuthStore {
  token: string | null
  user: User | null
  isLoading: boolean
  error: string | null

  // Actions
  setAuth: (data: LoginResponse) => void
  logout: () => void
  loadFromStorage: () => void
  saveToStorage: (data: LoginResponse) => void
  setError: (error: string | null) => void
  setLoading: (loading: boolean) => void
}

const STORAGE_KEY = 'docker-platform-auth'

export const useAuthStore = create<AuthStore>((set) => ({
  token: null,
  user: null,
  isLoading: false,
  error: null,

  setAuth: (data) => {
    set({
      token: data.token,
      user: data.user,
      error: null,
    })
  },

  logout: () => {
    set({
      token: null,
      user: null,
      error: null,
    })
    localStorage.removeItem(STORAGE_KEY)
  },

  loadFromStorage: () => {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      try {
        const { token, user } = JSON.parse(stored)
        set({ token, user })
      } catch {
        localStorage.removeItem(STORAGE_KEY)
      }
    }
  },

  saveToStorage: (data) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      token: data.token,
      user: data.user,
    }))
  },

  setError: (error) => set({ error }),
  setLoading: (loading) => set({ isLoading: loading }),
}))

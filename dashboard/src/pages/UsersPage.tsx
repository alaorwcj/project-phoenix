import { useEffect, useState } from 'react'
import type { User } from '../types'
import { Users as UsersIcon, Shield, User as UserIcon } from 'lucide-react'

export function UsersPage() {
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Users endpoint — only admins can access
    const load = async () => {
      try {
        const { default: api } = await import('../lib/api')
        const base = import.meta.env.VITE_API_URL || ''
        const res = await fetch(`${base}/api/v1/users`, {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('docker-platform-auth')?.replace(/"/g, '')}`,
          },
        })
        if (res.ok) {
          const data = await res.json()
          setUsers(data.data ?? [])
        }
      } catch {
        // API may not be running or user not admin
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const roleBadge = (role: string) => {
    const isAdmin = role === 'ADMIN'
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
        isAdmin ? 'bg-purple-50 text-purple-700' : 'bg-indigo-100 text-indigo-700'
      }`}>
        {isAdmin ? <Shield className="w-3 h-3" /> : <UserIcon className="w-3 h-3" />}
        {role}
      </span>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Users</h1>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500 border-b border-gray-100">
              <th className="px-5 py-3 font-medium">Name</th>
              <th className="px-5 py-3 font-medium">Email</th>
              <th className="px-5 py-3 font-medium">Role</th>
              <th className="px-5 py-3 font-medium">Created</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={4} className="px-5 py-12 text-center text-gray-400">
                  Loading...
                </td>
              </tr>
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-5 py-12 text-center text-gray-400">
                  <UsersIcon className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p>No users found</p>
                  <p className="text-xs mt-1">Admin access required</p>
                </td>
              </tr>
            ) : (
              users.map((user) => (
                <tr key={user.id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="px-5 py-3 font-medium">{user.name}</td>
                  <td className="px-5 py-3 text-gray-500">{user.email}</td>
                  <td className="px-5 py-3">{roleBadge(user.role)}</td>
                  <td className="px-5 py-3 text-gray-500">{new Date(user.createdAt).toLocaleString()}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

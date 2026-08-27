import { useEffect, useState } from 'react'
import { listContainers, startContainer, stopContainer } from '../lib/api'
import type { Container, Pagination } from '../types'
import { Play, Square, RefreshCw, Terminal } from 'lucide-react'

export function ContainersPage() {
  const [containers, setContainers] = useState<Container[]>([])
  const [pagination, setPagination] = useState<Pagination>({
    total: 0,
    page: 1,
    limit: 20,
    pages: 0,
  })
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  const load = async (page = 1) => {
    setLoading(true)
    try {
      const res = await listContainers({ page, limit: 20 })
      setContainers(res.data)
      setPagination(res.pagination)
    } catch {
      // API may not be running
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const handleStart = async (id: string) => {
    setActionLoading(id)
    try {
      await startContainer(id)
      await load(pagination.page)
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to start container')
    } finally {
      setActionLoading(null)
    }
  }

  const handleStop = async (id: string) => {
    setActionLoading(id)
    try {
      await stopContainer(id)
      await load(pagination.page)
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to stop container')
    } finally {
      setActionLoading(null)
    }
  }

  const statusBadge = (status: string) => {
    const styles: Record<string, string> = {
      RUNNING: 'bg-green-50 text-green-700',
      STOPPED: 'bg-gray-100 text-gray-600',
      PAUSED: 'bg-yellow-50 text-yellow-700',
      CREATED: 'bg-blue-50 text-blue-700',
    }
    return (
      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${styles[status] ?? 'bg-gray-100 text-gray-600'}`}>
        {status}
      </span>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Containers</h1>
        <button onClick={() => load(pagination.page)} className="btn-secondary text-sm">
          <RefreshCw className="w-4 h-4 inline mr-1" /> Refresh
        </button>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500 border-b border-gray-100">
              <th className="px-5 py-3 font-medium">Name</th>
              <th className="px-5 py-3 font-medium">Image</th>
              <th className="px-5 py-3 font-medium">Status</th>
              <th className="px-5 py-3 font-medium">Created</th>
              <th className="px-5 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="px-5 py-12 text-center text-gray-400">
                  Loading...
                </td>
              </tr>
            ) : containers.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-5 py-12 text-center text-gray-400">
                  No containers found
                </td>
              </tr>
            ) : (
              containers.map((c) => (
                <tr key={c.id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="px-5 py-3">
                    <div className="font-medium">{c.name}</div>
                    <div className="text-xs text-gray-400 font-mono">{c.id.slice(0, 12)}</div>
                  </td>
                  <td className="px-5 py-3 text-gray-500 font-mono text-xs">{c.image}</td>
                  <td className="px-5 py-3">{statusBadge(c.status)}</td>
                  <td className="px-5 py-3 text-gray-500">{new Date(c.createdAt).toLocaleString()}</td>
                  <td className="px-5 py-3 text-right space-x-1">
                    {actionLoading === c.id ? (
                      <span className="text-xs text-gray-400">Processing...</span>
                    ) : (
                      <>
                        {c.status !== 'RUNNING' && (
                          <button onClick={() => handleStart(c.id)} className="p-1.5 rounded hover:bg-green-50 text-green-600" title="Start">
                            <Play className="w-4 h-4" />
                          </button>
                        )}
                        {c.status === 'RUNNING' && (
                          <button onClick={() => handleStop(c.id)} className="p-1.5 rounded hover:bg-red-50 text-red-600" title="Stop">
                            <Square className="w-4 h-4" />
                          </button>
                        )}
                        {c.status === 'RUNNING' && (
                          <button className="p-1.5 rounded hover:bg-gray-100 text-gray-500" title="Logs (coming soon)">
                            <Terminal className="w-4 h-4" />
                          </button>
                        )}
                      </>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pagination.pages > 1 && (
        <div className="flex items-center justify-between mt-4 text-sm text-gray-500">
          <span>Page {pagination.page} of {pagination.pages} ({pagination.total} total)</span>
          <div className="space-x-2">
            {pagination.page > 1 && (
              <button onClick={() => load(pagination.page - 1)} className="btn-secondary text-xs px-3 py-1">
                Previous
              </button>
            )}
            {pagination.page < pagination.pages && (
              <button onClick={() => load(pagination.page + 1)} className="btn-secondary text-xs px-3 py-1">
                Next
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

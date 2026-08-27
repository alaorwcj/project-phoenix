import { useEffect, useState } from 'react'
import { listHosts } from '../lib/api'
import type { Host } from '../types'
import { Server, CheckCircle, AlertCircle, RefreshCw } from 'lucide-react'

export function HostsPage() {
  const [hosts, setHosts] = useState<Host[]>([])
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    try {
      const res = await listHosts({ limit: 100 })
      setHosts(res.data)
    } catch {
      // API may not be running
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Hosts</h1>
        <button onClick={load} className="btn-secondary text-sm">
          <RefreshCw className="w-4 h-4 inline mr-1" /> Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading ? (
          <div className="col-span-full flex items-center justify-center h-32">
            <div className="animate-spin w-6 h-6 border-4 border-brand-600 border-t-transparent rounded-full" />
          </div>
        ) : hosts.length === 0 ? (
          <div className="col-span-full card p-8 text-center text-gray-400">
            <Server className="w-10 h-10 mx-auto mb-2 opacity-50" />
            <p>No hosts registered</p>
          </div>
        ) : (
          hosts.map((host) => (
            <div key={host.id} className="card p-5">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Server className="w-5 h-5 text-gray-400" />
                  <h3 className="font-semibold">{host.name}</h3>
                </div>
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                  host.status === 'ONLINE'
                    ? 'bg-green-50 text-green-700'
                    : 'bg-red-50 text-red-700'
                }`}>
                  {host.status === 'ONLINE' ? (
                    <CheckCircle className="w-3 h-3" />
                  ) : (
                    <AlertCircle className="w-3 h-3" />
                  )}
                  {host.status}
                </span>
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Agent ID</span>
                  <span className="font-mono text-xs">{host.agentId.slice(0, 16)}...</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">IP Address</span>
                  <span>{host.ipAddress ?? '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Docker Version</span>
                  <span>{host.dockerVersion ?? '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Last Heartbeat</span>
                  <span>{host.lastHeartbeat ? new Date(host.lastHeartbeat).toLocaleString() : 'Never'}</span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

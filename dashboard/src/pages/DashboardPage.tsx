import { useEffect, useState } from 'react'
import { getStatus, listHosts, listContainers } from '../lib/api'
import type { SystemStatus, Host, Container } from '../types'
import {
  Activity,
  Server,
  Container as ContainerIcon,
  CheckCircle,
  AlertCircle,
} from 'lucide-react'

function StatCard({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string
  value: string | number
  icon: React.ElementType
  color: string
}) {
  return (
    <div className="card p-5">
      <div className="flex items-center gap-3">
        <div className={`p-2 rounded-lg ${color}`}>
          <Icon className="w-5 h-5 text-white" />
        </div>
        <div>
          <p className="text-sm text-gray-500">{label}</p>
          <p className="text-2xl font-bold">{value}</p>
        </div>
      </div>
    </div>
  )
}

export function DashboardPage() {
  const [status, setStatus] = useState<SystemStatus | null>(null)
  const [hosts, setHosts] = useState<Host[]>([])
  const [containers, setContainers] = useState<Container[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      try {
        const [s, h, c] = await Promise.all([
          getStatus(),
          listHosts({ limit: 50 }),
          listContainers({ limit: 50 }),
        ])
        setStatus(s)
        setHosts(h.data)
        setContainers(c.data)
      } catch {
        // API may not be running
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const onlineHosts = hosts.filter((h) => h.status === 'ONLINE').length
  const runningContainers = containers.filter((c) => c.status === 'RUNNING').length

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-4 border-brand-600 border-t-transparent rounded-full" />
      </div>
    )
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Dashboard</h1>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          label="System Status"
          value={status?.status ?? 'Unknown'}
          icon={Activity}
          color="bg-green-500"
        />
        <StatCard
          label="Online Hosts"
          value={`${onlineHosts}/${hosts.length}`}
          icon={Server}
          color="bg-blue-500"
        />
        <StatCard
          label="Running Containers"
          value={runningContainers}
          icon={ContainerIcon}
          color="bg-purple-500"
        />
        <StatCard
          label="Total Containers"
          value={containers.length}
          icon={ContainerIcon}
          color="bg-gray-500"
        />
      </div>

      {/* Hosts Table */}
      <div className="card">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold">Hosts</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b border-gray-100">
                <th className="px-5 py-3 font-medium">Name</th>
                <th className="px-5 py-3 font-medium">Agent ID</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Docker</th>
                <th className="px-5 py-3 font-medium">Last Heartbeat</th>
              </tr>
            </thead>
            <tbody>
              {hosts.map((host) => (
                <tr key={host.id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="px-5 py-3 font-medium">{host.name}</td>
                  <td className="px-5 py-3 text-gray-500 font-mono text-xs">{host.agentId}</td>
                  <td className="px-5 py-3">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                      host.status === 'ONLINE'
                        ? 'bg-green-50 text-green-700'
                        : host.status === 'OFFLINE'
                        ? 'bg-red-50 text-red-700'
                        : 'bg-yellow-50 text-yellow-700'
                    }`}>
                      {host.status === 'ONLINE' ? (
                        <CheckCircle className="w-3 h-3" />
                      ) : (
                        <AlertCircle className="w-3 h-3" />
                      )}
                      {host.status}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-gray-500">{host.dockerVersion ?? '—'}</td>
                  <td className="px-5 py-3 text-gray-500">
                    {host.lastHeartbeat
                      ? new Date(host.lastHeartbeat).toLocaleString()
                      : 'Never'}
                  </td>
                </tr>
              ))}
              {hosts.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center text-gray-400">
                    No hosts registered
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

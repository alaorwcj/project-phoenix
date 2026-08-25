type MetricLabels = Record<string, string>;

type CounterSeries = Map<
  string,
  {
    labels: MetricLabels;
    value: number;
  }
>;

type HistogramSeries = Map<
  string,
  {
    buckets: number[];
    counts: number[];
    sum: number;
    count: number;
    labels: MetricLabels;
  }
>;

const httpRequestBuckets = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5];
const grpcOperationBuckets = [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5];

class CounterMetric {
  private series: CounterSeries = new Map();

  constructor(
    public readonly name: string,
    public readonly help: string,
    public readonly labelNames: string[]
  ) {}

  inc(labels: MetricLabels = {}, value = 1) {
    const key = this.keyFor(labels);
    const current = this.series.get(key);
    if (current) {
      current.value += value;
      return;
    }

    this.series.set(key, {
      labels: { ...labels },
      value,
    });
  }

  render() {
    const lines = [`# HELP ${this.name} ${this.help}`, `# TYPE ${this.name} counter`];
    for (const { labels, value } of this.series.values()) {
      lines.push(`${this.name}${this.formatLabels(labels)} ${value}`);
    }
    return lines.join('\n');
  }

  private keyFor(labels: MetricLabels) {
    return this.labelNames.map((name) => `${name}=${labels[name] ?? ''}`).join('\u0001');
  }

  private formatLabels(labels: MetricLabels) {
    const entries = Object.entries(labels).filter(([, value]) => value !== '');
    if (!entries.length) return '';
    return `{${entries.map(([name, value]) => `${name}="${escapeLabelValue(value)}"`).join(',')}}`;
  }
}

class HistogramMetric {
  private series: HistogramSeries = new Map();

  constructor(
    public readonly name: string,
    public readonly help: string,
    public readonly labelNames: string[],
    public readonly buckets: number[]
  ) {}

  observe(labels: MetricLabels = {}, value: number) {
    const key = this.keyFor(labels);
    let series = this.series.get(key);
    if (!series) {
      series = {
        buckets: [...this.buckets],
        counts: this.buckets.map(() => 0),
        sum: 0,
        count: 0,
        labels: { ...labels },
      };
      this.series.set(key, series);
    }

    series.count += 1;
    series.sum += value;
    for (let index = 0; index < series.buckets.length; index += 1) {
      if (value <= series.buckets[index]) {
        series.counts[index] += 1;
        break;
      }
    }
  }

  render() {
    const lines = [`# HELP ${this.name} ${this.help}`, `# TYPE ${this.name} histogram`];
    for (const series of this.series.values()) {
      let cumulative = 0;
      for (let index = 0; index < series.buckets.length; index += 1) {
        cumulative += series.counts[index];
        lines.push(
          `${this.name}_bucket${this.formatLabels({ ...series.labels, le: String(series.buckets[index]) })} ${cumulative}`
        );
      }
      lines.push(`${this.name}_bucket${this.formatLabels({ ...series.labels, le: '+Inf' })} ${series.count}`);
      lines.push(`${this.name}_sum${this.formatLabels(series.labels)} ${series.sum}`);
      lines.push(`${this.name}_count${this.formatLabels(series.labels)} ${series.count}`);
    }
    return lines.join('\n');
  }

  private keyFor(labels: MetricLabels) {
    return this.labelNames.map((name) => `${name}=${labels[name] ?? ''}`).join('\u0001');
  }

  private formatLabels(labels: MetricLabels) {
    const entries = Object.entries(labels).filter(([, value]) => value !== '');
    if (!entries.length) return '';
    return `{${entries.map(([name, value]) => `${name}="${escapeLabelValue(value)}"`).join(',')}}`;
  }
}

function escapeLabelValue(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/"/g, '\\"');
}

const httpRequestsTotal = new CounterMetric(
  'control_plane_http_requests_total',
  'Total HTTP requests received by the control plane',
  ['route', 'status_code']
);

const httpRequestDurationSeconds = new HistogramMetric(
  'control_plane_http_request_duration_seconds',
  'HTTP request duration in seconds',
  ['route', 'status_code'],
  httpRequestBuckets
);

const grpcOperationsTotal = new CounterMetric(
  'control_plane_grpc_operations_total',
  'Total gRPC operations handled by the control plane',
  ['operation', 'status']
);

const grpcOperationDurationSeconds = new HistogramMetric(
  'control_plane_grpc_operation_duration_seconds',
  'gRPC operation duration in seconds',
  ['operation', 'status'],
  grpcOperationBuckets
);

const jobQueueEnqueuedTotal = new CounterMetric(
  'control_plane_job_queue_enqueued_total',
  'Total jobs enqueued by the control plane',
  ['job_type']
);

const jobQueueCompletedTotal = new CounterMetric(
  'control_plane_job_queue_completed_total',
  'Total jobs completed by the control plane',
  ['job_type']
);

const jobQueueFailedTotal = new CounterMetric(
  'control_plane_job_queue_failed_total',
  'Total jobs failed by the control plane',
  ['job_type']
);

export function observeHttpRequest(route: string, statusCode: number, durationSeconds: number) {
  const labels = { route, status_code: String(statusCode) };
  httpRequestsTotal.inc(labels);
  httpRequestDurationSeconds.observe(labels, durationSeconds);
}

export function observeGrpcOperation(
  operation: string,
  status: 'ok' | 'error',
  durationSeconds: number
) {
  const labels = { operation, status };
  grpcOperationsTotal.inc(labels);
  grpcOperationDurationSeconds.observe(labels, durationSeconds);
}

export function observeJobEnqueued(jobType: string) {
  jobQueueEnqueuedTotal.inc({ job_type: jobType });
}

export function observeJobCompleted(jobType: string) {
  jobQueueCompletedTotal.inc({ job_type: jobType });
}

export function observeJobFailed(jobType: string) {
  jobQueueFailedTotal.inc({ job_type: jobType });
}

export function getMetricsText() {
  return [
    httpRequestsTotal.render(),
    httpRequestDurationSeconds.render(),
    grpcOperationsTotal.render(),
    grpcOperationDurationSeconds.render(),
    jobQueueEnqueuedTotal.render(),
    jobQueueCompletedTotal.render(),
    jobQueueFailedTotal.render(),
  ]
    .filter(Boolean)
    .join('\n');
}

export const metricsContentType = 'text/plain; version=0.0.4; charset=utf-8';

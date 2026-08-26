package metrics

import (
	"strings"
	"testing"
	"time"
)

func TestRegistryRender(t *testing.T) {
	r := New()
	r.IncCounter("agent_heartbeat_total", nil)
	r.AddCounter("grpc_heartbeat_total", Labels{"result": "success"}, 2)
	r.SetGauge("agent_startup_state", Labels{"state": "ready"}, 1)
	r.ObserveDuration("agent_heartbeat_duration_seconds", nil, 150*time.Millisecond)

	out := r.Render()

	for _, want := range []string{
		"# TYPE agent_heartbeat_total counter",
		"agent_heartbeat_total 1",
		`grpc_heartbeat_total{result="success"} 2`,
		`# TYPE agent_startup_state gauge`,
		`agent_startup_state{state="ready"} 1`,
		"# TYPE agent_heartbeat_duration_seconds histogram",
		"agent_heartbeat_duration_seconds_bucket{le=\"0.25\"} 1",
		"agent_heartbeat_duration_seconds_bucket{le=\"+Inf\"} 1",
		"agent_heartbeat_duration_seconds_sum 0.15",
		"agent_heartbeat_duration_seconds_count 1",
	} {
		if !strings.Contains(out, want) {
			t.Fatalf("rendered metrics missing %q\noutput:\n%s", want, out)
		}
	}
}

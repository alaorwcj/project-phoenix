package main

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/alaorwcj/project-phoenix/agent/internal/metrics"
)

func TestMetricsExporterSmoke(t *testing.T) {
	reg := metrics.New()
	reg.IncCounter("agent_heartbeat_total", nil)

	server := httptest.NewServer(reg.Handler())
	defer server.Close()

	resp, err := http.Get(server.URL + "/metrics")
	if err != nil {
		t.Fatalf("GET /metrics: %v", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatalf("read body: %v", err)
	}

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want 200", resp.StatusCode)
	}
	if !strings.Contains(string(body), "agent_heartbeat_total 1") {
		t.Fatalf("unexpected metrics body:\n%s", body)
	}
}

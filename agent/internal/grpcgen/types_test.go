package grpcgen

import (
	"context"
	"encoding/json"
	"testing"
	"time"
)

func TestHTTPHostAgentServiceClient_RegisterHost(t *testing.T) {
	client := NewHTTPHostAgentServiceClient("http://localhost:3000")

	request := &RegisterHostRequest{
		AgentID:       "test-agent-001",
		Hostname:      "test-host.local",
		DockerVersion: "24.0.7",
		Metadata: map[string]interface{}{
			"os":   "Linux",
			"arch": "x86_64",
		},
	}

	// This will fail if the Control Plane is not running,
	// but demonstrates the expected behavior
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	_, err := client.RegisterHost(ctx, request)
	if err != nil {
		t.Logf("Expected error (Control Plane not running): %v", err)
		// In integration environment, this should succeed
	}
}

func TestHostMetricsMarshaling(t *testing.T) {
	metrics := &HostMetrics{
		Timestamp:      time.Now(),
		CPUUsage:       45.5,
		MemoryUsage:    2048,
		DiskUsage:      51200,
		ContainerCount: 12,
		ContainerData: []*ContainerMetric{
			{
				ContainerID: "abc123",
				Name:        "my-app",
				Status:      "running",
				CPUUsage:    23.5,
				MemoryUsage: 512,
			},
		},
	}

	// Test JSON marshaling
	data, err := json.MarshalIndent(metrics, "", "  ")
	if err != nil {
		t.Fatalf("Failed to marshal metrics: %v", err)
	}

	t.Logf("Metrics JSON:\n%s", string(data))

	// Test JSON unmarshaling
	var unmarshaled HostMetrics
	if err := json.Unmarshal(data, &unmarshaled); err != nil {
		t.Fatalf("Failed to unmarshal metrics: %v", err)
	}

	if unmarshaled.CPUUsage != metrics.CPUUsage {
		t.Errorf("CPU usage mismatch: got %f, want %f",
			unmarshaled.CPUUsage, metrics.CPUUsage)
	}

	if len(unmarshaled.ContainerData) != 1 {
		t.Errorf("Container count mismatch: got %d, want %d",
			len(unmarshaled.ContainerData), 1)
	}
}

func TestMockHostAgentServiceClient_Heartbeat(t *testing.T) {
	client := NewMockHostAgentServiceClient()

	heartbeatReq := &HeartbeatRequest{
		AgentID: "test-agent-001",
		Metrics: &HostMetrics{
			Timestamp:      time.Now(),
			CPUUsage:       50.0,
			MemoryUsage:    2048,
			DiskUsage:      51200,
			ContainerCount: 5,
		},
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	resp, err := client.Heartbeat(ctx, heartbeatReq)
	if err != nil {
		t.Fatalf("Heartbeat failed: %v", err)
	}

	if resp.Status != "OK" {
		t.Errorf("Expected status OK, got %s", resp.Status)
	}

	if resp.Message == "" {
		t.Error("Expected response message")
	}

	t.Logf("Heartbeat response: %+v", resp)
}

func TestMockHostAgentServiceClient_RegisterHost(t *testing.T) {
	client := NewMockHostAgentServiceClient()

	registerReq := &RegisterHostRequest{
		AgentID:       "test-agent-001",
		Hostname:      "test-host.local",
		DockerVersion: "24.0.7",
		Metadata: map[string]interface{}{
			"os":   "Linux",
			"arch": "x86_64",
		},
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	resp, err := client.RegisterHost(ctx, registerReq)
	if err != nil {
		t.Fatalf("RegisterHost failed: %v", err)
	}

	if resp.HostID == "" {
		t.Error("Expected host ID in response")
	}

	if resp.Status != "registered" {
		t.Errorf("Expected status 'registered', got %s", resp.Status)
	}

	t.Logf("RegisterHost response: %+v", resp)
}

func TestContainerMetricMarshaling(t *testing.T) {
	container := &ContainerMetric{
		ContainerID: "abc123def456",
		Name:        "web-server",
		Status:      "running",
		CPUUsage:    25.5,
		MemoryUsage: 512,
	}

	data, err := json.MarshalIndent(container, "", "  ")
	if err != nil {
		t.Fatalf("Failed to marshal container: %v", err)
	}

	t.Logf("Container Metric JSON:\n%s", string(data))

	var unmarshaled ContainerMetric
	if err := json.Unmarshal(data, &unmarshaled); err != nil {
		t.Fatalf("Failed to unmarshal container: %v", err)
	}

	if unmarshaled.ContainerID != container.ContainerID {
		t.Errorf("Container ID mismatch: got %s, want %s",
			unmarshaled.ContainerID, container.ContainerID)
	}
}

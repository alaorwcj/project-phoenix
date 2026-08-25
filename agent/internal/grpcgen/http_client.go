// Code generated from proto/docker_platform.proto - DO NOT EDIT

package grpcgen

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"bytes"
	"time"
)

// HTTPHostAgentServiceClient implements HostAgentServiceClient using HTTP for development
// TODO: Replace with real gRPC client once protoc generates the code
type HTTPHostAgentServiceClient struct {
	baseURL string
}

// NewHTTPHostAgentServiceClient creates a new HTTP-based client
func NewHTTPHostAgentServiceClient(addr string) HostAgentServiceClient {
	return &HTTPHostAgentServiceClient{
		baseURL: fmt.Sprintf("http://%s", addr),
	}
}

func (c *HTTPHostAgentServiceClient) RegisterHost(ctx context.Context, req *RegisterHostRequest) (*RegisterHostResponse, error) {
	data, err := json.Marshal(req)
	if err != nil {
		return nil, fmt.Errorf("marshal error: %v", err)
	}

	httpReq, err := http.NewRequestWithContext(ctx, "POST", c.baseURL+"/api/hosts/register", bytes.NewReader(data))
	if err != nil {
		return nil, fmt.Errorf("request error: %v", err)
	}

	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("http error: %v", err)
	}
	defer resp.Body.Close()

	var result RegisterHostResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("decode error: %v", err)
	}

	return &result, nil
}

func (c *HTTPHostAgentServiceClient) Heartbeat(ctx context.Context, req *HeartbeatRequest) (*HeartbeatResponse, error) {
	data, err := json.Marshal(req)
	if err != nil {
		return nil, fmt.Errorf("marshal error: %v", err)
	}

	httpReq, err := http.NewRequestWithContext(ctx, "POST", c.baseURL+"/api/hosts/heartbeat", bytes.NewReader(data))
	if err != nil {
		return nil, fmt.Errorf("request error: %v", err)
	}

	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("http error: %v", err)
	}
	defer resp.Body.Close()

	var result HeartbeatResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("decode error: %v", err)
	}

	return &result, nil
}

func (c *HTTPHostAgentServiceClient) StartContainer(ctx context.Context, req *StartContainerRequest) (*ContainerActionResponse, error) {
	data, err := json.Marshal(req)
	if err != nil {
		return nil, fmt.Errorf("marshal error: %v", err)
	}

	httpReq, err := http.NewRequestWithContext(ctx, "POST", c.baseURL+"/api/containers/start", bytes.NewReader(data))
	if err != nil {
		return nil, fmt.Errorf("request error: %v", err)
	}

	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("http error: %v", err)
	}
	defer resp.Body.Close()

	var result ContainerActionResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("decode error: %v", err)
	}

	return &result, nil
}

func (c *HTTPHostAgentServiceClient) StopContainer(ctx context.Context, req *StopContainerRequest) (*ContainerActionResponse, error) {
	data, err := json.Marshal(req)
	if err != nil {
		return nil, fmt.Errorf("marshal error: %v", err)
	}

	httpReq, err := http.NewRequestWithContext(ctx, "POST", c.baseURL+"/api/containers/stop", bytes.NewReader(data))
	if err != nil {
		return nil, fmt.Errorf("request error: %v", err)
	}

	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("http error: %v", err)
	}
	defer resp.Body.Close()

	var result ContainerActionResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("decode error: %v", err)
	}

	return &result, nil
}

func (c *HTTPHostAgentServiceClient) GetContainerLogs(ctx context.Context, req *GetContainerLogsRequest) (HostAgentService_GetContainerLogsClient, error) {
	// HTTP-based streaming not implemented - return mock stream
	return &MockLogsStream{}, nil
}

// TimeToRFC3339 converts time.Time to RFC3339 string for JSON
func TimeToRFC3339(t time.Time) string {
	return t.Format(time.RFC3339Nano)
}

// RFC3339ToTime parses RFC3339 string to time.Time
func RFC3339ToTime(s string) (time.Time, error) {
	return time.Parse(time.RFC3339Nano, s)
}

package config

import (
	"os"
	"strconv"
)

type Config struct {
	ControlPlaneAddr  string
	AgentID           string
	Hostname          string
	DockerHost        string
	HeartbeatInterval int
	Port              string
	// TLS/mTLS Configuration
	TLSEnabled   bool
	TLSCertPath  string
	TLSKeyPath   string
	TLSCAPath    string
}

func Load() *Config {
	return &Config{
		ControlPlaneAddr:  getEnv("CONTROL_PLANE_ADDR", "localhost:50051"),
		AgentID:           getEnv("AGENT_ID", ""),
		Hostname:          getEnv("HOSTNAME", os.Hostname()),
		DockerHost:        getEnv("DOCKER_HOST", "unix:///var/run/docker.sock"),
		HeartbeatInterval: getEnvInt("HEARTBEAT_INTERVAL", 30),
		Port:              getEnv("PORT", "9000"),
		// TLS/mTLS
		TLSEnabled:  getEnvBool("TLS_ENABLED", false),
		TLSCertPath: getEnv("TLS_CERT_PATH", ""),
		TLSKeyPath:  getEnv("TLS_KEY_PATH", ""),
		TLSCAPath:   getEnv("TLS_CA_PATH", ""),
	}
}

func getEnv(key, defaultVal string) string {
	if value, ok := os.LookupEnv(key); ok {
		return value
	}
	return defaultVal
}

func getEnvInt(key string, defaultVal int) int {
	if value, ok := os.LookupEnv(key); ok {
		if intVal, err := strconv.Atoi(value); err == nil {
			return intVal
		}
	}
	return defaultVal
}

func getEnvBool(key string, defaultVal bool) bool {
	if value, ok := os.LookupEnv(key); ok {
		if boolVal, err := strconv.ParseBool(value); err == nil {
			return boolVal
		}
	}
	return defaultVal
}
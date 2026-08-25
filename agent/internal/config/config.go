package config

import (
	"os"
	"strconv"
)

type Config struct {
	ControlPlaneAddr string
	AgentID          string
	Hostname         string
	DockerHost       string
	HeartbeatInterval int
	Port             string
}

func Load() *Config {
	return &Config{
		ControlPlaneAddr: getEnv("CONTROL_PLANE_ADDR", "localhost:50051"),
		AgentID:          getEnv("AGENT_ID", ""),
		Hostname:         getEnv("HOSTNAME", os.Hostname()),
		DockerHost:       getEnv("DOCKER_HOST", "unix:///var/run/docker.sock"),
		HeartbeatInterval: getEnvInt("HEARTBEAT_INTERVAL", 30),
		Port:             getEnv("PORT", "9000"),
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
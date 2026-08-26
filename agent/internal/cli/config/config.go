package config

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"

	"github.com/spf13/cobra"
)

// Config holds CLI configuration persisted to disk.
type Config struct {
	ServerURL string `json:"server_url"`
	Token     string `json:"token,omitempty"`
}

var configPath = filepath.Join(os.Getenv("HOME"), ".docker-platform", "config.json")

// Load reads the config file, returning an empty config if missing.
func Load() (*Config, error) {
	data, err := os.ReadFile(configPath)
	if err != nil {
		if os.IsNotExist(err) {
			return &Config{}, nil
		}
		return nil, err
	}
	var cfg Config
	if err := json.Unmarshal(data, &cfg); err != nil {
		return nil, err
	}
	return &cfg, nil
}

// Save writes the config file with 0600 permissions (contains secrets).
func Save(cfg *Config) error {
	if err := os.MkdirAll(filepath.Dir(configPath), 0755); err != nil {
		return err
	}
	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(configPath, data, 0600)
}

var SetCmd = &cobra.Command{
	Use:   "config set <key> <value>",
	Short: "Set a config value",
	Args:  cobra.ExactArgs(2),
	RunE: func(cmd *cobra.Command, args []string) error {
		key, value := args[0], args[1]
		cfg, err := Load()
		if err != nil {
			return err
		}
		switch key {
		case "server_url":
			cfg.ServerURL = value
		case "token":
			cfg.Token = value
		default:
			return fmt.Errorf("unknown config key: %s (valid: server_url, token)", key)
		}
		if err := Save(cfg); err != nil {
			return err
		}
		fmt.Printf("%s set successfully\n", key)
		return nil
	},
}

var GetCmd = &cobra.Command{
	Use:   "config get <key>",
	Short: "Get a config value",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		cfg, err := Load()
		if err != nil {
			return err
		}
		switch args[0] {
		case "server_url":
			fmt.Println(cfg.ServerURL)
		case "token":
			if cfg.Token != "" {
				fmt.Println(cfg.Token)
			} else {
				fmt.Println("(not set)")
			}
		default:
			return fmt.Errorf("unknown config key: %s", args[0])
		}
		return nil
	},
}

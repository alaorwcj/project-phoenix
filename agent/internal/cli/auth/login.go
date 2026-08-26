package auth

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"

	"github.com/alaorwcj/project-phoenix/agent/internal/cli/config"
	"github.com/spf13/cobra"
)

var LoginCmd = &cobra.Command{
	Use:   "login",
	Short: "Authenticate with the Control Plane",
	RunE: func(cmd *cobra.Command, args []string) error {
		cfg, err := config.Load()
		if err != nil {
			return err
		}
		if cfg.ServerURL == "" {
			return fmt.Errorf("server_url not configured — run: docker-platform config set server_url <url>")
		}

		email, _ := cmd.Flags().GetString("email")
		password, _ := cmd.Flags().GetString("password")

		if email == "" || password == "" {
			return fmt.Errorf("both --email and --password are required")
		}

		body, _ := json.Marshal(map[string]string{"email": email, "password": password})
		resp, err := http.Post(cfg.ServerURL+"/api/auth/login", "application/json", bytes.NewReader(body))
		if err != nil {
			return fmt.Errorf("failed to connect: %w", err)
		}
		defer resp.Body.Close()

		if resp.StatusCode != http.StatusOK {
			data, _ := io.ReadAll(resp.Body)
			return fmt.Errorf("login failed (%d): %s", resp.StatusCode, string(data))
		}

		var result struct {
			Token string `json:"token"`
		}
		if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
			return fmt.Errorf("invalid response: %w", err)
		}

		cfg.Token = result.Token
		if err := config.Save(cfg); err != nil {
			return fmt.Errorf("failed to save token: %w", err)
		}

		fmt.Println("Login successful — token stored")
		return nil
	},
}

var LogoutCmd = &cobra.Command{
	Use:   "logout",
	Short: "Clear stored credentials",
	RunE: func(cmd *cobra.Command, args []string) error {
		cfg, err := config.Load()
		if err != nil {
			return err
		}
		cfg.Token = ""
		if err := config.Save(cfg); err != nil {
			return err
		}
		fmt.Println("Logged out — token cleared")
		return nil
	},
}

func init() {
	LoginCmd.Flags().StringP("email", "e", "", "User email")
	LoginCmd.Flags().StringP("password", "p", "", "User password")
}

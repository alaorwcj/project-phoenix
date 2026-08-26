package main

import (
	"fmt"
	"os"

	"github.com/alaorwcj/project-phoenix/agent/internal/cli/auth"
	"github.com/alaorwcj/project-phoenix/agent/internal/cli/config"
	"github.com/alaorwcj/project-phoenix/agent/internal/cli/containers"
	"github.com/alaorwcj/project-phoenix/agent/internal/cli/hosts"
	"github.com/spf13/cobra"
)

var rootCmd = &cobra.Command{
	Use:   "docker-platform",
	Short: "Multi-tenant Docker container management CLI",
	Long:  "CLI tool for interacting with the Docker Platform Control Plane",
}

func init() {
	rootCmd.AddCommand(auth.LoginCmd)
	rootCmd.AddCommand(auth.LogoutCmd)
	rootCmd.AddCommand(containers.StartCmd)
	rootCmd.AddCommand(containers.StopCmd)
	rootCmd.AddCommand(containers.ListCmd)
	rootCmd.AddCommand(hosts.ListCmd)
	rootCmd.AddCommand(config.SetCmd)
	rootCmd.AddCommand(config.GetCmd)
}

func main() {
	if err := rootCmd.Execute(); err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		os.Exit(1)
	}
}

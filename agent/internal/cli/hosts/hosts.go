package hosts

import (
	"fmt"
	"os"
	"text/tabwriter"

	"github.com/alaorwcj/project-phoenix/agent/internal/cli/client"
	"github.com/spf13/cobra"
)

var ListCmd = &cobra.Command{
	Use:   "host-list",
	Short: "List available hosts",
	RunE: func(cmd *cobra.Command, args []string) error {
		c, err := client.New()
		if err != nil {
			return err
		}

		var result struct {
			Data []struct {
				ID       string `json:"id"`
				Name     string `json:"name"`
				Hostname string `json:"hostname"`
				Status   string `json:"status"`
			} `json:"data"`
			Pagination struct {
				Total int `json:"total"`
			} `json:"pagination"`
		}
		if err := c.Do("GET", "/api/hosts", nil, &result); err != nil {
			return err
		}

		w := tabwriter.NewWriter(os.Stdout, 0, 4, 2, ' ', 0)
		fmt.Fprintln(w, "ID\tNAME\tHOSTNAME\tSTATUS")
		for _, h := range result.Data {
			fmt.Fprintf(w, "%s\t%s\t%s\t%s\n", h.ID, h.Name, h.Hostname, h.Status)
		}
		w.Flush()
		fmt.Printf("\nTotal: %d\n", result.Pagination.Total)
		return nil
	},
}

var StatusCmd = &cobra.Command{
	Use:   "host-status <id>",
	Short: "Get detailed host status",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		hostID := args[0]

		c, err := client.New()
		if err != nil {
			return err
		}

		var result struct {
			Data struct {
				ID            string `json:"id"`
				Name          string `json:"name"`
				Hostname      string `json:"hostname"`
				Status        string `json:"status"`
				LastHeartbeat string `json:"lastHeartbeat"`
			} `json:"data"`
		}
		if err := c.Do("GET", "/api/hosts/"+hostID, nil, &result); err != nil {
			return err
		}

		fmt.Printf("ID:              %s\n", result.Data.ID)
		fmt.Printf("Name:            %s\n", result.Data.Name)
		fmt.Printf("Hostname:        %s\n", result.Data.Hostname)
		fmt.Printf("Status:          %s\n", result.Data.Status)
		fmt.Printf("Last Heartbeat:  %s\n", result.Data.LastHeartbeat)
		return nil
	},
}

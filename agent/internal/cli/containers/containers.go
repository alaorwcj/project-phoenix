package containers

import (
	"encoding/json"
	"fmt"
	"os"
	"text/tabwriter"

	"github.com/alaorwcj/project-phoenix/agent/internal/cli/client"
	"github.com/spf13/cobra"
)

var StartCmd = &cobra.Command{
	Use:   "container-start",
	Short: "Start a new container",
	RunE: func(cmd *cobra.Command, args []string) error {
		name, _ := cmd.Flags().GetString("name")
		image, _ := cmd.Flags().GetString("image")
		hostID, _ := cmd.Flags().GetString("host")

		if name == "" || image == "" || hostID == "" {
			return fmt.Errorf("--name, --image and --host are required")
		}

		c, err := client.New()
		if err != nil {
			return err
		}

		var result map[string]any
		err = c.Do("POST", "/api/containers/start", map[string]any{
			"name":   name,
			"image":  image,
			"hostId": hostID,
		}, &result)
		if err != nil {
			return err
		}

		fmt.Printf("Container queued: %v (job: %v)\n", result["id"], result["jobId"])
		return nil
	},
}

var StopCmd = &cobra.Command{
	Use:   "container-stop",
	Short: "Stop a running container",
	RunE: func(cmd *cobra.Command, args []string) error {
		containerID, _ := cmd.Flags().GetString("id")
		if containerID == "" {
			return fmt.Errorf("--id is required")
		}

		c, err := client.New()
		if err != nil {
			return err
		}

		var result map[string]any
		err = c.Do("POST", "/api/containers/stop", map[string]any{
			"containerId": containerID,
		}, &result)
		if err != nil {
			return err
		}

		fmt.Printf("Container stopping: %v (job: %v)\n", containerID, result["jobId"])
		return nil
	},
}

var ListCmd = &cobra.Command{
	Use:   "container-list",
	Short: "List containers",
	RunE: func(cmd *cobra.Command, args []string) error {
		status, _ := cmd.Flags().GetString("status")

		c, err := client.New()
		if err != nil {
			return err
		}

		path := "/api/containers"
		if status != "" {
			path += "?status=" + status
		}

		var result struct {
			Data []struct {
				ID     string `json:"id"`
				Name   string `json:"name"`
				Image  string `json:"image"`
				Status string `json:"status"`
			} `json:"data"`
			Pagination struct {
				Total int `json:"total"`
			} `json:"pagination"`
		}
		if err := c.Do("GET", path, nil, &result); err != nil {
			return err
		}

		w := tabwriter.NewWriter(os.Stdout, 0, 4, 2, ' ', 0)
		fmt.Fprintln(w, "ID\tNAME\tIMAGE\tSTATUS")
		for _, ct := range result.Data {
			fmt.Fprintf(w, "%s\t%s\t%s\t%s\n", ct.ID, ct.Name, ct.Image, ct.Status)
		}
		w.Flush()
		fmt.Printf("\nTotal: %d\n", result.Pagination.Total)
		return nil
	},
}

// jsonPrint is a helper for debugging raw responses.
func jsonPrint(v any) {
	data, _ := json.MarshalIndent(v, "", "  ")
	fmt.Println(string(data))
}

func init() {
	StartCmd.Flags().StringP("name", "n", "", "Container name")
	StartCmd.Flags().StringP("image", "i", "", "Docker image")
	StartCmd.Flags().String("host", "", "Target host ID")

	StopCmd.Flags().String("id", "", "Container ID")

	ListCmd.Flags().StringP("status", "s", "", "Filter by status (RUNNING, STOPPED, etc.)")
}

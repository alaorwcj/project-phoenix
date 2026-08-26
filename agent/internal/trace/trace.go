package trace

import (
	"strings"

	"github.com/google/uuid"
)

func ResolveTraceID(value string) string {
	if value != "" {
		return value
	}

	return strings.ReplaceAll(uuid.NewString(), "-", "")
}

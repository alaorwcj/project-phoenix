package logging

import (
	"fmt"
	"log"
	"sort"
	"strings"
)

func init() {
	log.SetFlags(0)
}

type Logger struct {
	fields map[string]string
}

func New(component, agentID string) Logger {
	fields := map[string]string{"component": component}
	if agentID != "" {
		fields["agentID"] = agentID
	}
	return Logger{fields: fields}
}

func (l Logger) With(key, value string) Logger {
	fields := make(map[string]string, len(l.fields)+1)
	for k, v := range l.fields {
		fields[k] = v
	}
	if value != "" {
		fields[key] = value
	}
	return Logger{fields: fields}
}

func (l Logger) WithHostID(hostID string) Logger {
	return l.With("hostID", hostID)
}

func (l Logger) WithTraceID(traceID string) Logger {
	return l.With("traceID", traceID)
}

func (l Logger) Info(msg string, kv ...any) {
	l.log("info", msg, nil, kv...)
}

func (l Logger) Warn(msg string, kv ...any) {
	l.log("warn", msg, nil, kv...)
}

func (l Logger) Error(msg string, err error, kv ...any) {
	l.log("error", msg, err, kv...)
}

func (l Logger) log(level, msg string, err error, kv ...any) {
	fields := make(map[string]string, len(l.fields)+len(kv)/2+3)
	for k, v := range l.fields {
		fields[k] = v
	}
	fields["level"] = level
	fields["msg"] = msg
	if err != nil {
		fields["error"] = err.Error()
	}
	for i := 0; i+1 < len(kv); i += 2 {
		fields[fmt.Sprint(kv[i])] = fmt.Sprint(kv[i+1])
	}

	keys := make([]string, 0, len(fields))
	for k := range fields {
		keys = append(keys, k)
	}
	sort.Strings(keys)

	parts := make([]string, 0, len(keys))
	for _, k := range keys {
		parts = append(parts, fmt.Sprintf("%s=%q", k, fields[k]))
	}

	log.Print(strings.Join(parts, " "))
}

FROM golang:1.22-alpine AS builder

RUN apk add --no-cache git

WORKDIR /app

# Cache dependencies
COPY go.mod go.sum ./
RUN go mod download

# Copy source and build
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o /docker-platform-agent ./cmd/agent

# ---- Runtime ----
FROM alpine:3.19

RUN apk add --no-cache ca-certificates curl && \
    addgroup -S app && adduser -S app -G app

COPY --from=builder /docker-platform-agent /usr/local/bin/docker-platform-agent

USER app

EXPOSE 50051

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD curl -f http://127.0.0.1:50051/ || exit 1

ENTRYPOINT ["docker-platform-agent"]

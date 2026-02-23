# RiskIntel Cloud API - minimal runtime image
# Multi-stage: build then slim runtime

FROM golang:1.22-alpine AS builder
WORKDIR /app
COPY go.mod ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -ldflags="-s -w" -o /api ./cmd/api

FROM alpine:3.19
RUN apk add --no-cache ca-certificates
WORKDIR /app
COPY --from=builder /api .
EXPOSE 8080
ENTRYPOINT ["./api"]

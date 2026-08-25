package grpc

import (
	"crypto/tls"
	"crypto/x509"
	"fmt"
	"io/ioutil"

	"github.com/alaorwcj/project-phoenix/agent/internal/logging"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials"
)

type TLSConfig struct {
	Enabled  bool
	CertPath string
	KeyPath  string
	CAPath   string
}

// LoadClientCredentials loads mTLS credentials for gRPC client
func LoadClientCredentials(tlsConfig *TLSConfig, log logging.Logger) (grpc.DialOption, error) {
	if !tlsConfig.Enabled {
		return grpc.WithInsecure(), nil
	}

	// Load client certificate
	cert, err := tls.LoadX509KeyPair(tlsConfig.CertPath, tlsConfig.KeyPath)
	if err != nil {
		return nil, fmt.Errorf("failed to load client certificate: %w", err)
	}

	// Load CA certificate
	caCertData, err := ioutil.ReadFile(tlsConfig.CAPath)
	if err != nil {
		return nil, fmt.Errorf("failed to read CA certificate: %w", err)
	}

	caCertPool := x509.NewCertPool()
	if !caCertPool.AppendCertsFromPEM(caCertData) {
		return nil, fmt.Errorf("failed to parse CA certificate")
	}

	// Create TLS credentials
	tlsCreds := credentials.NewTLS(&tls.Config{
		Certificates: []tls.Certificate{cert},
		RootCAs:      caCertPool,
		ClientAuth:   tls.RequireAndVerifyClientCert,
	})

	log.Info("mTLS enabled for gRPC client", "cert", tlsConfig.CertPath, "key", tlsConfig.KeyPath, "ca", tlsConfig.CAPath)
	return grpc.WithTransportCredentials(tlsCreds), nil
}

// LoadServerCredentials loads mTLS credentials for gRPC server
func LoadServerCredentials(tlsConfig *TLSConfig, log logging.Logger) (credentials.TransportCredentials, error) {
	if !tlsConfig.Enabled {
		return nil, nil // Will use insecure
	}

	// Load server certificate
	cert, err := tls.LoadX509KeyPair(tlsConfig.CertPath, tlsConfig.KeyPath)
	if err != nil {
		return nil, fmt.Errorf("failed to load server certificate: %w", err)
	}

	// Load CA certificate for client verification
	caCertData, err := ioutil.ReadFile(tlsConfig.CAPath)
	if err != nil {
		return nil, fmt.Errorf("failed to read CA certificate: %w", err)
	}

	caCertPool := x509.NewCertPool()
	if !caCertPool.AppendCertsFromPEM(caCertData) {
		return nil, fmt.Errorf("failed to parse CA certificate")
	}

	// Create TLS credentials
	tlsCreds := credentials.NewTLS(&tls.Config{
		Certificates: []tls.Certificate{cert},
		ClientCAs:    caCertPool,
		ClientAuth:   tls.RequireAndVerifyClientCert,
	})

	log.Info("mTLS enabled for gRPC server", "cert", tlsConfig.CertPath, "key", tlsConfig.KeyPath, "ca", tlsConfig.CAPath)
	return tlsCreds, nil
}

#!/bin/bash

# Generate mTLS certificates for Docker Platform
# Usage: ./generate-certs.sh [dev|prod] [output_dir]

set -e

MODE=${1:-dev}
OUTPUT_DIR=${2:-./certs}
CA_NAME="Docker Platform CA"
SERVER_NAME="localhost"
CLIENT_NAME="docker-platform-agent"

if [[ "$MODE" != "dev" && "$MODE" != "prod" ]]; then
    echo "Error: MODE must be 'dev' or 'prod'"
    exit 1
fi

echo "Generating $MODE mode mTLS certificates..."

# Set certificate validity
if [[ "$MODE" == "dev" ]]; then
    VALIDITY_DAYS=365   # 1 year for dev
    KEY_SIZE=2048
else
    VALIDITY_DAYS=3650  # 10 years for prod
    KEY_SIZE=4096
fi

echo "Certificate validity: $VALIDITY_DAYS days, Key size: $KEY_SIZE bits"

# Create output directory
mkdir -p "$OUTPUT_DIR"

# Step 1: Generate CA Private Key
echo "Step 1: Generating CA private key..."
CA_KEY_PATH="$OUTPUT_DIR/ca-key.pem"
openssl genrsa -out "$CA_KEY_PATH" $KEY_SIZE
echo "  ✓ CA key generated: $CA_KEY_PATH"

# Step 2: Generate CA Certificate
echo "Step 2: Generating CA certificate..."
CA_CERT_PATH="$OUTPUT_DIR/ca-cert.pem"
openssl req -new -x509 -days $VALIDITY_DAYS -key "$CA_KEY_PATH" \
    -out "$CA_CERT_PATH" \
    -subj "/C=BR/ST=SP/L=Sao Paulo/O=Docker Platform/CN=$CA_NAME"
echo "  ✓ CA certificate generated: $CA_CERT_PATH"

# Step 3: Generate Server Private Key
echo "Step 3: Generating server private key..."
SERVER_KEY_PATH="$OUTPUT_DIR/server-key.pem"
openssl genrsa -out "$SERVER_KEY_PATH" $KEY_SIZE
echo "  ✓ Server key generated: $SERVER_KEY_PATH"

# Step 4: Generate Server Certificate Signing Request
echo "Step 4: Generating server CSR..."
SERVER_CSR_PATH="$OUTPUT_DIR/server.csr"
openssl req -new -key "$SERVER_KEY_PATH" -out "$SERVER_CSR_PATH" \
    -subj "/C=BR/ST=SP/L=Sao Paulo/O=Docker Platform/CN=$SERVER_NAME"
echo "  ✓ Server CSR generated: $SERVER_CSR_PATH"

# Step 5: Create Server Certificate Extensions File
echo "Step 5: Creating server certificate extensions..."
EXT_FILE="$OUTPUT_DIR/server-ext.cnf"
cat > "$EXT_FILE" << EOF
subjectAltName = DNS:$SERVER_NAME,DNS:localhost,DNS:127.0.0.1,IP:127.0.0.1,IP:0.0.0.0
EOF
echo "  ✓ Extensions file created: $EXT_FILE"

# Step 6: Sign Server Certificate with CA
echo "Step 6: Signing server certificate with CA..."
SERVER_CERT_PATH="$OUTPUT_DIR/server-cert.pem"
openssl x509 -req -in "$SERVER_CSR_PATH" -CA "$CA_CERT_PATH" \
    -CAkey "$CA_KEY_PATH" -CAcreateserial -out "$SERVER_CERT_PATH" \
    -days $VALIDITY_DAYS -extensions v3_req -extfile "$EXT_FILE"
echo "  ✓ Server certificate signed: $SERVER_CERT_PATH"

# Step 7: Generate Client Private Key
echo "Step 7: Generating client private key..."
CLIENT_KEY_PATH="$OUTPUT_DIR/client-key.pem"
openssl genrsa -out "$CLIENT_KEY_PATH" $KEY_SIZE
echo "  ✓ Client key generated: $CLIENT_KEY_PATH"

# Step 8: Generate Client Certificate Signing Request
echo "Step 8: Generating client CSR..."
CLIENT_CSR_PATH="$OUTPUT_DIR/client.csr"
openssl req -new -key "$CLIENT_KEY_PATH" -out "$CLIENT_CSR_PATH" \
    -subj "/C=BR/ST=SP/L=Sao Paulo/O=Docker Platform/CN=$CLIENT_NAME"
echo "  ✓ Client CSR generated: $CLIENT_CSR_PATH"

# Step 9: Sign Client Certificate with CA
echo "Step 9: Signing client certificate with CA..."
CLIENT_CERT_PATH="$OUTPUT_DIR/client-cert.pem"
openssl x509 -req -in "$CLIENT_CSR_PATH" -CA "$CA_CERT_PATH" \
    -CAkey "$CA_KEY_PATH" -CAcreateserial -out "$CLIENT_CERT_PATH" \
    -days $VALIDITY_DAYS
echo "  ✓ Client certificate signed: $CLIENT_CERT_PATH"

# Step 10: Verify Certificates
echo "Step 10: Verifying certificates..."
openssl verify -CAfile "$CA_CERT_PATH" "$SERVER_CERT_PATH" "$CLIENT_CERT_PATH"
echo "  ✓ All certificates verified successfully"

# Step 11: Cleanup temporary files
echo "Step 11: Cleaning up temporary files..."
rm -f "$OUTPUT_DIR"/*.csr "$OUTPUT_DIR"/*-ext.cnf "$OUTPUT_DIR"/*.srl
echo "  ✓ Temporary files cleaned"

# Summary
echo ""
echo "✅ Certificate generation completed successfully!"
echo ""
echo "Generated certificates in: $OUTPUT_DIR"
echo "  - CA Certificate: $CA_CERT_PATH"
echo "  - Server Certificate: $SERVER_CERT_PATH"
echo "  - Server Key: $SERVER_KEY_PATH"
echo "  - Client Certificate: $CLIENT_CERT_PATH"
echo "  - Client Key: $CLIENT_KEY_PATH"
echo ""
echo "Next steps:"
echo "  1. Control Plane (.env): Set TLS_CA_PATH, TLS_CERT_PATH, TLS_KEY_PATH"
echo "  2. Agent (.env): Set TLS_CA_PATH, TLS_CERT_PATH, TLS_KEY_PATH"
echo "  3. Restart Control Plane and Agent"
echo "  4. Test: grpcurl -plaintext -cert client-cert.pem -key client-key.pem localhost:50051"

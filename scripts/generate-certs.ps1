# Generate mTLS certificates for Docker Platform
# Usage: .\generate-certs.ps1 -Mode dev|prod -OutputDir ./certs

param(
    [Parameter(Mandatory=$true)]
    [ValidateSet("dev", "prod")]
    [string]$Mode = "dev",
    
    [string]$OutputDir = "./certs",
    [string]$CAName = "Docker Platform CA",
    [string]$ServerName = "localhost",
    [string]$ClientName = "docker-platform-agent"
)

Write-Host "Generating $Mode mode mTLS certificates..." -ForegroundColor Green

# Create output directory
if (!(Test-Path $OutputDir)) {
    New-Item -ItemType Directory -Path $OutputDir | Out-Null
}

# Set certificate validity
if ($Mode -eq "dev") {
    $validityDays = 365  # 1 year for dev
    $keySize = 2048
}
else {
    $validityDays = 3650  # 10 years for prod
    $keySize = 4096
}

Write-Host "Certificate validity: $validityDays days, Key size: $keySize bits" -ForegroundColor Cyan

try {
    # Step 1: Generate CA Private Key
    Write-Host "Step 1: Generating CA private key..." -ForegroundColor Cyan
    $caKeyPath = Join-Path $OutputDir "ca-key.pem"
    $caKeyCmd = @(
        "genrsa",
        "-out", $caKeyPath,
        $keySize
    )
    & openssl @caKeyCmd 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Failed to generate CA private key" }
    Write-Host "  ✓ CA key generated: $caKeyPath" -ForegroundColor Green

    # Step 2: Generate CA Certificate
    Write-Host "Step 2: Generating CA certificate..." -ForegroundColor Cyan
    $caCertPath = Join-Path $OutputDir "ca-cert.pem"
    $caCertCmd = @(
        "req",
        "-new",
        "-x509",
        "-days", $validityDays,
        "-key", $caKeyPath,
        "-out", $caCertPath,
        "-subj", "/C=BR/ST=SP/L=Sao Paulo/O=Docker Platform/CN=$CAName"
    )
    & openssl @caCertCmd 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Failed to generate CA certificate" }
    Write-Host "  ✓ CA certificate generated: $caCertPath" -ForegroundColor Green

    # Step 3: Generate Server Private Key
    Write-Host "Step 3: Generating server private key..." -ForegroundColor Cyan
    $serverKeyPath = Join-Path $OutputDir "server-key.pem"
    $serverKeyCmd = @(
        "genrsa",
        "-out", $serverKeyPath,
        $keySize
    )
    & openssl @serverKeyCmd 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Failed to generate server private key" }
    Write-Host "  ✓ Server key generated: $serverKeyPath" -ForegroundColor Green

    # Step 4: Generate Server Certificate Signing Request
    Write-Host "Step 4: Generating server CSR..." -ForegroundColor Cyan
    $serverCsrPath = Join-Path $OutputDir "server.csr"
    $serverCsrCmd = @(
        "req",
        "-new",
        "-key", $serverKeyPath,
        "-out", $serverCsrPath,
        "-subj", "/C=BR/ST=SP/L=Sao Paulo/O=Docker Platform/CN=$ServerName"
    )
    & openssl @serverCsrCmd 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Failed to generate server CSR" }
    Write-Host "  ✓ Server CSR generated: $serverCsrPath" -ForegroundColor Green

    # Step 5: Create Server Certificate Extensions File
    Write-Host "Step 5: Creating server certificate extensions..." -ForegroundColor Cyan
    $extFile = Join-Path $OutputDir "server-ext.cnf"
    $extContent = @"
subjectAltName = DNS:$ServerName,DNS:localhost,DNS:127.0.0.1,IP:127.0.0.1,IP:0.0.0.0
"@
    Set-Content -Path $extFile -Value $extContent
    Write-Host "  ✓ Extensions file created: $extFile" -ForegroundColor Green

    # Step 6: Sign Server Certificate with CA
    Write-Host "Step 6: Signing server certificate with CA..." -ForegroundColor Cyan
    $serverCertPath = Join-Path $OutputDir "server-cert.pem"
    $serverSignCmd = @(
        "x509",
        "-req",
        "-in", $serverCsrPath,
        "-CA", $caCertPath,
        "-CAkey", $caKeyPath,
        "-CAcreateserial",
        "-out", $serverCertPath,
        "-days", $validityDays,
        "-extensions", "v3_req",
        "-extfile", $extFile
    )
    & openssl @serverSignCmd 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Failed to sign server certificate" }
    Write-Host "  ✓ Server certificate signed: $serverCertPath" -ForegroundColor Green

    # Step 7: Generate Client Private Key
    Write-Host "Step 7: Generating client private key..." -ForegroundColor Cyan
    $clientKeyPath = Join-Path $OutputDir "client-key.pem"
    $clientKeyCmd = @(
        "genrsa",
        "-out", $clientKeyPath,
        $keySize
    )
    & openssl @clientKeyCmd 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Failed to generate client private key" }
    Write-Host "  ✓ Client key generated: $clientKeyPath" -ForegroundColor Green

    # Step 8: Generate Client Certificate Signing Request
    Write-Host "Step 8: Generating client CSR..." -ForegroundColor Cyan
    $clientCsrPath = Join-Path $OutputDir "client.csr"
    $clientCsrCmd = @(
        "req",
        "-new",
        "-key", $clientKeyPath,
        "-out", $clientCsrPath,
        "-subj", "/C=BR/ST=SP/L=Sao Paulo/O=Docker Platform/CN=$ClientName"
    )
    & openssl @clientCsrCmd 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Failed to generate client CSR" }
    Write-Host "  ✓ Client CSR generated: $clientCsrPath" -ForegroundColor Green

    # Step 9: Sign Client Certificate with CA
    Write-Host "Step 9: Signing client certificate with CA..." -ForegroundColor Cyan
    $clientCertPath = Join-Path $OutputDir "client-cert.pem"
    $clientSignCmd = @(
        "x509",
        "-req",
        "-in", $clientCsrPath,
        "-CA", $caCertPath,
        "-CAkey", $caKeyPath,
        "-CAcreateserial",
        "-out", $clientCertPath,
        "-days", $validityDays
    )
    & openssl @clientSignCmd 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Failed to sign client certificate" }
    Write-Host "  ✓ Client certificate signed: $clientCertPath" -ForegroundColor Green

    # Step 10: Verify Certificates
    Write-Host "Step 10: Verifying certificates..." -ForegroundColor Cyan
    $verifyCmd = @("verify", "-CAfile", $caCertPath, $serverCertPath, $clientCertPath)
    & openssl @verifyCmd 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Certificate verification failed" }
    Write-Host "  ✓ All certificates verified successfully" -ForegroundColor Green

    # Step 11: Cleanup temporary files
    Write-Host "Step 11: Cleaning up temporary files..." -ForegroundColor Cyan
    Remove-Item -Path (Join-Path $OutputDir "*.csr") -Force -ErrorAction SilentlyContinue
    Remove-Item -Path (Join-Path $OutputDir "*-ext.cnf") -Force -ErrorAction SilentlyContinue
    Remove-Item -Path (Join-Path $OutputDir "*.srl") -Force -ErrorAction SilentlyContinue
    Write-Host "  ✓ Temporary files cleaned" -ForegroundColor Green

    # Summary
    Write-Host "`n✅ Certificate generation completed successfully!" -ForegroundColor Green
    Write-Host "`nGenerated certificates in: $OutputDir" -ForegroundColor Cyan
    Write-Host "  - CA Certificate: $caCertPath"
    Write-Host "  - Server Certificate: $serverCertPath"
    Write-Host "  - Server Key: $serverKeyPath"
    Write-Host "  - Client Certificate: $clientCertPath"
    Write-Host "  - Client Key: $clientKeyPath"
    Write-Host "`nNext steps:"
    Write-Host "  1. Control Plane (.env): Set TLS_CA_PATH, TLS_CERT_PATH, TLS_KEY_PATH"
    Write-Host "  2. Agent (.env): Set TLS_CA_PATH, TLS_CERT_PATH, TLS_KEY_PATH"
    Write-Host "  3. Restart Control Plane and Agent"
    Write-Host "  4. Test: curl -k --cert client-cert.pem --key client-key.pem https://localhost:50051"

}
catch {
    Write-Host "`n❌ Error: $_" -ForegroundColor Red
    exit 1
}

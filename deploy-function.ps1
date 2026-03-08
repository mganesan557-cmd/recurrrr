# deploy-function.ps1
# Deploys the analyze-code edge function to Supabase via Management API
# No Docker or CLI linking needed!

param(
    [Parameter(Mandatory=$true)]
    [string]$AccessToken  # Your Supabase Personal Access Token
)

$ProjectRef = "nsudqovksxeflgauwvsy"
$FunctionName = "analyze-code"
$FunctionPath = "$PSScriptRoot\supabase\functions\analyze-code\index.ts"

Write-Host "Reading function source..." -ForegroundColor Cyan
$FunctionCode = Get-Content $FunctionPath -Raw

Write-Host "Deploying $FunctionName to project $ProjectRef..." -ForegroundColor Cyan

$Headers = @{
    "Authorization" = "Bearer $AccessToken"
    "Content-Type"  = "application/json"
}

$Body = @{
    body        = $FunctionCode
    verify_jwt  = $false
    import_map  = $false
} | ConvertTo-Json

# First try PATCH (update existing), then POST (create new)
$Url = "https://api.supabase.com/v1/projects/$ProjectRef/functions/$FunctionName"

try {
    $Response = Invoke-RestMethod -Method PATCH -Uri $Url -Headers $Headers -Body $Body -ErrorAction Stop
    Write-Host "✅ Function updated successfully!" -ForegroundColor Green
    Write-Host ($Response | ConvertTo-Json) -ForegroundColor DarkGray
} catch {
    Write-Host "PATCH failed, trying POST..." -ForegroundColor Yellow
    $PostUrl = "https://api.supabase.com/v1/projects/$ProjectRef/functions"
    $PostBody = @{
        slug        = $FunctionName
        name        = $FunctionName
        body        = $FunctionCode
        verify_jwt  = $false
        import_map  = $false
    } | ConvertTo-Json
    try {
        $Response = Invoke-RestMethod -Method POST -Uri $PostUrl -Headers $Headers -Body $PostBody -ErrorAction Stop
        Write-Host "✅ Function created successfully!" -ForegroundColor Green
        Write-Host ($Response | ConvertTo-Json) -ForegroundColor DarkGray
    } catch {
        Write-Host "❌ Deployment failed: $_" -ForegroundColor Red
    }
}

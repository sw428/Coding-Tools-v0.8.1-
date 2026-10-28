param(
  [Parameter(Mandatory=$true)][ValidatePattern('^coding-tools-slot-paste-[a-f0-9]{24}$')][string]$PipeName,
  [switch]$SelfTest,
  [switch]$ProbeIpc
)
$ErrorActionPreference = 'Stop'
Add-Type -Path (Join-Path $PSScriptRoot 'windows-slot-paste.cs') -ReferencedAssemblies 'System.Windows.Forms','System.Drawing','System.Web.Extensions'
if ($SelfTest) {
  [CodingTools.SlotHost]::SelfTest()
} else {
  [CodingTools.SlotHost]::Run($PipeName, [bool]$ProbeIpc)
}
